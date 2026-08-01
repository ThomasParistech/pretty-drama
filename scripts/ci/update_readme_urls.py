#!/usr/bin/env python3
"""Point the README's site links at the site that was just published.

Usage: update_readme_urls.py <site url>

The site's address cannot be written in the template: it is built from the OWNER
and the REPOSITORY NAME, and both change the moment the template is copied. So
the README of a fresh copy cannot name its own site, and the only way to learn
the address was to go and read it on Settings > Pages. `build.yml` calls this
script right after a deployment, with the address the deployment answered on, so
the README of every copy ends up naming its own site, by itself.

Each link this script owns carries an invisible ref, and the ref names WHICH
page of the site it points at:

    [Le site de la troupe](https://example.com) <!-- ref: SITE_HOME -->

GitHub renders the comment as nothing, so the troupe sees an ordinary link. The
script rewrites the target of every ref it recognises to `<site>/<path>` and
touches nothing else: not the display text, which is French prose belonging to
the README, and not one character outside the parentheses.

That the ref names the DESTINATION rather than recording the current value is
what makes this safe to run over and over. The script never has to know what the
README said before, so there is no memory to keep in step, no marker to go
stale, and no substitution running loose over the file: each target is replaced
whole, in place, located by its own ref. Running it twice changes nothing the
second time because the computed address is the same, not because anything
remembered it.

`SITE_` is the namespace this script claims. A ref outside it is somebody else's
and is not even matched, so a fork may use the same comment syntax for its own
purposes. A ref INSIDE it that is not in `PATHS` is a typo in this repository and
stops the run, because the alternative is a link that silently never updates.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
README = REPO_ROOT / "README.md"

# What may be substituted IN. Guards the value coming from the workflow; there is no
# value coming out of the file any more, which is the point of the refs.
SITE_URL = re.compile(r"https?://[^\s<>\"']+")

# `[text](target) <!-- ref: SITE_NAME -->`, with the target as its own group so the
# replacement can leave the text and the comment exactly as they were. `[^)\s]*`
# matches an empty target too: a link written `[x]()` is still one this script owns
# and should fill in, rather than a shape it silently walks past.
LINK = re.compile(r"(\[[^\]]*\]\()([^)\s]*)(\)\s*<!--\s*ref:\s*(SITE_[A-Za-z0-9_]*)\s*-->)")

# Every page of the site the README may link to, as a path under the site's address.
# Only pages that exist in EVERY copy of the template belong here: a path is written
# into the README of each troupe, and nothing regenerates that prose afterwards, so a
# page one fork can delete would leave the others linking into a 404.
PATHS = {
    "SITE_HOME": "",
    "SITE_RESPO": "respo.html",
}


def normalize(url: str) -> str:
    """The site's address as a prefix: http(s), exactly one trailing slash.

    `actions/deploy-pages` already answers `https://owner.github.io/repo/`, but the
    paths in PATHS are appended to this string, and `SITE_HOME` is the empty one.
    """
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
        # A fork is free to rewrite its front page, and this is what that looks like.
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
        # The step fails, and the job's `continue-on-error` keeps that from touching a
        # deployment that SUCCEEDED. The README is a convenience; the site is not.
        print(f"::error title=README site links::{error}", file=sys.stderr)
        return 1

    if updated is None:
        return 0

    README.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
