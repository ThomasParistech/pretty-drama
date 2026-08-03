import React from "react";
import mountPage from "../shared/mountPage.tsx";
import App from "./App.tsx";
import { RESPO_CARDS } from "../shared/pages.ts";

// `page="dashboard"` says which SIDE one is on, not which page: it sends "change play" to
// the management page rather than the troupe's chooser (`chooserHref`, cf. RESPO_ONLY).
mountPage("page.respo.label", <App cards={RESPO_CARDS} page="dashboard" />);
