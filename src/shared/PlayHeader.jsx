import React, { useState } from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";
import { PAGES } from "./pages.js";

// Collapsible sticky header shared by the rehearsal, recording, stats, editor
// and dashboard pages: page mark and play title on one row (plus optional action
// buttons on the right); a folded/unfolded area below, holding the link back
// home and, on the pages that have some, their settings (children).
// Toujours pas de libellé de page en toutes lettres (il encombrait la barre
// sur mobile) : c'est le sceau coloré qui dit sur quelle page on est.
//
// **Le mot « PrettyDrama » n'est plus dans la rangée du haut.** Il vit
// maintenant à côté du logo, en pied du bandeau déplié : la rangée du haut est
// la seule ligne toujours visible, et sur mobile la marque y mangeait la moitié
// de la largeur du titre de la pièce, qui se coupait en « … ». Le titre de la
// pièce est la seule chose que cette rangée doit dire (le sceau dit la page),
// et le nom du site se lit très bien une ligne plus bas, une fois déplié, là où
// il est aussi la destination du lien.
//
// Le retour à l'accueil vit donc dans le bandeau déplié
// (`.play-header-home` : logo aux deux masques + le mot). Sur mobile, le pouce
// vise le haut de la barre pour la replier et tombait sur la marque, donc le
// geste le plus courant de la page menait au menu principal, en perdant le
// personnage choisi et, sur l'Enregistrement, les prises non exportées. Tout ce
// que le doigt peut atteindre dans la rangée replie maintenant le bandeau ;
// sortir de la page demande de le déplier d'abord.
// Le sceau de la page reste hors du bouton (il porte son role/aria-label, qui
// brouillerait le nom accessible du bouton) : il n'a jamais rien fait au clic,
// c'est la seule zone de la rangée qui reste inerte.
//
// Le bandeau se replie sur les CINQ pages, y compris l'Avancement, qui n'a
// aucun réglage : le repli n'ouvre plus sur du vide puisqu'il porte désormais
// le lien de retour, et une page où il ne se replierait pas serait la seule
// à garder son bandeau ouvert sous le pouce.
//
// **La doc de la page se rend ici, pas dans les pages.** Le premier paragraphe
// est le `desc` de `pages.js`, mot pour mot celui de la carte de l'accueil : la
// promesse et l'arrivée doivent décrire la même page, et une phrase recopiée
// dans deux fichiers finit par dériver. Le second (`hint`, facultatif) est ce
// que le bandeau ajoute : les précisions qui n'auraient aucun sens sur une
// carte, quand on choisit encore où aller. Deux paragraphes au total, jamais
// trois : c'est la place que laisse un bandeau au-dessus du contenu.
// Les réglages sont rognés en permanence (`overflow: hidden` sur
// `.play-header-settings`, theme.css). Ce composant a porté un état `animating`
// et un minuteur de 340 ms pour lever ce rognage dès que le bandeau était ouvert
// et immobile, et cela n'avait qu'une raison : le popover de couleur d'une puce
// de personnage devait pouvoir dépasser du bandeau de l'éditeur. Les puces
// vivent maintenant dans le rail de l'Édition, donc plus aucune des cinq pages
// n'a de contenu qui dépasse de ses réglages, et aucune ne fait plus tourner de
// minuteur à chaque repli.
export default function PlayHeader({ page, title, actions, hint, children }) {
  const [open, setOpen] = useState(true);

  return (
    <header className={`play-header page-${page} ${open ? "open" : ""}`}>
      <div className="play-header-row">
        <PageMark page={page} />
        {/* Infobulle en un seul libellé, et pas « les réglages » : le bandeau
            de l'Avancement ne contient qu'une phrase et le logo de retour, donc
            une infobulle par contenu se désaccorderait au premier ajout. */}
        <button
          className="play-header-toggle"
          title="Déplier ou replier le bandeau"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
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
          {/* La phrase compacte ouvre TOUJOURS le bandeau déplié, juste sous le
              titre de la pièce et au-dessus des réglages : à quoi sert la page
              se lit avant qu'on y touche, et elle est ainsi au même endroit sur
              les cinq pages (une doc qui change de place d'une page à l'autre
              se cherche à chaque fois). */}
          <p className="header-hint">{PAGES[page].desc}</p>
          {children}
          {/* Les précisions, elles, restent en pied : on les relit une fois,
              elles ne doivent pas éloigner les réglages du titre. Même classe et
              donc même style que la phrase compacte : c'est la même voix, à un
              cran de détail près, et c'est la place qui les distingue. (Une
              classe `header-hint-more` a existé ici ; rien ne la stylait, elle ne
              promettait qu'une nuance que le dessin refuse.) */}
          {hint && <p className="header-hint">{hint}</p>}
          {/* En pied du bandeau déplié et centré : une sortie de page ne se met
              pas au-dessus des réglages de la page, et centrée elle ne se
              confond avec aucune des colonnes de gauche. C'est ici que le nom du
              site se lit, plus dans la rangée du haut, où il rognait le titre de
              la pièce sur mobile. Le lien lui-même (logo + mot, filets compris)
              vit dans `HomeLink`, partagé avec `PageHeader` pour que la marque
              soit au même endroit pendant le chargement et après. */}
          <HomeLink page={page} />
        </div>
      </div>
    </header>
  );
}
