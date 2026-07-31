import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// Accueil complet du responsable (respo.html) : même page qu'index.html, avec les
// cinq cartes au lieu des trois des acteurs.
// `page="dashboard"` ne dit pas quelle page on est mais de quel CÔTÉ on est : c'est
// ce qui fait remonter « changer de pièce » vers la gestion des pièces du responsable
// et non vers le sélecteur de la troupe (`chooserHref` partage le même partage que
// `homeHref`, cf. RESPO_ONLY).
mountPage("page.respo.label", <App cards={RESPO_CARDS} page="dashboard" />);
