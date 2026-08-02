#!/usr/bin/env bash
# Usage: commit_push.sh "<commit message>" <path>...
# Commits the given paths as the github-actions bot and pushes, rebasing on
# top of any concurrent push. No-op when there is nothing to commit.
#
# No conflict is arbitrated here: everything written is derived, so a conflict means a
# parallel run wrote the same data and must fail loudly. Taking "ours" could throw away
# the other run's clips.
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

# Retry a REJECTED push only: two workflows write here in different concurrency groups,
# so losing the race is reachable. A rebase that cannot replay still exits non-zero and
# `set -e` stops us.
branch="${GITHUB_REF_NAME:-main}"
for attempt in 1 2 3; do
  git fetch origin "$branch"
  git rebase "origin/$branch"
  if git push; then
    exit 0
  fi
  echo "Push rejected (attempt $attempt/3): another run got there first, rebasing."
  sleep $((attempt * 3))
done

echo "Push still rejected after 3 attempts." >&2
exit 1
