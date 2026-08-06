#!/usr/bin/env bash
# One-time Cloudflare Tunnel setup for Apple Pay dev testing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/tunnel/cloudflared.yml"
EXAMPLE="$ROOT/tunnel/cloudflared.example.yml"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Install cloudflared first:"
  echo "  brew install cloudflared"
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  cp "$EXAMPLE" "$CONFIG"
  echo "Created $CONFIG — edit tunnel UUID, credentials path, and hostname."
fi

read -r -p "Tunnel hostname (e.g. coinflow-dev.yourcompany.com): " HOSTNAME
read -r -p "Tunnel name [coinflow-example]: " TUNNEL_NAME
TUNNEL_NAME="${TUNNEL_NAME:-coinflow-example}"

echo ""
echo "Step 1: Log in to Cloudflare (browser opens)"
cloudflared tunnel login

echo ""
echo "Step 2: Create tunnel '$TUNNEL_NAME'"
cloudflared tunnel create "$TUNNEL_NAME" || true

TUNNEL_UUID="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$0 ~ n {print $1; exit}')"
if [[ -z "$TUNNEL_UUID" ]]; then
  echo "Could not find tunnel UUID. Run: cloudflared tunnel list"
  exit 1
fi

CREDS="$HOME/.cloudflared/${TUNNEL_UUID}.json"
if [[ ! -f "$CREDS" ]]; then
  echo "Credentials not found at $CREDS"
  exit 1
fi

echo ""
echo "Step 3: Route DNS $HOSTNAME → tunnel"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

cat >"$CONFIG" <<EOF
tunnel: $TUNNEL_UUID
credentials-file: $CREDS

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:5173
  - service: http_status:404
EOF

ENV_FILE="$ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^VITE_TUNNEL_HOSTNAME=' "$ENV_FILE"; then
    sed -i '' "s|^VITE_TUNNEL_HOSTNAME=.*|VITE_TUNNEL_HOSTNAME=$HOSTNAME|" "$ENV_FILE"
  else
    echo "VITE_TUNNEL_HOSTNAME=$HOSTNAME" >>"$ENV_FILE"
  fi
  if grep -q '^VITE_APP_ORIGIN=' "$ENV_FILE"; then
    sed -i '' "s|^VITE_APP_ORIGIN=.*|VITE_APP_ORIGIN=https://$HOSTNAME|" "$ENV_FILE"
  else
    echo "VITE_APP_ORIGIN=https://$HOSTNAME" >>"$ENV_FILE"
  fi
else
  echo "Add to .env:"
  echo "  VITE_TUNNEL_HOSTNAME=$HOSTNAME"
  echo "  VITE_APP_ORIGIN=https://$HOSTNAME"
fi

echo ""
echo "Done. Next:"
echo "  1. Whitelist $HOSTNAME in Coinflow + add Apple Pay verification file to public/.well-known/"
echo "  2. npm run dev:tunnel"
echo "  3. Open https://$HOSTNAME/"
echo "  4. Verify: curl -I https://$HOSTNAME/.well-known/apple-developer-merchantid-domain-association"
