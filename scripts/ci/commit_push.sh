#!/usr/bin/env bash
# Usage: commit_push.sh "<commit message>" <path>...
# Commits the given paths as the github-actions bot and pushes, rebasing on
# top of any concurrent push. No-op when there is nothing to commit.
#
# Aucun conflit n'est arbitré ici : tout ce que le workflow écrit est dérivé
# (clips/, clips.json, manifest.json, history.json), donc un conflit veut dire
# qu'un autre run a écrit les mêmes données en parallèle. Il doit échouer fort
# plutôt qu'être résolu au hasard : prendre « ours » pourrait jeter les clips de
# l'autre run. Le groupe de concurrence du workflow rend le cas très improbable,
# et le push suivant reconstruit tout de toute façon.
set -euo pipefail

message="$1"
shift

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A "$@"
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi
git commit -m "$message"

branch="${GITHUB_REF_NAME:-main}"
git fetch origin "$branch"
git rebase "origin/$branch"
git push
