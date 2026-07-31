import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// The coordinator's full home page (respo.html): same page as index.html, with the five
// cards instead of the actors' three.
// `page="dashboard"` does not say which page one is on but which SIDE one is on: it
// is what makes "change play" go up to the coordinator's play management page and not to
// the troupe's chooser (`chooserHref` follows the same split as `homeHref`, cf.
// RESPO_ONLY).
mountPage("page.respo.label", <App cards={RESPO_CARDS} page="dashboard" />);
