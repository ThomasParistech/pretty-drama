import React from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import { applyDocumentLanguage } from "./locale.js";

// Le montage d'une page, identique pour les sept documents du site. Il vivait
// recopié dans chaque point d'entrée, commentaire compris, au seul argument
// d'`applyDocumentLanguage` près : sept copies d'un même geste, donc sept endroits
// à retoucher le jour où le montage change (un `StrictMode`, un garde d'erreur,
// un conteneur nommé autrement).
//
// `<html lang>` et `<title>` sont statiques dans le `.html` (le repli français
// AVANT exécution du JS, qu'un garde de scripts/tests/test_contracts.py tient en
// accord avec le catalogue) : ils sont posés pour de bon ici, une fois la locale
// connue.
//
// **L'import de `theme.css` est ici, et son ORDRE compte.** Le thème doit être
// chargé avant le CSS de la page, qui le surcharge (les `:root` locaux de
// l'éditeur, les variantes de `.dialogue-card`, `.page-notice`…). C'est pour ça
// que chaque point d'entrée importe CE module avant son `App.jsx` : les modules
// ES s'évaluent dans l'ordre des déclarations d'import, donc cet ordre-là est ce
// qui met `theme.css` en premier dans la feuille finale. Inverser les deux lignes
// d'un point d'entrée retournerait la cascade sans rien casser de visible tout de
// suite, ce qui est la pire façon de se tromper.
export default function mountPage(labelKey, element) {
  applyDocumentLanguage(labelKey);
  createRoot(document.getElementById("root")).render(element);
}
