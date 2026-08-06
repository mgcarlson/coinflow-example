/**
 * Bank Auth + delegated payout from Coinflow merchant wallet.
 *
 * 1. Session key + Coinflow bank-auth iframe (link bank/card)
 * 2. On accountLinked → GET /withdraw for payout method token
 * 3. Confirm → POST /merchant/withdraws/payout/delegated
 *
 * @see https://docs.coinflow.cash/docs/payouts-1
 */

import { useCallback, useEffect, useState } from "react";
import {
  bankAuthIframeSrc,
  fetchSessionKey,
  fetchWithdrawer,
  parseAccountLinkedMessage,
  postDelegatedPayout,
  resolvePayoutAccount,
  withdrawSpeedLabel,
  type DelegatedPayoutResult,
  type ResolvedPayoutAccount,
} from "./coinflowApi";

const COINFLOW_MERCHANT_ID =
  import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const HAS_API_KEY = Boolean(import.meta.env.VITE_COINFLOW_API_KEY?.trim());

type Props = {
  sessionId: string;
  playerId: string;
  amount: string;
  onSuccess: () => void;
  onError: (error: string) => void;
};

type Step = "loading" | "link" | "confirm" | "processing" | "done";

function majorToCents(amount: string): number | null {
  const n = parseFloat(amount);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function payoutErrorMessage(
  status: number,
  data: DelegatedPayoutResult["data"]
): string {
  if (status === 451 && typeof data.verificationLink === "string") {
    return `Additional verification required: ${data.verificationLink}`;
  }
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  return `Payout failed (${status})`;
}

export function BankAuthPayout({
  playerId,
  amount,
  onSuccess,
  onError,
}: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [loading, setLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [payoutAccount, setPayoutAccount] =
    useState<ResolvedPayoutAccount | null>(null);
  const [payoutResult, setPayoutResult] =
    useState<DelegatedPayoutResult["data"] | null>(null);

  const loadPayoutAccount = useCallback(
    async (linkedType?: string) => {
      const { withdrawer } = await fetchWithdrawer(playerId);
      const resolved = resolvePayoutAccount(withdrawer, linkedType);
      if (!resolved) {
        throw new Error(
          "No linked payout method found. Complete bank auth in the iframe first."
        );
      }
      setPayoutAccount(resolved);
      return resolved;
    },
    [playerId]
  );

  useEffect(() => {
    if (!HAS_API_KEY) {
      setSessionError("Set VITE_COINFLOW_API_KEY in .env");
      setStep("link");
      return;
    }
    let cancelled = false;
    setStep("loading");
    setSessionError(null);
    fetchSessionKey(playerId)
      .then((key) => {
        if (!cancelled) {
          setSessionKey(key);
          setStep("link");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSessionError(
            e instanceof Error ? e.message : "Session key failed"
          );
          setStep("link");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin.includes("coinflow.cash")) return;
      const { linked, accountType } = parseAccountLinkedMessage(event.data);
      if (!linked) return;

      setLoading(true);
      loadPayoutAccount(accountType)
        .then(() => setStep("confirm"))
        .catch((e) => {
          onError(e instanceof Error ? e.message : "Failed to load payout method");
        })
        .finally(() => setLoading(false));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [loadPayoutAccount, onError]);

  async function initiatePayout() {
    const cents = majorToCents(amount);
    if (cents == null) {
      onError("Invalid payout amount");
      return;
    }

    setLoading(true);
    setStep("processing");

    try {
      let account = payoutAccount;
      if (!account) {
        account = await loadPayoutAccount();
      }

      const result = await postDelegatedPayout({
        amountCents: cents,
        speed: account.speed,
        account: account.account,
        userId: playerId,
      });

      if (result.ok) {
        setPayoutResult(result.data);
        setStep("done");
        onSuccess();
      } else {
        onError(payoutErrorMessage(result.status, result.data));
        setStep("confirm");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Payout failed");
      setStep("confirm");
    } finally {
      setLoading(false);
    }
  }

  const cents = majorToCents(amount);
  const iframeSrc =
    sessionKey && HAS_API_KEY
      ? bankAuthIframeSrc(sessionKey, COINFLOW_MERCHANT_ID)
      : null;

  return (
    <div>
      {step === "loading" && (
        <p style={styles.hint}>Loading session for bank authentication…</p>
      )}

      {sessionError && (
        <p style={styles.error}>{sessionError}</p>
      )}

      {step === "link" && (
        <div>
          <p style={styles.stepLabel}>Link bank account or card</p>
          {!HAS_API_KEY && (
            <p style={styles.error}>
              Delegated payout requires <code>VITE_COINFLOW_API_KEY</code> in{" "}
              <code>.env</code>.
            </p>
          )}
          {iframeSrc ? (
            <iframe
              src={iframeSrc}
              style={styles.iframe}
              allow="payment; clipboard-write; geolocation"
              title="Coinflow Bank Auth"
            />
          ) : (
            HAS_API_KEY &&
            !sessionError && (
              <p style={styles.hint}>Waiting for session key…</p>
            )
          )}
          {payoutAccount && (
            <button
              type="button"
              style={{ ...styles.secondaryButton, marginTop: 12 }}
              onClick={() => setStep("confirm")}
            >
              Continue to payout (already linked)
            </button>
          )}
        </div>
      )}

      {step === "confirm" && payoutAccount && cents != null && (
        <div>
          <p style={styles.stepLabel}>Confirm withdrawal</p>
          <div style={styles.summary}>
            <div style={styles.summaryRow}>
              <span>Amount</span>
              <strong>${amount} USD</strong>
            </div>
            <div style={styles.summaryRow}>
              <span>Payout to</span>
              <strong>{payoutAccount.label}</strong>
            </div>
            <div style={styles.summaryRow}>
              <span>Speed</span>
              <strong>{withdrawSpeedLabel(payoutAccount.speed)}</strong>
            </div>
          </div>
          <button
            type="button"
            style={styles.payoutButton}
            onClick={initiatePayout}
            disabled={loading}
          >
            {loading ? "Processing…" : `Withdraw $${amount}`}
          </button>
          <p style={styles.hint}>
            Funds are deducted from your Coinflow merchant wallet and sent to
            the linked account.
          </p>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => setStep("link")}
            disabled={loading}
          >
            Link a different account
          </button>
        </div>
      )}

      {step === "processing" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: "#ffe500", fontSize: "1rem" }}>
            Processing withdrawal…
          </p>
        </div>
      )}

      {step === "done" && (
        <div>
          <p style={{ ...styles.stepLabel, color: "#00c853" }}>
            Withdrawal submitted
          </p>
          <p style={styles.hint}>
            ${amount} USD payout initiated from your Coinflow wallet.
            {payoutResult?.signature && (
              <>
                {" "}
                Signature:{" "}
                <code style={{ fontSize: "0.7rem" }}>
                  {payoutResult.signature.slice(0, 24)}…
                </code>
              </>
            )}
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
  secondaryButton: {
    width: "100%",
    background: "transparent",
    color: "#888",
    border: "1px solid #2a2a2a",
    padding: 10,
    borderRadius: 8,
    fontSize: "0.85rem",
    cursor: "pointer",
    marginTop: 8,
  },
  hint: {
    color: "#888",
    fontSize: "0.75rem",
    marginTop: 12,
    lineHeight: 1.6,
    textAlign: "center" as const,
  },
  error: {
    color: "#ff3d00",
    fontSize: "0.85rem",
    marginBottom: 12,
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
