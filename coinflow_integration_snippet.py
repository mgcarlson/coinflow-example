"""
MonkeyTilt → Coinflow Integration Snippet

How we create checkout sessions and handle webhooks.
Settlement type: USDC
"""

import httpx

COINFLOW_API_URL = "https://api-sandbox.coinflow.cash/api"
COINFLOW_API_KEY = "your_api_key"
COINFLOW_MERCHANT_ID = "maddie"
COINFLOW_SETTLEMENT_TYPE = "USDC"


# ─── 1. Create a checkout link (deposit) ───────────────────────────────

def create_checkout_link(user_id: str, amount_cents: int, currency: str = "USD") -> dict:
    """
    Creates a hosted checkout URL that we load in an iframe.
    Returns: { "link": "https://sandbox.coinflow.cash/solana/purchase-v2/maddie?..." }
    """
    payload = {
        "subtotal": {"cents": amount_cents, "currency": currency},
        "settlementType": COINFLOW_SETTLEMENT_TYPE,
        "chargebackProtectionData": [
            {
                "productName": "MonkeyTilt Deposit",
                "productType": "onlineCasino",
                "quantity": 1,
                "listPrice": {"cents": amount_cents, "currency": currency},
            }
        ],
        "theme": {
            "style": "rounded",
            "ctaColor": "#ffe500",
            "background": "#1a1a1a",
            "font": "Poppins",
        },
    }

    response = httpx.post(
        f"{COINFLOW_API_URL}/checkout/link",
        json=payload,
        headers={
            "Authorization": COINFLOW_API_KEY,
            "x-coinflow-auth-user-id": user_id,
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


# ─── 2. Get a session key (for user identification) ────────────────────

def get_session_key(user_id: str) -> str:
    """
    Get a Coinflow session key for a user. Valid for 24 hours.
    We cache this and refresh before expiry.
    """
    response = httpx.get(
        f"{COINFLOW_API_URL}/auth/session-key",
        headers={
            "Authorization": COINFLOW_API_KEY,
            "x-coinflow-auth-user-id": user_id,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json().get("key", "")


# ─── 3. Frontend loads the checkout URL in an iframe ────────────────────

# The link returned by create_checkout_link() is loaded directly in an iframe:
#
#   <iframe src="{checkout_link}" allow="payment; clipboard-write" />
#
# We listen for postMessage events from the iframe for success/error callbacks.
# We do NOT use the CoinflowPurchase React SDK — just the hosted URL in an iframe.


# ─── 4. Webhook handling ───────────────────────────────────────────────

# Coinflow POSTs webhooks to our endpoint.
# We verify the Authorization header matches our webhook validation key.
# The webhook is processed asynchronously (immediate 200 response).

# Webhook payload example:
# {
#     "eventType": "Card Payment Authorized",
#     "data": {
#         "id": "payment-uuid",
#         "subtotal": {"cents": 2500, "currency": "USD"},
#         "total": {"cents": 2627, "currency": "USD"},
#         "fees": {"cents": 127, "currency": "USD"},
#         "customerId": "player-uuid",
#         "webhookInfo": {"session_id": "our-session-uuid", "owner_id": "player-uuid"},
#         ...
#     }
# }

# Events we handle:
#   "Card Payment Authorized" → authorize transaction in our backend
#   "Settled" → capture/finalize transaction
#   "Withdraw Success" → finalize withdrawal
#   "Withdraw Failure" → rollback withdrawal

def verify_webhook(authorization_header: str, validation_key: str) -> bool:
    """Verify Coinflow webhook by comparing Authorization header."""
    import hmac
    return hmac.compare_digest(authorization_header, validation_key)


# ─── 5. Example: full deposit flow ─────────────────────────────────────

if __name__ == "__main__":
    user_id = "9d450c0f-8919-4bec-a520-23c73f11e219"

    # Step 1: Create checkout link
    result = create_checkout_link(user_id=user_id, amount_cents=2500)
    checkout_url = result.get("link", "")
    print(f"Checkout URL: {checkout_url}")

    # Step 2: Frontend loads checkout_url in iframe
    # Step 3: User completes payment
    # Step 4: Coinflow sends webhook → we process it async
    # Step 5: We authorize + capture in our backend (Elantil integration)
