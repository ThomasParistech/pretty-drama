#!/usr/bin/env python3
"""Writes the address of the published site into README.md.

Usage: update_readme_urls.py <site url>

The site's address cannot be written in the template: it is built from the OWNER
and the REPOSITORY NAME, and both change the moment the template is copied. So
the README of a fresh copy still names the address of the site it was copied
from, and the only way to learn the real one was to go and read it on
Settings > Pages. `build.yml` calls this script right after a deployment, with
the address the deployment actually answered on, so the README of every copy
ends up naming its own site, by itself.

The README is FRENCH and is the troupe's page: not one word of it is generated
here. What this script owns is a single URL. A marker line records the address
currently written in the file:

    <!-- prettydrama:site https://exemple.github.io/les-troubadours/ -->

and the update is a plain substitution of that string throughout the document,
including inside the marker. So the address may be named as many times as the
prose needs, in any form (a bare link, a table cell, a sentence, an address with
`respo.html` glued after it), and all of them follow. Idempotent by
construction: the second run reads the address it wrote and stops.

Nothing here is a condition of anything: a README that no longer carries the
marker (a fork that rewrote its front page, which is its right) is left alone
and the script exits 0. It says so on stdout, which is the run log, because the
alternative is a link that quietly never updates again.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
README = REPO_ROOT / "README.md"

# The recorded address, and the only thing this script needs to find. `[^\s>]+` and
# not `.+`: an address never holds a space, and stopping before `>` keeps the regex
# from swallowing the `-->` that closes the comment.
MARKER = re.compile(r"<!--\s*prettydrama:site\s+([^\s>]+)\s*-->")


def normalize(url: str) -> str:
    """The address as the README writes it: http(s), one trailing slash.

    `actions/deploy-pages` already answers `https://owner.github.io/repo/`, but a
    trailing slash that comes and goes would rewrite the whole file for nothing,
    and `respo.html` is appended to this string in the prose.
    """
    url = url.strip()
    if not re.fullmatch(r"https?://[^\s<>\"']+", url):
        raise ValueError(f"not a usable site address: {url!r}")
    return url.rstrip("/") + "/"


def update(text: str, url: str) -> str | None:
    """The README with `url` in place of the recorded address, or None if nothing to do."""
    found = MARKER.search(text)
    if not found:
        print("README.md carries no prettydrama:site marker: nothing to update.")
        return None

    current = found.group(1)
    if current == url:
        print(f"README.md already names {url}.")
        return None

    print(f"README.md: {current} -> {url}")
    return text.replace(current, url)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    url = normalize(argv[1])
    text = README.read_text(encoding="utf-8")
    updated = update(text, url)
    if updated is None:
        return 0

    README.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
