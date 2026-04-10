import {
  CoinflowPurchase,
  Currency,
  SettlementType,
  type CoinflowEnvs,
} from "@coinflowlabs/react";
import { useEffect, useState, type CSSProperties } from "react";
import { fetchSessionKey } from "./coinflowApi";

const MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const ENV_RAW = import.meta.env.VITE_COINFLOW_ENV;

const COINFLOW_ENV: CoinflowEnvs =
  ENV_RAW === "prod" ||
  ENV_RAW === "staging" ||
  ENV_RAW === "staging-live" ||
  ENV_RAW === "sandbox" ||
  ENV_RAW === "local"
    ? ENV_RAW
    : "sandbox";

const HAS_API_KEY = Boolean(import.meta.env.VITE_COINFLOW_API_KEY?.trim());

function getBrowserOrigins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const { protocol, hostname, port } = window.location;
    const o = new Set<string>([window.location.origin]);
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port) {
      o.add(`${protocol}//localhost:${port}`);
      o.add(`${protocol}//127.0.0.1:${port}`);
    }
    return [...o];
  } catch {
    return [];
  }
}

function mxnMajorToCents(s: string): number | null {
  const n = parseFloat(s);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Minimal sandbox harness for @coinflowlabs/react CoinflowPurchase:
 * session key from VITE_COINFLOW_API_KEY + GET /auth/session-key, MXN presentment.
 */
export function CoinflowPurchaseTest() {
  const [origins] = useState(getBrowserOrigins);
  const [authUserId, setAuthUserId] = useState(
    () =>
      import.meta.env.VITE_COINFLOW_AUTH_USER_ID?.trim() ||
      "demo-shopper-1"
  );
  const [sessionKey, setSessionKey] = useState(() =>
    HAS_API_KEY ? "" : (import.meta.env.VITE_COINFLOW_AUTH_SESSION_KEY?.trim() ?? "")
  );
  const [sessionStatus, setSessionStatus] = useState<
    "idle" | "loading" | "error"
  >(() => (HAS_API_KEY ? "loading" : "idle"));
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [amountMxn, setAmountMxn] = useState("500.00");
  const [email, setEmail] = useState("test@example.com");
  const [frameHeight, setFrameHeight] = useState(720);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!HAS_API_KEY) {
      setSessionStatus("idle");
      setSessionError(null);
      return;
    }
    let cancelled = false;
    setSessionStatus("loading");
    setSessionError(null);
    fetchSessionKey(authUserId)
      .then((key) => {
        if (!cancelled) {
          setSessionKey(key);
          setSessionStatus("idle");
        }
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
  }, [authUserId]);

  const cents = mxnMajorToCents(amountMxn);
  const canRender =
    sessionKey.trim().length > 0 &&
    cents != null &&
    origins.length > 0 &&
    sessionStatus !== "loading";

  return (
    <div>
      <p style={lead}>
        <code>CoinflowPurchase</code> · merchant <code>{MERCHANT_ID}</code> ·
        env <code>{COINFLOW_ENV}</code> · presentment{" "}
        <strong>{Currency.MXN}</strong> · settlement{" "}
        <code>{SettlementType.USDC}</code>.
      </p>

      <label style={lab}>Shopper ID (x-coinflow-auth-user-id)</label>
      <input
        style={inp}
        value={authUserId}
        onChange={(e) => setAuthUserId(e.target.value)}
        autoComplete="off"
      />
      <p style={fine}>
        Session key from <code>GET /auth/session-key</code> when{" "}
        <code>VITE_COINFLOW_API_KEY</code> is set; otherwise paste JWT below.
      </p>

      {!HAS_API_KEY && (
        <>
          <label style={lab}>Session key (manual)</label>
          <input
            style={inp}
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="x-coinflow-auth-session-key JWT"
            autoComplete="off"
          />
        </>
      )}

      {HAS_API_KEY && sessionStatus === "loading" && (
        <p style={{ ...fine, color: "#ffe500" }}>Loading session key…</p>
      )}
      {sessionStatus === "error" && sessionError && (
        <p style={err}>{sessionError}</p>
      )}
      {HAS_API_KEY && sessionStatus === "idle" && sessionKey && (
        <button
          type="button"
          style={{ ...btnSecondary, marginBottom: 14 }}
          onClick={() => {
            setSessionStatus("loading");
            setSessionError(null);
            fetchSessionKey(authUserId)
              .then((key) => {
                setSessionKey(key);
                setSessionStatus("idle");
              })
              .catch((e) => {
                setSessionKey("");
                setSessionStatus("error");
                setSessionError(
                  e instanceof Error ? e.message : "Session key failed"
                );
              });
          }}
        >
          Refresh session key
        </button>
      )}

      <label style={lab}>Amount (MXN)</label>
      <input
        style={inp}
        type="number"
        min="0.01"
        step="0.01"
        value={amountMxn}
        onChange={(e) => setAmountMxn(e.target.value)}
      />

      <label style={lab}>Email</label>
      <input
        style={inp}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {cents == null && (
        <p style={err}>Enter a valid MXN amount (minor units = centavos).</p>
      )}
      {origins.length === 0 && (
        <p style={err}>Could not resolve browser origins for the iframe.</p>
      )}

      {lastSuccess && (
        <p style={{ ...fine, color: "#00c853", marginBottom: 12 }}>
          {lastSuccess}
        </p>
      )}

      {canRender && cents != null && (
        <div
          style={{
            minHeight: frameHeight,
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <CoinflowPurchase
            merchantId={MERCHANT_ID}
            env={COINFLOW_ENV}
            sessionKey={sessionKey.trim()}
            email={email.trim()}
            origins={origins}
            settlementType={SettlementType.USDC}
            subtotal={{ cents, currency: Currency.MXN }}
            presentment={Currency.MXN}
            handleHeightChange={(h) => {
              const n = parseInt(h, 10);
              if (!Number.isNaN(n) && n > 0) setFrameHeight(n + 24);
            }}
            onSuccess={(args) => {
              const msg =
                typeof args === "string"
                  ? args
                  : `paymentId: ${args.paymentId}${args.hash ? ` hash: ${args.hash}` : ""}`;
              setLastSuccess(`Success — ${msg}`);
            }}
          />
        </div>
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
const btnSecondary: CSSProperties = {
  width: "100%",
  background: "#2a2a2a",
  color: "#e0e0e0",
  border: "1px solid #3a3a3a",
  padding: 10,
  borderRadius: 8,
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
