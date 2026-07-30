"""Build data/script.pdf — le script de la pièce, mis en page pour l'impression.

Dérivé de data/script.json, comme manifest.json : rien n'est stocké ici, tout
se recalcule. Généré par build.yml SEUL (uploads.yml est le seul écrivain du
dépôt, et ce PDF n'est pas une donnée : il est gitignoré, construit à chaque
déploiement et recopié dans dist/ avec le reste de data/).

La mise en page reprend celle du script LaTeX de la troupe (article deux
colonnes, babel français, nom en capitales grasses suivi de deux-points) : le
PDF doit ressembler au script que les acteurs ont déjà eu en main. Les paquets
chargés sans servir ont sauté, dont pgfornament, qui tirait tout TikZ derrière
lui pour rien.

Deux règles à ne pas défaire :

 - **Ce script ne peut pas faire échouer le déploiement.** LaTeX s'arrête sur
   des broutilles, et un run en échec ne se raconte nulle part (build.yml
   n'écrit ni issue ni journal, cf. CLAUDE.md) : le respo ne verrait que le
   site cesser de se mettre à jour. Une compilation ratée se plaint sur stderr
   et rend la main en code 0, le site part sans son PDF.
 - **Le texte des répliques est échappé** avant d'entrer dans le .tex. Il est
   saisi dans l'éditeur par un humain, donc un « 50 % » ou un « R&D » finira
   par arriver, et ces caractères sont du code pour LaTeX.

Usage : python scripts/build_script_pdf.py [chemin/de/sortie.pdf]
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from common import REPO_ROOT
from build_manifest import SCRIPT_PATH, sanitize_script

PDF_PATH = REPO_ROOT / "data" / "script.pdf"

# pdflatex d'abord : c'est le moteur de la CI (paquets TeX de la distribution,
# cf. build.yml) et celui du script LaTeX d'origine de la troupe, donc le PDF
# obtenu en local est celui qui sera publié. tectonic ensuite, pour qui l'a
# déjà : le rendu est équivalent, à l'espace avant les deux-points près
# (en XeTeX, il suit la règle française de plus près). Aucun des deux n'est
# requis pour importer ce module : les tests portent sur le .tex produit, pas
# sur le PDF.
ENGINES = ("pdflatex", "tectonic")

# Caractères qui sont du code pour LaTeX. Une seule passe de re.sub, jamais un
# str.replace par caractère : remplacer "\" en premier réintroduirait des
# antislashs que les remplacements suivants ré-échapperaient.
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

# Les blancs sont ramenés à une espace en même temps, et ce n'est pas de la
# cosmétique : une LIGNE VIDE devient un \par pour TeX, or \lhead (titre courant)
# et \MakeUppercase (nom du personnage) ne supportent pas de fin de paragraphe
# dans leur argument. LaTeX s'arrête là, et comme ce module ne peut pas faire
# échouer le déploiement, le PDF de toute la pièce disparaît sans un mot. Un
# titre ou un nom sur deux paragraphes n'arrive pas de l'éditeur (deux champs
# d'une ligne) mais script.json s'édite à la main dans le dépôt, et tout
# consommateur doit y survivre. LaTeX ramenant de toute façon toute suite de
# blancs à une espace, il n'y a rien à perdre à le faire ici : une réplique y
# gagne même de rester un seul paragraphe, donc de garder son nom de personnage
# en tête (une ligne vide au milieu compilait, mais la fin de la réplique
# repartait sans locuteur).
_BLANKS_RE = re.compile(r"\s+")


def latex_escape(text) -> str:
    if not isinstance(text, str):
        return ""
    # Aplatir d'abord : la normalisation des blancs n'introduit aucun caractère
    # spécial, l'inverse ne serait pas vrai.
    return _ESCAPE_RE.sub(lambda m: _ESCAPES[m.group()], _BLANKS_RE.sub(" ", text))


PREAMBLE = r"""\documentclass[10pt,a4paper,twocolumn]{article}

\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
%% lmodern n'est pas cosmétique : sans lui, les fontes T1 par défaut n'existent
%% qu'en tailles discrètes, et le titre demandé à 52 pt sort à 35,83 pt avec un
%% simple avertissement dans le journal. Latin Modern est vectoriel, donc
%% n'importe quelle taille passe (et le PDF n'embarque plus de bitmaps).
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

