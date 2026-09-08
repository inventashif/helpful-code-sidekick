#!/usr/bin/env bash
# Shim only. The real watchdog lives in persistent storage:
#   /mnt/documents/hackerai-keepalive.sh
# This file is auto-started by the dev server (see vite.config.ts). A workspace
# reset wipes /root but never /mnt/documents, so always hand off to the
# persistent copy. /mnt/documents is mounted without exec permission, so the
# script is copied to /tmp and run through bash.
set -u

PERSISTENT="/mnt/documents/hackerai-keepalive.sh"
FALLBACK="/mnt/documents/hackerai/scripts/hackerai-keepalive.sh"
LOCAL="/dev-server/scripts/hackerai-keepalive.local.sh"

for candidate in "$PERSISTENT" "$FALLBACK" "$LOCAL"; do
  if [ -s "$candidate" ]; then
    cp "$candidate" /tmp/hackerai-keepalive.run.sh 2>/dev/null || true
    exec bash /tmp/hackerai-keepalive.run.sh "$@"
  fi
done

echo "persistent watchdog not found at $PERSISTENT, $FALLBACK or $LOCAL" >&2
exit 1
