"""Text normalization used to detect stale recordings (status "perime").

The ONLY implementation: the browser ships raw text, so there is no twin to keep in
sync. Lowercase, curly quotes and dashes unified, punctuation to spaces EXCEPT
apostrophes and hyphens (meaningful in French words), accents kept, whitespace
collapsed.
"""

import re
import unicodedata

_UNIFY = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "–": "-", "—": "-"})


def _keep(char: str) -> bool:
    if char in "'-" or char.isspace():
        return True
    category = unicodedata.category(char)
    return category.startswith("L") or category.startswith("N")


def normalize_text(text: str) -> str:
    text = text.lower().translate(_UNIFY)
    text = "".join(char if _keep(char) else " " for char in text)
    return re.sub(r"\s+", " ", text).strip()
