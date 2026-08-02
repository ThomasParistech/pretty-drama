"""Build plays/<id>/data/script.pdf, a play's script laid out for printing.

Derived from script.json but COMMITTED, written by uploads.yml alone on the runs that
promote a script: rebuilding it every deploy cost 45 s of LaTeX install. So nothing
refreshes it at deploy time, and a script.json edited by hand keeps its old PDF until
the next upload. Two rules not to undo: this script CANNOT FAIL the deployment (it
complains on stderr and exits 0), and the text is ESCAPED before entering the .tex.

Usage: python scripts/build_script_pdf.py [play id ...]  (no argument: every play)
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from common import is_play_id, play_data_dir, play_ids
from build_manifest import sanitize_script

# pdflatex first: it is the CI's engine, so a local PDF matches the published one.
ENGINES = ("pdflatex", "tectonic")

# Characters that are code for LaTeX. ONE re.sub pass, never a str.replace per
# character: replacing "\" first would reintroduce backslashes the rest escapes again.
_ESCAPES = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}
_ESCAPE_RE = re.compile("[" + re.escape("".join(_ESCAPES)) + "]")

# Whitespace collapsing is not cosmetic: an EMPTY LINE is a \par, which \lhead and
# \MakeUppercase refuse, and LaTeX stopping there loses the whole play's PDF silently.
_BLANKS_RE = re.compile(r"\s+")


def latex_escape(text) -> str:
    if not isinstance(text, str):
        return ""
    # Flatten first: collapsing whitespace adds no special character.
    return _ESCAPE_RE.sub(lambda m: _ESCAPES[m.group()], _BLANKS_RE.sub(" ", text))


PREAMBLE = r"""\documentclass[10pt,a4paper,twocolumn]{article}

\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
%% lmodern is not cosmetic: without it, the default T1 fonts exist only in
%% discrete sizes, and the title asked for at 52 pt comes out at 35.83 pt with a
%% mere warning in the log. Latin Modern is vector-based, so any size goes
%% through (and the PDF no longer embeds bitmaps).
\usepackage{lmodern}
\usepackage[%(babel)s]{babel}
\usepackage{geometry}
\usepackage{setspace}
\usepackage{fancyhdr}
\usepackage{ragged2e}

\geometry{margin=0.75in, top=1.5in, columnsep=0.5in}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\onehalfspacing

\pagestyle{fancy}
\fancyhf{}
\rhead{\thepage}
\lhead{\textit{%(running_title)s}}
\renewcommand{\headrulewidth}{0pt}

