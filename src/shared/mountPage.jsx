import React from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import { applyDocumentLanguage } from "./locale.js";

// Mounting a page, identical for the site's nine entry points: the two ROOT pages
// (the play chooser and the play management page) and the seven a play carries. It
// used to live copied into each of them, comment included, down to the single
// argument of `applyDocumentLanguage`: as many copies of one and the same gesture,
// hence as many places to touch up the day mounting changes (a `StrictMode`, an error
// guard, a container named differently).
//
// `<html lang>` and `<title>` are static in the `.html` (the French fallback BEFORE
// the JS runs, which a guard in scripts/tests/test_contracts.py holds in agreement
// with the catalogue): they are set for good here, once the locale is known.
//
// **The `theme.css` import is here, and its ORDER matters.** The theme must be
// loaded before the page's CSS, which overrides it (the editor's local `:root`, the
// variants of `.dialogue-card`, `.page-notice`…). That is why every entry point
// imports THIS module before its `App.jsx`: ES modules are evaluated in the order
// of their import declarations, so that order is what puts `theme.css` first in the
// final stylesheet. Swapping the two lines of an entry point would flip the cascade
// without breaking anything visible right away, which is the worst way to get it
// wrong.
export default function mountPage(labelKey, element) {
  applyDocumentLanguage(labelKey);
  createRoot(document.getElementById("root")).render(element);
}
