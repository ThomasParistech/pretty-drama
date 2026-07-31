import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";

// The troupe's play chooser: the address given to the actors. It only shows the
// plays, and no link there leads to the play management page (`respo.html`), which
// is bookmarked.
mountPage("chooser.label", <App />);
