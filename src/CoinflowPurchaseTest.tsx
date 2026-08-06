import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CoinflowCardForm,
  useCoinflowProtectionHeaders,
  type CardFormRef,
} from "@coinflowlabs/react";
import {
  buildAftBugReproCheckoutLinkPayload,
  buildDefaultChargebackProtectionData,
  extractCheckoutLink,
  extractPaymentId,
  fetchSessionKeyForUser,
  parseCheckoutIframeMessage,
  postCardCheckout,
  postCheckoutLink,
  postCheckoutTotals,
  normalizePaymentIdForReview,
  putCheckoutReviewWithRetry,
  type CheckoutReviewRetryResult,
} from "./coinflowApi";

const HAS_API_KEY = Boolean(import.meta.env.VITE_COINFLOW_API_KEY?.trim());
const MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const COINFLOW_ENV =
  import.meta.env.VITE_COINFLOW_ENV === "prod" ? "prod" : "sandbox";

type CheckoutMode = "api" | "link";

function majorToCents(s: string): number | null {
  const n = parseFloat(s);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function CoinflowPurchaseTest() {
  const getProtectionHeaders = useCoinflowProtectionHeaders();
  const cardFormRef = useRef<CardFormRef>(null);

  const [mode, setMode] = useState<CheckoutMode>("api");
  const [authUserId, setAuthUserId] = useState(
    () =>
      import.meta.env.VITE_COINFLOW_AUTH_USER_ID?.trim() || "demo-shopper-1"
  );
  const [email, setEmail] = useState("test@example.com");
  const [amountUsd, setAmountUsd] = useState("5.00");
  const [sessionKey, setSessionKey] = useState("");
  const [sessionStatus, setSessionStatus] = useState<
    "idle" | "loading" | "error"
  >(() => (HAS_API_KEY ? "loading" : "idle"));
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [totalsPreview, setTotalsPreview] = useState<string | null>(null);

  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done">(
    "idle"
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [autoReview, setAutoReview] = useState(true);
  const [reviewAccept, setReviewAccept] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<
    "idle" | "calling" | "done" | "error"
  >("idle");
  const [reviewResult, setReviewResult] = useState<CheckoutReviewRetryResult | null>(
    null
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [lastIframeEvent, setLastIframeEvent] = useState<string | null>(null);
  const [manualPaymentId, setManualPaymentId] = useState("");
  const reviewedPaymentIds = useRef(new Set<string>());

  const cents = majorToCents(amountUsd);
  const shopperReady =
    authUserId.trim().length > 0 && isValidEmail(email) && cents != null;
  const canShowCardForm =
    shopperReady && sessionKey.trim().length > 0 && sessionStatus !== "loading";

  const fireCheckoutReview = useCallback(
    async (paymentId: string, source: string) => {
      const normalizedId = normalizePaymentIdForReview(paymentId);
      if (!autoReview || reviewedPaymentIds.current.has(normalizedId)) return;
      reviewedPaymentIds.current.add(normalizedId);

      const receivedAt = performance.now();
      setLastPaymentId(normalizedId);
      setLastIframeEvent(source);
      setReviewStatus("calling");
      setReviewError(null);
      setReviewResult(null);

      console.log("[checkout/review] paymentId received — calling PUT /checkout/review", {
        paymentId: normalizedId,
        accept: reviewAccept,
        source,
        receivedAt,
      });

      try {
        const result = await putCheckoutReviewWithRetry({
          paymentId: normalizedId,
          accept: reviewAccept,
        });
        const elapsedMs = Math.round(performance.now() - receivedAt);
        setReviewResult(result);
        setReviewStatus(result.ok ? "done" : "error");
        if (!result.ok) {
          const details =
            typeof result.data.details === "string"
              ? result.data.details
              : null;
          setReviewError(
            details ||
              (typeof result.data.message === "string"
                ? result.data.message
                : `Review failed (${result.status})`)
          );
        }
        console.log("[checkout/review] response", {
          status: result.status,
          attempts: result.attempts,
          elapsedMs,
          data: result.data,
        });
      } catch (e) {
        setReviewStatus("error");
        setReviewError(e instanceof Error ? e.message : "Review call failed");
        console.error("[checkout/review] error", e);
      }
    },
    [autoReview, reviewAccept]
  );

  useEffect(() => {
    if (!checkoutUrl || !autoReview) return;

    const onMessage = (event: MessageEvent) => {
      const { paymentId, eventType } = parseCheckoutIframeMessage(
        event.data,
        event.origin
      );
      if (!paymentId) return;
      // Wait for checkout success before reviewing (settlement guide postMessage).
      if (eventType !== "success") return;
      void fireCheckoutReview(paymentId, `iframe:${eventType}`);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [checkoutUrl, autoReview, fireCheckoutReview]);

  useEffect(() => {
    if (!HAS_API_KEY || !shopperReady) {
      setSessionStatus("idle");
      setSessionError(null);
      setSessionKey("");
      setTotalsPreview(null);
      return;
    }

    let cancelled = false;
    setSessionStatus("loading");
    setSessionError(null);
    setTotalsPreview(null);

    const protectionHeaders = getProtectionHeaders();

    fetchSessionKeyForUser(authUserId)
      .then(async (key) => {
        if (cancelled) return;
        setSessionKey(key);

        if (cents != null) {
          const totals = await postCheckoutTotals({
            merchantId: MERCHANT_ID,
            sessionKey: key,
            subtotalCents: cents,
            protectionHeaders,
          });
          if (!cancelled && totals.ok) {
            const card = totals.data.card as
              | { total?: { cents?: number } }
              | undefined;
            const totalCents = card?.total?.cents;
            setTotalsPreview(
              totalCents != null
                ? `Total (card): $${(totalCents / 100).toFixed(2)}`
                : null
            );
          }
        }

        if (!cancelled) setSessionStatus("idle");
      })
      .catch((e) => {
        if (!cancelled) {
          setSessionKey("");
          setSessionStatus("error");
          setSessionError(
            e instanceof Error ? e.message : "Session key failed"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUserId, email, cents, shopperReady, getProtectionHeaders]);

  async function runCardCheckout() {
    if (!HAS_API_KEY) {
      setRunError("Set VITE_COINFLOW_API_KEY in .env");
      return;
    }
    if (!shopperReady || cents == null) {
      setRunError("Enter shopper ID, valid email, and amount");
      return;
    }
    const key =
      sessionKey.trim() ||
      import.meta.env.VITE_COINFLOW_AUTH_SESSION_KEY?.trim() ||
      "";
    if (!key) {
      setRunError("Session key is required — wait for session to load");
      return;
    }

    setRunStatus("running");
    setRunError(null);
    setLastResponse(null);
    setLastStatus(null);
    reviewedPaymentIds.current.clear();
    setReviewStatus("idle");
    setReviewResult(null);
    setReviewError(null);
    setLastPaymentId(null);

    try {
      const tokenResult = await cardFormRef.current?.tokenize();
      if (!tokenResult?.token) {
        throw new Error("Card tokenization did not return a token");
      }

      const protectionHeaders = getProtectionHeaders();
      const result = await postCardCheckout({
        merchantId: MERCHANT_ID,
        sessionKey: key,
        subtotalCents: cents,
        currency: "USD",
        card: {
          cardToken: tokenResult.token,
          expMonth: tokenResult.expMonth ?? "12",
          expYear: tokenResult.expYear ?? "30",
          email: email.trim(),
          firstName: "Test",
          lastName: "User",
          address1: "123 Main St",
          city: "Miami",
          country: "US",
          state: "FL",
          zip: "33101",
        },
        chargebackProtectionData: buildDefaultChargebackProtectionData(),
        protectionHeaders,
      });

      setLastStatus(result.status);
      setLastResponse(result.data);
      console.log("[checkout/card] response", result);

      const paymentId = extractPaymentId(result.data);
      if (result.ok && paymentId) {
        void fireCheckoutReview(paymentId, "checkout/card:response");
      } else if (!result.ok) {
        setRunError(
          typeof result.data.message === "string"
            ? result.data.message
            : `Card checkout failed (${result.status})`
        );
      } else {
        setRunError("Card checkout response had no paymentId");
      }

      setRunStatus("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Card checkout failed";
      setRunError(msg);
      console.error("[checkout/card] error", e);
      setRunStatus("done");
    }
  }

  async function loadCheckoutLink() {
    if (!HAS_API_KEY) {
      setRunError("Set VITE_COINFLOW_API_KEY in .env");
      return;
    }
    if (!shopperReady || cents == null) {
      setRunError("Enter shopper ID, valid email, and amount");
      return;
    }
    const jwt =
      sessionKey.trim() ||
      import.meta.env.VITE_COINFLOW_AUTH_SESSION_KEY?.trim() ||
      "";
    if (!jwt) {
      setRunError("Session key is required — wait for session to load");
      return;
    }

    setRunStatus("running");
    setRunError(null);
    setCheckoutUrl(null);
    setLastResponse(null);
    setLastStatus(null);
    reviewedPaymentIds.current.clear();
    setReviewStatus("idle");
    setReviewResult(null);
    setReviewError(null);
    setLastPaymentId(null);

    try {
      const body = buildAftBugReproCheckoutLinkPayload(cents, email);

      console.log("[checkout/link] request", {
        userId: authUserId,
        body,
      });

      const result = await postCheckoutLink({
        userId: authUserId,
        body,
        protectionHeaders: getProtectionHeaders(),
      });

      setLastStatus(result.status);
      setLastResponse(result.data);

      const link = extractCheckoutLink(result.data);
      if (link) {
        setCheckoutUrl(link);
        console.log("[checkout/link] embedded iframe URL:", link);
      }
      console.log("[checkout/link] response status:", result.status);
      console.log("[checkout/link] full response:", result.data);

      if (!result.ok) {
        setRunError(
          typeof result.data.message === "string"
            ? result.data.message
            : `Checkout link failed (${result.status})`
        );
      } else if (!link) {
        setRunError("Response OK but no link field returned");
      }

      setRunStatus("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout link failed";
      setRunError(msg);
      console.error("[checkout/link] error:", e);
      setRunStatus("done");
    }
  }

  const canRunLink =
    HAS_API_KEY && shopperReady && sessionKey.trim().length > 0;

  return (
    <div>
      <p style={lead}>
        Settlement-to-Coinflow-wallet checkout. Enter your shopper ID and email —
        the card form or hosted checkout iframe loads after the session key is
        ready. Chargeback protection headers (<code>x-device-id</code>) are sent
        on every checkout API call.
      </p>

      <div style={modeTabs} role="tablist" aria-label="Checkout mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "api"}
          style={mode === "api" ? modeTabActive : modeTab}
          onClick={() => setMode("api")}
        >
          API checkout (card form)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "link"}
          style={mode === "link" ? modeTabActive : modeTab}
          onClick={() => setMode("link")}
        >
          Checkout link (iframe)
        </button>
      </div>

      <p style={reproLead}>
        <strong>PrePurchasePipeline race repro:</strong> when a payment lands in{" "}
        <code>PendingReview</code>, this harness fires{" "}
        <code>PUT /checkout/review</code> immediately on the returned{" "}
        <code>paymentId</code>.
      </p>

      <label style={checkRow}>
        <input
          type="checkbox"
          checked={autoReview}
          onChange={(e) => setAutoReview(e.target.checked)}
        />
        Auto <code>PUT /checkout/review</code> on <code>paymentId</code>
      </label>

      <label style={checkRow}>
        <input
          type="checkbox"
          checked={reviewAccept}
          onChange={(e) => setReviewAccept(e.target.checked)}
        />
        <code>accept</code> = {reviewAccept ? "true" : "false"}
      </label>

      <label style={lab}>Manual paymentId (optional)</label>
      <input
        style={inp}
        value={manualPaymentId}
        onChange={(e) => setManualPaymentId(e.target.value)}
        placeholder="pay_… from dashboard if iframe did not postMessage"
        autoComplete="off"
      />
      <button
        type="button"
        style={btnSecondary}
        disabled={!manualPaymentId.trim() || reviewStatus === "calling"}
        onClick={() =>
          void fireCheckoutReview(manualPaymentId.trim(), "manual")
        }
      >
        Fire PUT /checkout/review now
      </button>

      {typeof window !== "undefined" &&
        (window.location.hostname === "127.0.0.1" ||
          /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) && (
          <p style={warn}>
            Apple Pay requires a whitelisted HTTPS domain (not an IP). Host the
            site association file at{" "}
            <code>/.well-known/apple-developer-merchantid-domain-association</code>.
          </p>
        )}

      <label style={lab}>Shopper ID (x-coinflow-auth-user-id)</label>
      <input
        style={inp}
        value={authUserId}
        onChange={(e) => setAuthUserId(e.target.value)}
        autoComplete="off"
      />

      <label style={lab}>Email</label>
      <input
        style={inp}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="customer@example.com"
      />
      {!isValidEmail(email) && email.length > 0 && (
        <p style={err}>Enter a valid email address.</p>
      )}

      <label style={lab}>Amount (USD)</label>
      <input
        style={inp}
        type="number"
        min="0.01"
        step="0.01"
        value={amountUsd}
        onChange={(e) => setAmountUsd(e.target.value)}
      />
      {cents == null && (
        <p style={err}>Enter a valid USD amount.</p>
      )}

      {HAS_API_KEY && sessionStatus === "loading" && (
        <p style={{ ...fine, color: "#ffe500" }}>
          Loading session key &amp; totals…
        </p>
      )}
      {sessionStatus === "error" && sessionError && (
        <p style={err}>{sessionError}</p>
      )}
      {totalsPreview && sessionStatus === "idle" && (
        <p style={fine}>{totalsPreview}</p>
      )}

      {mode === "api" && (
        <>
          {!canShowCardForm && shopperReady && sessionStatus !== "loading" && (
            <p style={fine}>Waiting for session key…</p>
          )}
          {canShowCardForm && (
            <>
              <label style={lab}>Card details</label>
              <div style={cardFormWrap}>
                <CoinflowCardForm
                  ref={cardFormRef}
                  merchantId={MERCHANT_ID}
                  env={COINFLOW_ENV}
                  theme={{
                    font: "Inter",
                    fontSize: "14px",
                    background: "#0d0d0d",
                    textColor: "#e0e0e0",
                    cardNumberPlaceholder: "Card number",
                    cvvPlaceholder: "CVV",
                    expirationPlaceholder: "MM / YY",
                  }}
                />
              </div>
              <button
                type="button"
                style={btnPrimary}
                onClick={() => void runCardCheckout()}
                disabled={runStatus === "running"}
              >
                {runStatus === "running"
                  ? "Processing card checkout…"
                  : "Pay with card"}
              </button>
            </>
          )}
        </>
      )}

      {mode === "link" && (
        <>
          <button
            type="button"
            style={btnPrimary}
            onClick={() => void loadCheckoutLink()}
            disabled={!canRunLink || runStatus === "running"}
          >
            {runStatus === "running"
              ? "Calling POST /checkout/link…"
              : "Load hosted checkout"}
          </button>

          {checkoutUrl && (
            <iframe
              src={checkoutUrl}
              style={iframe}
              allow="payment; clipboard-write"
              title="Coinflow Checkout"
            />
          )}
        </>
      )}

      {runError && <p style={err}>{runError}</p>}

      {lastPaymentId && (
        <p style={fine}>
          Last <code>paymentId</code>:{" "}
          <code style={{ wordBreak: "break-all" }}>{lastPaymentId}</code>
          {lastIframeEvent ? ` · source: ${lastIframeEvent}` : ""}
        </p>
      )}

      {reviewStatus === "calling" && (
        <p style={{ ...fine, color: "#ffe500" }}>
          Calling PUT /checkout/review…
        </p>
      )}
      {reviewError && <p style={err}>{reviewError}</p>}
      {reviewResult && (
        <p style={reviewResult.ok ? stylesOk : err}>
          Review {reviewResult.status}{" "}
          {reviewResult.ok ? "OK" : "failed"}
          {reviewResult.attempts > 1
            ? ` · ${reviewResult.attempts} attempts`
            : ""}
          {reviewResult.text ? ` · ${reviewResult.text.slice(0, 120)}` : ""}
        </p>
      )}

      {lastStatus != null && (
        <p style={fine}>
          Response status: <strong>{lastStatus}</strong>
        </p>
      )}

      {lastResponse && (
        <pre style={payloadPre}>{JSON.stringify(lastResponse, null, 2)}</pre>
      )}
    </div>
  );
}

const lead: CSSProperties = {
  fontSize: "0.82rem",
  color: "#888",
  lineHeight: 1.6,
  marginBottom: 20,
};
const reproLead: CSSProperties = {
  fontSize: "0.78rem",
  color: "#aaa",
  lineHeight: 1.55,
  marginBottom: 14,
  padding: "10px 12px",
  background: "#0d0d0d",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
};
const modeTabs: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
};
const modeTab: CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #2a2a2a",
  background: "#0d0d0d",
  color: "#888",
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer",
};
const modeTabActive: CSSProperties = {
  ...modeTab,
  border: "1px solid #ffe500",
  color: "#ffe500",
  background: "rgba(255,229,0,0.08)",
};
const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "0.8rem",
  color: "#aaa",
  marginBottom: 12,
  cursor: "pointer",
};
const warn: CSSProperties = {
  fontSize: "0.78rem",
  color: "#ffb74d",
  background: "rgba(255,183,77,0.08)",
  border: "1px solid rgba(255,183,77,0.35)",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 16,
  lineHeight: 1.5,
};
const lab: CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#888",
  marginBottom: 6,
  fontWeight: 600,
};
const inp: CSSProperties = {
  width: "100%",
  background: "#0d0d0d",
  border: "1px solid #2a2a2a",
  color: "#e0e0e0",
  padding: "12px 14px",
  borderRadius: 8,
  fontSize: "0.95rem",
  marginBottom: 14,
  outline: "none",
  boxSizing: "border-box",
};
const fine: CSSProperties = {
  fontSize: "0.72rem",
  color: "#666",
  marginTop: -8,
  marginBottom: 14,
  lineHeight: 1.5,
};
const err: CSSProperties = {
  color: "#ff3d00",
  fontSize: "0.85rem",
  marginBottom: 12,
};
const btnPrimary: CSSProperties = {
  width: "100%",
  background: "#ffe500",
  color: "#000",
  border: "none",
  padding: 14,
  borderRadius: 8,
  fontSize: "1rem",
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: 14,
};
const btnSecondary: CSSProperties = {
  width: "100%",
  background: "#141414",
  color: "#ffe500",
  border: "1px solid #ffe500",
  padding: 14,
  borderRadius: 8,
  fontSize: "0.95rem",
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: 14,
};
const stylesOk: CSSProperties = {
  color: "#00c853",
  fontSize: "0.85rem",
  marginBottom: 12,
};
const cardFormWrap: CSSProperties = {
  width: "100%",
  marginBottom: 14,
};
const payloadPre: CSSProperties = {
  margin: 0,
  fontSize: "0.68rem",
  color: "#aaa",
  overflow: "auto",
  maxHeight: 280,
  lineHeight: 1.45,
};
const iframe: CSSProperties = {
  width: "100%",
  minHeight: 600,
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  background: "#fff",
  marginBottom: 14,
};
