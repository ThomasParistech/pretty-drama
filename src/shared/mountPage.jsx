import React from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import { applyDocumentLanguage } from "./locale.js";

// Mounting a page, shared by the site's nine entry points. `<html lang>`/`<title>`
// are static French in the `.html` (checked by test_contracts.py) and set here once
// the locale is known.
// The `theme.css` import lives here and its ORDER matters: every entry point must
// import this module BEFORE its `App.jsx`, or the page CSS lands before the theme
// it is meant to override, with nothing visibly broken right away.
export default function mountPage(labelKey, element) {
  applyDocumentLanguage(labelKey);
  createRoot(document.getElementById("root")).render(element);
}
