import React from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";

// Bandeau des écrans de `PageState` (chargement, manifest illisible, navigateur
// incapable d'enregistrer, Édition ouverte au doigt) : ceux qui n'ont pas de
// réglages à porter. Il n'est monté par aucune page directement.
//
// Même géométrie que `PlayHeader`, et ce n'est pas cosmétique : ces écrans sont
// l'attente de ces mêmes pages, donc sceau et titre dans la rangée du haut, le
// retour à l'accueil (`HomeLink`, marque comprise) en pied. La marque vivait ici
// en haut à gauche pendant que `PlayHeader` la posait en bas, si bien qu'à
// chaque ouverture d'une des cinq pages le nom du site s'affichait en haut
// puis sautait en pied quand le manifest arrivait.
//
// `page` est la clé de src/shared/pages.js : elle choisit le sceau, via la
// classe posée ici.
//
// **`title` ne dit QUE le titre de la pièce, et il est facultatif.** Aucun
// bandeau du site n'écrit son libellé de page (« Répétition », « Édition ») :
// c'est le sceau qui dit où on est, et l'onglet du navigateur le répète. Tant
// que la pièce est inconnue, la rangée du haut n'a donc rien à dire et le titre
// n'est pas rendu du tout. C'est la seule façon que le titre APPARAISSE au lieu
// d'en REMPLACER un autre : un libellé écrit pendant le chargement se faisait
// recouvrir par le titre de la pièce une fraction de seconde plus tard, et ce
// clignotement se voyait à chaque ouverture de page. Le vide ne coûte rien
// (la hauteur de la rangée est fixée par le sceau, donc rien ne bouge quand le
// titre arrive), et le message de l'écran, lui, est dans la carte au-dessous.
export default function PageHeader({ page, title = "", children }) {
  return (
    <header className={`page-header page-${page}`}>
      <div className="page-header-row">
        <PageMark page={page} />
        {title ? <span className="page-title">{title}</span> : null}
        <span className="spacer" />
        {children}
      </div>
      <HomeLink page={page} />
    </header>
  );
}
