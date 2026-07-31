"""Tests for the play's PDF script.

Everything is about the .tex produced, never about the PDF: `render_tex` is
pure, so the layout is checked by reading text, without opening a binary or
installing LaTeX. Only the end-to-end test really compiles, and it skips itself
wherever no engine is installed (a troupe that forks the repo runs this suite
without TeX).

What is verified here comes down to two promises: the PDF cannot make the
deployment fail, and no text typed into the editor can break the compilation.
"""

import contextlib
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_script_pdf import compile_pdf, latex_escape, render_tex

ANNIE, SERGE = "char-annie", "char-serge"

# Neither act nor scene carries a title: the label is DERIVED from the rank, in
# the language of the play (`language`). The fixture therefore writes none, on
# purpose: as long as it carried some, the assertions on "Acte I" and "Scène 1"
# passed by coincidence (the written title happened to equal the derived label)
# and no longer verified anything. Verified by mutation: replacing those titles
# with anything at all left the suite green.
SCRIPT = {
    "title": "Transport de Femmes",
    "language": "fr",
    "characters": [{"id": ANNIE, "name": "Annie"}, {"id": SERGE, "name": "Serge"}],
    "acts": [
        {
            "scenes": [
                {
                    "lines": [
                        {"id": "l1", "characterId": ANNIE, "text": "Mais on va être comme des coqs en pâte!"},
                        {"id": "l2", "characterId": SERGE, "text": "Silence! C'est moi le chef ici."},
                    ],
                },
                {
                    "lines": [{"id": "l3", "characterId": ANNIE, "text": "On étouffe ici."}],
                },
            ],
        },
        {
            "scenes": [
                {"lines": [{"id": "l4", "characterId": SERGE, "text": "Debout."}]}
            ],
        },
    ],
}


class TestLatexEscape(unittest.TestCase):
    def test_every_special_character_is_neutralised(self):
        # These characters are code for LaTeX. None of this exists in today's
        # play, but the text comes from an input field: a "50 %" or an "R&D"
        # will turn up eventually.
        self.assertEqual(latex_escape("50 % & 3 $ #1 _x {a} ~ ^"),
                         r"50 \% \& 3 \$ \#1 \_x \{a\} \textasciitilde{} \textasciicircum{}")

    def test_backslash_is_not_escaped_twice(self):
        # The character-by-character replacement trap: handling "\" first
        # reintroduces backslashes that the following passes escape again, and
        # the text fills up with \textbackslash.
        self.assertEqual(latex_escape("a\\b"), r"a\textbackslash{}b")
        self.assertNotIn(r"\textbackslash{}textbackslash", latex_escape("a\\b"))

    def test_accents_and_french_quotes_pass_through(self):
        # The .tex is written in UTF-8 and read by inputenc: nothing to escape
        # here, and above all nothing to transliterate.
        self.assertEqual(latex_escape("« Éclair », dit-il… ça va ?"), "« Éclair », dit-il… ça va ?")

    def test_non_string_gives_empty(self):
        self.assertEqual(latex_escape(None), "")
        self.assertEqual(latex_escape(42), "")

    def test_a_blank_line_never_becomes_a_paragraph_break(self):
        # A blank line is a \par for TeX, and both \lhead and \MakeUppercase
        # stop dead on a paragraph end inside their argument: the whole PDF
        # disappears, silently. Whitespace is therefore flattened, which LaTeX
        # would do anyway with a run of spaces.
        self.assertEqual(latex_escape("Transport\n\nde Femmes"), "Transport de Femmes")
        self.assertEqual(latex_escape("a \t b\r\n\r\n c"), "a b c")


