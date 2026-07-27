import React from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// Accueil complet du responsable (respo.html) : même page que index.html, avec
// les quatre cartes au lieu des deux des acteurs.
createRoot(document.getElementById("root")).render(<App cards={RESPO_CARDS} />);