%% Nom en capitales grasses suivi de deux-points, réplique dans la foulée.
%% C'est la forme du script de la troupe, et elle évite le tiret cadratin de la
%% convention française, que ce projet n'utilise nulle part.
\newcommand{\speak}[1]{\par\noindent\textbf{\MakeUppercase{#1}}:}

%% Filet de séparation entre deux scènes, sur la largeur d'une colonne.
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


# Les libellés d'acte et de scène, DÉRIVÉS de leur rang, et la langue de babel.
#
# Miroir de src/shared/structureLabels.js et des catalogues : un acte et une scène
# n'ont pas de titre dans script.json, donc le PDF compose les siens. Il les
# compose dans la langue de la PIÈCE (`language`) et non dans celle d'un lecteur :
# à l'écran un libellé d'acte est de la navigation, sur le papier c'est le
# document. Le chiffre est le même des deux côtés, donc personne ne perd sa place.
#
# Un garde de scripts/tests/test_contracts.py compare ces mots à ceux des
# catalogues JS : les faire diverger ferait imprimer « Acte II » sous un écran qui
# annonce « Act II ».
#
# `babel` : AUCUN paquet apt à ajouter pour l'anglais, et c'est vérifié plutôt que
# supposé. `english.ldf` vient de `texlive-latex-base`, dont
# `texlive-latex-recommended` (déjà installé par build.yml) dépend ; seul le
# français demande son propre paquet, `texlive-lang-french`. Une pièce anglaise se
# compose donc sans toucher au workflow. Si une troisième langue s'ajoute un jour,
# c'est le premier endroit à vérifier : sans son `.ldf`, LaTeX échoue, et comme ce
# script rend 0 même en cas d'échec (cf. plus bas), le PDF disparaîtrait sans un
# mot au respo.
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

# Chiffres romains pour les actes, arabes pour les scènes, comme le script imprimé
# que ce module reproduit. Miroir de `romanNumeral` (structureLabels.js), y compris
# son abandon au-delà de 39 : aucune pièce n'a quarante actes, et un chiffre romain
# faux se lirait plus mal qu'un nombre.
_TENS = ("", "X", "XX", "XXX")
_UNITS = ("", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX")


def roman_numeral(n: int) -> str:
    if not isinstance(n, int) or isinstance(n, bool) or n < 1 or n > 39:
        return str(n)
    return _TENS[n // 10] + _UNITS[n % 10]


def render_tex(script: dict) -> str:
    """script.json -> source LaTeX complet. Fonction pure : c'est elle que les
    tests lisent, il n'y a pas à ouvrir un PDF pour vérifier la mise en page."""
    script = sanitize_script(script)
    words = STRUCTURE.get(script["language"], STRUCTURE["fr"])
    title = script["title"].strip() or words["untitled"]
    names = {c["id"]: c["name"] for c in script["characters"]}

    out = [PREAMBLE % {"running_title": latex_escape(title), "babel": words["babel"]}]

    # Page de titre : le titre seul, centré. Pas de distribution ni de lieu ni
    # de date, script.json n'en porte pas (et une page de garde inventée
    # vieillirait mal).
    out.append(r"\onecolumn")
    # Centrer un titre sur une page vide demande trois précautions, mesurées
    # chacune sur le PDF rendu (l'écart se lit à l'œil sur une page qui ne
    # contient que lui) :
    #  - `\newgeometry` : la géométrie du corps réserve 1,5 pouce en haut pour
    #    l'en-tête courant contre 0,75 en bas, et `nohead,nofoot` enlève en
    #    plus la hauteur d'en-tête et de pied que geometry garderait quand
    #    même. Sans ça le bloc de texte descend d'un demi-pouce, et le titre
    #    avec lui.
    #  - `\topskip` à zéro : TeX cale la première boîte d'une page à au moins
    #    \topskip du haut du bloc, ce qui repousse le titre vers le bas sans
    #    rien rendre au ressort du dessous.
    #  - un `\vbox to \textheight` : deux `\vspace*{\fill}` de part et d'autre
    #    laissaient encore une douzaine de pixels d'écart (constants, quelle
    #    que soit la longueur du titre). Une boîte de la hauteur exacte du bloc
    #    avec des ressorts nommés place le titre au pixel près, sur une comme
    #    sur deux lignes. `\hsize\textwidth` lui rend la pleine largeur : dans
    #    un document à deux colonnes, elle vaudrait sinon une demi-page et le
    #    titre se couperait.
    #
    # Les ressorts sont dans un rapport 3:5 et pas 1:1 : le titre se pose au
    # centre OPTIQUE, aux deux cinquièmes de la hauteur, pas au milieu
    # géométrique. Un titre mathématiquement centré sur une page par ailleurs
    # vide se lit comme tombé trop bas (l'œil place le milieu d'une page plus
    # haut que le mètre). Les rapports voisins ont été comparés sur le rendu :
    # 1:1 tombe, 1:2 remonte trop et la page devient déséquilibrée par le vide
    # du dessous.
    out.append(r"\newgeometry{margin=0.75in,nohead,nofoot}")
    out.append(r"\begin{titlepage}\setlength{\topskip}{0pt}%")
    # 36 pt et pas 52 : c'est la taille à laquelle « Transport de Femmes »
    # tient sur une ligne. Le script LaTeX d'origine demandait 52 pt et se
    # faisait silencieusement substituer 35,83 pt (fontes T1 non vectorielles),
    # donc c'est bien cette taille-là que la troupe a toujours vue imprimée ;
    # lmodern honorerait 52 pt pour de bon et couperait le titre en deux.
    out.append(
        r"\noindent\vbox to \textheight{\hsize\textwidth\vskip 0pt plus 3fil\centering "
        + r"{\fontsize{36}{42}\selectfont\scshape "
        + latex_escape(title)
        + r"\par}\vskip 0pt plus 5fil}%"
    )
    out.append(r"\end{titlepage}")
    # Verso blanc. Imprimé en recto-verso, le texte doit commencer sur une belle
    # page : sans cette page-ci, la première réplique tombe au dos du titre.
    # \null est obligatoire, une page vide de tout contenu serait escamotée.
    out.append(r"\thispagestyle{empty}")
    out.append(r"\null")
    # \restoregeometry APRÈS le verso, jamais avant : il provoque un saut de
    # page, et placé juste après la page de titre il expédiait une page vide de
    # plus, celle-là avec le titre courant et son numéro en haut.
    out.append(r"\restoregeometry")
    out.append(r"\twocolumn")
    # La numérotation repart à 1 sur la première page de texte : le titre et son
    # verso ne sont pas des pages du script.
    out.append(r"\setcounter{page}{1}")
    out.append("")

    empty = True
    # Une pièce en un seul acte n'affiche pas son titre d'acte : il ne distingue
    # rien, et le lecteur d'un script d'un acte n'a que des scènes à repérer. Il
    # reste dans script.json (l'éditeur travaille toujours par acte), c'est la
    # mise en page qui le tait.
    show_acts = len(script["acts"]) > 1
    for act_index, act in enumerate(script["acts"]):
        act_title = words["act"] % roman_numeral(act_index + 1)
        # Chaque acte sauf le premier ouvre une page : \clearpage et non
        # \newpage, qui ne ferait que passer à la colonne suivante.
        if act_index > 0:
            out.append(r"\clearpage")
        if show_acts and act_title:
            out.append(r"\actheading{" + latex_escape(act_title) + "}")

        for scene_index, scene in enumerate(act["scenes"]):
            scene_title = words["scene"] % (scene_index + 1)
            # Le filet sépare deux scènes : il n'a rien à séparer avant la
            # première, où le titre d'acte vient juste de passer.
            if scene_index > 0:
                out.append(r"\hlinecol")
            if scene_title:
                out.append(r"\sceneheading{" + latex_escape(scene_title) + "}")

            for line in scene["lines"]:
                text = line["text"].strip()
                if not text:
                    continue
                empty = False
                # Personnage inconnu : « ? », comme build_manifest. Un id
                # orphelin est un script à réparer, pas une raison de perdre la
                # réplique.
                who = names.get(line["characterId"], "?")
                out.append(r"\speak{" + latex_escape(who) + "} " + latex_escape(text))
            out.append("")

    if empty:
        # Dans la langue de la PIÈCE, comme le titre de repli et les intertitres :
        # c'est la seule phrase que ce module écrive de son propre chef, et elle
        # était la seule à rester en français sur le papier d'une pièce anglaise.
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
    """Compile le .tex et pose le PDF à out_path. Rend False (sans lever) si
    quoi que ce soit manque ou échoue : l'appelant doit pouvoir continuer."""
    engine = _engine()
    if engine is None:
        print(
            "aucun moteur LaTeX trouvé (" + " ou ".join(ENGINES) + ") : PDF non généré",
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
                # errors="replace" est obligatoire : le journal de pdflatex
                # recrache les noms de fichiers de police en latin-1, et un
                # décodage strict lève au milieu de subprocess.run, donc bien
                # avant qu'on ait pu regarder le code de retour.
                encoding="utf-8",
                errors="replace",
            )
        # Volontairement large : la promesse de ce module est qu'il ne peut pas
        # faire échouer le déploiement, et une compilation LaTeX a trop de
        # façons de mal finir pour qu'on les énumère.
        except Exception as exc:  # noqa: BLE001
            print(f"{engine} n'a pas pu être lancé ({exc}) : PDF non généré", file=sys.stderr)
            return False

        produced = tmp_dir / "script.pdf"
        if done.returncode != 0 or not produced.exists():
            print(f"{engine} a échoué : PDF non généré", file=sys.stderr)
            # Les dernières lignes du log disent l'erreur ; le reste est du
            # bruit de chargement de paquets.
            for row in (done.stdout or "").strip().splitlines()[-25:]:
                print("  " + row, file=sys.stderr)
            return False

        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(produced, out_path)
        return True


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF_PATH
    try:
        raw = SCRIPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("data/script.json introuvable : PDF non généré", file=sys.stderr)
        return
    try:
        script = json.loads(raw)
    except ValueError as exc:
        print(f"data/script.json illisible ({exc}) : PDF non généré", file=sys.stderr)
        return

    tex = render_tex(script)
    if compile_pdf(tex, out_path):
        print(f"{out_path.name} written: {out_path.stat().st_size // 1024} KB")
    # Pas de sys.exit(1) : ce PDF est un confort, pas une condition de
    # déploiement. Voir l'en-tête du module.


if __name__ == "__main__":
    main()
