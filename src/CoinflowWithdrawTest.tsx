import { CoinflowWithdraw, type CoinflowEnvs } from "@coinflowlabs/react";
import { useEffect, useState, type CSSProperties } from "react";
import { fetchSessionKeyForWallet } from "./coinflowApi";
import { usePhantomWallet } from "./usePhantomWallet";

const MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const ENV_RAW = import.meta.env.VITE_COINFLOW_ENV;
const HAS_API_KEY = Boolean(import.meta.env.VITE_COINFLOW_API_KEY?.trim());

const COINFLOW_ENV: CoinflowEnvs =
  ENV_RAW === "prod" ||
  ENV_RAW === "staging" ||
  ENV_RAW === "staging-live" ||
  ENV_RAW === "sandbox" ||
  ENV_RAW === "local"
    ? ENV_RAW
    : "sandbox";

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

const IFRAME_MIN_PX = 480;
const IFRAME_PAD_PX = 16;

function parseIframeHeightPx(payload: unknown): number | null {
  if (typeof payload === "number" && Number.isFinite(payload) && payload > 0) {
    return Math.round(payload);
  }
  if (typeof payload === "string") {
    const t = payload.trim();
    if (!t) return null;
    try {
      return parseIframeHeightPx(JSON.parse(t) as unknown);
    } catch {
      const n = parseInt(t.replace(/px$/i, "").trim(), 10);
      return !Number.isNaN(n) && n > 0 ? n : null;
    }
  }
  if (payload && typeof payload === "object" && "height" in payload) {
    return parseIframeHeightPx((payload as { height: unknown }).height);
  }
  return null;
}

/**
 * CoinflowWithdraw with Phantom browser extension.
 * @see https://docs.coinflow.cash/guides/payouts/implementation-methods/coinflow-withdraw-component
 */
export function CoinflowWithdrawTest() {
  const {
    connection,
    publicKey,
    connected,
    connecting,
    error: walletError,
    connect,
    disconnect,
    coinflowWallet,
    hasPhantom,
  } = usePhantomWallet();

  const [origins] = useState(getBrowserOrigins);
  const [email, setEmail] = useState("test@test.com");
  const [amountUsd, setAmountUsd] = useState("10");
  const [lockAmount, setLockAmount] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [sessionStatus, setSessionStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(640);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const walletPubkey = publicKey?.toBase58() ?? "";

  useEffect(() => {
    if (!HAS_API_KEY || !walletPubkey) {
      setSessionKey("");
      setSessionStatus("idle");
      setSessionError(null);
      return;
    }
    let cancelled = false;
    setSessionStatus("loading");
    setSessionError(null);
    fetchSessionKeyForWallet(walletPubkey)
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
  }, [walletPubkey]);

  const amount = parseFloat(amountUsd);
  const canRender =
    coinflowWallet != null &&
    connected &&
    origins.length > 0 &&
    sessionStatus !== "loading" &&
    (!HAS_API_KEY || sessionKey.trim().length > 0);

  return (
    <div>
      <p style={lead}>
        <code>CoinflowWithdraw</code> + <strong>Phantom</strong> · merchant{" "}
        <code>{MERCHANT_ID}</code> · env <code>{COINFLOW_ENV}</code>. Connect
        your wallet, then complete KYC / bank link / withdraw in the embedded UI.
      </p>

      <div style={walletRow}>
        {connected ? (
          <button type="button" style={btnSecondary} onClick={() => disconnect()}>
            Disconnect Phantom
          </button>
        ) : (
          <button
            type="button"
            style={btnPrimary}
            onClick={() => connect()}
            disabled={connecting}
          >
            {connecting ? "Connecting…" : "Connect Phantom"}
          </button>
        )}
      </div>

      {walletPubkey && (
        <p style={fine}>
          Connected:{" "}
          <code style={{ wordBreak: "break-all" }}>{walletPubkey}</code>
        </p>
      )}

      {!hasPhantom && (
        <p style={fine}>
          Install the{" "}
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#ffe500" }}
          >
            Phantom
          </a>{" "}
          browser extension, then refresh and connect.
        </p>
      )}

      {walletError && <p style={err}>{walletError}</p>}

      <label style={lab}>Email (prefill)</label>
      <input
        style={inp}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <label style={lab}>Amount (USD)</label>
      <input
        style={inp}
        type="number"
        min="0.01"
        step="0.01"
        value={amountUsd}
        onChange={(e) => setAmountUsd(e.target.value)}
      />

      <label style={checkRow}>
        <input
          type="checkbox"
          checked={lockAmount}
          onChange={(e) => setLockAmount(e.target.checked)}
        />
        Lock amount (<code>lockAmount</code>)
      </label>

      {HAS_API_KEY && connected && sessionStatus === "loading" && (
        <p style={{ ...fine, color: "#ffe500" }}>Loading session key…</p>
      )}
      {sessionStatus === "error" && sessionError && (
        <p style={err}>{sessionError}</p>
      )}

      {lastSuccess && (
        <p style={{ ...fine, color: "#00c853", marginBottom: 12 }}>
          {lastSuccess}
        </p>
      )}

      {connected && !canRender && sessionStatus !== "loading" && (
        <p style={fine}>Preparing withdraw UI…</p>
      )}

      {canRender && coinflowWallet && (
        <div
          style={{
            height: Math.max(IFRAME_MIN_PX, frameHeight),
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <CoinflowWithdraw
            wallet={coinflowWallet}
            connection={connection}
            blockchain="solana"
            merchantId={MERCHANT_ID}
            env={COINFLOW_ENV}
            sessionKey={sessionKey.trim() || undefined}
            origins={origins}
            email={email}
            lockAmount={lockAmount}
            amount={lockAmount && !Number.isNaN(amount) ? amount : undefined}
            handleHeightChange={(payload) => {
              const px = parseIframeHeightPx(payload);
              if (px != null) {
                setFrameHeight(Math.max(IFRAME_MIN_PX, px + IFRAME_PAD_PX));
              }
            }}
            onSuccess={(args) => {
              const msg =
                typeof args === "string"
                  ? args
                  : `paymentId: ${args.paymentId}${args.hash ? ` hash: ${args.hash}` : ""}`;
              setLastSuccess(`Withdraw success — ${msg}`);
              console.log("[CoinflowWithdraw] success", args);
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
const walletRow: CSSProperties = {
  marginBottom: 14,
};
const btnPrimary: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #ffe500",
  background: "rgba(255,229,0,0.12)",
  color: "#ffe500",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: CSSProperties = {
  ...btnPrimary,
  border: "1px solid #2a2a2a",
  background: "#141414",
  color: "#e0e0e0",
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
const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "0.8rem",
  color: "#aaa",
  marginBottom: 14,
  cursor: "pointer",
};
