/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINFLOW_MERCHANT_ID?: string;
  readonly VITE_COINFLOW_ENV?: string;
  /** Shopper session key for POST /checkout/card (header x-coinflow-auth-session-key) */
  readonly VITE_COINFLOW_AUTH_SESSION_KEY?: string;
  /** Stable external id for GET /auth/session-key (header x-coinflow-auth-user-id) */
  readonly VITE_COINFLOW_AUTH_USER_ID?: string;
  readonly VITE_COINFLOW_API_KEY?: string;
  readonly VITE_COINFLOW_TX_APIKEY?: string;
  readonly VITE_COINFLOW_TX_TOKENEX_ID?: string;
  readonly VITE_COINFLOW_API_BASE?: string;
  readonly VITE_COINFLOW_SAVED_CARD_TOKEN?: string;
  readonly VITE_COINFLOW_CHECKOUT_CARD_TOKEN?: string;
  readonly VITE_COINFLOW_AUTH_WALLET?: string;
  readonly VITE_CHECKOUT_PAYIN_FIXED_FEE_CENTS?: string;
  readonly VITE_CHECKOUT_PAYIN_VARIABLE_FEE_PERCENT?: string;
  readonly VITE_APP_ORIGIN?: string;
  readonly VITE_TUNNEL_HOSTNAME?: string;
  /** Legacy MonkeyTilt demo (unused in checkout-only app) */
  readonly VITE_PAYMENTS_API?: string;
  readonly VITE_HMAC_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
