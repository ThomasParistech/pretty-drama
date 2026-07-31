import React, { useState } from "react";
import { DownloadIcon, WarnIcon } from "../shared/icons.jsx";
import { downloadBlob, githubUploadUrl } from "../shared/data.js";
import { LOCALE, t } from "../shared/locale.js";
import { mintPlayId, newPlayScript } from "../shared/plays.js";

// Créer une pièce, depuis le site et sans écrire une ligne de JSON.
//
// Le site est statique : il ne peut rien commiter, donc une pièce ne peut naître que
// d'un DÉPÔT, comme tout ce qui entre dans ce dépôt. Le geste est donc en deux temps,
// et la phrase de doc les annonce tous les deux : on télécharge le script de départ,
// on le dépose. La pièce apparaît quand l'Action a tourné.
//
// Le fichier part vers la RACINE d'`uploads/` et non vers `uploads/<id>/`, parce que
// c'est le seul cas où le dossier ne peut pas encore router : il n'existe pas. C'est
// l'identifiant inscrit dans le fichier qui décide, et c'est le seul endroit du
// projet où le contenu route un dépôt (cf. `claimed_play_id` dans
// scripts/process_uploads.py). Une fois la pièce née, l'Action lui crée sa propre
// zone de dépôt, et tous ses dépôts suivants passent par elle.
//
// L'identifiant est minté ICI, une fois, et ne changera jamais : il nomme le dossier
// de la pièce et son adresse sur le site. Renommer la pièce plus tard changera son
// titre, pas son adresse.

// L'`id` que le champ cite en `aria-describedby` quand il est refusé. Une constante
// de module : il n'y a qu'un seul formulaire de création par document.
const ERROR_ID = "new-play-error";

export default function NewPlay({ taken }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);
  const [downloaded, setDownloaded] = useState(false);
  const url = githubUploadUrl();

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("manage.new.emptyTitle"));
      return;
    }
    const id = mintPlayId(trimmed);
    if (!id) {
      // Un titre tout en ponctuation ne laisse aucune adresse : mieux vaut le dire
      // que fabriquer un dossier nommé « piece-1 », qui vivrait des années dans
      // l'URL de la troupe.
      setError(t("manage.new.badTitle"));
      return;
    }
    // Deux pièces au même identifiant se marcheraient dessus (même dossier, même
    // zone de dépôt) ; deux pièces au même titre seraient de surcroît impossibles à
    // distinguer dans le sélecteur. On demande donc un autre titre plutôt que de
    // suffixer un numéro derrière le dos du responsable.
    if (taken.some((play) => play.id === id)) {
      setError(t("manage.new.taken"));
      return;
    }
    setError(null);
    // La langue du LECTEUR comme langue de la pièce : c'est le meilleur pari (une
    // troupe francophone écrit en français), et le plan du rail la corrige d'un clic
    // si besoin. C'est bien la langue du DOCUMENT qu'on pose là, pas celle de
    // l'interface, les deux axes ne se confondant pas ailleurs sur le site.
    const script = newPlayScript(id, trimmed, LOCALE);
    const blob = new Blob([JSON.stringify(script, null, 2)], { type: "application/json" });
    // Le nom du fichier porte l'identifiant, qui n'est pas un mot à traduire : il se
    // relit dans un dossier de téléchargements, et l'Action ne le lit jamais (le type
    // d'un dépôt vient de sa seule extension).
    downloadBlob(blob, `${id}.json`);
    setDownloaded(true);
  };

  return (
    <section className="chooser-new card">
      <h2>{t("manage.new.title")}</h2>
      <p className="chooser-new-hint">{t("manage.new.hint")}</p>
      {/* Un vrai `<form>` et pas une rangée de `div` : Entrée dans le champ soumet,
          ce qui est le geste naturel après avoir tapé un titre et le seul chemin
          clavier direct vers l'action. Même forme que le formulaire d'ajout d'un
          personnage dans le rail de l'Édition, qui est le précédent du site. */}
      <form
        className="chooser-new-row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label>
          {t("manage.new.label")}
          <input
            type="text"
            value={title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              // Le message part dès qu'on retouche le titre : il décrivait la valeur
              // d'avant, et le garder ferait lire un refus qui n'a plus cours.
              setError(null);
              setDownloaded(false);
            }}
          />
        </label>
        <button type="submit" className="btn primary">
          <DownloadIcon /> {t("manage.new.download")}
        </button>
      </form>
      {/* `role="alert"` parce que ce message n'apparaît qu'APRÈS un clic, et qu'un
          lecteur d'écran resté sur le bouton ne le verrait jamais passer : c'est le
          seul refus de la page, et il porte la seule chose à corriger. */}
      {error && (
        <p className="chooser-new-error" id={ERROR_ID} role="alert">
          <WarnIcon /> {error}
        </p>
      )}
      {/* Le second temps du geste n'apparaît qu'une fois le premier fait : proposer
          de déposer un fichier qu'on n'a pas encore téléchargé ne mène nulle part.
          Le lien est masqué hors github.io, où l'adresse du dépôt est indevinable. */}
      {downloaded && !error && (
        <p className="chooser-new-done">
          {t("manage.new.done")}{" "}
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              {t("manage.new.deposit")}
            </a>
          )}
        </p>
      )}
    </section>
  );
}
