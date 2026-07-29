import React, { useCallback, useRef, useState } from "react";
import { OutlineIcon, PersonIcon, SearchIcon } from "../shared/icons.jsx";

// Le rail latéral de l'Édition : une bande de trois icônes toujours visible et
// UNE section ouverte à la fois, à gauche de la colonne de texte.
//
// **Les icônes de la bande sont le seul interrupteur du panneau**, comme la barre
// d'activité d'un éditeur de code : cliquer une icône ouvre sa section, recliquer
// celle de la section ouverte replie le rail (Escape aussi). Elles disent donc à
// la fois quelle section et si elle est ouverte (`aria-expanded`), et elles sont
// le seul mobilier de l'état replié : le rail y fait exactement la largeur de la
// bande. Le bord droit ne fait plus qu'une chose, régler la largeur.
//
// Deux languettes de repli ont été essayées puis retirées, et la seconde a coûté
// un bug qu'il ne faut pas refabriquer : posée au milieu du bord droit, elle
// partageait son `pointerdown` avec la poignée de largeur, qui appelle
// `setPointerCapture` (sans quoi le glissement lâche le curseur). Or un pointeur
// capturé retarge le `click` sur l'élément capturant : le clic arrivait au bord et
// pas au bouton, donc la languette ne repliait qu'une fois sur deux (celles où le
// double-clic « largeur par défaut » sortait avant la capture). La contourner
// demandait de replier depuis le `pointerdown` de la poignée, c'est-à-dire de
// deviner dans un geste de glissement s'il visait un bouton. La première essayait
// une tête de panneau, à côté du titre : un bouton de plus dans une rangée de
// titre, et rien n'y disait de quel côté le panneau allait se ranger.
//
// **Pas un `role="tablist"`** : un tablist promet un onglet sélectionné en
// permanence et les flèches Début/Fin/gauche/droite, alors que le rail a un état
// « rien d'ouvert ». Le motif mentirait et il faudrait intercepter les flèches
// pour rien. Ce sont trois boutons de dévoilement à `aria-expanded`, exactement
// comme le bouton de repli du bandeau, et le CSS lit cet attribut plutôt qu'une
// classe de plus : l'aspect ne peut pas se désaccorder du nom accessible.
//
// Le panneau n'est monté que quand une section est ouverte : il n'y a rien à
// sortir du parcours clavier, contrairement au bandeau, qui doit garder ses
// réglages montés pour pouvoir animer une hauteur inconnue. Ici la largeur
// ouverte est un nombre choisi, donc l'animation n'a rien à mesurer.
//
// L'ordre des icônes est l'ordre du parcours au clavier depuis le bandeau, et
// Structure vient d'abord parce qu'elle porte la NAVIGATION de la page (elle a
// remplacé les selects d'acte et de scène du bandeau, qui étaient les premiers
// réglages de la page et venaient donc avant les puces de personnage). C'est
// aussi la section ouverte à l'arrivée, cf. App.jsx.
const SECTIONS = [
  {
    key: "structure",
    label: "Structure",
    tip: "Titre, actes et scènes de la pièce",
    Icon: OutlineIcon,
  },
  {
    key: "characters",
    label: "Personnages",
    tip: "Personnages de la pièce",
    Icon: PersonIcon,
  },
  {
    key: "search",
    label: "Recherche",
    tip: "Rechercher dans les répliques (Ctrl+F)",
    Icon: SearchIcon,
  },
];

// Bornes de la largeur du panneau. En bas, 200 px : en dessous, une puce de
// personnage complète (pastille, nom, compte, ✕) ne tient plus sur une ligne et
// un extrait de réplique ne se reconnaît plus. En haut, 560 px : au-delà, sur une
// fenêtre courante le panneau prend plus de place que la colonne de texte, et
// c'est la pièce qu'on est venu écrire.
const MIN_PANEL = 200;
const MAX_PANEL = 560;
const DEFAULT_PANEL = 272;
// Pas du clavier sur la poignée : assez grand pour arriver quelque part en
// quelques touches, assez petit pour viser.
const KEY_STEP = 16;

const clampPanel = (px) => Math.max(MIN_PANEL, Math.min(MAX_PANEL, Math.round(px)));

