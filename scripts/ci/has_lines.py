"""Exit 0 if that script.json holds at least one line, 1 otherwise.

Called by uploads.yml to decide whether a promoted script is worth 30 s of LaTeX
install: a play is BORN with a title and no line, and its PDF would be a single page
saying so. Read tolerantly like every other reader of an uploaded document, and any
surprise (missing file, malformed JSON, unexpected shape) answers "no lines", the side
that skips the PDF, which the workflow has already deleted.

Usage: python scripts/ci/has_lines.py <path to script.json>
"""

import json
import sys
from pathlib import Path


def has_lines(path) -> bool:
    try:
        script = json.loads(Path(path).read_text(encoding="utf-8"))
        return any(
            scene.get("lines")
            for act in script.get("acts") or []
            for scene in act.get("scenes") or []
        )
    except Exception:
        return False


if __name__ == "__main__":
    sys.exit(0 if len(sys.argv) == 2 and has_lines(sys.argv[1]) else 1)
