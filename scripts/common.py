"""Bits shared by every Action script: repo paths, JSON writing, timestamps."""

# Les annotations de ce module (`list[str]`, `str | None`) ne sont pas évaluées grâce
# à cet import : le workflow tourne sur Python 3.12, mais un dev peut avoir une
# version plus ancienne sous la main et ces écritures y lèveraient à l'import. Les
# autres modules de scripts/ le posent déjà pour la même raison.
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Miroir de SAFE_PLAY_ID dans src/shared/plays.js, à garder synchrone : un garde
# de scripts/tests/test_contracts.py compare les deux expressions au caractère
# près, comme il le fait pour les ids de répliques.
#
# Cet identifiant nomme un DOSSIER du dépôt (`plays/<id>/`, `uploads/<id>/`) et un
# segment d'URL du site publié, donc il est validé des deux côtés : le navigateur
# le mint, l'Action le revalide avant d'en faire un chemin.
PLAY_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def is_play_id(value) -> bool:
    """`fullmatch` et pas `match` : en Python, `$` accepte aussi un saut de ligne
    final (« ma-piece\\n » passerait), là où le SAFE_PLAY_ID du navigateur le
    refuse. Même précaution que LINE_ID_PATTERN, et pour la même raison : cette
    valeur devient un chemin."""
    return isinstance(value, str) and PLAY_ID_PATTERN.fullmatch(value) is not None


# La disposition d'une pièce, en un seul endroit. Chaque pièce est un SILO : ses
# pages, ses données, ses clips et sa zone de dépôt vivent sous son identifiant, et
# rien de ce qui la concerne ne se range ailleurs. C'est ce qui fait qu'ajouter ou
# retirer une pièce ne touche à aucune autre, et que les pages d'une pièce lisent
# `data/manifest.json` en chemin RELATIF, exactement comme du temps où le site n'en
# connaissait qu'une.
PLAYS_DIR = REPO_ROOT / "plays"
UPLOADS_DIR = REPO_ROOT / "uploads"


def play_dir(play_id: str) -> Path:
    """Le dossier d'une pièce. C'est `is_play_id` qui rend cette concaténation
    sûre : le motif n'accepte ni point ni barre oblique, donc aucun identifiant
    valide ne peut sortir de `plays/`. Tout appelant valide donc AVANT de
    construire un chemin, jamais après."""
    return PLAYS_DIR / play_id


def play_data_dir(play_id: str) -> Path:
    return play_dir(play_id) / "data"


def play_clips_dir(play_id: str) -> Path:
    return play_dir(play_id) / "clips"


def play_uploads_dir(play_id: str) -> Path:
    return UPLOADS_DIR / play_id


def play_ids() -> list[str]:
    """Les pièces du dépôt, par identifiant croissant.

    La liste vient des DOSSIERS et non d'un index : c'est ce qui garantit qu'une
    pièce ne disparaît jamais du site parce que son script est devenu illisible.
    Un dossier dont le nom n'est pas un identifiant valide est ignoré, ce qui n'est
    pas de la prudence : il a été créé à la main, aucun fichier déposé ne pourra le
    désigner, et le publier donnerait une URL que le site ne saurait pas écrire.
    """
    if not PLAYS_DIR.is_dir():
        return []
    return sorted(p.name for p in PLAYS_DIR.iterdir() if p.is_dir() and is_play_id(p.name))


def load_json(path: Path, default, warning: str | None = None):
    """Lecture tolérante partagée : un fichier absent ou abîmé rend le repli.

    Elle vivait dans update_history.py, où le journal n'est qu'un confort. Elle
    sert maintenant à tout ce qui lit un fichier DÉRIVÉ à côté d'une source de
    vérité (journal, index des pièces, état des clips), et la règle est la même
    partout : un fichier dérivé abîmé se lit en dégradé, il ne fait pas échouer le
    run, et surtout pas celui des autres pièces. La seule lecture qui ne passe pas
    par ici est celle de `script.json`, dont l'appelant doit distinguer « absent »
    de « illisible » : écrire par-dessus un fichier illisible effacerait la pièce
    d'une troupe.

    `warning` est écrit sur stderr quand le fichier EXISTE mais ne se lit pas. Un
    fichier absent est un cas normal (une pièce qui n'a pas encore de dépôt), un
    fichier abîmé mérite une ligne dans le journal de la CI ; sans message, la
    lecture est muette.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        if warning:
            print(warning, file=sys.stderr)
        return default


def utc_stamp() -> str:
    """Horodatage ISO à la seconde, suffixé Z. Un seul format d'horodatage dans
    tout le projet : `new Date()` le lit tel quel côté navigateur."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, data, sort_keys: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=sort_keys) + "\n",
        encoding="utf-8",
    )
