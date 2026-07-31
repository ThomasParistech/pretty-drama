"""Écrit data/plays.json — la liste des pièces, le SEUL fichier au-dessus d'elles.

Chaque pièce est un silo : ses pages, ses données et ses clips vivent sous
`plays/<id>/` et n'ont besoin de rien d'autre. Mais quelque chose doit bien dire
QUELLES pièces existent, sinon les deux pages racine (le sélecteur de la troupe et
la page de gestion du respo) n'auraient rien à lister. C'est ce fichier, et il ne
contient rien de plus que ce qu'il faut pour dessiner une carte de pièce : son
identifiant, son titre, sa langue, et de quoi montrer où elle en est.

Dérivé de bout en bout, comme le manifest : il se reconstruit à chaque dépôt et à
chaque déploiement, et il ne porte aucune information qui ne soit déjà dans une
pièce.

Deux choses à ne pas défaire.

1. **La liste vient des DOSSIERS** (`play_ids`) et non des manifests : une pièce dont
   le manifest manque ou est abîmé apparaît quand même, avec ce qu'on a pu lire
   d'elle. Une pièce qui DISPARAÎT du sélecteur est le pire affichage possible, le
   respo n'ayant alors plus aucun chemin vers sa page de dépôt pour la réparer.

2. **L'ordre est celui des identifiants, pas des titres.** Trier sur le titre
   demanderait de comparer des chaînes accentuées, donc de choisir une locale, et un
   fichier machine n'a pas à en connaître une (même règle que les rangs du manifest,
   qui laisse le front écrire « Acte II »). Ce sont les deux pages racine qui
   trient à l'affichage, avec `Intl.Collator` et dans la langue du lecteur.
"""

from __future__ import annotations

from common import REPO_ROOT, load_json, play_data_dir, play_ids, write_json

INDEX_PATH = REPO_ROOT / "data" / "plays.json"


def play_entry(play_id: str) -> dict:
    """Ce qu'une carte de pièce a besoin de savoir, lu en dégradé.

    Le manifest est le seul fichier consulté pour le titre : c'est déjà lui que
    toutes les pages lisent, et il est reconstruit juste avant nous par les deux
    workflows. Absent (pièce née d'un dépôt refusé) ou abîmé, la carte tombe sur un
    titre vide, que les deux pages racine rendent avec le même « Pièce sans titre »
    que les cinq bandeaux.
    """
    data = play_data_dir(play_id)
    manifest = load_json(data / "manifest.json", {})
    if not isinstance(manifest, dict):
        manifest = {}
    lines = manifest.get("lines")
    lines = lines if isinstance(lines, list) else []

    history = load_json(data / "history.json", {})
    runs = history.get("runs") if isinstance(history, dict) else None
    runs = runs if isinstance(runs, list) else []
    # La date du dépôt le plus récent, le journal étant rangé du plus récent au plus
    # ancien (cf. update_history.add_run). Elle sert de témoin de vie sur la carte,
    # et c'est le même rôle qu'elle tient déjà en tête du journal de l'Avancement :
    # une pièce dont la date n'avance plus est une pièce dont les dépôts échouent.
    last = runs[0].get("at") if runs and isinstance(runs[0], dict) else None

    return {
        "id": play_id,
        # Le titre vient du manifest, donc du script, donc de la troupe : c'est une
        # donnée et jamais du texte d'interface. Le repli est laissé au front.
        "title": manifest.get("title") if isinstance(manifest.get("title"), str) else "",
        "language": manifest.get("language") if isinstance(manifest.get("language"), str) else "fr",
        # Deux nombres et pas un pourcentage déjà composé : c'est `fmt.percent` qui
        # met une part en mots, dans la langue du lecteur.
        "lines": len(lines),
        "recorded": sum(1 for line in lines if isinstance(line, dict) and line.get("status") == "ok"),
        "lastDeposit": last if isinstance(last, str) else None,
    }


def main() -> None:
    plays = [play_entry(play_id) for play_id in play_ids()]
    write_json(INDEX_PATH, {"plays": plays})
    print(f"data/plays.json : {len(plays)} pièce(s)")


if __name__ == "__main__":
    main()
