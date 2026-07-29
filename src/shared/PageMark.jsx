import React from "react";
import { PAGES } from "./pages.js";

// Le « sceau » d'une page : pastille ronde colorée portant l'icône de la page.
// Il remplace l'emoji 🎭 en tête des bandeaux partagés, sert de vignette aux
// cartes de l'accueil et aux boutons de dépôt du tableau de bord. Il ne porte
// jamais lui-même de clic : c'est une image porteuse de sens, d'où le
// role/aria-label. Quand il vit DANS un lien (le retour à l'accueil en pied de
// bandeau, le lien de page d'une phrase de doc), c'est le lien qui est
// cliquable et le sceau qui passe décoratif, cf. `label=""` plus bas.
// La classe `page-<clé>` qu'il pose sur lui-même porte ses couleurs, donc il
// s'affiche correctement partout, y compris hors d'un bandeau coloré.
// `label` : à passer quand le sceau ne désigne PAS sa page. Le journal des
// dépôts s'en sert pour sa colonne Type, où le micro veut dire « Voix » et non
// « Enregistrement » : sans lui, un lecteur d'écran y annonce le nom de la page.
//
// `label=""` le rend DÉCORATIF (aria-hidden, plus de role) : à utiliser quand
// le mot est déjà écrit juste à côté, comme sur les cartes de l'accueil, où
// sinon chaque lien s'annonce « Répétition, Répétition, Répétez à
// l'italienne… ». Une image qui redit son voisin n'informe personne, elle
// double la longueur de l'annonce.
export default function PageMark({ page, className = "", label }) {
  const { label: pageLabel, Icon } = PAGES[page];
  const decorative = label === "";
  return (
    <span
      className={`page-mark page-${page} ${className}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : (label ?? pageLabel)}
      aria-hidden={decorative ? "true" : undefined}
    >
      <Icon />
    </span>
  );
}
