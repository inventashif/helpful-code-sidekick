#!/usr/bin/env bash
# Persistent HackerAI watchdog.
# Keeps the full HackerAI stack (Next on :3000, Convex, Centrifugo, sandbox)
# alive. Never touches port 8080 — that belongs to the workspace dev server.
set -u

PORT="${PORT:-3000}"
STARTER="/dev-server/scripts/start-hackerai.sh"
FALLBACK_STARTER="/mnt/documents/hackerai/scripts/start-hackerai.sh"
LOCK="/tmp/hackerai-keepalive.lock"
LOG="/tmp/hackerai-keepalive.log"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[keepalive] another watchdog already running; exiting" >&2
  exit 0
fi

log() { echo "[keepalive $(date -u +%H:%M:%S)] $*"; }

pick_starter() {
  [ -f "$STARTER" ] && { echo "$STARTER"; return; }
  echo "$FALLBACK_STARTER"
}

healthy() {
  curl -sf -m 8 -o /dev/null "http://127.0.0.1:$PORT/" || return 1
  curl -sf -m 8 -o /dev/null "http://127.0.0.1:$PORT/api/sandbox/presence" || return 1
  return 0
}

log "watchdog started (port $PORT)"
fails=0
while true; do
  if healthy; then
    fails=0
  else
    fails=$((fails + 1))
    log "health check failed ($fails)"
    if [ "$fails" -ge 2 ]; then
      s="$(pick_starter)"
      log "restarting stack via $s"
      PORT="$PORT" bash "$s" >>"$LOG" 2>&1
      fails=0
    fi
  fi
  sleep 30
done
