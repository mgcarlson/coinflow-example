# Coinflow Checkout — React Integration Example

Sample React component for embedding Coinflow card payments into monkeytilt-club.

## Quick Start

```bash
cd examples/react-checkout
npm install
npm run dev
# Open http://localhost:5173
```

## How It Works

1. Frontend calls monkeytilt-payments API to create a session
2. API returns a Coinflow `sessionKey` and checkout config
3. `CoinflowCardForm` renders an inline card form (no iframe)
4. User enters card details, hits pay
5. SDK tokenizes the card via Basis Theory
6. Frontend submits the token to Coinflow's checkout API
7. Coinflow processes the payment and sends a webhook to monkeytilt-payments
8. monkeytilt-payments calls the C# bridge → Elantil credits the player's wallet

## Environment

Set these in `.env`:

```
VITE_PAYMENTS_API=https://payments.mt-dev.monkeytilt.pro
VITE_COINFLOW_MERCHANT_ID=maddie
VITE_COINFLOW_ENV=sandbox
```

## For Production

In monkeytilt-club, the HMAC signing should happen server-side (never expose
the shared secret in client code). The frontend should call a monkeytilt-club
backend endpoint that proxies the request to monkeytilt-payments with proper
HMAC headers.
