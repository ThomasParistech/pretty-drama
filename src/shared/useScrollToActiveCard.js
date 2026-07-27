import { useEffect } from "react";

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
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
