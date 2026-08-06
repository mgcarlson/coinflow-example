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

export const COINFLOW_BLOCKCHAIN = "solana" as const;

/**
 * Deterministic Solana pubkey from merchant user id (Coinflow wallet pattern).
 * https://docs.coinflow.cash/guides/developer-resources/checkout-implementation/wallets
 */
export async function getSolanaWalletPubkeyFromUserId(
  userId: string
): Promise<string> {
  const override = import.meta.env.VITE_COINFLOW_AUTH_WALLET?.trim();
  if (override) return override;

  const { Keypair } = await import("@solana/web3.js");
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(userId.trim()) as BufferSource
  );
  const seed = new Uint8Array(hash).slice(0, 32);
  return Keypair.fromSeed(seed).publicKey.toBase58();
}

export function coinflowWalletHeaders(wallet: string): Record<string, string> {
  return {
    "x-coinflow-auth-wallet": wallet,
    "x-coinflow-auth-blockchain": COINFLOW_BLOCKCHAIN,
  };
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
export async function fetchSessionKey(
  externalUserId: string,
  wallet?: string
): Promise<string> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const uid = externalUserId.trim();
  if (!uid) {
    throw new Error("Shopper ID (x-coinflow-auth-user-id) is required");
  }

  const walletPubkey =
    wallet?.trim() || (await getSolanaWalletPubkeyFromUserId(uid));

  const url = `${getCoinflowApiBase()}/auth/session-key`;
  const headers: Record<string, string> = {
    Authorization: auth,
    "x-coinflow-auth-user-id": uid,
    ...coinflowWalletHeaders(walletPubkey),
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

/**
 * GET /auth/session-key for a connected Web3 wallet (no merchant user id).
 * Uses x-coinflow-auth-wallet + x-coinflow-auth-blockchain per Coinflow wallet docs.
 */
export async function fetchSessionKeyForWallet(
  walletPubkey: string
): Promise<string> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const wallet = walletPubkey.trim();
  if (!wallet) {
    throw new Error("Connect a wallet first");
  }

  const url = `${getCoinflowApiBase()}/auth/session-key`;
  const headers: Record<string, string> = {
    Authorization: auth,
    ...coinflowWalletHeaders(wallet),
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

export type ChargebackProtectionItem = {
  productName: string;
  productType: string;
  quantity: number;
  rawProductData?: Record<string, unknown>;
};

/** Default chargebackProtectionData for sandbox demos. */
export function buildDefaultChargebackProtectionData(): ChargebackProtectionItem[] {
  return [
    {
      productName: "Sandbox purchase",
      productType: "inGameProduct",
      quantity: 1,
      rawProductData: {
        productID: "sandbox-demo-1",
        productDescription: "Coinflow example checkout",
        productCategory: "Demo",
      },
    },
  ];
}

/** Fixed pay-in fee — see CustomPayInFeeValue0 in get-checkout-link API. */
export type CustomPayInFixedFee = {
  cents: number;
  currency: string;
  percent: null;
  isFixed: true;
};

/** Variable (percent) pay-in fee — see CustomPayInFeeValue1 in get-checkout-link API. */
export type CustomPayInVariableFee = {
  cents: null;
  currency: null;
  percent: number;
  isFixed: false;
};

export type CustomPayInFeeConfig = {
  fee: CustomPayInFixedFee | CustomPayInVariableFee;
  lineItemLabel: string;
};

/** Default customPayInFees: one fixed + one variable fee for checkout/link demos. */
export function buildDefaultCustomPayInFees(): CustomPayInFeeConfig[] {
  const fixedCents = parseInt(
    import.meta.env.VITE_CHECKOUT_PAYIN_FIXED_FEE_CENTS?.trim() || "50",
    10
  );
  const variablePercent = parseFloat(
    import.meta.env.VITE_CHECKOUT_PAYIN_VARIABLE_FEE_PERCENT?.trim() || "2.9"
  );

  return [
    {
      fee: {
        cents: Number.isFinite(fixedCents) ? fixedCents : 50,
        currency: "USD",
        percent: null,
        isFixed: true,
      },
      lineItemLabel: "Processing fee",
    },
    {
      fee: {
        cents: null,
        currency: null,
        percent: Number.isFinite(variablePercent) ? variablePercent : 2.9,
        isFixed: false,
      },
      lineItemLabel: "Service fee",
    },
  ];
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

export type CoinflowProtectionHeaders = {
  "x-device-id"?: string | null;
  "x-session-id"?: string | null;
};

function protectionHeadersToRecord(
  headers?: CoinflowProtectionHeaders
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

/**
 * GET /auth/session-key — settlement-to-coinflow-wallet (user id only, no wallet).
 */
export async function fetchSessionKeyForUser(
  externalUserId: string
): Promise<string> {
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

export type CheckoutTotalsResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  text: string;
};

/**
 * POST /checkout/totals/{merchantId}
 * https://docs.coinflow.cash/guides/checkout/implementation-overview/implementation-guides/settlement-to-coinflow-wallet
 */
export async function postCheckoutTotals(args: {
  merchantId: string;
  sessionKey: string;
  subtotalCents: number;
  currency?: string;
  protectionHeaders?: CoinflowProtectionHeaders;
}): Promise<CheckoutTotalsResult> {
  const url = `${getCoinflowApiBase()}/checkout/totals/${encodeURIComponent(
    args.merchantId
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coinflow-auth-session-key": args.sessionKey,
      ...protectionHeadersToRecord(args.protectionHeaders),
    },
    body: JSON.stringify({
      subtotal: {
        cents: args.subtotalCents,
        currency: args.currency ?? "USD",
      },
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

export type CardCheckoutResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  text: string;
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
  chargebackProtectionData?: ChargebackProtectionItem[];
  doNotReviewChargebackProtection?: boolean;
  protectionHeaders?: CoinflowProtectionHeaders;
}): Promise<CardCheckoutResult> {
  const url = `${getCoinflowApiBase()}/checkout/card/${encodeURIComponent(
    args.merchantId
  )}`;
  const body: Record<string, unknown> = {
    subtotal: {
      cents: args.subtotalCents,
      currency: args.currency,
    },
    card: args.card,
  };
  if (args.chargebackProtectionData?.length) {
    body.chargebackProtectionData = args.chargebackProtectionData;
  }
  body.doNotReviewChargebackProtection =
    args.doNotReviewChargebackProtection ?? false;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coinflow-auth-session-key": args.sessionKey,
      ...protectionHeadersToRecord(args.protectionHeaders),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
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

/** Shared AFT bug-repro fields — matches POST /checkout/token body (minus token). */
const AFT_RECIPIENT_INFO = {
  firstName: "Roberto",
  lastName: "Test",
  address1: "123 Main St",
  city: "Miami",
  postalCode: "33101",
  countryCode: "GT",
  dateOfBirth: "19900101",
  phoneNumber: "13051234567",
} as const;

const AFT_CUSTOMER_INFO = {
  firstName: "Test",
  lastName: "User",
  dob: "1990-01-01",
  email: "test@test.com",
  address: "123 Main St",
  city: "Miami",
  state: "FL",
  zip: "33101",
  country: "US",
} as const;

const AFT_BUG_REPRO_AUTHENTICATION_3DS = {
  colorDepth: 24,
  screenHeight: 900,
  screenWidth: 1440,
  timeZone: -300,
} as const;

export type AftBugReproCheckoutCore = {
  subtotal: { currency: "USD"; cents: number };
  accountFundingTransaction: {
    recipientAftInfo: {
      firstName: string;
      lastName: string;
      address1: string;
      city: string;
      postalCode: string;
      countryCode: string;
      dateOfBirth: string;
      phoneNumber: string;
    };
  };
  authentication3DS: {
    colorDepth: number;
    screenHeight: number;
    screenWidth: number;
    timeZone: number;
  };
  customerInfo: {
    firstName: string;
    lastName: string;
    dob: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
};

/** Core body shared by checkout/link and checkout/token AFT repro. */
export function buildAftBugReproCheckoutCore(
  cents = 500,
  email?: string
): AftBugReproCheckoutCore {
  return {
    subtotal: { currency: "USD", cents },
    accountFundingTransaction: {
      recipientAftInfo: { ...AFT_RECIPIENT_INFO },
    },
    authentication3DS: { ...AFT_BUG_REPRO_AUTHENTICATION_3DS },
    customerInfo: {
      ...AFT_CUSTOMER_INFO,
      ...(email?.trim() ? { email: email.trim() } : {}),
    },
  };
}

export type CheckoutLinkPayload = AftBugReproCheckoutCore & {
  chargebackProtectionData?: ChargebackProtectionItem[];
  customPayInFees?: CustomPayInFeeConfig[];
  doNotReviewChargebackProtection?: boolean;
};

/**
 * POST /checkout/link body — AFT repro fields + chargebackProtectionData.
 */
export function buildAftBugReproCheckoutLinkPayload(
  cents = 500,
  email?: string
): CheckoutLinkPayload {
  return {
    ...buildAftBugReproCheckoutCore(cents, email),
    chargebackProtectionData: buildDefaultChargebackProtectionData(),
    customPayInFees: buildDefaultCustomPayInFees(),
    doNotReviewChargebackProtection: false,
  };
}

export type CheckoutLinkResult = {
  ok: boolean;
  status: number;
  data: { link?: string } & Record<string, unknown>;
  text: string;
};

/**
 * POST /checkout/link — returns { link } for iframe redirect.
 * https://docs.coinflow.cash/guides/getting-started/card-checkout
 */
export async function postCheckoutLink(args: {
  userId: string;
  body: CheckoutLinkPayload;
  wallet?: string;
  protectionHeaders?: CoinflowProtectionHeaders;
}): Promise<CheckoutLinkResult> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const uid = args.userId.trim();
  if (!uid) {
    throw new Error("x-coinflow-auth-user-id is required");
  }

  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
    "x-coinflow-auth-user-id": uid,
    ...protectionHeadersToRecord(args.protectionHeaders),
  };
  if (args.wallet?.trim()) {
    Object.assign(headers, coinflowWalletHeaders(args.wallet.trim()));
  }

  const res = await fetch(`${getCoinflowApiBase()}/checkout/link`, {
    method: "POST",
    headers,
    body: JSON.stringify(args.body),
  });
  const text = await res.text();
  let data: CheckoutLinkResult["data"] = {};
  try {
    data = JSON.parse(text) as CheckoutLinkResult["data"];
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

export type CheckoutReviewResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  text: string;
};

/** Review API expects pay_<uuid>; card checkout may return a bare UUID. */
export function normalizePaymentIdForReview(paymentId: string): string {
  const id = paymentId.trim();
  if (!id) return id;
  if (id.startsWith("pay_")) return id;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return `pay_${id}`;
  }
  return id;
}

function isReviewPaymentNotFound(result: CheckoutReviewResult): boolean {
  if (result.status !== 400) return false;
  const details = result.data.details;
  if (details === "Payment Not Found") return true;
  const message = result.data.message;
  return typeof message === "string" && /not found/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PUT /checkout/review — chargeback protection manual review (PendingReview → accept/reject).
 * https://docs.coinflow.cash/api-reference/api-reference/checkout/review-payment
 */
export async function putCheckoutReview(args: {
  paymentId: string;
  accept: boolean;
}): Promise<CheckoutReviewResult> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const paymentId = normalizePaymentIdForReview(args.paymentId);
  if (!paymentId) {
    throw new Error("paymentId is required");
  }

  const res = await fetch(`${getCoinflowApiBase()}/checkout/review`, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentId, accept: args.accept }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = text ? { raw: text } : {};
  }
  return { ok: res.ok, status: res.status, data, text };
}

export type CheckoutReviewRetryResult = CheckoutReviewResult & {
  attempts: number;
  paymentId: string;
};

/**
 * Retry review when the payment record is not visible yet (400 Payment Not Found).
 * First attempt fires immediately; subsequent attempts back off briefly.
 */
export async function putCheckoutReviewWithRetry(args: {
  paymentId: string;
  accept: boolean;
  maxAttempts?: number;
  retryDelayMs?: number;
}): Promise<CheckoutReviewRetryResult> {
  const paymentId = normalizePaymentIdForReview(args.paymentId);
  const maxAttempts = args.maxAttempts ?? 10;
  const retryDelayMs = args.retryDelayMs ?? 300;

  let lastResult: CheckoutReviewResult = {
    ok: false,
    status: 0,
    data: {},
    text: "",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await sleep(retryDelayMs);
    }
    lastResult = await putCheckoutReview({
      paymentId,
      accept: args.accept,
    });
    if (lastResult.ok || !isReviewPaymentNotFound(lastResult)) {
      return { ...lastResult, attempts: attempt, paymentId };
    }
    console.log("[checkout/review] payment not found yet, retrying…", {
      attempt,
      paymentId,
    });
  }

  return { ...lastResult, attempts: maxAttempts, paymentId };
}

/** Extract paymentId from checkout API responses or iframe postMessage payloads. */
export function extractPaymentId(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return extractPaymentId(JSON.parse(data) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.paymentId === "string" && obj.paymentId.trim()) {
    return obj.paymentId.trim();
  }
  if (typeof obj.id === "string" && obj.id.startsWith("pay_")) {
    return obj.id.trim();
  }

  const info = obj.info;
  if (info && typeof info === "object") {
    const fromInfo = extractPaymentId(info);
    if (fromInfo) return fromInfo;
  }

  const nested = obj.data;
  if (nested && typeof nested === "object") {
    const fromNested = extractPaymentId(nested);
    if (fromNested) return fromNested;
  }

  return null;
}

/** Coinflow checkout iframe postMessage — verify origin and pull paymentId. */
export function parseCheckoutIframeMessage(
  raw: unknown,
  origin: string
): { paymentId: string | null; eventType: string | null } {
  if (!origin.includes("coinflow.cash")) {
    return { paymentId: null, eventType: null };
  }

  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { paymentId: null, eventType: null };
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }
  if (!parsed) return { paymentId: null, eventType: null };

  const eventType =
    typeof parsed.data === "string"
      ? parsed.data
      : typeof parsed.method === "string"
        ? parsed.method
        : null;

  return {
    paymentId: extractPaymentId(parsed),
    eventType,
  };
}

export function extractCheckoutLink(
  data: Record<string, unknown>
): string | null {
  if (typeof data.link === "string" && data.link.trim()) {
    return data.link;
  }
  const links = extractCheckoutLinks(data);
  return links[0] ?? null;
}

export type TokenCheckoutPayload = AftBugReproCheckoutCore & {
  token: string;
};

/** Fixed AFT bug-repro body (token injected at runtime). */
export function buildAftBugReproTokenCheckoutPayload(
  token: string,
  cents = 500
): TokenCheckoutPayload {
  return {
    ...buildAftBugReproCheckoutCore(cents),
    token,
  };
}

export type TokenCheckoutResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  text: string;
};

/**
 * POST /checkout/token/{merchantId}
 * Requires checkout JWT + Solana wallet headers.
 * https://docs.coinflow.cash/api-reference/api-reference/checkout/token-checkout
 */
export async function postTokenCheckout(args: {
  merchantId: string;
  checkoutJwt: string;
  wallet: string;
  userId: string;
  body: TokenCheckoutPayload;
}): Promise<TokenCheckoutResult> {
  const jwt = args.checkoutJwt.trim();
  if (!jwt) {
    throw new Error("Checkout JWT (session key) is required");
  }
  const wallet = args.wallet.trim();
  if (!wallet) {
    throw new Error("x-coinflow-auth-wallet is required");
  }
  const uid = args.userId.trim();
  if (!uid) {
    throw new Error("x-coinflow-auth-user-id is required");
  }

  const res = await fetch(
    `${getCoinflowApiBase()}/checkout/token/${encodeURIComponent(args.merchantId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        "x-coinflow-auth-session-key": jwt,
        "x-coinflow-auth-user-id": uid,
        ...coinflowWalletHeaders(wallet),
      },
      body: JSON.stringify(args.body),
    }
  );
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** Collect url/link fields Coinflow may return (3DS challenge, verification, etc.). */
export function extractCheckoutLinks(data: Record<string, unknown>): string[] {
  const links = new Set<string>();
  for (const key of [
    "url",
    "link",
    "verificationLink",
    "redirectLink",
    "checkoutLink",
  ]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) links.add(v);
  }
  const additional = data.additionalVerificationLinks;
  if (Array.isArray(additional)) {
    for (const item of additional) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { link?: unknown }).link === "string"
      ) {
        links.add((item as { link: string }).link);
      }
    }
  }
  return [...links];
}

/** Saved/vaulted card token for POST /checkout/token (not a /tokenize PAN token). */
export function resolveSavedCardToken(explicit?: string): string {
  const token =
    explicit?.trim() ||
    import.meta.env.VITE_COINFLOW_SAVED_CARD_TOKEN?.trim() ||
    import.meta.env.VITE_COINFLOW_CHECKOUT_CARD_TOKEN?.trim() ||
    "";
  if (!token) {
    throw new Error(
      "Saved card token required for POST /checkout/token. Save a card via hosted checkout first, then set VITE_COINFLOW_SAVED_CARD_TOKEN or paste the token below. A fresh /tokenize token will not work (Unable to find card)."
    );
  }
  return token;
}

/** Tokenize sandbox 4242 test PAN unless VITE_COINFLOW_CHECKOUT_CARD_TOKEN is set. */
export async function resolveCheckoutCardToken(): Promise<string> {
  const fromEnv = import.meta.env.VITE_COINFLOW_CHECKOUT_CARD_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const missing = missingTokenizeConfig();
  if (missing.length > 0) {
    throw new Error(
      `Set ${missing.join(" and ")} to tokenize 4242, or set VITE_COINFLOW_CHECKOUT_CARD_TOKEN`
    );
  }

  const tokenized = await postTokenizePanCvv({
    data: "4242424242424242",
    cvv: "123",
  });
  const token = extractTokenFromTokenizeResponse(tokenized);
  if (!token) {
    throw new Error("Tokenize response missing token");
  }
  return token;
}

export type WithdrawSpeed =
  | "asap"
  | "same_day"
  | "standard"
  | "card"
  | "iban"
  | "pix"
  | "eft"
  | "venmo"
  | "paypal"
  | "wire"
  | "interac";

type TokenizedPayoutMethod = {
  token: string;
  last4?: string;
  alias?: string;
};

export type Withdrawer = {
  bankAccounts?: TokenizedPayoutMethod[];
  cards?: TokenizedPayoutMethod[];
  ibans?: TokenizedPayoutMethod[];
  pixes?: TokenizedPayoutMethod[];
  paypal?: { token: string; alias?: string; type?: string };
  venmo?: { token: string };
  verification?: { status?: string };
};

export type WithdrawerResponse = {
  withdrawer?: Withdrawer;
};

export type ResolvedPayoutAccount = {
  account: string;
  speed: WithdrawSpeed;
  label: string;
};

function lastLinked<T extends { token: string }>(items?: T[]): T | undefined {
  if (!items?.length) return undefined;
  return items[items.length - 1];
}

/** Pick token + speed after bank auth; prefers type from accountLinked when present. */
export function resolvePayoutAccount(
  withdrawer: Withdrawer | undefined,
  linkedType?: string
): ResolvedPayoutAccount | null {
  if (!withdrawer) return null;
  const type = linkedType?.toLowerCase();

  if (type === "card" || type === "debit") {
    const card = lastLinked(withdrawer.cards);
    if (card) {
      return {
        account: card.token,
        speed: "card",
        label: `Debit card ****${card.last4 ?? "????"}`,
      };
    }
  }

  if (type === "bank") {
    const bank = lastLinked(withdrawer.bankAccounts);
    if (bank) {
      return {
        account: bank.token,
        speed: "same_day",
        label: `${bank.alias ?? "Bank account"} ****${bank.last4 ?? "????"}`,
      };
    }
  }

  if (type === "iban") {
    const iban = lastLinked(withdrawer.ibans);
    if (iban) {
      return {
        account: iban.token,
        speed: "iban",
        label: `${iban.alias ?? "IBAN"} ****${iban.last4 ?? "????"}`,
      };
    }
  }

  if (type === "pix") {
    const pix = lastLinked(withdrawer.pixes);
    if (pix) {
      return {
        account: pix.token,
        speed: "pix",
        label: `PIX ****${pix.last4 ?? "????"}`,
      };
    }
  }

  const card = lastLinked(withdrawer.cards);
  if (card) {
    return {
      account: card.token,
      speed: "card",
      label: `Debit card ****${card.last4 ?? "????"}`,
    };
  }

  const bank = lastLinked(withdrawer.bankAccounts);
  if (bank) {
    return {
      account: bank.token,
      speed: "same_day",
      label: `${bank.alias ?? "Bank account"} ****${bank.last4 ?? "????"}`,
    };
  }

  const iban = lastLinked(withdrawer.ibans);
  if (iban) {
    return {
      account: iban.token,
      speed: "iban",
      label: `${iban.alias ?? "IBAN"} ****${iban.last4 ?? "????"}`,
    };
  }

  const pix = lastLinked(withdrawer.pixes);
  if (pix) {
    return {
      account: pix.token,
      speed: "pix",
      label: `PIX ****${pix.last4 ?? "????"}`,
    };
  }

  if (withdrawer.paypal?.token) {
    return {
      account: withdrawer.paypal.token,
      speed: "paypal",
      label: withdrawer.paypal.alias ?? "PayPal",
    };
  }

  if (withdrawer.venmo?.token) {
    return {
      account: withdrawer.venmo.token,
      speed: "venmo",
      label: "Venmo",
    };
  }

  return null;
}

const WITHDRAW_SPEED_LABELS: Record<WithdrawSpeed, string> = {
  card: "Push to card (instant)",
  asap: "Real-time payments (instant)",
  same_day: "Same-day ACH",
  standard: "Standard ACH (1–3 business days)",
  iban: "SEPA transfer",
  pix: "PIX (instant)",
  eft: "EFT",
  venmo: "Venmo (instant)",
  paypal: "PayPal (instant)",
  wire: "Wire transfer",
  interac: "Interac (instant)",
};

export function withdrawSpeedLabel(speed: WithdrawSpeed): string {
  return WITHDRAW_SPEED_LABELS[speed];
}

/**
 * GET /withdraw — linked payout methods and verification status.
 * https://docs.coinflow.cash/docs/payouts-1#step-2-get-withdrawer-details
 */
export async function fetchWithdrawer(
  userId: string
): Promise<WithdrawerResponse> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const uid = userId.trim();
  if (!uid) {
    throw new Error("User ID (x-coinflow-auth-user-id) is required");
  }

  const res = await fetch(`${getCoinflowApiBase()}/withdraw`, {
    method: "GET",
    headers: {
      Authorization: auth,
      "x-coinflow-auth-user-id": uid,
    },
  });
  const text = await res.text();
  let data: WithdrawerResponse;
  try {
    data = JSON.parse(text) as WithdrawerResponse;
  } catch {
    throw new Error(`Get withdrawer ${res.status}: ${text.slice(0, 280)}`);
  }
  if (!res.ok) {
    throw new Error(`Get withdrawer ${res.status}: ${text.slice(0, 280)}`);
  }
  return data;
}

