"""Writes data/plays.json, the list of plays and the ONLY file sitting above them.

Each play is a silo: its pages, data and clips live under `plays/<id>/` and need
nothing else. But something has to say WHICH plays exist, or the two root pages (the
troupe's chooser and the coordinator's management page) would have nothing to list. This is
that file, and it holds nothing beyond what is needed to draw a play card: its id, its
title, its language, what the play IS (its cast size and its length in words), and the two
numbers the management card turns into a recorded share.

Derived end to end, like the manifest: it is rebuilt on every upload and every
deployment, and carries no information that is not already inside a play.

Two things not to undo.

1. **The list comes from the FOLDERS** (`play_ids`) and not from the manifests: a play
   whose manifest is missing or damaged still shows up, with whatever could be read of
   it. A play VANISHING from the chooser is the worst possible display, since the
   coordinator then has no path left to its upload page to repair it.

2. **The order is by id, not by title.** Sorting on the title would mean comparing
   accented strings, so choosing a locale, and a machine file has no business knowing
   one (same rule as the manifest's ranks, which leave the front to write "Acte II").
   The two root pages are what sort for display, with `Intl.Collator` and in the
   reader's language.
"""

from __future__ import annotations

import re

from common import REPO_ROOT, load_json, play_data_dir, play_ids, write_json

INDEX_PATH = REPO_ROOT / "data" / "plays.json"

# The play's length in words, the figure a card puts next to its cast size.
#
# TWIN of `countWords` (src/stats/stats.js) and it must stay one: the chooser writes
# "12 340 mots" on the very play whose Speaking share page writes a word total per
# character, and two tokenisers would have the site contradict itself in two clicks.
# `\w+` is the cut of the troupe's reference script (the same one the PDF descends
# from), so apostrophes separate: "l'crâne" counts two words. It inflates the totals
# in absolute terms, identically for everyone, and in exchange the site's figures and
# the PDF's agree. The one divergence with the JS side is `_`, which `\w` admits and
# `[\p{L}\p{N}]` does not; dialogue has none.
#
# Tolerant by contract, like every reader of the manifest: a line without text counts
# zero rather than raising.
WORD_RE = re.compile(r"\w+")


def count_words(text: object) -> int:
    if not isinstance(text, str):
        return 0
    return len(WORD_RE.findall(text))


def play_entry(play_id: str) -> dict:
    """What a play card needs to know, read in degraded mode.

    The manifest is the only file consulted: it is already what every page reads, and
    it is rebuilt just before us by both workflows. Missing (a play born from a
    rejected upload) or damaged, the card falls back to an empty title, which the two
    root pages render with the same "Pièce sans titre" as the five headers, and to
    zeroed figures, which they replace with "Pièce encore vide".
    """
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
        # The title comes from the manifest, so from the script, so from the troupe:
        # it is data and never interface text. The fallback is left to the front.
        "title": manifest.get("title") if isinstance(manifest.get("title"), str) else "",
        "language": manifest.get("language") if isinstance(manifest.get("language"), str) else "fr",
        # What the play IS, the two figures a card leads with: how many roles to hand
        # out, and how long it is. The cast is the manifest's list and not the
        # characters who actually speak: the card answers "how many of us does this
        # play need", and a character written but not yet given a line is still a role
        # to cast.
        "characters": len(characters),
        "words": sum(count_words(line.get("text")) for line in lines if isinstance(line, dict)),
        # Two numbers rather than an already-composed percentage: `formatShare` is what
        # puts a share into words, in the reader's language, and it is the management
        # card alone that shows it.
        "lines": len(lines),
        "recorded": sum(1 for line in lines if isinstance(line, dict) and line.get("status") == "ok"),
    }


def main() -> None:
    plays = [play_entry(play_id) for play_id in play_ids()]
    write_json(INDEX_PATH, {"plays": plays})
    print(f"data/plays.json: {len(plays)} play(s)")


if __name__ == "__main__":
    main()
