#!/usr/bin/env bash
# Start HackerAI from the copy kept inside this workspace project.
#
#   bash /dev-server/scripts/start-hackerai.sh
#
# Source copy : /dev-server/scripts/hackerai  (in-repo, survives /root wipes)
# Runtime copy: /root/hackerai                (node/pnpm run from a local disk)
# Binaries    : restored from /mnt/documents/hackerai/bin when missing
#               (cloudflared/centrifugo are too large to keep in the repo)
set -u

SRC="/dev-server/scripts/hackerai"
PERSISTENT="/mnt/documents/hackerai"
APP="/root/hackerai"
PORT="${PORT:-8080}"
LOG="/tmp/hackerai-start.log"
export PORT

echo "[start-hackerai] syncing source -> $APP"
mkdir -p "$APP"
rsync -a --exclude node_modules --exclude .next --exclude .git "$SRC/" "$APP/"

# Binaries live outside the repo; take them from persistent storage.
mkdir -p "$APP/bin"
for b in cloudflared centrifugo; do
  if [ ! -x "$APP/bin/$b" ] && [ -f "$PERSISTENT/bin/$b" ]; then
    cp "$PERSISTENT/bin/$b" "$APP/bin/$b"
  fi
done
chmod +x "$APP"/bin/* 2>/dev/null

# Env / keys / local database only exist in persistent storage.
[ -f "$APP/.env.local" ] || cp "$PERSISTENT/.env.local" "$APP/.env.local" 2>/dev/null
[ -d "$APP/.personal" ] || cp -r "$PERSISTENT/.personal" "$APP/.personal" 2>/dev/null
[ -d "$APP/.convex" ] || cp -r "$PERSISTENT/.convex" "$APP/.convex" 2>/dev/null

if [ ! -d "$APP/node_modules" ]; then
  echo "[start-hackerai] installing dependencies (first run takes a few minutes)"
  ( cd "$APP" && pnpm install --frozen-lockfile )
fi

# Free the app port from anything that is not HackerAI (e.g. the workspace dev server).
for pid in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
  cmd="$(ps -o cmd= -p "$pid" 2>/dev/null)"
  case "$cmd" in *next*|*hackerai*) continue ;; esac
  echo "[start-hackerai] freeing port $PORT from PID $pid"
  kill -9 "$pid" 2>/dev/null
done

if pgrep -f "node scripts/hackerai.mjs" >/dev/null 2>&1; then
  echo "[start-hackerai] stack already running"
else
  echo "[start-hackerai] starting stack on port $PORT (log: $LOG)"
  ( cd "$APP" && PORT="$PORT" setsid nohup node scripts/hackerai.mjs >>"$LOG" 2>&1 & )
fi

for _ in $(seq 1 120); do
  if curl -sf -m 5 -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "[start-hackerai] HackerAI is up → http://localhost:$PORT"
    exit 0
  fi
  sleep 5
done

echo "[start-hackerai] did not come up in time — see $LOG" >&2
exit 1
