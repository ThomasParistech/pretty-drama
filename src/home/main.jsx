import React from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { applyDocumentLanguage } from "../shared/locale.js";
import App from "./App.jsx";

// <html lang> and <title> are static in the .html file (the pre-JS French
// fallback); they are set for real here, once the locale is known.
applyDocumentLanguage("page.home.label");

createRoot(document.getElementById("root")).render(<App />);