%% Name in bold capitals followed by a colon, line straight after. This is the
%% form of the troupe's script, and it avoids the em dash of the French
%% convention, which this project uses nowhere.
\newcommand{\speak}[1]{\par\noindent\textbf{\MakeUppercase{#1}}:}

%% Separating rule between two scenes, over the width of one column.
\newcommand{\hlinecol}{%%
  \par\vspace{1.2cm}%%
  \noindent\rule{\columnwidth}{0.4pt}%%
  \vspace{0.4cm}\par%%
}

\newcommand{\actheading}[1]{%%
  \par\vspace{0.4cm}{\centering\Large\scshape #1\par}\vspace{0.6cm}\par%%
}
\newcommand{\sceneheading}[1]{%%
  {\centering\large\scshape #1\par}\vspace{0.5cm}\par%%
}

\begin{document}
\justifying
"""


# Act and scene labels, derived from rank, in the language of the PLAY. Mirror of
# src/shared/structureLabels.js and the catalogues, compared by test_contracts.py.
# `babel`: English needs no apt package (english.ldf ships with texlive-latex-base),
# only French does. Check this first when adding a language: a missing .ldf fails LaTeX
# and this script exits 0, so the PDF would vanish silently.
STRUCTURE = {
    "fr": {
        "act": "Acte %s",
        "scene": "Scène %s",
        "untitled": "Sans titre",
        "empty": "Aucune réplique dans ce script.",
        "babel": "french",
    },
    "en": {
        "act": "Act %s",
        "scene": "Scene %s",
        "untitled": "Untitled",
        "empty": "No lines in this script.",
        "babel": "english",
    },
}

# Mirror of `romanNumeral` (structureLabels.js), including giving up beyond 39.
_TENS = ("", "X", "XX", "XXX")
_UNITS = ("", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX")


def roman_numeral(n: int) -> str:
    if not isinstance(n, int) or isinstance(n, bool) or n < 1 or n > 39:
        return str(n)
    return _TENS[n // 10] + _UNITS[n % 10]


def render_tex(script: dict) -> str:
    """script.json -> complete LaTeX source. Pure, so the tests check layout without
    opening a PDF."""
    script = sanitize_script(script)
    words = STRUCTURE.get(script["language"], STRUCTURE["fr"])
    title = script["title"].strip() or words["untitled"]
    names = {c["id"]: c["name"] for c in script["characters"]}

    out = [PREAMBLE % {"running_title": latex_escape(title), "babel": words["babel"]}]

    out.append(r"\onecolumn")
    # Three measured precautions for centring the title on an empty page: nohead,nofoot
    # (the body reserves 1.5 in at the top, dropping the title half an inch); `\topskip`
    # to zero; and a `\vbox to \textheight` with named springs, `\hsize\textwidth`
    # restoring the full width. Springs are 3:5 so the title sits at the OPTICAL centre;
    # measured, 1:1 reads as fallen and 1:2 rises too much.
    out.append(r"\newgeometry{margin=0.75in,nohead,nofoot}")
    out.append(r"\begin{titlepage}\setlength{\topskip}{0pt}%")
    # 36 pt, not 52: the size at which "Transport de Femmes" fits on one line, and what
    # the troupe has always seen (the original 52 pt was silently served at 35.83 pt).
    out.append(
        r"\noindent\vbox to \textheight{\hsize\textwidth\vskip 0pt plus 3fil\centering "
        + r"{\fontsize{36}{42}\selectfont\scshape "
        + latex_escape(title)
        + r"\par}\vskip 0pt plus 5fil}%"
    )
    out.append(r"\end{titlepage}")
    # Blank verso so printing starts on a recto. `\null`: an empty page is dropped.
    out.append(r"\thispagestyle{empty}")
    out.append(r"\null")
    # \restoregeometry AFTER the verso: placed before, it shipped an extra empty page.
    out.append(r"\restoregeometry")
    out.append(r"\twocolumn")
    out.append(r"\setcounter{page}{1}")
    out.append("")

    empty = True
    # A one-act play does not show its act title: it distinguishes nothing.
    show_acts = len(script["acts"]) > 1
    for act_index, act in enumerate(script["acts"]):
        act_title = words["act"] % roman_numeral(act_index + 1)
        # \clearpage and not \newpage, which would only move to the next column.
        if act_index > 0:
            out.append(r"\clearpage")
        if show_acts and act_title:
            out.append(r"\actheading{" + latex_escape(act_title) + "}")

        for scene_index, scene in enumerate(act["scenes"]):
            scene_title = words["scene"] % (scene_index + 1)
            if scene_index > 0:
                out.append(r"\hlinecol")
            if scene_title:
                out.append(r"\sceneheading{" + latex_escape(scene_title) + "}")

            for line in scene["lines"]:
                text = line["text"].strip()
                if not text:
                    continue
                empty = False
                # Unknown character: "?", as in build_manifest, never a lost line.
                who = names.get(line["characterId"], "?")
                out.append(r"\speak{" + latex_escape(who) + "} " + latex_escape(text))
            out.append("")

    if empty:
        out.append(r"\textit{" + latex_escape(words["empty"]) + "}")
        out.append("")

    out.append(r"\end{document}")
    return "\n".join(out) + "\n"


def _engine():
    for name in ENGINES:
        if shutil.which(name):
            return name
    return None


def compile_pdf(tex: str, out_path: Path) -> bool:
    """Compile the .tex to out_path. Returns False without raising on any failure."""
    engine = _engine()
    if engine is None:
        print(
            "no LaTeX engine found (" + " or ".join(ENGINES) + "): PDF not generated",
            file=sys.stderr,
        )
        return False

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        source = tmp_dir / "script.tex"
        source.write_text(tex, encoding="utf-8")

        if engine == "tectonic":
            cmd = [engine, "--outdir", str(tmp_dir), str(source)]
        else:
            cmd = [
                engine,
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-output-directory",
                str(tmp_dir),
                str(source),
            ]

        try:
            done = subprocess.run(
                cmd,
                cwd=tmp_dir,
                capture_output=True,
                timeout=180,
                # errors="replace" is mandatory: pdflatex logs font names in latin-1 and
                # a strict decode raises inside subprocess.run.
                encoding="utf-8",
                errors="replace",
            )
        # Broad on purpose: this module cannot fail the deployment.
        except Exception as exc:  # noqa: BLE001
            print(f"{engine} could not be launched ({exc}): PDF not generated", file=sys.stderr)
            return False

        produced = tmp_dir / "script.pdf"
        if done.returncode != 0 or not produced.exists():
            print(f"{engine} failed: PDF not generated", file=sys.stderr)
            # The last lines hold the error; the rest is package-loading noise.
            for row in (done.stdout or "").strip().splitlines()[-25:]:
                print("  " + row, file=sys.stderr)
            return False

        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(produced, out_path)
        return True


def build_one(play_id: str) -> None:
    """ONE play's PDF. Never raises and never exits: one unreadable script must not take
    the other plays' PDFs down."""
    data = play_data_dir(play_id)
    out_path = data / "script.pdf"
    try:
        raw = (data / "script.json").read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"plays/{play_id}/data/script.json not found: PDF not generated", file=sys.stderr)
        return
    try:
        script = json.loads(raw)
    except ValueError as exc:
        print(f"plays/{play_id}/data/script.json unreadable ({exc}): PDF not generated", file=sys.stderr)
        return

    tex = render_tex(script)
    if compile_pdf(tex, out_path):
        print(f"plays/{play_id}/data/script.pdf: {out_path.stat().st_size // 1024} kB")


def main() -> None:
    wanted = sys.argv[1:] or play_ids()
    for play_id in wanted:
        if not is_play_id(play_id):
            print(f"{play_id} is not a play id: skipped", file=sys.stderr)
            continue
        build_one(play_id)
    # No sys.exit(1): this PDF is a convenience, not a condition of deployment.


if __name__ == "__main__":
    main()
