import React from "react";
import { t } from "../shared/locale.js";

// Le compte de répliques d'un objet de la pièce : un personnage dans la section
// « Personnages » du rail, un acte ou une scène dans son plan.
//
// **Un nombre nu ne dit pas ce qu'il compte.** À l'écran, la colonne des comptes
// doit s'aligner d'une rangée à l'autre, donc seul le chiffre est écrit ; c'est
// l'`aria-label` qui porte la phrase, et sans lui la voix annonçait « Marie, 12 »
// et la souris n'apprenait rien du tout. Le `role="img"` posé à côté est ce qui
// rend un `aria-label` valable sur un `<span>` : c'est le motif de `PageMark` et
// des drapeaux du sélecteur de langue, le seul du dépôt.
//
// Un seul composant pour les deux panneaux, et il vit ici plutôt que chez l'un
// des deux : le même objet rendu par deux fichiers voisins finit par diverger sur
// le détail qui compte (la clé de pluriel, ou le couple `role`/`aria-label`, dont
// l'un sans l'autre ne dit plus rien). Leur CSS était déjà commun
// (`.character-count, .structure-count` dans editor.css), ce qui disait bien
// qu'il n'y avait qu'un objet ; les deux classes restent pour que chaque panneau
// garde la main sur son gabarit.
export default function CountBadge({ count, className }) {
  const label = t("common.lineCount", { count });
  return (
    <span className={className} role="img" aria-label={label} title={label}>
      {count}
    </span>
  );
}
