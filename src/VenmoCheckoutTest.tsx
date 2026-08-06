import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  fetchMerchantV2,
  fetchSessionKeyForUser,
  postVenmoCheckout,
  resolvePayPalMerchantId,
  SANDBOX_PAYPAL_CLIENT_ID,
} from "./coinflowApi";

const HAS_API_KEY = Boolean(import.meta.env.VITE_COINFLOW_API_KEY?.trim());
const MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const PAYPAL_CLIENT_ID =
  import.meta.env.VITE_PAYPAL_CLIENT_ID?.trim() || SANDBOX_PAYPAL_CLIENT_ID;

type PayPalButtons = {
  isEligible: () => boolean;
  render: (selector: string | HTMLElement) => Promise<void>;
};

type PayPalSdk = {
  Buttons: (config: Record<string, unknown>) => PayPalButtons;
  FUNDING: { VENMO: string };
};

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

function majorToCents(s: string): number | null {
  const n = parseFloat(s);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function loadPayPalSdk(paypalMerchantId: string): Promise<void> {
  if (window.paypal?.Buttons) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({
      "client-id": PAYPAL_CLIENT_ID,
      "merchant-id": paypalMerchantId,
      currency: "USD",
      intent: "authorize",
      components: "buttons",
      "enable-funding": "venmo",
      "disable-funding": "paylater",
      "buyer-country": "US",
    });
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-coinflow-paypal-sdk="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("PayPal SDK failed to load")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${q.toString()}`;
    script.async = true;
    script.dataset.coinflowPaypalSdk = "1";
    script.setAttribute("data-partner-attribution-id", "CoinflowLabsLimited_PSP");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(script);
  });
}

export type VenmoCheckoutInitial = {
  userId?: string;
  email?: string;
  amountUsd?: string;
  autoStart?: boolean;
};

