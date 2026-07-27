import React, { useEffect, useState } from "react";
import PageMark from "./PageMark.jsx";
import { homeHref } from "./pages.js";

// Collapsible sticky header shared by the rehearsal, recording, editor and
// dashboard pages: page mark, brand and play title on one row (plus optional
// action buttons on the right); a folded/unfolded area below, holding the link
// back home and, on the pages that have some, their settings (children).
// Toujours pas de libellé de page en toutes lettres (il encombrait la barre
// sur mobile) : c'est le sceau coloré qui dit sur quelle page on est.
//
// **La marque n'est plus un lien : c'est du texte dans le bouton de repli.** Le
// retour à l'accueil vit dans le bandeau déplié (`.play-header-home`, la
// pastille aux deux masques). Sur mobile, le pouce vise le haut de la barre
// pour la replier et tombait sur la marque, donc le geste le plus courant de la
// page menait au menu principal, en perdant le personnage choisi et, sur
// l'Enregistrement, les prises non exportées. Tout ce que le doigt peut
// atteindre dans la rangée replie maintenant le bandeau ; sortir de la page
// demande de le déplier d'abord.
// Le sceau de la page reste hors du bouton (il porte son role/aria-label, qui
// brouillerait le nom accessible du bouton) : il n'a jamais rien fait au clic,
// c'est la seule zone de la rangée qui reste inerte.
//
// Le bandeau se replie sur les QUATRE pages, y compris l'Avancement, qui n'a
// aucun réglage : le repli n'ouvre plus sur du vide puisqu'il porte désormais
// le lien de retour, et une page où il ne se replierait pas serait la seule
// à garder son bandeau ouvert sous le pouce.
export default function PlayHeader({ page, title, actions, children }) {
  const [open, setOpen] = useState(true);
  // Le repli est animé, donc les réglages doivent être rognés PENDANT le
  // mouvement seulement : ouverts et immobiles, ils laissent dépasser ce qui
  // doit dépasser (le popover de couleur de l'éditeur, posé sous sa puce).
  const [animating, setAnimating] = useState(false);

  // Minuteur plutôt que `transitionend` : l'événement ne se déclenche pas quand
  // la transition est neutralisée (mouvement réduit) ni si un navigateur
  // n'animait pas `grid-template-rows`, et le bandeau resterait rogné. Doit
  // couvrir la plus longue transition du repli (`.play-header-settings*` dans
  // theme.css : 0.26 s, plus 0.06 s de retard à l'ouverture).
  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 340);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <header
      className={`play-header page-${page} ${open ? "open" : ""} ${animating ? "animating" : ""}`}
    >
      <div className="play-header-row">
        <PageMark page={page} />
        {/* Infobulle en un seul libellé, et pas « les réglages » : le bandeau
            de l'Avancement ne contient qu'une phrase et le logo de retour, donc
            une infobulle par contenu se désaccorderait au premier ajout. */}
        <button
          className="play-header-toggle"
          title="Déplier ou replier le bandeau"
          aria-expanded={open}
          onClick={() => {
            setAnimating(true);
            setOpen((o) => !o);
          }}
        >
          <span className="header-brand">PrettyDrama</span>
          <span className="play-header-title">{title}</span>
          {/* Un seul chevron qui pivote (et non ▲/▼ échangés) : le repli est
              animé, la flèche doit suivre le même mouvement. */}
          <span className="play-header-chevron" aria-hidden="true">
            ▼
          </span>
        </button>
        {actions}
      </div>
      {/* Les réglages restent montés : c'est ce qui permet d'animer le repli
          (grille 1fr → 0fr). Fermés, ils sont `visibility: hidden`, donc hors
          du parcours au clavier. */}
      <div className="play-header-settings">
        <div className="play-header-settings-inner">
          {children}
          {/* En pied du bandeau déplié et centré : une sortie de page ne se met
              pas au-dessus des réglages de la page, et centrée elle ne se
              confond avec aucune des colonnes de gauche. Le logo SEUL, sans le
              mot : les deux masques sont la marque du site, ils disent la
              destination, et un « Retour à l'accueil » écrit sous des réglages
              ne fait que peser. Il devient donc lui-même le bouton, qui
              s'allume au survol (`.play-header-home` dans theme.css).
              Le nom accessible passe alors sur le lien (le sceau reste
              décoratif) : sans texte, il n'y a plus rien d'autre à annoncer.
              Les deux filets qui l'encadrent (posés en CSS sur
              `.play-header-foot`) ferment le bandeau, pour que le logo ne soit
              pas une pastille tombée là. */}
          <div className="play-header-foot">
            <a
              className="play-header-home"
              href={homeHref(page)}
              aria-label="Accueil PrettyDrama"
              title="Accueil PrettyDrama"
            >
              <PageMark page="home" className="play-header-home-mark" label="" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
