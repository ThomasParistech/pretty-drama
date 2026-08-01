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

# Push, and try again when it is REJECTED: another run can land a commit between our
# fetch and our push, and the loser of that race would otherwise fail a job that has
# already done its work. Two workflows write to this repository now (uploads.yml
# processing a deposit, build.yml writing the site address into the README) and they
# sit in different concurrency groups, so the race is reachable, not theoretical.
#
# This changes nothing about CONFLICTS, which is the case the comment above is about:
# a rebase that cannot replay exits non-zero and `set -e` stops us right here, exactly
# as before. Only a rejected push is retried, and only after rebasing onto whatever
# arrived in the meantime.
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
