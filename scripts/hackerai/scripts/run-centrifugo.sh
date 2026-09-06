#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BIN="$ROOT/bin/centrifugo"
CONFIG="$ROOT/.personal/centrifugo-config.json"

if [ ! -x "$BIN" ]; then
  echo "[centrifugo] bundled binary missing at $BIN" >&2
  exit 1
fi

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

SECRET="${CENTRIFUGO_TOKEN_HMAC_SECRET_KEY:-${CENTRIFUGO_TOKEN_SECRET:-}}"
if [ -z "$SECRET" ]; then
  echo "[centrifugo] no token secret in .env.local" >&2
  exit 1
fi

mkdir -p "$(dirname "$CONFIG")"
if [ ! -f "$CONFIG" ] && [ -f /mnt/documents/hackerai-backup/centrifugo-config.json ]; then
  cp /mnt/documents/hackerai-backup/centrifugo-config.json "$CONFIG"
fi

export CENTRIFUGO_TOKEN_HMAC_SECRET_KEY="$SECRET"
export CENTRIFUGO_HTTP_API_KEY="${CENTRIFUGO_API_KEY:-$SECRET}"
export CENTRIFUGO_PORT="${CENTRIFUGO_PORT:-8001}"
export CENTRIFUGO_HEALTH="true"
export CENTRIFUGO_ALLOWED_ORIGINS="*"

exec "$BIN" --config "$CONFIG"