import React from "react";
import mountPage from "../shared/mountPage.jsx";
import App from "./App.jsx";

// The play management page (respo.html): same page as the troupe's chooser, plus what
// belongs to the coordinator alone, namely creating a play, each play's own links (its
// upload folder, its folder in the repo) and the record of the uploads no play has
// claimed.
mountPage("manage.label", <App manage />);
