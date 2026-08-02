import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";
import { RESPO_CARDS } from "../shared/pages.js";

// `page="dashboard"` says which SIDE one is on, not which page: it sends "change play" to
// the management page rather than the troupe's chooser (`chooserHref`, cf. RESPO_ONLY).
mountPage("page.respo.label", <App cards={RESPO_CARDS} page="dashboard" />);
