import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";

// Le sélecteur de pièce de la troupe : l'adresse qu'on donne aux acteurs. Il ne
// montre que les pièces, et aucun lien n'y mène vers la gestion des pièces
// (`respo.html`), qui se bookmarke.
mountPage("chooser.label", <App />);
