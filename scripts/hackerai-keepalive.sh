#!/usr/bin/env bash
# Keeps the local HackerAI runtime alive.
# - starts the stack if the app is not answering on port 3000
# - re-checks every 30s, forever
# - safe to run many times: a lock file keeps a single watchdog
set -u

APP_DIR="${HACKERAI_DIR:-/dev-server/hackerai}"
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
  curl -sf -m 8 -o /dev/null "http://127.0.0.1:3000/" 2>/dev/null
}

start_stack() {
  [ -d "$APP_DIR" ] || { log "missing $APP_DIR"; return 1; }
  log "starting stack"
  ( cd "$APP_DIR" && nohup node scripts/hackerai.mjs >>"$LOG_DIR/stack.log" 2>&1 & )
  for _ in $(seq 1 90); do
    app_up && { log "stack up"; return 0; }
    sleep 5
  done
  log "stack did not come up in time"
  return 1
}

log "watchdog started (app dir: $APP_DIR)"
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
  sleep 30
done
