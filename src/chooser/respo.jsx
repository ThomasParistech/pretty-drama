import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";

// La gestion des pièces (respo.html) : même page que le sélecteur de la troupe, plus
// ce qui n'appartient qu'au responsable, à savoir la création d'une pièce, les liens
// propres de chaque pièce (sa zone de dépôt, son dossier dans le dépôt) et le relevé
// des dépôts qu'aucune pièce n'a réclamés.
mountPage("manage.label", <App manage />);
