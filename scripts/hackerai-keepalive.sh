#!/usr/bin/env bash
# Shim only. The real watchdog lives in persistent storage:
#   /mnt/documents/hackerai-keepalive.sh
# This file is auto-started by the dev server (see vite.config.ts). A workspace
# reset wipes /root but never /mnt/documents, so always hand off to the
# persistent copy — it knows the persistent source dir and the app port (8080).
set -u

PERSISTENT="/mnt/documents/hackerai-keepalive.sh"
FALLBACK="/mnt/documents/hackerai/scripts/hackerai-keepalive.sh"

for candidate in "$PERSISTENT" "$FALLBACK"; do
  if [ -f "$candidate" ]; then
    exec bash "$candidate" "$@"
  fi
done

echo "persistent watchdog not found at $PERSISTENT or $FALLBACK" >&2
exit 1
