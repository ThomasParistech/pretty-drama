#!/usr/bin/env bash
# Usage: commit_push.sh "<commit message>" <path>...
# Commits the given paths as the github-actions bot and pushes, rebasing on
# top of any concurrent push. No-op when there is nothing to commit.
#
# No conflict is arbitrated here: everything the workflow writes is derived
# (a play's clips/, its clips.json, manifest.json and history.json, plus the plays
# index), so a conflict means another run wrote the same data in parallel. It must
# fail loudly rather than be
# resolved at random: taking "ours" could throw away the other run's clips. The
# workflow's concurrency group makes this very unlikely, and the next push
# rebuilds everything anyway.
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
