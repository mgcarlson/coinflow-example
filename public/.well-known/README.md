# Apple Pay domain verification

Coinflow requires this file on your **whitelisted dev/staging domain** before Apple Pay works in checkout.

## Steps

1. **Register the domain with Coinflow**  
   In the [Coinflow Merchant Dashboard](https://merchant.coinflow.cash) → Apple Pay settings, add the exact hostname you will use (e.g. `coinflow-dev.yourcompany.com`).  
   Do **not** use `127.0.0.1` or a bare IP — Apple Pay only accepts registered domain names.

2. **Download the site association file** from the dashboard (Apple Pay settings).

3. **Place it here** with this exact filename (no extension):

   ```
   public/.well-known/apple-developer-merchantid-domain-association
   ```

4. **Deploy or serve over HTTPS** on that domain. Vite serves `public/` at the site root, so the file must be reachable at:

   ```
   https://<your-whitelisted-domain>/.well-known/apple-developer-merchantid-domain-association
   ```

   Verify in a browser or with:

   ```bash
   curl -I "https://<your-whitelisted-domain>/.well-known/apple-developer-merchantid-domain-association"
   ```

   Expect `200` and `Content-Type: application/octet-stream` or similar (not HTML).

5. **Notify Coinflow** support or your integrations contact so they can validate the domain with Apple.

6. **Open checkout on that domain** — use `https://your-domain/...`, not `http://127.0.0.1:5173`.

## Local dev

Apple Pay will not work on `127.0.0.1`. Options:

- Deploy this app to your whitelisted staging URL and test there.
- Or use `localhost` only if Coinflow has explicitly whitelisted `localhost` for your merchant (uncommon).

## Docs

- [Coinflow: Implement Apple Pay](https://docs.coinflow.cash/guides/checkout/payment-methods/payment-methods/apple-pay/implement-apple-pay)
