import { useMemo, useState, type CSSProperties } from "react";
import { CoinflowPurchaseProtection } from "@coinflowlabs/react";
import { BankAuthPayout } from "./BankAuthPayout";
import { CoinflowPurchaseTest } from "./CoinflowPurchaseTest";
import { CoinflowWithdrawTest } from "./CoinflowWithdrawTest";
import { VenmoCheckoutTest } from "./VenmoCheckoutTest";

type Tab = "checkout" | "withdraw" | "payout" | "venmo";

function readVenmoDeepLink() {
  if (typeof window === "undefined") {
    return {
      tab: "checkout" as Tab,
      userId: undefined,
      email: undefined,
      amountUsd: undefined,
      autoStart: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "venmo" ? "venmo" : "checkout";
  return {
    tab,
    userId: params.get("userId") ?? undefined,
    email: params.get("email") ?? undefined,
    amountUsd: params.get("amount") ?? undefined,
    autoStart: params.get("auto") === "1",
  };
}

const MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const COINFLOW_ENV =
  import.meta.env.VITE_COINFLOW_ENV === "prod" ? "prod" : "sandbox";

export function App() {
  const deepLink = useMemo(() => readVenmoDeepLink(), []);
  const [tab, setTab] = useState<Tab>(deepLink.tab);
  const [authUserId, setAuthUserId] = useState(
    () => import.meta.env.VITE_COINFLOW_AUTH_USER_ID?.trim() || "demo-shopper-1"
  );
  const [payoutAmount, setPayoutAmount] = useState("10.00");
  const [payoutNotice, setPayoutNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  return (
    <div style={styles.container}>
      <CoinflowPurchaseProtection
        coinflowEnv={COINFLOW_ENV}
        merchantId={MERCHANT_ID}
      />
      <h1 style={styles.title}>Coinflow Sandbox</h1>
      <p style={styles.badge}>SANDBOX · checkout, withdraw SDK &amp; payout API</p>

      <div style={styles.tabs} role="tablist" aria-label="Coinflow flows">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "checkout"}
          style={tab === "checkout" ? styles.tabActive : styles.tab}
          onClick={() => setTab("checkout")}
        >
          Checkout
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "withdraw"}
          style={tab === "withdraw" ? styles.tabActive : styles.tab}
          onClick={() => setTab("withdraw")}
        >
          Withdraw SDK
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "payout"}
          style={tab === "payout" ? styles.tabActive : styles.tab}
          onClick={() => setTab("payout")}
        >
          Payout API
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "venmo"}
          style={tab === "venmo" ? styles.tabActive : styles.tab}
          onClick={() => setTab("venmo")}
        >
          PayPal & Venmo
        </button>
      </div>

      <div style={styles.card}>
        {tab === "checkout" && <CoinflowPurchaseTest />}

        {tab === "withdraw" && <CoinflowWithdrawTest />}

        {tab === "venmo" && (
          <VenmoCheckoutTest
            initialUserId={deepLink.userId}
            initialEmail={deepLink.email}
            initialAmountUsd={deepLink.amountUsd}
            autoStart={deepLink.autoStart}
          />
        )}

        {tab === "payout" && (
          <>
            <label style={styles.lab}>Shopper ID (x-coinflow-auth-user-id)</label>
            <input
              style={styles.inp}
              value={authUserId}
              onChange={(e) => setAuthUserId(e.target.value)}
              autoComplete="off"
            />
            <label style={styles.lab}>Payout amount (USD)</label>
            <input
              style={styles.inp}
              type="number"
              min="0.01"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
            {payoutNotice && (
              <p
                style={
                  payoutNotice.kind === "ok" ? styles.noticeOk : styles.noticeErr
                }
              >
                {payoutNotice.text}
              </p>
            )}
            <BankAuthPayout
              sessionId="demo"
              playerId={authUserId}
              amount={payoutAmount}
              onSuccess={() =>
                setPayoutNotice({
                  kind: "ok",
                  text: "Delegated payout submitted from Coinflow wallet.",
                })
              }
              onError={(msg) => setPayoutNotice({ kind: "err", text: msg })}
            />
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#e0e0e0",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px",
  },
  title: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "1.6rem",
    color: "#ffe500",
    marginBottom: 4,
  },
  badge: {
    fontSize: "0.7rem",
    padding: "3px 8px",
    borderRadius: 4,
    background: "rgba(255,229,0,0.15)",
    color: "#ffe500",
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 16,
  },
  tabs: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    width: "100%",
    maxWidth: 560,
  },
  tab: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "#141414",
    color: "#888",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  tabActive: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #ffe500",
    background: "rgba(255,229,0,0.12)",
    color: "#ffe500",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  card: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: 32,
    width: "100%",
    maxWidth: 560,
  },
  lab: {
    display: "block",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#888",
    marginBottom: 6,
    fontWeight: 600,
  },
  inp: {
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
  },
  noticeOk: {
    color: "#00c853",
    fontSize: "0.85rem",
    marginBottom: 12,
  },
  noticeErr: {
    color: "#ff3d00",
    fontSize: "0.85rem",
    marginBottom: 12,
  },
};
