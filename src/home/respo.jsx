import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// Accueil complet du responsable (respo.html) : même page qu'index.html, avec les
// cinq cartes au lieu des trois des acteurs.
mountPage("page.respo.label", <App cards={RESPO_CARDS} />);
