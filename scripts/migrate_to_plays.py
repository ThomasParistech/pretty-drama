"""Déplace la pièce unique d'un dépôt vers `plays/<id>/`. À lancer UNE fois.

Le dépôt n'a longtemps connu qu'une pièce : `data/script.json` était la source de
vérité et `clips/` portait ses mp3. Depuis qu'il en héberge plusieurs, chaque pièce
est un silo (`plays/<id>/data/`, `plays/<id>/clips/`, `uploads/<id>/`), et ce script
est ce qui fait passer l'ancienne disposition à la nouvelle sans rien perdre.

Il sert à ce dépôt-ci comme à toute troupe qui a déjà forké et travaille depuis des
mois : sans lui, tirer la nouvelle version laisserait sa pièce dans un `data/` que
plus personne ne lit.

    python3 scripts/migrate_to_plays.py transport-de-femmes

L'identifiant est un ARGUMENT et n'est pas dérivé du titre, alors que c'est ce que
fait la page de gestion quand elle crée une pièce. Deux raisons : il nomme un
dossier et une URL pour des années, donc il vaut d'être choisi à l'œil plutôt que
subi ; et le calculer ici demanderait une seconde implémentation du slug, en Python,
que rien ne tiendrait en accord avec celle du navigateur (`slugify`,
src/shared/data.js) pour un script qui ne tourne qu'une fois.

Idempotent : relancé, il constate que la pièce est déjà là et ne touche à rien. Il ne
commite pas, il déplace des fichiers ; git reconnaît les renommages tout seul.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from common import (
    REPO_ROOT,
    UPLOADS_DIR,
    is_play_id,
    play_clips_dir,
    play_data_dir,
    play_dir,
    play_uploads_dir,
    write_json,
)

OLD_DATA = REPO_ROOT / "data"
OLD_CLIPS = REPO_ROOT / "clips"

# Les quatre fichiers qui décrivaient LA pièce. Ils descendent tels quels dans son
# dossier. Ce qui reste dans `data/` après le passage ne parle plus d'une pièce en
# particulier : l'index des pièces et le journal des dépôts qu'aucune n'a réclamés.
PLAY_FILES = ("script.json", "clips.json", "history.json", "manifest.json")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail(
            "usage : python3 scripts/migrate_to_plays.py <identifiant>\n"
            "L'identifiant nomme le dossier de la pièce et son adresse sur le site "
            "(minuscules, chiffres et tirets), par exemple « transport-de-femmes »."
        )
    play_id = sys.argv[1]
    if not is_play_id(play_id):
        fail(
            f"« {play_id} » n'est pas un identifiant de pièce valide : minuscules, "
            "chiffres et tirets, sans tiret en tête, 64 caractères au plus."
        )

    target_script = play_data_dir(play_id) / "script.json"
    if target_script.exists():
        print(f"plays/{play_id}/ porte déjà un script : rien à migrer.")
        return

    old_script = OLD_DATA / "script.json"
    if not old_script.exists():
        fail(
            "data/script.json est introuvable : il n'y a aucune pièce à migrer. "
            "Créez-la depuis la page de gestion des pièces du site."
        )

    # Le script est relu ici pour lui poser son identifiant, et c'est la SEULE
    # retouche de contenu de toute la migration. Il est réécrit avec le même
    # formatage que celui de l'éditeur (indent 2), et tous ses champs sont
    # conservés, couleurs des personnages comprises : on charge, on ajoute une clé,
    # on réécrit, sans passer par aucun sanitize.
    try:
        script = json.loads(old_script.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(
            f"data/script.json n'est pas un JSON valide ({exc}) : réparez-le ou "
            "restaurez-le depuis l'historique GitHub avant de migrer."
        )
    if not isinstance(script, dict):
        fail("data/script.json ne contient pas un script de pièce : migration annulée.")

    play_data_dir(play_id).mkdir(parents=True, exist_ok=True)

    # Les CLIPS avant les fichiers de données, et l'ordre n'est pas indifférent : la
    # garde d'idempotence, plus haut, est la présence du script à destination. Les
    # mp3 déplacés en dernier, une interruption entre les deux (Ctrl+C, disque plein)
    # laissait un dépôt où le script était migré mais pas les voix, et la relance
    # s'arrêtait sur la garde en annonçant « rien à migrer », les mp3 restant en
    # rade. Dans cet ordre, tout ce qui précède le script est déjà fait quand la
    # garde se ferme, et une relance après interruption reprend proprement.
    if OLD_CLIPS.is_dir():
        # Le dossier entier, `.gitkeep` compris : il tient `clips/` en vie dans git
        # quand la troupe n'a pas encore enregistré une seule réplique.
        if play_clips_dir(play_id).exists():
            fail(
                f"plays/{play_id}/clips/ existe déjà alors que clips/ est encore là : "
                "déplacez le reste à la main, la migration ne veut pas choisir pour vous."
            )
        shutil.move(str(OLD_CLIPS), str(play_clips_dir(play_id)))
        count = len(list(play_clips_dir(play_id).glob("*.mp3")))
        print(f"  clips/ -> plays/{play_id}/clips/ ({count} mp3)")

    for name in PLAY_FILES:
        source = OLD_DATA / name
        if source.exists():
            shutil.move(str(source), str(play_data_dir(play_id) / name))
            print(f"  data/{name} -> plays/{play_id}/data/{name}")

    script["id"] = play_id
    write_json(play_data_dir(play_id) / "script.json", script)
    print(f"  identifiant « {play_id} » inscrit dans le script")

    # Le PDF est dérivé et gitignoré : il se reconstruit à sa nouvelle place au
    # prochain déploiement, il n'y a rien à déplacer.
    (OLD_DATA / "script.pdf").unlink(missing_ok=True)

    # La zone de dépôt de la pièce. Elle doit exister AVANT que le respo en ait
    # besoin : c'est elle que vise le bouton de dépôt de l'Avancement, et GitHub ne
    # sert sa page d'envoi que sur un dossier qu'il connaît.
    play_uploads_dir(play_id).mkdir(parents=True, exist_ok=True)
    (play_uploads_dir(play_id) / ".gitkeep").touch()
    (UPLOADS_DIR / ".gitkeep").touch()
    print(f"  uploads/{play_id}/ créé")

    print(
        f"\nMigration terminée. Reconstruisez les fichiers dérivés :\n"
        f"  python3 scripts/build_manifest.py && python3 scripts/build_plays_index.py"
    )


if __name__ == "__main__":
    main()
