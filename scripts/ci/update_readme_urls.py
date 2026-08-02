#!/usr/bin/env python3
"""Point the README's site links at the site that was just published.

Usage: update_readme_urls.py <site url>

The address is unknowable before a deployment, so build.yml calls this right after one.
Each link carries an invisible ref naming the PAGE it wants:

    [Le site de la troupe](https://example.com) <!-- ref: SITE_HOME -->

Only the target is replaced. The ref names the DESTINATION, not the current value, so a
second run recomputes the same address and there is no memory to keep in step. `SITE_`
is the claimed namespace: a ref outside it is not matched, one inside it but absent from
PATHS stops the run rather than silently never updating.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
README = REPO_ROOT / "README.md"

SITE_URL = re.compile(r"https?://[^\s<>\"']+")

# `[text](target) <!-- ref: SITE_NAME -->`. `[^)\s]*` matches an empty target too:
# `[x]()` is still a link this script owns.
LINK = re.compile(r"(\[[^\]]*\]\()([^)\s]*)(\)\s*<!--\s*ref:\s*(SITE_[A-Za-z0-9_]*)\s*-->)")

# Only pages present in EVERY copy belong here: this prose is never regenerated, so a
# page a fork can delete would leave an inherited 404.
PATHS = {
    "SITE_HOME": "",
    "SITE_RESPO": "respo.html",
}


def normalize(url: str) -> str:
    """The site's address as a prefix: http(s), exactly one trailing slash, since the
    PATHS are appended to it and SITE_HOME is the empty one."""
    url = url.strip()
    if not SITE_URL.fullmatch(url):
        raise ValueError(f"not a usable site address: {url!r}")
    return url.rstrip("/") + "/"


def update(text: str, base: str) -> str | None:
    """The README with every SITE_* link pointing at `base`, or None if nothing to do."""
    unknown: list[str] = []
    found: list[str] = []

    def swap(match: re.Match[str]) -> str:
        ref = match.group(4)
        if ref not in PATHS:
            unknown.append(ref)
            return match.group(0)
        found.append(ref)
        return f"{match.group(1)}{base}{PATHS[ref]}{match.group(3)}"

    updated = LINK.sub(swap, text)

    if unknown:
        raise ValueError(
            f"README.md carries unknown link refs: {', '.join(sorted(set(unknown)))}. "
            f"Known: {', '.join(sorted(PATHS))}."
        )
    if not found:
        # A fork that rewrote its front page has opted out.
        print("README.md carries no SITE_ link refs: nothing to update.")
        return None
    if updated == text:
        print(f"README.md already points its {len(found)} links at {base}.")
        return None

    print(f"README.md: {len(found)} links now point at {base} ({', '.join(found)})")
    return updated


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    try:
        base = normalize(argv[1])
        text = README.read_text(encoding="utf-8")
        updated = update(text, base)
    except ValueError as error:
        # The job's `continue-on-error` keeps this from reddening a run that PUBLISHED.
        print(f"::error title=README site links::{error}", file=sys.stderr)
        return 1

    if updated is None:
        return 0

    README.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