export type DelegatedPayoutResult = {
  ok: boolean;
  status: number;
  data: { signature?: string; effectiveSpeed?: WithdrawSpeed } & Record<
    string,
    unknown
  >;
  text: string;
};

/**
 * POST /merchant/withdraws/payout/delegated — payout from Coinflow merchant wallet.
 * https://docs.coinflow.cash/api-reference/api-reference/merchant/payout-from-delegated-settlement-wallet
 */
export async function postDelegatedPayout(args: {
  amountCents: number;
  speed: WithdrawSpeed;
  account: string;
  userId: string;
  idempotencyKey?: string;
  waitForConfirmation?: boolean;
}): Promise<DelegatedPayoutResult> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set VITE_COINFLOW_API_KEY in .env");
  }
  const uid = args.userId.trim();
  if (!uid) {
    throw new Error("userId is required for delegated payout");
  }

  const body: Record<string, unknown> = {
    amount: { cents: args.amountCents },
    speed: args.speed,
    account: args.account,
    userId: uid,
    idempotencyKey: args.idempotencyKey ?? crypto.randomUUID(),
  };
  if (args.waitForConfirmation !== undefined) {
    body.waitForConfirmation = args.waitForConfirmation;
  }

  const res = await fetch(
    `${getCoinflowApiBase()}/merchant/withdraws/payout/delegated`,
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  let data: DelegatedPayoutResult["data"] = {};
  try {
    data = JSON.parse(text) as DelegatedPayoutResult["data"];
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

export function bankAuthIframeSrc(sessionKey: string, merchantId: string): string {
  const isProd = import.meta.env.VITE_COINFLOW_ENV === "prod";
  const host = isProd ? "https://coinflow.cash" : "https://sandbox.coinflow.cash";
  const params = new URLSearchParams({
    sessionKey,
    bankAccountLinkRedirect:
      typeof window !== "undefined" ? window.location.href : "",
//    allowedWithdrawSpeeds: "card, standard, same_day, venmo",
  });
  if (typeof window !== "undefined") {
    params.set("origins", JSON.stringify([window.location.origin]));
  }
  return `${host}/solana/withdraw/${encodeURIComponent(
    merchantId
  )}?${params.toString()}`;
}

/** Parse Coinflow bank-auth iframe postMessage (accountLinked). */
export function parseAccountLinkedMessage(
  raw: unknown
): { linked: boolean; accountType?: string } {
  if (raw === "accountLinked") return { linked: true };
  let data: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { linked: false };
    }
  } else if (raw && typeof raw === "object") {
    data = raw as Record<string, unknown>;
  }
  if (!data) return { linked: false };

  const linked =
    data.data === "accountLinked" || data.method === "accountLinked";

  const info = data.info;
  const accountType =
    info && typeof info === "object" && "type" in info
      ? String((info as { type: unknown }).type)
      : undefined;

  return { linked, accountType };
}

