#!/usr/bin/env bash
# Usage: scripts/dev.sh [port]
# Starts the dev server and opens BOTH entries of the site in the browser: the
# troupe's play selector (the root) and the coordinator's plays management page
# (respo.html). Vite would only open one of them with --open, hence this script.
#
# Plus the test bench when it is there. `plays/dev/` is the play the site keeps for
# itself: it is missing from data/plays.json on purpose, so the chooser just opened does
# not link to it and nothing else does either. Its coordinator home is therefore opened
# directly, that being the page from which its six others are reachable.
set -euo pipefail
cd "$(dirname "$0")/.."

port="${1:-5173}"
url="http://localhost:$port"

# The pages to open, in the order they are wanted on screen. The play id is written
# here as plain text (a shell script imports nothing): it is `DEV_PLAY_ID`,
# src/shared/plays.js and scripts/common.py, and a guard in
# scripts/tests/test_contracts.py keeps the three from drifting apart.
#
# An `if` and not `[ -d … ] && pages+=(…)`: the script runs under `set -e`, where that
# one-liner would ABORT it whenever the folder is missing, its non-zero test being the
# status of the whole line. Only the fork that deleted the play would be hit, and it
# would lose its dev server over a tab.
pages=("" "respo.html")
if [ -d plays/dev ]; then
  pages+=("plays/dev/respo.html")
fi

[ -d node_modules ] || npm install

# Opened in the background as soon as the server answers (60 s at most). With no
# browser at hand (SSH, CI), we say nothing: Vite already prints both URLs.
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

# The local binary through exec, not `npm run dev`: Vite takes the script's place,
# so Ctrl+C really stops the server and frees the port (no npm wrapper and no pid
# to watch). --strictPort: otherwise a busy port makes Vite slide onto the next one
# and we would open the tabs of a server that is not ours.
exec ./node_modules/.bin/vite --port "$port" --strictPort
