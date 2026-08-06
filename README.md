# Coinflow Sandbox Example

React demo with **Checkout**, **Withdraw SDK**, and **Payout API** tabs — plus a React Native app for mobile testing.

## Quick Start (Web)

```bash
npm install
npm run dev
# Open http://localhost:5173
```

Tabs:

| Tab | What it tests |
|-----|----------------|
| **Checkout** | `POST /checkout/link` — hosted checkout URL (AFT bug repro) |
| **Withdraw SDK** | [`CoinflowWithdraw`](https://docs.coinflow.cash/guides/payouts/implementation-methods/coinflow-withdraw-component) + **Phantom** wallet |
| **Payout API** | Bank-auth iframe + delegated wallet payout |

### Withdraw SDK (Web)

1. Install the [Phantom](https://phantom.app/) browser extension.
2. Open the **Withdraw SDK** tab and click **Connect Phantom**.
3. Approve the connection in Phantom — session key is fetched using your wallet address (no shopper ID).

## Quick Start (React Native — iOS Simulator)

```bash
npm run install:mobile
cp mobile/.env.example mobile/.env   # fill EXPO_PUBLIC_* from root .env
npm run dev:mobile:ios               # first run builds dev client (~5–10 min)
```

On **iOS Simulator**, tap **Connect simulator wallet** (Phantom is not available in the simulator). Uses an in-memory dev wallet + wallet-based session key so `CoinflowWithdraw` loads.

## Quick Start (React Native — Android)

```bash
npm run install:mobile
cp mobile/.env.example mobile/.env   # fill EXPO_PUBLIC_* from root .env
cd mobile && npx expo run:android    # dev build (required for MWA)
```

Uses [`@coinflowlabs/react-native`](https://www.npmjs.com/package/@coinflowlabs/react-native) with **Phantom** via [Mobile Wallet Adapter](https://docs.solanamobile.com/get-started/react-native/mobile-wallet-adapter) on Android.

**Note:** Expo Go does not include MWA native modules. Build a dev client (`expo run:android`) and install Phantom on the device/emulator.

## Environment (Web)

Set in `.env` (see `.env.example`):

- `VITE_COINFLOW_MERCHANT_ID`
- `VITE_COINFLOW_ENV=sandbox`
- `VITE_COINFLOW_API_KEY` — session key + API calls
- `VITE_COINFLOW_AUTH_USER_ID` — used by Checkout and Payout API tabs only
- `VITE_SOLANA_RPC_URL` — optional (default devnet)

## Environment (Mobile)

Set in `mobile/.env` with `EXPO_PUBLIC_` prefix (see `mobile/.env.example`).

Optional: `EXPO_PUBLIC_SOLANA_CLUSTER=devnet` or `mainnet-beta` for MWA chain selection.

## Withdraw SDK Notes

Web and RN withdraw flows use the [Coinflow Withdraw docs](https://docs.coinflow.cash/guides/payouts/implementation-methods/coinflow-withdraw-component) **Web3 customer** pattern:

- Real Phantom wallet (browser extension on web, MWA on Android)
- `GET /auth/session-key` with `x-coinflow-auth-wallet` only (no `x-coinflow-auth-user-id`)
- `CoinflowWithdraw` handles KYC, bank link, and payout UI

For **merchant-initiated** payouts (no user wallet), use the **Payout API** tab instead.

## Apple Pay (Checkout)

Apple Pay in the hosted checkout iframe only works on a **registered HTTPS domain**. `127.0.0.1` and raw IPs are rejected (`Invalid domainName`).

### Register your dev/staging domain

1. In **Coinflow Merchant Dashboard** → Apple Pay settings, whitelist your dev hostname (e.g. `coinflow-dev.yourcompany.com`).
2. Download the **site association file** from the dashboard.
3. Save it as `public/.well-known/apple-developer-merchantid-domain-association` (see `public/.well-known/README.md`).
4. Deploy this app to that domain over **HTTPS** and confirm the file is public:

   ```bash
   curl -I "https://<your-domain>/.well-known/apple-developer-merchantid-domain-association"
   ```

5. Tell Coinflow to validate the domain with Apple.
6. Open checkout at `https://<your-domain>/` — not `http://127.0.0.1:5173`.

Optional: set `VITE_APP_ORIGIN=https://<your-domain>` in `.env` as a reminder of the URL to use.

Card payments and other checkout flows can still be tested locally; Apple Pay requires the whitelisted domain.

Docs: [Implement Apple Pay](https://docs.coinflow.cash/guides/checkout/payment-methods/payment-methods/apple-pay/implement-apple-pay)

### Dev via Cloudflare Tunnel (Option C)

Expose your local Vite server at a real HTTPS domain (for Apple Pay + verification file). Requires a **hostname on Cloudflare DNS**.

**One-time setup:**

```bash
brew install cloudflared
npm install
npm run tunnel:setup
# Follow prompts: log in, create tunnel, route DNS to your hostname
```

Or manually: copy `tunnel/cloudflared.example.yml` → `tunnel/cloudflared.yml`, then:

```bash
cloudflared tunnel login
cloudflared tunnel create coinflow-example
cloudflared tunnel route dns coinflow-example coinflow-dev.yourcompany.com
```

Set in `.env`:

```
VITE_TUNNEL_HOSTNAME=coinflow-dev.yourcompany.com
VITE_APP_ORIGIN=https://coinflow-dev.yourcompany.com
```

**Each session:**

```bash
# Terminal: Vite + tunnel together
npm run dev:tunnel

# Open (HTTPS — Cloudflare terminates TLS)
https://coinflow-dev.yourcompany.com/

# Verify Apple Pay association file
curl -I "https://coinflow-dev.yourcompany.com/.well-known/apple-developer-merchantid-domain-association"
```

Whitelist the same hostname in Coinflow, place the association file in `public/.well-known/`, then ask Coinflow to validate.

### Deploy to Vercel (easiest — no Cloudflare access)

Gives you a stable HTTPS URL like `maddie-coinflowexample.vercel.app`.

1. Put the Apple Pay verification file in `public/.well-known/apple-developer-merchantid-domain-association`
2. Install Vercel CLI: `npm i -g vercel`
3. Deploy from this repo:

   ```bash
   vercel
   # Pick a project name → becomes https://<project-name>.vercel.app
   ```

4. Add env vars in the [Vercel dashboard](https://vercel.com) → Project → Settings → Environment Variables (same as `.env`, `VITE_*` prefix)
5. Redeploy: `vercel --prod`
6. Whitelist `https://<project-name>.vercel.app` in Coinflow (hostname only: `<project-name>.vercel.app`)
7. Verify:

   ```bash
   curl -I "https://<project-name>.vercel.app/.well-known/apple-developer-merchantid-domain-association"
   ```

8. Open the app at `https://<project-name>.vercel.app/` — not localhost

**Note:** The verification file is gitignored (merchant-specific). Either deploy from your machine after placing the file locally, or add it as a Vercel env/file before deploy.

### ngrok (local dev tunnel)

Works if you have a **reserved domain** on a paid ngrok plan (free URLs change every session and can't be whitelisted).

```bash
npm run dev
ngrok http 5173 --domain=maddie-coinflowexample.ngrok.app
```

Open `https://maddie-coinflowexample.ngrok.app` and whitelist that hostname in Coinflow. Free ngrok URLs (`*.ngrok-free.app` random) won't work for Apple Pay registration.
