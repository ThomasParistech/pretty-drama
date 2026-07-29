"""Tests du script PDF de la pièce.

Tout porte sur le .tex produit, jamais sur le PDF : `render_tex` est pure, donc
la mise en page se vérifie en lisant du texte, sans ouvrir un binaire ni
installer LaTeX. Seul le test de bout en bout compile vraiment, et il se saute
tout seul là où aucun moteur n'est installé (une troupe qui forke le dépôt fait
tourner cette suite sans TeX).

Ce qui est vérifié ici tient en deux promesses : le PDF ne peut pas faire
échouer le déploiement, et aucun texte saisi dans l'éditeur ne peut casser la
compilation.
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

SCRIPT = {
    "title": "Transport de Femmes",
    "characters": [{"id": ANNIE, "name": "Annie"}, {"id": SERGE, "name": "Serge"}],
    "acts": [
        {
            "title": "Acte I",
            "scenes": [
                {
                    "title": "Scène 1",
                    "lines": [
                        {"id": "l1", "characterId": ANNIE, "text": "Mais on va être comme des coqs en pâte!"},
                        {"id": "l2", "characterId": SERGE, "text": "Silence! C'est moi le chef ici."},
                    ],
                },
                {
                    "title": "Scène 2",
                    "lines": [{"id": "l3", "characterId": ANNIE, "text": "On étouffe ici."}],
                },
            ],
        },
        {
            "title": "Acte II",
            "scenes": [
                {"title": "Scène 1", "lines": [{"id": "l4", "characterId": SERGE, "text": "Debout."}]}
            ],
        },
    ],
}


class TestLatexEscape(unittest.TestCase):
    def test_every_special_character_is_neutralised(self):
        # Ces caractères sont du code pour LaTeX. Rien de tout cela n'existe
        # dans la pièce d'aujourd'hui, mais le texte vient d'un champ de
        # saisie : un « 50 % » ou un « R&D » finira par arriver.
        self.assertEqual(latex_escape("50 % & 3 $ #1 _x {a} ~ ^"),
                         r"50 \% \& 3 \$ \#1 \_x \{a\} \textasciitilde{} \textasciicircum{}")

    def test_backslash_is_not_escaped_twice(self):
        # Le piège du remplacement caractère par caractère : traiter "\"
        # d'abord réintroduit des antislashs que les passes suivantes
        # ré-échappent, et le texte se remplit de \textbackslash.
        self.assertEqual(latex_escape("a\\b"), r"a\textbackslash{}b")
        self.assertNotIn(r"\textbackslash{}textbackslash", latex_escape("a\\b"))

    def test_accents_and_french_quotes_pass_through(self):
        # Le .tex est écrit en UTF-8 et lu par inputenc : rien à échapper ici,
        # et surtout rien à translittérer.
        self.assertEqual(latex_escape("« Éclair », dit-il… ça va ?"), "« Éclair », dit-il… ça va ?")

    def test_non_string_gives_empty(self):
        self.assertEqual(latex_escape(None), "")
        self.assertEqual(latex_escape(42), "")

    def test_a_blank_line_never_becomes_a_paragraph_break(self):
        # Une ligne vide est un \par pour TeX, et \lhead comme \MakeUppercase
        # s'arrêtent net sur une fin de paragraphe dans leur argument : c'est
        # tout le PDF qui disparaît, silencieusement. Les blancs sont donc
        # aplatis, ce que LaTeX ferait de toute façon d'une suite d'espaces.
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
        tex = render_tex(SCRIPT)
        self.assertIn(r"\actheading{Acte I}", tex)
        self.assertIn(r"\actheading{Acte II}", tex)
        self.assertIn(r"\sceneheading{Scène 1}", tex)
        self.assertIn(r"\sceneheading{Scène 2}", tex)

    def test_rule_separates_scenes_but_never_opens_an_act(self):
        # Le filet sépare deux scènes. En tête d'acte il n'a rien à séparer :
        # l'acte I a deux scènes (un filet), l'acte II une seule (aucun).
        # On compte dans le corps seulement, le préambule contenant le
        # \newcommand qui définit la macro.
        body = render_tex(SCRIPT).split(r"\begin{document}", 1)[1]
        self.assertEqual(body.count(r"\hlinecol"), 1)
        self.assertLess(body.index(r"\sceneheading{Scène 1}"), body.index(r"\hlinecol"))

    def test_new_act_opens_a_page_but_not_the_first(self):
        # \clearpage et pas \newpage : en deux colonnes, \newpage se
        # contenterait de passer à la colonne de droite.
        tex = render_tex(SCRIPT)
        self.assertEqual(tex.count(r"\clearpage"), 1)
        self.assertLess(tex.index(r"\actheading{Acte I}"), tex.index(r"\clearpage"))


class TestRenderTexTolerance(unittest.TestCase):
    """script.json est éditable à la main dans le dépôt : comme build_manifest,
    ce script doit dégrader, jamais lever."""

    def test_unknown_character_becomes_a_question_mark(self):
        script = dict(SCRIPT, characters=[])
        tex = render_tex(script)
        self.assertIn(r"\speak{?} Mais on va être comme des coqs en pâte!", tex)

    def test_empty_lines_are_dropped(self):
        script = {
            "title": "T",
            "characters": [{"id": ANNIE, "name": "Annie"}],
            "acts": [{"title": "A", "scenes": [{"title": "S", "lines": [
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

    def test_missing_title_gets_a_placeholder(self):
        # Un \lhead{\textit{}} vide passerait inaperçu jusqu'à l'impression.
        tex = render_tex({"title": "", "characters": [], "acts": []})
        self.assertIn("Sans titre", tex)


class TestCompile(unittest.TestCase):
    def test_compile_failure_never_raises(self):
        # LA promesse du module : build.yml n'écrit ni issue ni journal, donc
        # une compilation qui lèverait ferait disparaître le site sans que le
        # respo en soit informé.
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("aucun moteur LaTeX installé")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "nope.pdf"
            # L'échec recopie la fin du journal LaTeX sur stderr, ce qui est le
            # comportement voulu en CI mais noierait la sortie des tests.
            with open(os.devnull, "w") as quiet, contextlib.redirect_stderr(quiet):
                ok = compile_pdf(r"\documentclass{article}\begin{document}\undefinedmacro", out)
            self.assertFalse(ok)
            self.assertFalse(out.exists())

    def test_real_script_compiles(self):
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("aucun moteur LaTeX installé")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(SCRIPT), out))
            self.assertEqual(out.read_bytes()[:5], b"%PDF-")

    def test_hostile_text_compiles(self):
        # Le vrai test de l'échappement : ces caractères doivent traverser
        # LaTeX sans l'arrêter.
        script = {
            "title": "100 % & Cie",
            "characters": [{"id": ANNIE, "name": "Annie"}],
            "acts": [{"title": "Acte I", "scenes": [{"title": "Scène 1", "lines": [
                {"id": "l1", "characterId": ANNIE, "text": r"50 % de #1 & $3 _ {a} ~ ^ \dangereux"},
            ]}]}],
        }
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("aucun moteur LaTeX installé")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(script), out))

    def test_a_hand_edited_blank_line_still_compiles(self):
        # script.json s'édite à la main dans le dépôt : un titre ou un nom de
        # personnage sur deux paragraphes y est possible. Sans l'aplatissement
        # des blancs, LaTeX s'arrêtait sur le \par et le PDF de TOUTE la pièce
        # disparaissait, sans un mot au respo (build.yml n'écrit ni issue ni
        # journal).
        script = {
            "title": "Transport\n\nde Femmes",
            "characters": [{"id": ANNIE, "name": "An\n\nnie"}],
            "acts": [{"title": "Acte I", "scenes": [{"title": "Scène 1", "lines": [
                {"id": "l1", "characterId": ANNIE, "text": "Premier bout.\n\nSecond bout."},
            ]}]}],
        }
        if shutil.which("pdflatex") is None and shutil.which("tectonic") is None:
            self.skipTest("aucun moteur LaTeX installé")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "script.pdf"
            self.assertTrue(compile_pdf(render_tex(script), out))


if __name__ == "__main__":
    unittest.main()
