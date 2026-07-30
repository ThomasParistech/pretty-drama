import { useEffect } from "react";

// Vrai le temps qu'un pointeur TIRE le curseur de la barre basse (`ProgressBar`,
// seul producteur, via `setSeekDragging`). Un drapeau de module plutôt qu'une
// prop : le producteur et le consommateur sont ces deux modules partagés, aucune
// des deux pages n'a de décision à prendre là-dessus (et le site étant
// multi-pages, un document ne porte jamais qu'une barre).
let dragging = false;

export function setSeekDragging(on) {
  dragging = on;
}

// Le suivi du glissement : 90 % du chemin en 110 ms. C'est ce qui remplace
// `scrollIntoView({ behavior: "smooth" })` PENDANT un glissement, et il ne faut
// pas confondre les deux problèmes. Le lissé du navigateur n'est pas trop doux,
// il est trop LONG : plusieurs centaines de millisecondes, relancées depuis la
// position courante à chaque nouveau cran, donc la liste ne peut par
// construction que traîner derrière la souris, et c'est le geste où l'on regarde
// justement où l'on arrive. Un défilement sec réglait la traîne mais faisait
// sauter la liste de carte en carte. Ici la cible se déplace et la position la
// rattrape en un dixième de seconde : ça glisse, et l'œil ne mesure pas le
// retard. L'approche est exponentielle et pas une durée fixe, exprès : un
// nouveau cran ne RELANCE rien, il déplace la cible, donc aucune discontinuité
// au milieu du geste. Elle continue après le relâcher, le temps de finir de
// centrer la dernière carte.
const FOLLOW_MS = 110;
let followTarget = 0;
let followFrame = 0;
let followAt = 0;

// Les deux pages qui portent cette liste défilent avec le DOCUMENT (la barre de
// contrôle est `fixed`, `.dialogue-container` n'a pas d'`overflow`). Une future
// liste dans son propre conteneur de défilement demanderait de remonter au
// premier ancêtre défilant ; `scrollIntoView`, lui, le fait tout seul, donc les
// sauts discrets ci-dessous n'ont pas cette limite.
const scroller = () => document.scrollingElement;

// Position de défilement qui centre la carte. Relative à la position COURANTE,
// donc juste même si une animation est en vol : on lit l'écart qu'il reste à
// combler, jamais une coordonnée absolue mémorisée.
//
// **Bornée à la course réelle du scroller**, et ce n'est pas de la prudence :
// une carte du tout début ou de la toute fin de la pièce ne PEUT pas être
// centrée, il n'y a pas de course au-delà des bords, donc la position voulue
// tombe hors de [0, course]. Le navigateur, lui, borne toute affectation de
// `scrollTop`, donc l'écart ne se comblait jamais : la boucle du dessous
// repartait à chaque image sur un `delta` constant, indéfiniment, jusqu'au
// prochain saut discret. Tirer la barre basse à son premier cran, c'est-à-dire
// le geste qui revient au début de la scène, laissait ainsi la page brûler une
// image toutes les 16 ms tant qu'on la laissait ouverte, et sur les deux pages
// qui s'ouvrent au doigt pendant une répétition entière.
function centerTarget(card, el) {
  const rect = card.getBoundingClientRect();
  const wanted = el.scrollTop + rect.top + rect.height / 2 - el.clientHeight / 2;
  return Math.max(0, Math.min(wanted, el.scrollHeight - el.clientHeight));
}

function followStep(now) {
  const el = scroller();
  if (!el) return;
  const dt = Math.min(50, now - followAt);
  followAt = now;
  const delta = followTarget - el.scrollTop;
  if (Math.abs(delta) < 0.5) {
    el.scrollTop = followTarget;
    followFrame = 0;
    return;
  }
  const before = el.scrollTop;
  el.scrollTop += delta * (1 - Math.pow(0.1, dt / FOLLOW_MS));
  // Seconde sortie, celle qui tient quand la course change SOUS la boucle (le
  // bandeau collant qu'on replie en pleine main, une police qui finit de
  // charger) : la cible étant fixe le temps du pas, une image qui n'a pas bougé
  // d'un pixel ne bougera pas plus à la suivante. Le bornage de `centerTarget`
  // suffit à l'ouverture du geste, celle-ci le rattrape en vol.
  if (el.scrollTop === before) {
    followFrame = 0;
    return;
  }
  followFrame = requestAnimationFrame(followStep);
}

function followCard(card, instant) {
  const el = scroller();
  if (!el) return;
  followTarget = centerTarget(card, el);
  if (instant) {
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    el.scrollTop = followTarget;
    return;
  }
  if (followFrame) return; // Boucle déjà en vol : la cible seule a bougé.
  followAt = performance.now();
  followFrame = requestAnimationFrame(followStep);
}

// Garde la carte `.dialogue-card.active` de la liste centrée à l'écran quand
// la sélection change (partagé par les pages Répétition et Enregistrement).
// `deps` : les indices dont le changement doit déclencher le recentrage.
export default function useScrollToActiveCard(listRef, deps) {
  useEffect(() => {
    const card = listRef.current?.querySelector(".dialogue-card.active");
    if (!card) return;
    // Le reste du site neutralise ses animations sous « mouvement réduit »
    // (bloc `prefers-reduced-motion` de theme.css) : un défilement lissé est
    // exactement ce que ce réglage demande de supprimer, et il n'est pas
    // joignable en CSS puisqu'il vient de scrollIntoView.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (dragging) {
      // Le drapeau se CONSOMME : un glissement le repose à chaque cran, donc
      // les sauts discrets retrouvent leur lissé d'eux-mêmes si la fin du
      // geste passe à la trappe (pointeur perdu, curseur désactivé en route).
      dragging = false;
      followCard(card, reduced);
      return;
    }
    // Saut discret (clic sur la piste, flèches de la barre basse, clavier,
    // lecture qui avance) : le lissé du navigateur, qui est ce pour quoi il a
    // été mis. Une boucle de suivi encore en vol lutterait contre lui.
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