class TestRenderTex(unittest.TestCase):
    def test_document_is_complete(self):
        tex = render_tex(SCRIPT)
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)

    def test_every_line_is_present_and_in_order(self):
        tex = render_tex(SCRIPT)
        positions = [
            tex.index("Mais on va être comme des coqs en pâte!"),
            tex.index("Silence! C'est moi le chef ici."),
            tex.index("On étouffe ici."),
            tex.index("Debout."),
        ]
        self.assertEqual(positions, sorted(positions))

    def test_speaker_precedes_its_line(self):
        tex = render_tex(SCRIPT)
        self.assertIn(r"\speak{Annie} Mais on va être comme des coqs en pâte!", tex)
        self.assertIn(r"\speak{Serge} Silence! C'est moi le chef ici.", tex)

    def test_title_appears_on_cover_and_in_running_head(self):
        tex = render_tex(SCRIPT)
        self.assertIn(r"\lhead{\textit{Transport de Femmes}}", tex)
        self.assertIn(r"\scshape Transport de Femmes", tex)

    def test_act_and_scene_headings(self):
        # Composed by the module and not read from script.json: roman numerals
        # for acts, arabic for scenes, the convention of the printed script.
        tex = render_tex(SCRIPT)
        self.assertIn(r"\actheading{Acte I}", tex)
        self.assertIn(r"\actheading{Acte II}", tex)
        self.assertIn(r"\sceneheading{Scène 1}", tex)
        self.assertIn(r"\sceneheading{Scène 2}", tex)

    def test_a_leftover_title_in_the_file_is_ignored(self):
        # The guard against coincidence: an older `script.json` carries titles,
        # and the PDF must certainly not pick them up, otherwise two ways of
        # naming a scene would coexist in the format. Without this test, the
        # fixture could say anything at all without a single case turning red.
        script = {
            "title": "T",
            "language": "fr",
            "characters": [{"id": ANNIE, "name": "Annie"}],
            "acts": [
                {
                    "title": "PROLOGUE",
                    "scenes": [
                        {"title": "OUVERTURE", "lines": [
                            {"id": "l1", "characterId": ANNIE, "text": "Ici."},
                        ]},
                    ],
                },
                {"scenes": [{"lines": [{"id": "l2", "characterId": ANNIE, "text": "Là."}]}]},
            ],
        }
        tex = render_tex(script)
        self.assertNotIn("PROLOGUE", tex)
        self.assertNotIn("OUVERTURE", tex)
        self.assertIn(r"\actheading{Acte I}", tex)
        self.assertIn(r"\sceneheading{Scène 1}", tex)

    def test_an_english_play_is_composed_in_english(self):
        # `language` is the language of the PLAY, not that of a reader: on paper
        # a heading is the document. The words are kept in agreement with the
        # front-end catalogues by test_contracts.TestStructureLabels; what is
        # checked here is that `render_tex` really does use them.
        tex = render_tex(dict(SCRIPT, language="en"))
        self.assertIn(r"\actheading{Act I}", tex)
        self.assertIn(r"\actheading{Act II}", tex)
        self.assertIn(r"\sceneheading{Scene 1}", tex)
        self.assertIn(r"\sceneheading{Scene 2}", tex)
        self.assertNotIn("Acte I", tex)
        self.assertNotIn("Scène 1", tex)

    def test_babel_follows_the_play_language(self):
        # Hyphenation and the words babel composes itself. `english.ldf` comes
        # from texlive-latex-base, so nothing to add to the workflow; a third
        # language, however, would need its own package (see STRUCTURE).
        self.assertIn(r"\usepackage[french]{babel}", render_tex(SCRIPT))
        self.assertIn(r"\usepackage[english]{babel}", render_tex(dict(SCRIPT, language="en")))

    def test_an_unknown_language_falls_back_to_french(self):
        # Mirror of `sanitize_script` and of the front end: a file from before
        # this field existed, or a hand-edited value gone wrong, stays typesettable.
        for value in (None, "kl", 42):
            with self.subTest(language=value):
                tex = render_tex(dict(SCRIPT, language=value))
                self.assertIn(r"\usepackage[french]{babel}", tex)
                self.assertIn(r"\actheading{Acte I}", tex)

    def test_rule_separates_scenes_but_never_opens_an_act(self):
        # The rule separates two scenes. At the head of an act it has nothing to
        # separate: act I has two scenes (one rule), act II a single one (none).
        # We count in the body only, the preamble containing the \newcommand
        # that defines the macro.
        body = render_tex(SCRIPT).split(r"\begin{document}", 1)[1]
        self.assertEqual(body.count(r"\hlinecol"), 1)
        self.assertLess(body.index(r"\sceneheading{Scène 1}"), body.index(r"\hlinecol"))

    def test_a_single_act_hides_its_heading_but_keeps_its_scenes(self):
        # An act title only serves to tell two acts apart. On its own, it adds a
        # heading above the first scene without teaching anything.
        script = dict(SCRIPT, acts=SCRIPT["acts"][:1])
        tex = render_tex(script)
        self.assertNotIn(r"\actheading{", tex.split(r"\begin{document}", 1)[1])
        self.assertIn(r"\sceneheading{Scène 1}", tex)
        self.assertIn(r"\sceneheading{Scène 2}", tex)
        self.assertIn("On étouffe ici.", tex)

    def test_new_act_opens_a_page_but_not_the_first(self):
        # \clearpage and not \newpage: in two columns, \newpage would merely
        # move on to the right-hand column.
        tex = render_tex(SCRIPT)
        self.assertEqual(tex.count(r"\clearpage"), 1)
        self.assertLess(tex.index(r"\actheading{Acte I}"), tex.index(r"\clearpage"))


