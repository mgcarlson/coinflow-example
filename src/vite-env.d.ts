/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINFLOW_MERCHANT_ID?: string;
  readonly VITE_COINFLOW_ENV?: string;
  /** Shoppersession key for POST /checkout/card (header x-coinflow-auth-session-key) */
  readonly VITE_COINFLOW_AUTH_SESSION_KEY?: string;
  /** Stable external id for GET /auth/session-key (header x-coinflow-auth-user-id) */
  readonly VITE_COINFLOW_AUTH_USER_ID?: string;
  readonly VITE_COINFLOW_API_KEY?: string;
  readonly VITE_COINFLOW_TX_APIKEY?: string;
  readonly VITE_COINFLOW_TX_TOKENEX_ID?: string;
  readonly VITE_COINFLOW_API_BASE?: string;
  /** Legacy MonkeyTilt demo (unused in checkout-only app) */
  readonly VITE_PAYMENTS_API?: string;
  readonly VITE_HMAC_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
