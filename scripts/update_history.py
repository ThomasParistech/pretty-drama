"""Append one entry to data/history.json — the journal shown on the Avancement page.

Le respo ne lit ni les logs de la CI ni l'onglet Issues : son seul retour sur
« mon dépôt est-il passé ? » est la page Avancement. Ce journal est donc le
canal d'erreur du projet, pas un simple historique : un fichier refusé n'a aucun
autre endroit où se dire.

Entrée : uploads_result.json (éphémère, écrit par process_uploads.py), le sort
de chaque fichier déposé dans ce run. Le journal ne consigne donc QUE les
dépôts : c'est le workflow uploads.yml qui l'écrit, jamais celui qui reconstruit
le site.

Rien n'est consigné pour un run en échec : il ne commite pas, donc il ne peut
rien écrire ici. C'est assumé, et c'est même le détecteur de panne : la date de
la dernière entrée cesse d'avancer.

Le fichier est lu par build_manifest.py, qui le recopie dans data/manifest.json
(seul fichier lu par les pages).
"""

from __future__ import annotations

import json

from common import REPO_ROOT, utc_stamp, write_json

HISTORY_PATH = REPO_ROOT / "data" / "history.json"
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# Le journal est commité à chaque dépôt : il est plafonné, sinon il grossit sans
# fin. Une trentaine d'entrées couvre largement ce que le respo consulte.
MAX_RUNS = 30


def load_json(path, default):
    """Lecture tolérante : un fichier absent ou abîmé ne fait jamais échouer le
    run (le journal est un confort, pas une source de vérité)."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def add_run(history: dict, files: list, at: str) -> dict:
    """Journal + résultat de ce dépôt -> nouveau journal (fonction pure).

    Les entrées sont rangées de la plus récente à la plus ancienne : c'est
    l'ordre d'affichage, et le plafond se lit alors comme « on garde les
    MAX_RUNS dernières »."""
    runs = history.get("runs")
    if not isinstance(runs, list):
        runs = []
    return {"runs": [{"at": at, "files": files}] + runs[: MAX_RUNS - 1]}


def main() -> None:
    result = load_json(RESULT_PATH, [])
    files = result if isinstance(result, list) else []
    if not files:
        print("Journal : rien à consigner (aucun fichier déposé)")
        return

    history = load_json(HISTORY_PATH, {})
    if not isinstance(history, dict):
        history = {}
    write_json(HISTORY_PATH, add_run(history, files, utc_stamp()))
    print(f"Journal : 1 entrée ajoutée ({len(files)} fichier(s))")


if __name__ == "__main__":
    main()
