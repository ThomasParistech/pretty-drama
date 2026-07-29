import { useEffect, useState } from "react";

// L'Édition est la seule page réservée à l'ordinateur : on y glisse des
// répliques à la souris et on y saisit de longs textes au clavier. Le critère
// est le POINTEUR PRINCIPAL, pas la largeur : un téléphone en paysage fait
// 844 px de large (il passerait un seuil de largeur) et reste inutilisable,
// tandis qu'une fenêtre d'ordinateur rétrécie garde souris et clavier, donc
// n'a aucune raison d'être refusée (le CSS de la page sait déjà se replier).
const TOUCH_QUERY = "(pointer: coarse)";

// Écouté et pas seulement lu au montage : un hybride peut passer du doigt à la
// souris (clavier détaché/rattaché), et l'émulation d'appareil des outils de
// développement change la réponse sans recharger la page.
export default function useTouchPointer() {
  const [touch, setTouch] = useState(() => matches());

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = (e) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    // La requête peut avoir changé entre le premier rendu et l'abonnement.
    setTouch(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return touch;
}

// Sans matchMedia (navigateur très ancien, rendu hors navigateur), on ne bloque
// pas : mieux vaut un éditeur à l'étroit qu'une page murée par erreur.
function mediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(TOUCH_QUERY);
}

function matches() {
  return mediaQuery()?.matches ?? false;
}
