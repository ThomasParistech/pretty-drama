import React from "react";
import PageMark from "./PageMark.jsx";
import { homeHref } from "./pages.js";

// Le retour à l'accueil, seul lien sortant des pages qui ne sont pas l'accueil :
// le logo aux deux masques et le mot « PrettyDrama » à sa droite, encadrés de
// deux filets courts qui ferment le bandeau comme un cul-de-lampe ferme une
// page. Toujours pas de « Retour à l'accueil » écrit : le logo et le nom du
// site disent la destination, et c'est l'`aria-label` qui porte le verbe (il
// contient bien le texte visible ; le sceau, lui, passe décoratif).
//
// **Un seul composant pour les deux bandeaux**, et c'est le point. `PageHeader`
// est l'en-tête des écrans de `PageState`, c'est-à-dire l'écran de chargement
// des pages que `PlayHeader` coiffe ensuite : la marque y vivait en haut à
// gauche pendant que `PlayHeader` la posait en pied, donc à chaque ouverture de
// la Répétition, de l'Enregistrement, de l'Avancement ou de l'Édition, le nom du
// site s'affichait en haut puis sautait en bas quand le manifest arrivait. Deux
// rendus du même objet ne peuvent pas rester d'accord ; un seul, si.
//
// `page-home` est posé sur le lien lui-même : c'est ce qui donne au survol le
// crème de la marque (`--page-mark-soft`) sans le recopier en dur dans
// theme.css. Sur les pages du responsable, la classe du bandeau met ce token au
// vert ou au violet ; posée ici, elle rend au lien le sable des masques, qui est
// aussi le fond de sa pastille.
export default function HomeLink({ page }) {
  return (
    <div className="play-header-foot">
      <a
        className="play-header-home page-home"
        href={homeHref(page)}
        aria-label="Accueil PrettyDrama"
        title="Accueil PrettyDrama"
      >
        <PageMark page="home" className="play-header-home-mark" label="" />
        <span className="play-header-home-word">PrettyDrama</span>
      </a>
    </div>
  );
}
