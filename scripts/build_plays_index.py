"""Writes data/plays.json, the play index the two root pages list.

Two things not to undo: the list comes from the FOLDERS and not the manifests, so a
damaged manifest never removes a play from the chooser (the coordinator would lose the
path to its upload page); and the order is by id, not title, because sorting titles
means choosing a locale and the front does that with `Intl.Collator`.
"""

from __future__ import annotations

import re

from common import DEV_PLAY_ID, REPO_ROOT, load_json, play_data_dir, play_ids, write_json

INDEX_PATH = REPO_ROOT / "data" / "plays.json"

# TWIN of `countWords` (src/stats/stats.ts) and must stay one, or the chooser and the
# Stats page would contradict each other. Apostrophes separate: "l'crâne" is two words.
# `[^\W_]` and not `\w`: `\w` also takes the UNDERSCORE, which `[\p{L}\p{N}]` on the JS
# side does not, so "a_b" was one word here and two there. Measured: the two agree on
# every code point up to U+3000 plus a spread of astral, Arabic-indic and numeral ones.
WORD_RE = re.compile(r"[^\W_]+")


def count_words(text: object) -> int:
    if not isinstance(text, str):
        return 0
    return len(WORD_RE.findall(text))


def play_entry(play_id: str) -> dict:
    """What a play card needs, read from the manifest in degraded mode: missing or
    damaged, it falls back to an empty title and zeroed figures, which the root pages
    render as "Pièce sans titre" / "Pièce encore vide"."""
    data = play_data_dir(play_id)
    manifest = load_json(data / "manifest.json", {})
    if not isinstance(manifest, dict):
        manifest = {}
    lines = manifest.get("lines")
    lines = lines if isinstance(lines, list) else []
    characters = manifest.get("characters")
    characters = characters if isinstance(characters, list) else []

    return {
        "id": play_id,
        "title": manifest.get("title") if isinstance(manifest.get("title"), str) else "",
        "language": manifest.get("language") if isinstance(manifest.get("language"), str) else "fr",
        # The whole cast, not just the characters who speak: a written role with no line
        # yet is still a role to cast.
        "characters": len(characters),
        "words": sum(count_words(line.get("text")) for line in lines if isinstance(line, dict)),
        # Two numbers, not a composed percentage: `formatShare` words it on the front.
        "lines": len(lines),
        "recorded": sum(1 for line in lines if isinstance(line, dict) and line.get("status") == "ok"),
    }


def listed_play_ids() -> list[str]:
    """Every play but the test bench, reachable only by hand-written URL. A named
    function and not a condition in `main`: hiding a play is the one thing this file is
    otherwise built never to do, and this exception removes an address no troupe owns."""
    return [play_id for play_id in play_ids() if play_id != DEV_PLAY_ID]


def main() -> None:
    plays = [play_entry(play_id) for play_id in listed_play_ids()]
    write_json(INDEX_PATH, {"plays": plays})
    print(f"data/plays.json: {len(plays)} play(s)")


if __name__ == "__main__":
    main()