/** Sandbox PayPal client-id from Coinflow Venmo docs. */
export const SANDBOX_PAYPAL_CLIENT_ID =
  "AZ27v54Pd6dItFBi39hcHPCSrFSbaylVU4ExPpHi3z0UIIDquGWG4psZK63Sz1EUZVKXyh3ucAAWE9oS";

export type MerchantV2Response = {
  merchant?: Record<string, unknown>;
  [key: string]: unknown;
};

/** PayPal merchant id for SDK `merchant-id` (GET /merchant/v2 or env override). */
export function resolvePayPalMerchantId(
  merchantResponse: MerchantV2Response
): { id: string | null; source: string | null } {
  const envOverride = import.meta.env.VITE_PAYPAL_MERCHANT_ID?.trim();
  if (envOverride) {
    return { id: envOverride, source: "VITE_PAYPAL_MERCHANT_ID" };
  }

  const m = merchantResponse.merchant;
  if (!m || typeof m !== "object") return { id: null, source: null };

  for (const key of [
    "paypalMerchantId",
    "paypal_merchant_id",
    "payPalMerchantId",
  ] as const) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) {
      return { id: v.trim(), source: `merchant.${key}` };
    }
  }

  const vendor = m.vendorSettings;
  if (vendor && typeof vendor === "object" && !Array.isArray(vendor)) {
    const paypal = (vendor as { paypal?: { accountId?: unknown } }).paypal;
    const accountId = paypal?.accountId;
    if (typeof accountId === "string" && accountId.trim()) {
      return {
        id: accountId.trim(),
        source: "merchant.vendorSettings.paypal.accountId",
      };
    }
  }

  return { id: null, source: null };
}

