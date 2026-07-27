import React, { useEffect, useState } from "react";
import PageMark from "./PageMark.jsx";
import { homeHref } from "./pages.js";

// Collapsible sticky header shared by the rehearsal, recording, editor and
// dashboard pages: page mark, brand and play title on one row (plus optional
// action buttons on the right); a settings area (children) folded/unfolded by
// clicking the title.
// Sans réglages (tableau de bord), le titre n'est plus un bouton : pas de
// chevron qui promette un repli inexistant.
// Toujours pas de libellé de page en toutes lettres (il encombrait la barre
// sur mobile) : c'est le sceau coloré qui dit sur quelle page on est.
export default function PlayHeader({ page, title, actions, children }) {
  const [open, setOpen] = useState(true);
  // Le repli est animé, donc les réglages doivent être rognés PENDANT le
  // mouvement seulement : ouverts et immobiles, ils laissent dépasser ce qui
  // doit dépasser (le popover de couleur de l'éditeur, posé sous sa puce).
  const [animating, setAnimating] = useState(false);
  const hasSettings = React.Children.count(children) > 0;

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
        <span className="header-identity">
          <PageMark page={page} />
          <a className="header-brand" href={homeHref(page)}>
            PrettyDrama
          </a>
        </span>
        {hasSettings ? (
          <button
            className="play-header-toggle"
            title="Afficher ou masquer les réglages"
            aria-expanded={open}
            onClick={() => {
              setAnimating(true);
              setOpen((o) => !o);
            }}
          >
            <span className="play-header-title">{title}</span>
            {/* Un seul chevron qui pivote (et non ▲/▼ échangés) : le repli est
                animé, la flèche doit suivre le même mouvement. */}
            <span className="play-header-chevron" aria-hidden="true">
              ▼
            </span>
          </button>
        ) : (
          <span className="play-header-title play-header-title-plain">{title}</span>
        )}
        {actions}
      </div>
      {/* Les réglages restent montés une fois `hasSettings` vrai : c'est ce qui
          permet d'animer le repli (grille 1fr → 0fr). Fermés, ils sont
          `visibility: hidden`, donc hors du parcours au clavier. */}
      {hasSettings && (
        <div className="play-header-settings">
          <div className="play-header-settings-inner">{children}</div>
        </div>
      )}
    </header>
  );
}
