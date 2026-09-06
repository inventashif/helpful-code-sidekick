#!/usr/bin/env bash
# Keeps the local HackerAI runtime alive.
# - starts the stack if the app is not answering on port 3000
# - re-checks every 30s, forever
# - safe to run many times: a lock file keeps a single watchdog
set -u

APP_DIR="${HACKERAI_DIR:-/root/hackerai}"
LOG_DIR="/tmp/hackerai-keepalive"
LOCK="/tmp/hackerai-keepalive.lock"
mkdir -p "$LOG_DIR"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "keepalive already running"
  exit 0
fi

log() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG_DIR/keepalive.log"; }

app_up() {
  curl -sf -m 8 -o /dev/null "http://127.0.0.1:3000/" 2>/dev/null &&
    curl -sf -m 8 "http://127.0.0.1:3000/api/sandbox/presence" 2>/dev/null |
      grep -q '"connections":\[{'
}

supervisor_pids() {
  pgrep -f "node scripts/hackerai.mjs" 2>/dev/null
}

start_stack() {
  [ -d "$APP_DIR" ] || { log "missing $APP_DIR"; return 1; }
  # Never run two supervisors: duplicates fight over ports and sandboxes.
  local existing
  existing="$(supervisor_pids | tr '\n' ' ')"
  if [ -n "${existing// /}" ]; then
    log "supervisor already running ($existing) — waiting instead of starting another"
  else
    log "starting stack as $(id -un)"
    # setsid detaches the stack from this watchdog's session so nothing upstream
    # can take it down with us.
    ( cd "$APP_DIR" && setsid nohup $RUNNER node scripts/hackerai.mjs >>"$LOG_DIR/stack.log" 2>&1 & )
  fi
  for _ in $(seq 1 90); do
    app_up && { log "stack up"; return 0; }
    sleep 5
  done
  log "stack did not come up in time"
  return 1
}

# Public link for the app (port 3000). Kept alive here so the shared URL
# survives a tunnel drop; the current URL is written to a file for reference.
APP_TUNNEL_URL_FILE="/tmp/hackerai-app-tunnel.url"
start_app_tunnel() {
  local bin="$APP_DIR/bin/cloudflared"
  [ -x "$bin" ] || { log "cloudflared missing at $bin"; return 1; }
  log "starting app tunnel"
  : >"$LOG_DIR/app-tunnel.log"
  ( setsid nohup $RUNNER "$bin" tunnel --url http://127.0.0.1:3000 \
      >>"$LOG_DIR/app-tunnel.log" 2>&1 & )
  for _ in $(seq 1 30); do
    sleep 3
    local url
    url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/app-tunnel.log" | head -1)"
    if [ -n "$url" ]; then
      echo "$url" >"$APP_TUNNEL_URL_FILE"
      log "app tunnel up: $url"
      return 0
    fi
  done
  log "app tunnel did not report a URL"
  return 1
}

app_tunnel_up() {
  pgrep -f "cloudflared tunnel --url http://127.0.0.1:3000" >/dev/null 2>&1
}

log "watchdog started (app dir: $APP_DIR, user: $(id -un))"
fails=0
while true; do
  if app_up; then
    fails=0
  else
    fails=$((fails + 1))
    log "app not answering (strike $fails)"
    if [ "$fails" -ge 2 ]; then
      start_stack
      fails=0
    fi
  fi
  app_tunnel_up || start_app_tunnel
  sleep 30
done

