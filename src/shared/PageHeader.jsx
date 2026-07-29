import React from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";

// Bandeau des écrans qui n'ont pas encore (ou plus) de pièce à nommer : ceux de
// `PageState` (chargement, manifest illisible, navigateur incapable
// d'enregistrer, Édition ouverte au doigt). Il n'est monté par aucune page
// directement.
//
// Même géométrie que `PlayHeader`, et ce n'est pas cosmétique : ces écrans sont
// l'attente de ces mêmes pages, donc sceau et titre dans la rangée du haut, le
// retour à l'accueil (`HomeLink`, marque comprise) en pied. La marque vivait ici
// en haut à gauche pendant que `PlayHeader` la posait en bas, si bien qu'à
// chaque ouverture d'une des quatre pages le nom du site s'affichait en haut
// puis sautait en pied quand le manifest arrivait.
//
// `page` est la clé de src/shared/pages.js : elle choisit le sceau, via la
// classe posée ici. `title` est le libellé de la page, faute de titre de pièce.
export default function PageHeader({ page, title, children }) {
  return (
    <header className={`page-header page-${page}`}>
      <div className="page-header-row">
        <PageMark page={page} />
        <span className="page-title">{title}</span>
        <span className="spacer" />
        {children}
      </div>
      <HomeLink page={page} />
    </header>
  );
}
