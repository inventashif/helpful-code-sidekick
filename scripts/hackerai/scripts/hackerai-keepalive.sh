#!/usr/bin/env bash
# HackerAI persistent watchdog.
#
# Source of truth: /mnt/documents/hackerai (cloud-backed, survives resets).
# Runtime copy:    /root/hackerai (node/pnpm cannot resolve the /proc-based
#                  documents mount, so the stack is executed from a local copy
#                  that is re-created from the persistent copy on every boot).
# Port:            8080 by default — the port the workspace URL serves, so the
#                  real app is reachable publicly without a proxy.
set -u

SRC_DIR="${HACKERAI_SRC:-/mnt/documents/hackerai}"
APP_DIR="${HACKERAI_DIR:-/root/hackerai}"
PORT="${PORT:-3000}"
LOG_DIR="/tmp/hackerai-keepalive"
LOCK="/tmp/hackerai-keepalive.lock"
mkdir -p "$LOG_DIR"
export PORT

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then exec sudo -E -n bash "$0" "$@"; fi
  echo "must run as root" >&2
  exit 1
fi

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "keepalive already running"
  exit 0
fi

log() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG_DIR/keepalive.log"; }

app_up() {
  curl -sf -m 8 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null &&
    curl -sf -m 8 "http://127.0.0.1:$PORT/api/sandbox/presence" 2>/dev/null |
      grep -q '"connections":\[{'
}

supervisor_pids() { pgrep -f "node scripts/hackerai.mjs" 2>/dev/null; }

# Free the app port from anything that is not our stack (e.g. the workspace
# dev server). Without this the supervisor refuses to start on a held port.
hijack_port() {
  local pids
  pids="$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
  for pid in $pids; do
    local cmd
    cmd="$(ps -o cmd= -p "$pid" 2>/dev/null)"
    case "$cmd" in
      *next*|*hackerai*) continue ;;
    esac
    log "freeing port $PORT from PID $pid ($cmd)"
    kill -9 "$pid" 2>/dev/null
  done
}

# Re-create the runtime copy from persistent storage when it is missing.
sync_runtime() {
  [ -d "$SRC_DIR" ] || { log "missing persistent source $SRC_DIR"; return 1; }
  mkdir -p "$APP_DIR"
  log "syncing $SRC_DIR -> $APP_DIR"
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude .git \
    "$SRC_DIR/" "$APP_DIR/" >>"$LOG_DIR/sync.log" 2>&1
  chmod +x "$APP_DIR"/bin/* 2>/dev/null
  if [ ! -d "$APP_DIR/node_modules" ]; then
    log "installing dependencies"
    ( cd "$APP_DIR" && pnpm install --frozen-lockfile >>"$LOG_DIR/install.log" 2>&1 )
    log "install exit=$?"
  fi
}

start_stack() {
  local existing
  existing="$(supervisor_pids | tr '\n' ' ')"
  if [ -n "${existing// /}" ]; then
    log "supervisor already running ($existing) — waiting"
  else
    [ -d "$APP_DIR/node_modules" ] || sync_runtime
    :
    log "starting stack on port $PORT"
    ( cd "$APP_DIR" && PORT="$PORT" setsid nohup node scripts/hackerai.mjs >>"$LOG_DIR/stack.log" 2>&1 & )
  fi
  for _ in $(seq 1 120); do
    app_up && { log "stack up"; return 0; }
    sleep 5
  done
  log "stack did not come up in time"
  return 1
}

# Public link, kept alive so the shared URL survives tunnel drops.
APP_TUNNEL_URL_FILE="/tmp/hackerai-app-tunnel.url"
app_tunnel_up() { pgrep -f "cloudflared tunnel --url http://127.0.0.1:$PORT" >/dev/null 2>&1; }
start_app_tunnel() {
  local bin="$APP_DIR/bin/cloudflared"
  [ -x "$bin" ] || { log "cloudflared missing at $bin"; return 1; }
  : >"$LOG_DIR/app-tunnel.log"
  ( setsid nohup "$bin" tunnel --url "http://127.0.0.1:$PORT" >>"$LOG_DIR/app-tunnel.log" 2>&1 & )
  for _ in $(seq 1 30); do
    sleep 3
    local url
    url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/app-tunnel.log" | head -1)"
    if [ -n "$url" ]; then
      echo "$url" >"$APP_TUNNEL_URL_FILE"
      cp "$APP_TUNNEL_URL_FILE" /mnt/documents/hackerai-app-tunnel.url 2>/dev/null
      log "app tunnel up: $url"
      return 0
    fi
  done
  log "app tunnel did not report a URL"
  return 1
}

# Continuous port guard: the workspace dev server is auto-respawned by its own
# supervisor, so a one-shot kill loses the race. Keep evicting non-app holders.
# port guard disabled: the app runs on 3000 and the workspace proxies to it
PORT_GUARD_PID=$!
trap 'kill $PORT_GUARD_PID 2>/dev/null' EXIT

log "watchdog started (src: $SRC_DIR, runtime: $APP_DIR, port: $PORT)"
[ -d "$APP_DIR/node_modules" ] || sync_runtime
fails=0
while true; do
  if app_up; then
    fails=0
  else
    fails=$((fails + 1))
    log "app not answering on $PORT (strike $fails)"
    if [ "$fails" -ge 2 ]; then
      start_stack
      fails=0
    fi
  fi
  app_tunnel_up || start_app_tunnel
  sleep 30
done
