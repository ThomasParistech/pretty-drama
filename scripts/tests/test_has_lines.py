"""The gate that keeps a newborn play from paying for the LaTeX install.

`new_play_script` is READ here rather than a hand-written empty document: the state a
play is born in is the very case the workflow must skip, so the two have to be checked
against each other and not against a copy of one of them.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from common import new_play_script
from has_lines import has_lines


def written(document) -> str:
    path = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    with path as handle:
        handle.write(document if isinstance(document, str) else json.dumps(document))
    return path.name


class HasLines(unittest.TestCase):
    def test_a_brand_new_play_has_none(self):
        self.assertFalse(has_lines(written(new_play_script("x", "Titre", "fr"))))

    def test_one_line_is_enough(self):
        script = new_play_script("x", "Titre", "fr")
        script["acts"][0]["scenes"][0]["lines"] = [{"id": "a", "characterId": "c", "text": "Ho"}]
        self.assertTrue(has_lines(written(script)))

    def test_the_dev_play_has_some(self):
        bench = Path(__file__).resolve().parent.parent.parent / "plays/dev/data/script.json"
        if bench.exists():  # the test bench can be deleted from a fork
            self.assertTrue(has_lines(bench))

    # Every surprise answers "no lines", the side that skips the PDF the workflow has
    # already deleted, so a broken document never gets one that disagrees with it.
    def test_anything_unexpected_is_no(self):
        for document in ("", "{", "[]", '{"acts": null}', '{"acts": [{"scenes": 3}]}'):
            self.assertFalse(has_lines(written(document)), document)
        self.assertFalse(has_lines("/no/such/script.json"))


class BlankTemplate(unittest.TestCase):
    """The PDF a lineless play is given, in place of 30 s of LaTeX printing one blank
    page. Committed, so the only thing to hold is that the workflow's `cp` has a file to
    copy and that the file really is a PDF."""

    def test_the_workflow_copies_a_real_pdf(self):
        root = Path(__file__).resolve().parent.parent.parent
        workflow = (root / ".github/workflows/uploads.yml").read_text(encoding="utf-8")
        self.assertIn("cp scripts/blank-script.pdf", workflow)
        self.assertTrue((root / "scripts/blank-script.pdf").read_bytes().startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