class TestRenderTexTolerance(unittest.TestCase):
    """script.json is hand-editable in the repo: like build_manifest, this script
    must degrade, never raise."""

    def test_unknown_character_becomes_a_question_mark(self):
        script = dict(SCRIPT, characters=[])
        tex = render_tex(script)
        self.assertIn(r"\speak{?} Mais on va être comme des coqs en pâte!", tex)

    def test_empty_lines_are_dropped(self):
        script = {
            "title": "T",
            "characters": [{"id": ANNIE, "name": "Annie"}],
            "acts": [{"scenes": [{"lines": [
                {"id": "l1", "characterId": ANNIE, "text": "   "},
                {"id": "l2", "characterId": ANNIE, "text": "Vraie réplique."},
            ]}]}],
        }
        tex = render_tex(script)
        self.assertEqual(tex.count(r"\speak{"), 1)
        self.assertIn("Vraie réplique.", tex)

    def test_garbage_does_not_raise(self):
        for junk in ({}, {"acts": "pas une liste"}, {"acts": [None, 3]}, {"title": 12}):
            with self.subTest(junk=junk):
                tex = render_tex(junk)
                self.assertIn(r"\end{document}", tex)

    def test_empty_play_still_produces_a_document(self):
        tex = render_tex({"title": "Vide", "characters": [], "acts": []})
        self.assertIn("Aucune réplique", tex)
        self.assertIn(r"\end{document}", tex)

    def test_the_empty_notice_follows_the_play_language(self):
        # Like the fallback title and the headings: on paper, everything this
        # module writes of its own accord is in the language of the play. This
        # sentence was the only one left in French under an "Untitled" title.
        tex = render_tex({"title": "Empty", "language": "en", "acts": []})
        self.assertIn("No lines in this script.", tex)
        self.assertNotIn("Aucune réplique", tex)

    def test_missing_title_gets_a_placeholder(self):
        # An empty \lhead{\textit{}} would go unnoticed until printing. The
        # fallback follows the language of the play, like the headings.
        tex = render_tex({"title": "", "characters": [], "acts": []})
        self.assertIn("Sans titre", tex)
        self.assertIn("Untitled", render_tex({"title": "", "language": "en", "acts": []}))


class TestCompile(unittest.TestCase):
    def test_compile_failure_never_raises(self):
        # THE promise of the module: build.yml writes neither an issue nor a
        # journal, so a compilation that raised would make the site disappear
        # without the coordinator being told.
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("no LaTeX engine installed")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "nope.pdf"
            # The failure copies the tail of the LaTeX log to stderr, which is
            # the intended behaviour in CI but would drown the test output.
            with open(os.devnull, "w") as quiet, contextlib.redirect_stderr(quiet):
                ok = compile_pdf(r"\documentclass{article}\begin{document}\undefinedmacro", out)
            self.assertFalse(ok)
            self.assertFalse(out.exists())

    def test_real_script_compiles(self):
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("no LaTeX engine installed")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(SCRIPT), out))
            self.assertEqual(out.read_bytes()[:5], b"%PDF-")

    def test_hostile_text_compiles(self):
        # The real test of the escaping: these characters must go through LaTeX
        # without stopping it.
        script = {
            "title": "100 % & Cie",
            "characters": [{"id": ANNIE, "name": "Annie"}],
            "acts": [{"scenes": [{"lines": [
                {"id": "l1", "characterId": ANNIE, "text": r"50 % de #1 & $3 _ {a} ~ ^ \dangereux"},
            ]}]}],
        }
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("no LaTeX engine installed")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(script), out))

    def test_a_hand_edited_blank_line_still_compiles(self):
        # script.json is edited by hand in the repo: a title or a character name
        # spread over two paragraphs is possible there. Without the flattening
        # of whitespace, LaTeX stopped on the \par and the PDF of the WHOLE play
        # disappeared, without a word to the coordinator (build.yml writes neither an
        # issue nor a journal).
        script = {
            "title": "Transport\n\nde Femmes",
            "characters": [{"id": ANNIE, "name": "An\n\nnie"}],
            "acts": [{"scenes": [{"lines": [
                {"id": "l1", "characterId": ANNIE, "text": "Premier bout.\n\nSecond bout."},
            ]}]}],
        }
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("no LaTeX engine installed")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(script), out))


if __name__ == "__main__":
    unittest.main()
