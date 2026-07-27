import React from "react";
import { PAGES } from "./pages.js";

// Le « sceau » d'une page : pastille ronde colorée portant l'icône de la page.
// Il remplace l'emoji 🎭 en tête des bandeaux partagés, sert de vignette aux
// cartes de l'accueil et aux boutons de dépôt du tableau de bord. Non
// cliquable (le retour à l'accueil reste sur le lien de la marque, juste à
// côté) : c'est une image porteuse de sens, d'où le role/aria-label.
// La classe `page-<clé>` qu'il pose sur lui-même porte ses couleurs, donc il
// s'affiche correctement partout, y compris hors d'un bandeau coloré.
// `label` : à passer quand le sceau ne désigne PAS sa page. Le journal des
// dépôts s'en sert pour sa colonne Type, où le micro veut dire « Voix » et non
// « Enregistrement » : sans lui, un lecteur d'écran y annonce le nom de la page.
export default function PageMark({ page, className = "", label }) {
  const { label: pageLabel, Icon } = PAGES[page];
  return (
    <span
      className={`page-mark page-${page} ${className}`.trim()}
      role="img"
      aria-label={label ?? pageLabel}
    >
      <Icon />
    </span>
  );
}