export default function EditorRail({ section, onSection, structure, characters, search }) {
  const tabRefs = useRef({});
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  // Pendant le glissement, la transition de largeur est coupée : sinon le
  // panneau poursuit le curseur avec un quart de seconde de retard, ce qui se
  // lit comme une latence et pas comme une animation.
  const [resizing, setResizing] = useState(false);
  const drag = useRef(null);
  // Horodatage du dernier appui sur le bord, pour reconnaître un double-clic
  // à la main. Pourquoi à la main : `onPointerDown` appelle `preventDefault` (sans
  // quoi le glissement sélectionne le texte sous le curseur), et cela supprime les
  // événements souris de compatibilité, donc `onDoubleClick` ne se déclenche
  // jamais. Piste écartée : laisser passer le défaut et empêcher la sélection en
  // posant `user-select: none` sur le `body` le temps du glissement, soit un effet
  // de bord global pour un confort local.
  const lastDown = useRef(0);

  const open = section !== null;
  const current = SECTIONS.find((s) => s.key === section) ?? null;

  const close = useCallback(() => {
    // Rendre le focus à l'icône de la section qu'on ferme : sinon une fermeture
    // au clavier le laisse sur le `body`, et la tabulation repart du bandeau.
    const tab = tabRefs.current[section];
    onSection(null);
    tab?.focus();
  }, [section, onSection]);

  // La largeur ne vit qu'en mémoire, le temps de l'onglet. Rien n'est écrit dans
  // le navigateur : le projet n'a aucune persistance locale, et en ouvrir une
  // pour une préférence d'affichage serait la première (cf. la décision produit
  // sur les brouillons de l'éditeur).
  const onEdgeDown = (e) => {
    // Empêche la sélection de texte de démarrer sous le curseur pendant le
    // glissement (le `setPointerCapture` seul ne s'en occupe pas).
    e.preventDefault();
    // Deuxième appui rapproché : on revient à la largeur de départ au lieu de
    // commencer un glissement. C'est la seule façon de retrouver la valeur par
    // défaut sans la viser au pixel.
    if (e.timeStamp - lastDown.current < 350) {
      lastDown.current = 0;
      setPanelWidth(DEFAULT_PANEL);
      return;
    }
    lastDown.current = e.timeStamp;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: panelWidth };
    setResizing(true);
  };

  const onEdgeMove = (e) => {
    if (!drag.current) return;
    setPanelWidth(clampPanel(drag.current.startWidth + (e.clientX - drag.current.startX)));
  };

  const onEdgeUp = (e) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setResizing(false);
  };

  return (
    // Repère `complementary` : le rail complète le texte de la pièce, qui reste
    // le repère principal. L'étiquette nomme ce qu'il y a dedans, et pas
    // « panneau latéral », qui décrirait un meuble.
    <aside
      className={`editor-rail ${open ? "open" : ""} ${resizing ? "resizing" : ""}`}
      aria-label="Structure, personnages et recherche"
      style={{ "--ed-rail-panel": `${panelWidth}px` }}
    >
      <div className="editor-rail-strip">
        {SECTIONS.map(({ key, label, tip, Icon }) => (
          <button
            key={key}
            ref={(el) => (tabRefs.current[key] = el)}
            className="editor-rail-tab"
            // Le nom accessible ne dépend pas de l'état (c'est `aria-expanded`
            // qui le porte), donc une seule infobulle par bouton, qui nomme la
            // section : l'esprit de l'infobulle unique du repli du bandeau.
            aria-label={label}
            title={tip}
            aria-expanded={section === key}
            aria-controls="editor-rail-panel"
            onClick={() => onSection(section === key ? null : key)}
          >
            <Icon />
          </button>
        ))}
      </div>

      {current && (
        <>
        <div
          className="editor-rail-panel"
          id="editor-rail-panel"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Garde obligatoire, pas défensif, et c'est le même que celui de
            // `useSearch.js` : un `ConfirmModal` ouvert DEPUIS le rail (« Tout
            // remplacer », suppression d'un acte ou d'une scène) écoute Escape en
            // phase de CAPTURE sur `window` et appelle `preventDefault` sans
            // `stopPropagation`. Il est rendu en portail, mais React fait remonter
            // ses événements dans l'arbre REACT et pas dans le DOM, donc l'Escape
            // qui referme la modale arrivait jusqu'ici et repliait le rail derrière
            // elle, panneau de recherche compris.
            if (e.defaultPrevented) return;
            // Écouté ici et pas dans les sections : le rail est le seul à savoir à
            // quelle icône rendre le focus. `stopPropagation` pour que le
            // raccourci global de la page ne referme pas deux fois.
            e.stopPropagation();
            close();
          }}
        >
          {/* La tête ne défile pas : c'est elle qui nomme la section, et sur la
              Recherche elle porte aussi la requête et ses options (cf.
              `.editor-rail-body`, dont seul le contenu utile défile).
              Un titre par section, plus un `<h3>` par groupe de résultats : le
              rail est ainsi un plan de titres parcourable, ce qui remplace un
              aria-label sur chaque bloc. */}
          <div className="editor-rail-head">
            <h2 className="editor-rail-title">{current.label}</h2>
          </div>

          <div className="editor-rail-body">
            {section === "structure" ? structure : section === "characters" ? characters : search}
          </div>
        </div>

        {/* Le bord droit : la poignée de largeur, et rien d'autre. Il n'existe QUE
            panneau ouvert (replié, le rail n'est plus que sa bande d'icônes, et il
            n'y a plus de largeur à régler).
            `role="separator"` focalisable : c'est le motif du séparateur
            redimensionnable, et il vient avec ses flèches, sans quoi la largeur ne
            serait réglable qu'à la souris. Les valeurs annoncées sont celles du
            panneau, pas celles du rail entier : c'est le panneau qu'on
            redimensionne. */}
        <div
          className="editor-rail-edge"
          role="separator"
          aria-orientation="vertical"
          aria-label="Largeur du panneau"
          aria-valuenow={panelWidth}
          aria-valuemin={MIN_PANEL}
          aria-valuemax={MAX_PANEL}
          tabIndex={0}
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPanelWidth((w) => clampPanel(w - KEY_STEP));
            else if (e.key === "ArrowRight") setPanelWidth((w) => clampPanel(w + KEY_STEP));
            else if (e.key === "Home") setPanelWidth(MIN_PANEL);
            else if (e.key === "End") setPanelWidth(MAX_PANEL);
            else return;
            e.preventDefault();
          }}
        />
        </>
      )}
    </aside>
  );
}
