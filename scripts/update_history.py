"""Logs this run's uploads into the journals: one per play, plus the root one.

The coordinator reads neither the CI logs nor the Issues tab: their only feedback on "did
my upload go through?" is the journal displayed on screen. That journal is therefore the
project's error channel, not a mere history: a rejected file has nowhere else to be
reported.

**One journal per play** (`plays/<id>/data/history.json`, rendered by that play's
Dashboard): a play ignores the other plays' uploads, as it ignores their lines and
clips. **Plus a root journal** (`data/history.json`, rendered by the play management
page) for whatever no play claims: a file dropped at the root of `uploads/` with no
readable id, an upload zone whose name is not a valid id. Without it, those files would
vanish without a word, which is exactly what an error channel must never do.

Input: uploads_result.json (ephemeral, written by process_uploads.py), the outcome of
every file uploaded in this run, already keyed by play. So the journal logs ONLY
uploads: the uploads.yml workflow is what writes it, never the one that rebuilds the
site.

Nothing is logged for a failed run: it does not commit, so it cannot write anything
here. That is accepted, and is even the failure detector: the last entry's date stops
advancing.

A play's journal is read by build_manifest.py, which copies it into the play's manifest
(the only file its pages read); the root one is read by build_plays_index.py, and the
management page serves it from the index.
"""

from __future__ import annotations

import sys
from pathlib import Path

from common import REPO_ROOT, is_play_id, load_json, play_data_dir, utc_stamp, write_json

ROOT_HISTORY_PATH = REPO_ROOT / "data" / "history.json"
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# The journal is committed on every upload: it is capped, or it would grow without end.
# Around thirty entries covers far more than what the coordinator consults.
MAX_RUNS = 30


def add_run(history: dict, files: list, at: str) -> dict:
    """Journal plus this upload's result gives a new journal (pure function).

    Entries are ordered newest to oldest: that is the display order, and the cap then
    reads as "keep the last MAX_RUNS"."""
    runs = history.get("runs")
    if not isinstance(runs, list):
        runs = []
    return {"runs": [{"at": at, "files": files}] + runs[: MAX_RUNS - 1]}


def append(path: Path, files: list, at: str) -> None:
    history = load_json(path, {})
    if not isinstance(history, dict):
        history = {}
    write_json(path, add_run(history, files, at))


def main() -> None:
    result = load_json(RESULT_PATH, {})
    if not isinstance(result, dict):
        result = {}
    by_play = result.get("plays")
    by_play = by_play if isinstance(by_play, dict) else {}
    unrouted = result.get("unrouted")
    unrouted = unrouted if isinstance(unrouted, list) else []

    # One timestamp for the whole run: two files uploaded together are a single
    # upload, even when they concern two plays.
    at = utc_stamp()
    written = 0
    for play_id, files in sorted(by_play.items()):
        if not isinstance(files, list) or not files:
            continue
        # Validated BEFORE being used to build a path, as everywhere else in the
        # project. `uploads_result.json` is written by the previous step of the same
        # job, so the value is safe in practice; the rule does not relax for that.
        # It is the rule that makes the concatenation safe, not a piece of reasoning
        # about today's caller.
        if not is_play_id(play_id):
            print(f"Journal: invalid play id, ignored ({play_id!r})", file=sys.stderr)
            continue
        append(play_data_dir(play_id) / "history.json", files, at)
        written += 1
        print(f"Journal for {play_id!r}: 1 entry added ({len(files)} file(s))")

    if unrouted:
        append(ROOT_HISTORY_PATH, unrouted, at)
        written += 1
        print(f"Root journal: 1 entry added ({len(unrouted)} unroutable file(s))")

    if written == 0:
        print("Journal: nothing to log (no file uploaded)")


if __name__ == "__main__":
    main()
