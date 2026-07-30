import React from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { applyDocumentLanguage } from "../shared/locale.js";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// Accueil complet du responsable (respo.html) : même page que index.html, avec
// les cinq cartes au lieu des trois des acteurs.
// <html lang> and <title> are static in the .html file (the pre-JS French
// fallback); they are set for real here, once the locale is known.
applyDocumentLanguage("page.respo.label");

createRoot(document.getElementById("root")).render(<App cards={RESPO_CARDS} />);