export function VenmoCheckoutTest({
  initialUserId,
  initialEmail,
  initialAmountUsd,
  autoStart = false,
}: {
  initialUserId?: string;
  initialEmail?: string;
  initialAmountUsd?: string;
  autoStart?: boolean;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [userId, setUserId] = useState(
    () =>
      initialUserId?.trim() ||
      import.meta.env.VITE_COINFLOW_AUTH_USER_ID?.trim() ||
      "demo-shopper-1"
  );
  const [email, setEmail] = useState(initialEmail?.trim() || "test@test.com");
  const [amountUsd, setAmountUsd] = useState(initialAmountUsd?.trim() || "5.00");
  const [sessionKey, setSessionKey] = useState("");
  const [paypalMerchantId, setPaypalMerchantId] = useState("");
  const [paypalSource, setPaypalSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [webStatus, setWebStatus] = useState<string | null>(null);
  const [setupNonce, setSetupNonce] = useState(0);

  const cents = majorToCents(amountUsd);
  const ready = Boolean(
    sessionKey && paypalMerchantId && cents != null && email.trim()
  );

  const prepare = useCallback(async () => {
    if (!HAS_API_KEY) {
      setError("Set VITE_COINFLOW_API_KEY in .env");
      return;
    }
    if (!userId.trim()) {
      setError("Shopper user id is required");
      return;
    }
    if (cents == null) {
      setError("Enter a valid amount");
      return;
    }
    if (!email.trim()) {
      setError("Email is required for Venmo checkout");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setWebStatus(null);
    setSessionKey("");
    setPaypalMerchantId("");
    setPaypalSource(null);
    if (buttonRef.current) buttonRef.current.innerHTML = "";

    try {
      const key = await fetchSessionKeyForUser(userId);
      const merchant = await fetchMerchantV2(key);
      const { id: ppId, source: ppSource } = resolvePayPalMerchantId(merchant);
      if (!ppId) {
        throw new Error(
          `GET /merchant/v2 succeeded but no PayPal merchant id found for "${MERCHANT_ID}".`
        );
      }
      setSessionKey(key);
      setPaypalMerchantId(ppId);
      setPaypalSource(ppSource);
      setSetupNonce((n) => n + 1);
      setStatus(
        `Ready — PayPal merchant ${ppId.slice(0, 12)}… (from ${ppSource ?? "api"})`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }, [userId, cents, email]);

  useEffect(() => {
    if (!ready || cents == null || !buttonRef.current) return;

    let cancelled = false;
    const container = buttonRef.current;
    container.innerHTML = "";

    async function renderVenmo() {
      try {
        await loadPayPalSdk(paypalMerchantId);
        if (cancelled || !window.paypal?.Buttons) {
          throw new Error("PayPal SDK not available");
        }

        const buttons = window.paypal.Buttons({
          fundingSource: window.paypal.FUNDING.VENMO,
          style: { layout: "horizontal", shape: "rect", height: 48, tagline: false },
          createOrder: async () => {
            setWebStatus("Creating Coinflow Venmo order…");
            const result = await postVenmoCheckout({
              merchantId: MERCHANT_ID,
              sessionKey,
              userId: userId.trim(),
              subtotalCents: cents!,
              email: email.trim(),
            });
            const paymentId =
              typeof result.data.paymentId === "string"
                ? result.data.paymentId
                : null;
            if (!result.ok || !paymentId) {
              const msg =
                typeof result.data.message === "string"
                  ? result.data.message
                  : `Venmo checkout failed (${result.status})`;
              throw new Error(msg);
            }
            setWebStatus(`Coinflow order: ${paymentId}`);
            return paymentId;
          },
          onApprove: (data: { orderID?: string }) => {
            setWebStatus(`Venmo approved — ${data.orderID ?? "ok"}`);
          },
          onCancel: () => setWebStatus("Cancelled"),
          onError: (err: { message?: string }) => {
            setWebStatus(`Error: ${err?.message ?? "PayPal error"}`);
          },
        });

        if (!buttons.isEligible()) {
          setWebStatus(
            "Venmo not eligible — use Safari (iOS) or Chrome (Android), US location, Venmo app installed."
          );
          return;
        }

        setWebStatus(`Tap Venmo to pay $${(cents! / 100).toFixed(2)}`);
        await buttons.render(container);
      } catch (e) {
        if (!cancelled) {
          setWebStatus(
            `Setup failed: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }
      }
    }

    void renderVenmo();
    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [ready, setupNonce, sessionKey, paypalMerchantId, userId, email, cents]);

  useEffect(() => {
    if (autoStart && HAS_API_KEY && userId.trim() && cents != null && email.trim()) {
      void prepare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link auto start once
  }, []);

  return (
    <div>
      <p style={styles.lead}>
        Direct API + PayPal JS SDK (Venmo funding source). Run in{" "}
        <strong>Safari</strong> on iOS or <strong>Chrome</strong> on Android — PayPal
        blocks Venmo inside in-app WebViews.
      </p>

      {!HAS_API_KEY && <p style={styles.err}>Set VITE_COINFLOW_API_KEY</p>}

      <label style={styles.lab}>Shopper user id</label>
      <input
        style={styles.inp}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        autoComplete="off"
      />

      <label style={styles.lab}>Venmo email</label>
      <input
        style={styles.inp}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <label style={styles.lab}>Amount (USD)</label>
      <input
        style={styles.inp}
        value={amountUsd}
        onChange={(e) => setAmountUsd(e.target.value)}
        inputMode="decimal"
      />

      <button
        type="button"
        style={styles.btn}
        onClick={() => void prepare()}
        disabled={loading}
      >
        {loading ? "Loading…" : "Load Venmo button"}
      </button>

      <p style={styles.fine}>
        PayPal client-id: sandbox default
        {PAYPAL_CLIENT_ID !== SANDBOX_PAYPAL_CLIENT_ID ? " (custom)" : ""}
        {paypalSource ? ` · merchant from ${paypalSource}` : ""}
      </p>

      {error && <p style={styles.err}>{error}</p>}
      {status && !error && <p style={styles.ok}>{status}</p>}
      {webStatus && <p style={styles.fine}>{webStatus}</p>}

      <div ref={buttonRef} style={styles.venmoSlot} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  lead: {
    color: "#888",
    fontSize: 13,
    lineHeight: 1.55,
    marginBottom: 16,
  },
  lab: {
    display: "block",
    color: "#888",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inp: {
    width: "100%",
    boxSizing: "border-box",
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    color: "#e0e0e0",
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  btn: {
    background: "#ffe500",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 12,
  },
  fine: { color: "#666", fontSize: 12, lineHeight: 1.5, marginBottom: 12 },
  err: { color: "#ff3d00", fontSize: 13, marginBottom: 12 },
  ok: { color: "#00c853", fontSize: 13, marginBottom: 12 },
  venmoSlot: { minHeight: 52, marginTop: 8 },
};
