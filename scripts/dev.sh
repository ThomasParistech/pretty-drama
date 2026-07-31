#!/usr/bin/env bash
# Usage: scripts/dev.sh [port]
# Starts the dev server and opens BOTH entries of the site in the browser: the
# troupe's play selector (the root) and the coordinator's plays management page
# (respo.html). Vite would only open one of them with --open, hence this script.
set -euo pipefail
cd "$(dirname "$0")/.."

port="${1:-5173}"
url="http://localhost:$port"

[ -d node_modules ] || npm install

# Opened in the background as soon as the server answers (60 s at most). With no
# browser at hand (SSH, CI), we say nothing: Vite already prints both URLs.
(
  for _ in $(seq 1 120); do
    curl -sf -o /dev/null "$url/" || { sleep 0.5; continue; }
    for opener in xdg-open open wslview; do
      command -v "$opener" >/dev/null || continue
      "$opener" "$url/" >/dev/null 2>&1 || true
      "$opener" "$url/respo.html" >/dev/null 2>&1 || true
      break
    done
    break
  done
) &

# The local binary through exec, not `npm run dev`: Vite takes the script's place,
# so Ctrl+C really stops the server and frees the port (no npm wrapper and no pid
# to watch). --strictPort: otherwise a busy port makes Vite slide onto the next one
# and we would open the tabs of a server that is not ours.
exec ./node_modules/.bin/vite --port "$port" --strictPort
