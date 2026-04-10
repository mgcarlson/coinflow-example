/**
 * Bank Auth + API Payout flow.
 *
 * 1. Embeds Coinflow Bank Auth iframe for linking bank/card
 * 2. Listens for accountLinked postMessage
 * 3. Calls our payout API with the account token
 */

import { useEffect, useRef, useState } from "react";

const PAYMENTS_API = import.meta.env.VITE_PAYMENTS_API;
const HMAC_SECRET = import.meta.env.VITE_HMAC_SECRET;
const COINFLOW_MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const COINFLOW_API = "https://api-sandbox.coinflow.cash/api";
const COINFLOW_KEY = import.meta.env.VITE_COINFLOW_API_KEY || "";

async function hmacSign(body: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(HMAC_SECRET) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(ts + body) as BufferSource
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { signature: hex, timestamp: ts };
}

type Props = {
  sessionId: string;
  playerId: string;
  amount: string;
  onSuccess: () => void;
  onError: (error: string) => void;
};

type Step = "link" | "confirm" | "processing" | "done";

export function BankAuthPayout({
  sessionId,
  playerId,
  amount,
  onSuccess,
  onError,
}: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [loading, setLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for Coinflow postMessage (accountLinked)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin.includes("coinflow.cash")) return;
      const data = event.data;
      if (data === "accountLinked" || data?.method === "accountLinked") {
        setStep("confirm");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function initiatePayout() {
    setLoading(true);
    setStep("processing");

    try {
      const body = JSON.stringify({
        session_id: sessionId,
        account_token: "card", // Use the linked card
        speed: "card",
      });

      const { signature, timestamp } = await hmacSign(body);
      const resp = await fetch(`${PAYMENTS_API}/api/v1/withdraw/payout/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body,
      });

      const data = await resp.json();

      if (resp.ok) {
        setPayoutResult(data);
        setStep("done");
        onSuccess();
      } else {
        onError(data.error || "Payout failed");
        setStep("confirm");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Payout failed");
      setStep("confirm");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {step === "link" && (
        <div>
          <p style={styles.stepLabel}>Link Bank Account or Card</p>
          <iframe
            ref={iframeRef}
            src={`https://sandbox.coinflow.cash/solana/withdraw/${COINFLOW_MERCHANT_ID}?sessionKey=placeholder&bankAccountLinkRedirect=${encodeURIComponent(window.location.href)}`}
            style={styles.iframe}
            allow="payment; clipboard-write"
            title="Coinflow Bank Auth"
          />
        </div>
      )}

      {step === "confirm" && (
        <div>
          <p style={styles.stepLabel}>Confirm Withdrawal</p>
          <div style={styles.summary}>
            <div style={styles.summaryRow}>
              <span>Amount</span>
              <strong>${amount} USD</strong>
            </div>
            <div style={styles.summaryRow}>
              <span>Payout to</span>
              <strong>Visa ****0004</strong>
            </div>
            <div style={styles.summaryRow}>
              <span>Speed</span>
              <strong>Push to card (instant)</strong>
            </div>
          </div>
          <button
            style={styles.payoutButton}
            onClick={initiatePayout}
            disabled={loading}
          >
            {loading ? "Processing..." : `Withdraw $${amount}`}
          </button>
          <p style={styles.hint}>
            Funds will be deducted from your Elantil wallet and sent to your linked card.
          </p>
        </div>
      )}

      {step === "processing" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: "#ffe500", fontSize: "1rem" }}>Processing withdrawal...</p>
        </div>
      )}

      {step === "done" && (
        <div>
          <p style={{ ...styles.stepLabel, color: "#00c853" }}>
            Withdrawal Submitted
          </p>
          <p style={styles.hint}>
            ${amount} USD payout initiated. Coinflow will send the funds to your card.
            Elantil wallet will be debited when confirmed.
          </p>
          {payoutResult && (
            <pre style={styles.result}>
              {JSON.stringify(payoutResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  stepLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#ffe500",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iframe: {
    width: "100%",
    minHeight: 400,
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    background: "#fff",
  },
  summary: {
    background: "#0d0d0d",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1a1a1a",
    fontSize: "0.9rem",
    color: "#ccc",
  },
  payoutButton: {
    width: "100%",
    background: "#00c853",
    color: "#000",
    border: "none",
    padding: 16,
    borderRadius: 8,
    fontSize: "1.1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  hint: {
    color: "#888",
    fontSize: "0.75rem",
    marginTop: 12,
    lineHeight: 1.6,
    textAlign: "center" as const,
  },
  result: {
    background: "#0d0d0d",
    borderRadius: 8,
    padding: 12,
    fontSize: "0.7rem",
    color: "#888",
    overflow: "auto",
    maxHeight: 150,
    marginTop: 8,
  },
};
