"""Consigne les dépôts de ce run dans les journaux : un par pièce, plus la racine.

Le respo ne lit ni les logs de la CI ni l'onglet Issues : son seul retour sur
« mon dépôt est-il passé ? » est le journal affiché à l'écran. Ce journal est donc le
canal d'erreur du projet, pas un simple historique : un fichier refusé n'a aucun
autre endroit où se dire.

**Un journal par pièce** (`plays/<id>/data/history.json`, affiché par l'Avancement de
cette pièce) : une pièce ignore les dépôts des autres, comme elle ignore leurs
répliques et leurs clips. **Plus un journal racine** (`data/history.json`, affiché par
la page de gestion des pièces) pour ce qu'aucune pièce ne réclame : un fichier posé à
la racine d'`uploads/` sans identifiant lisible, une zone de dépôt dont le nom n'est
pas un identifiant valide. Sans lui, ces fichiers-là disparaîtraient sans un mot, ce
qui est exactement ce qu'un canal d'erreur ne doit jamais faire.

Entrée : uploads_result.json (éphémère, écrit par process_uploads.py), le sort de
chaque fichier déposé dans ce run, déjà rangé par pièce. Le journal ne consigne donc
QUE les dépôts : c'est le workflow uploads.yml qui l'écrit, jamais celui qui
reconstruit le site.

Rien n'est consigné pour un run en échec : il ne commite pas, donc il ne peut
rien écrire ici. C'est assumé, et c'est même le détecteur de panne : la date de
la dernière entrée cesse d'avancer.

Le journal d'une pièce est lu par build_manifest.py, qui le recopie dans le manifest
de la pièce (seul fichier lu par ses pages) ; celui de la racine est lu par
build_plays_index.py, et la page de gestion le sert depuis l'index.
"""

from __future__ import annotations

import sys
from pathlib import Path

from common import REPO_ROOT, is_play_id, load_json, play_data_dir, utc_stamp, write_json

ROOT_HISTORY_PATH = REPO_ROOT / "data" / "history.json"
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# Le journal est commité à chaque dépôt : il est plafonné, sinon il grossit sans
# fin. Une trentaine d'entrées couvre largement ce que le respo consulte.
MAX_RUNS = 30


def add_run(history: dict, files: list, at: str) -> dict:
    """Journal + résultat de ce dépôt -> nouveau journal (fonction pure).

    Les entrées sont rangées de la plus récente à la plus ancienne : c'est
    l'ordre d'affichage, et le plafond se lit alors comme « on garde les
    MAX_RUNS dernières »."""
    runs = history.get("runs")
    if not isinstance(runs, list):
        runs = []
    return {"runs": [{"at": at, "files": files}] + runs[: MAX_RUNS - 1]}


def append(path: Path, files: list, at: str) -> None:
    history = load_json(path, {})
    if not isinstance(history, dict):
        history = {}
    write_json(path, add_run(history, files, at))


def main() -> None:
    result = load_json(RESULT_PATH, {})
    if not isinstance(result, dict):
        result = {}
    by_play = result.get("plays")
    by_play = by_play if isinstance(by_play, dict) else {}
    unrouted = result.get("unrouted")
    unrouted = unrouted if isinstance(unrouted, list) else []

    # Un seul horodatage pour tout le run : deux fichiers déposés ensemble sont un
    # seul dépôt, même quand ils concernent deux pièces.
    at = utc_stamp()
    written = 0
    for play_id, files in sorted(by_play.items()):
        if not isinstance(files, list) or not files:
            continue
        # Validé AVANT de servir à construire un chemin, comme partout ailleurs dans
        # le projet. `uploads_result.json` est écrit par l'étape précédente du même
        # job, donc la valeur est sûre en pratique ; la règle ne se relâche pas pour
        # autant, c'est elle qui rend la concaténation sûre plutôt qu'un raisonnement
        # sur l'appelant du jour.
        if not is_play_id(play_id):
            print(f"Journal : identifiant de pièce invalide, ignoré ({play_id!r})", file=sys.stderr)
            continue
        append(play_data_dir(play_id) / "history.json", files, at)
        written += 1
        print(f"Journal de « {play_id} » : 1 entrée ajoutée ({len(files)} fichier(s))")

    if unrouted:
        append(ROOT_HISTORY_PATH, unrouted, at)
        written += 1
        print(f"Journal racine : 1 entrée ajoutée ({len(unrouted)} fichier(s) non routable(s))")

    if written == 0:
        print("Journal : rien à consigner (aucun fichier déposé)")


if __name__ == "__main__":
    main()
