const API_BASE =
  process.env.EXPO_PUBLIC_COINFLOW_API_BASE?.replace(/\/$/, "") ||
  (process.env.EXPO_PUBLIC_COINFLOW_ENV === "prod"
    ? "https://api.coinflow.cash/api"
    : "https://api-sandbox.coinflow.cash/api");

/** Sandbox PayPal client-id from Coinflow Venmo docs. */
export const SANDBOX_PAYPAL_CLIENT_ID =
  "AZ27v54Pd6dItFBi39hcHPCSrFSbaylVU4ExPpHi3z0UIIDquGWG4psZK63Sz1EUZVKXyh3ucAAWE9oS";

export function getCoinflowApiBase(): string {
  return API_BASE;
}

function apiKey(): string {
  const auth = process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim();
  if (!auth) throw new Error("Set EXPO_PUBLIC_COINFLOW_API_KEY");
  return auth;
}

/**
 * GET /auth/session-key — shopper user id (settlement-to-coinflow-wallet pattern).
 */
export async function fetchSessionKeyForUser(
  externalUserId: string
): Promise<string> {
  const uid = externalUserId.trim();
  if (!uid) throw new Error("Shopper user id is required");

  const headers: Record<string, string> = {
    Authorization: apiKey(),
    "x-coinflow-auth-user-id": uid,
  };
  const mid = process.env.EXPO_PUBLIC_COINFLOW_MERCHANT_ID?.trim();
  if (mid) headers["x-coinflow-auth-merchant-id"] = mid;

  const res = await fetch(`${API_BASE}/auth/session-key`, { headers });
  const text = await res.text();
  let data: { key?: string };
  try {
    data = JSON.parse(text) as { key?: string };
  } catch {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !data.key) {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 200)}`);
  }
  return data.key;
}

export type MerchantV2Response = {
  merchant?: {
    paypalMerchantId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** PayPal merchant id for SDK merchant-id param (from GET /merchant/v2 or env override). */
export function resolvePayPalMerchantId(
  merchantResponse: MerchantV2Response
): { id: string | null; source: string | null } {
  const envOverride = process.env.EXPO_PUBLIC_PAYPAL_MERCHANT_ID?.trim();
  if (envOverride) return { id: envOverride, source: "EXPO_PUBLIC_PAYPAL_MERCHANT_ID" };

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
      return { id: accountId.trim(), source: "merchant.vendorSettings.paypal.accountId" };
    }
  }

  return { id: null, source: null };
}

/** GET /merchant/v2 — read merchant.paypalMerchantId for PayPal SDK. */
export async function fetchMerchantV2(
  sessionKey: string
): Promise<MerchantV2Response> {
  const key = sessionKey.trim();
  if (!key) throw new Error("Session key is required");

  const res = await fetch(`${API_BASE}/merchant/v2`, {
    headers: {
      accept: "application/json",
      Authorization: apiKey(),
      "x-coinflow-auth-session-key": key,
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

export type WalletCheckoutResult = {
  ok: boolean;
  status: number;
  data: { paymentId?: string; message?: string } & Record<string, unknown>;
  text: string;
};

/** @deprecated use WalletCheckoutResult */
export type VenmoCheckoutResult = WalletCheckoutResult;

/** POST /checkout/venmo/{merchantId} — returns paymentId for PayPal createOrder. */
export async function postVenmoCheckout(args: {
  merchantId: string;
  sessionKey: string;
  userId: string;
  subtotalCents: number;
  email: string;
  currency?: string;
}): Promise<WalletCheckoutResult> {
  const res = await fetch(
    `${API_BASE}/checkout/venmo/${encodeURIComponent(args.merchantId)}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: apiKey(),
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
  let data: WalletCheckoutResult["data"] = {};
  try {
    data = JSON.parse(text) as WalletCheckoutResult["data"];
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** POST /checkout/paypal/{merchantId} — returns paymentId for PayPal createOrder. */
export async function postPayPalCheckout(args: {
  merchantId: string;
  sessionKey: string;
  userId: string;
  subtotalCents: number;
  email: string;
  currency?: string;
}): Promise<WalletCheckoutResult> {
  const res = await fetch(
    `${API_BASE}/checkout/paypal/${encodeURIComponent(args.merchantId)}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: apiKey(),
        "x-coinflow-auth-session-key": args.sessionKey.trim(),
        "x-coinflow-auth-user-id": args.userId.trim(),
      },
      body: JSON.stringify({
        subtotal: {
          cents: args.subtotalCents,
          currency: args.currency ?? "USD",
        },
        paypal: { email: args.email.trim() },
      }),
    }
  );
  const text = await res.text();
  let data: WalletCheckoutResult["data"] = {};
  try {
    data = JSON.parse(text) as WalletCheckoutResult["data"];
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

export function buildVenmoPayPalHtml(config: {
  paypalClientId: string;
  paypalMerchantId: string;
  cents: number;
}): string {
  const cfg = JSON.stringify(config);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
    }
    #paypal-button-container, #venmo-button-container { min-height: 52px; margin-bottom: 12px; }
    .err { color: #ff3d00; }
    .ok { color: #00c853; }
  </style>
</head>
<body>
  <div id="paypal-button-container"></div>
  <div id="venmo-button-container"></div>
  <script>
    const CONFIG = ${cfg};
    const statusEl = null;
    function setStatus() {}
    function post(type, payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, ...(payload || {}) }));
      }
    }
    window.__orderWaiters = {};
    window.__onOrderResult = function(requestId, ok, value) {
      var waiter = window.__orderWaiters[requestId];
      if (!waiter) return;
      delete window.__orderWaiters[requestId];
      if (ok) waiter.resolve(value);
      else waiter.reject(new Error(value || 'Order failed'));
    };
    function requestCoinflowOrder(funding) {
      return new Promise(function(resolve, reject) {
        var requestId = Math.random().toString(36).slice(2);
        window.__orderWaiters[requestId] = { resolve: resolve, reject: reject };
        post('createOrder', { requestId: requestId, funding: funding });
        setTimeout(function() {
          if (window.__orderWaiters[requestId]) {
            delete window.__orderWaiters[requestId];
            reject(new Error('Order request timed out'));
          }
        }, 60000);
      });
    }
    function loadPayPalSdk() {
      return new Promise(function(resolve, reject) {
        var q = new URLSearchParams({
          'client-id': CONFIG.paypalClientId,
          'merchant-id': CONFIG.paypalMerchantId,
          currency: 'USD',
          intent: 'authorize',
          components: 'buttons',
          'enable-funding': 'venmo,paypal',
          'disable-funding': 'paylater',
          'buyer-country': 'US',
        });
        var s = document.createElement('script');
        s.src = 'https://www.paypal.com/sdk/js?' + q.toString();
        s.setAttribute('data-partner-attribution-id', 'CoinflowLabsLimited_PSP');
        s.onload = function() { resolve(); };
        s.onerror = function() { reject(new Error('PayPal SDK failed to load')); };
        document.head.appendChild(s);
      });
    }
    async function init() {
      try {
        await loadPayPalSdk();
        if (!window.paypal || !window.paypal.Buttons) {
          throw new Error('PayPal SDK not available');
        }
        function wireButtons(fundingSource, fundingKey, containerId, label) {
          var buttons = window.paypal.Buttons({
            fundingSource: fundingSource,
            style: { layout: 'horizontal', shape: 'rect', height: 48, tagline: false },
            createOrder: async function() {
              setStatus('Creating Coinflow ' + label + ' order…');
              var paymentId = await requestCoinflowOrder(fundingKey);
              setStatus('Order created: ' + paymentId);
              post('orderCreated', { paymentId: paymentId, funding: fundingKey });
              return paymentId;
            },
            onApprove: function(data) {
              setStatus('Approved — order ' + data.orderID, 'ok');
              post('approved', { orderId: data.orderID, funding: fundingKey });
            },
            onCancel: function() {
              setStatus(label + ' checkout cancelled');
              post('cancelled', { funding: fundingKey });
            },
            onError: function(err) {
              var msg = (err && err.message) ? err.message : String(err);
              setStatus('Error: ' + msg, 'err');
              post('error', { message: msg, funding: fundingKey });
            },
          });
          return buttons.render(containerId);
        }
        setStatus();
        await wireButtons(window.paypal.FUNDING.PAYPAL, 'paypal', '#paypal-button-container', 'PayPal');
        await wireButtons(window.paypal.FUNDING.VENMO, 'venmo', '#venmo-button-container', 'Venmo');
      } catch (e) {
        var errMsg = (e && e.message) ? e.message : String(e);
        setStatus('Setup failed: ' + errMsg, 'err');
        post('error', { message: errMsg });
      }
    }
    init();
  </script>
</body>
</html>`;
}