/** GET /merchant/v2 — PayPal merchant id for Venmo SDK. */
export async function fetchMerchantV2(
  sessionKey: string
): Promise<MerchantV2Response> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) throw new Error("Set VITE_COINFLOW_API_KEY in .env");

  const res = await fetch(`${getCoinflowApiBase()}/merchant/v2`, {
    headers: {
      accept: "application/json",
      Authorization: auth,
      "x-coinflow-auth-session-key": sessionKey.trim(),
    },
  });
  const text = await res.text();
  let data: MerchantV2Response = {};
  try {
    data = JSON.parse(text) as MerchantV2Response;
  } catch {
    throw new Error(`Merchant v2 ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Merchant v2 ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

export type VenmoCheckoutResult = {
  ok: boolean;
  status: number;
  data: { paymentId?: string; message?: string } & Record<string, unknown>;
  text: string;
};

/** POST /checkout/venmo/{merchantId} — returns paymentId for PayPal createOrder. */
export async function postVenmoCheckout(args: {
  merchantId: string;
  sessionKey: string;
  userId: string;
  subtotalCents: number;
  email: string;
  currency?: string;
}): Promise<VenmoCheckoutResult> {
  const auth = import.meta.env.VITE_COINFLOW_API_KEY?.trim();
  if (!auth) throw new Error("Set VITE_COINFLOW_API_KEY in .env");

  const res = await fetch(
    `${getCoinflowApiBase()}/checkout/venmo/${encodeURIComponent(args.merchantId)}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: auth,
        "x-coinflow-auth-session-key": args.sessionKey.trim(),
        "x-coinflow-auth-user-id": args.userId.trim(),
      },
      body: JSON.stringify({
        subtotal: {
          cents: args.subtotalCents,
          currency: args.currency ?? "USD",
        },
        venmo: { email: args.email.trim() },
      }),
    }
  );
  const text = await res.text();
  let data: VenmoCheckoutResult["data"] = {};
  try {
    data = JSON.parse(text) as VenmoCheckoutResult["data"];
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}
