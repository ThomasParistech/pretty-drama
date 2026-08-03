#!/usr/bin/env bash
# Usage: scripts/dev.sh [port]
# Starts the dev server and opens both root pages plus the test bench, which nothing
# links to. Vite's --open would open only one.
set -euo pipefail
cd "$(dirname "$0")/.."

port="${1:-5173}"
url="http://localhost:$port"

# The play id is plain text here (a shell script imports nothing): it is DEV_PLAY_ID in
# src/shared/plays.ts and scripts/common.py, held together by test_contracts.py.
#
# An `if` and not `[ -d … ] && pages+=(…)`: under `set -e` that one-liner ABORTS the
# script whenever the folder is missing.
pages=("" "respo.html")
if [ -d plays/dev ]; then
  pages+=("plays/dev/respo.html")
fi

[ -d node_modules ] || npm install

# Opened in the background as soon as the server answers (60 s at most). With no browser
# at hand (SSH, CI), stay quiet: Vite already prints the URLs.
(
  for _ in $(seq 1 120); do
    curl -sf -o /dev/null "$url/" || { sleep 0.5; continue; }
    for opener in xdg-open open wslview; do
      command -v "$opener" >/dev/null || continue
      for page in "${pages[@]}"; do
        "$opener" "$url/$page" >/dev/null 2>&1 || true
      done
      break
    done
    break
  done
) &

# exec the local binary, not `npm run dev`: Vite takes the script's place, so Ctrl+C
# really frees the port. --strictPort, or Vite slides onto another port and the tabs
# would open a server that is not ours.
exec ./node_modules/.bin/vite --port "$port" --strictPort
