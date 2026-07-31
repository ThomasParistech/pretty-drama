#!/usr/bin/env bash
# Usage: scripts/dev.sh [port]
# Lance le serveur de dev et ouvre les DEUX entrées du site dans le navigateur : le
# sélecteur de pièce de la troupe (la racine) et la gestion des pièces du responsable
# (respo.html). Vite n'en ouvrirait qu'une avec --open, d'où ce script.
set -euo pipefail
cd "$(dirname "$0")/.."

port="${1:-5173}"
url="http://localhost:$port"

[ -d node_modules ] || npm install

# Ouverture en tâche de fond dès que le serveur répond (60 s au plus). Sans
# navigateur sous la main (SSH, CI), on ne dit rien : Vite affiche déjà les deux
# URLs.
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

# Le binaire local via exec, pas `npm run dev` : Vite prend la place du script,
# donc Ctrl+C arrête vraiment le serveur et libère le port (pas de wrapper npm ni
# de pid à surveiller). --strictPort : sinon un port occupé fait glisser Vite sur
# le suivant et on ouvrirait les onglets d'un serveur qui n'est pas le nôtre.
exec ./node_modules/.bin/vite --port "$port" --strictPort
