/**
 * Coinflow REST API base URL.
 * In dev, default is Vite proxy path `/coinflow-api` → api-sandbox (avoids CORS).
 * Override with VITE_COINFLOW_API_BASE if needed.
 */
export function getCoinflowApiBase(): string {
  const fromEnv = import.meta.env.VITE_COINFLOW_API_BASE?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "/coinflow-api";
  return import.meta.env.VITE_COINFLOW_ENV === "prod"
    ? "https://api.coinflow.cash/api"
    : "https://api-sandbox.coinflow.cash/api";
}

/** Required TokenEx headers per Coinflow card-tokenization docs. */
export function tokenizeHeaders(): Record<string, string> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  const txApiKey = import.meta.env.VITE_COINFLOW_TX_APIKEY?.trim();
  const tokenexId =
    import.meta.env.VITE_COINFLOW_TX_TOKENEX_ID?.trim() ||
    (import.meta.env.VITE_COINFLOW_ENV === "prod"
      ? "2781185452603874"
      : "4582952996979143");

  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "tx-token-scheme": "sixANTOKENfour",
    "tx-tokenex-id": tokenexId,
  };
  if (auth) h.Authorization = auth;
  if (txApiKey) h["tx-apikey"] = txApiKey;
  return h;
}

export function missingTokenizeConfig(): string[] {
  const missing: string[] = [];
  if (!import.meta.env.VITE_COINFLOW_API_KEY?.trim())
    missing.push("VITE_COINFLOW_API_KEY");
  if (!import.meta.env.VITE_COINFLOW_TX_APIKEY?.trim())
    missing.push("VITE_COINFLOW_TX_APIKEY");
  return missing;
}

/**
 * GET /auth/session-key — shopper JWT for x-coinflow-auth-session-key on checkout.
 * https://docs.coinflow.cash/api-reference/api-reference/authentication/get-session-key
 */
export async function fetchSessionKey(externalUserId: string): Promise<string> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const uid = externalUserId.trim();
  if (!uid) {
    throw new Error("Shopper ID (x-coinflow-auth-user-id) is required");
  }

  const url = `${getCoinflowApiBase()}/auth/session-key`;
  const headers: Record<string, string> = {
    Authorization: auth,
    "x-coinflow-auth-user-id": uid,
  };
  const mid = import.meta.env.VITE_COINFLOW_MERCHANT_ID?.trim();
  if (mid) headers["x-coinflow-auth-merchant-id"] = mid;

  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let data: { key?: string };
  try {
    data = JSON.parse(text) as { key?: string };
  } catch {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 280)}`);
  }
  if (!res.ok) {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 280)}`);
  }
  if (!data.key) {
    throw new Error("Session response missing key");
  }
  return data.key;
}

export type CardCheckoutCardPayload = {
  cardToken: string;
  expYear: string;
  expMonth: string;
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  country: string;
  zip?: string;
  state?: string;
};

/**
 * POST /checkout/card/{merchantId}
 * https://docs.coinflow.cash/api-reference/api-reference/checkout/card-checkout
 */
export async function postCardCheckout(args: {
  merchantId: string;
  sessionKey: string;
  subtotalCents: number;
  currency: string;
  card: CardCheckoutCardPayload;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${getCoinflowApiBase()}/checkout/card/${encodeURIComponent(
    args.merchantId
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coinflow-auth-session-key": args.sessionKey,
    },
    body: JSON.stringify({
      subtotal: {
        cents: args.subtotalCents,
        currency: args.currency,
      },
      card: args.card,
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/** POST /tokenize (PAN + optional CVV). Returns parsed JSON or throws. */
export async function postTokenizePanCvv(body: {
  data: string;
  cvv?: string;
}): Promise<unknown> {
  const res = await fetch(`${getCoinflowApiBase()}/tokenize`, {
    method: "POST",
    headers: tokenizeHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Tokenize ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`Tokenize ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

export function extractTokenFromTokenizeResponse(data: unknown): string | null {
  if (data && typeof data === "object" && "token" in data) {
    const t = (data as { token: unknown }).token;
    return typeof t === "string" ? t : null;
  }
  return null;
}
