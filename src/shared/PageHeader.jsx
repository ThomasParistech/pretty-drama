import React from "react";
import PageMark from "./PageMark.jsx";
import { homeHref } from "./pages.js";

// Common top bar: page mark + brand link back to home + page title + free slot
// on the right. `page` est la clé de src/shared/pages.js : elle choisit le
// sceau, via la classe posée ici.
export default function PageHeader({ page, title, children }) {
  return (
    <header className={`page-header page-${page}`}>
      <span className="header-identity">
        <PageMark page={page} />
        <a className="brand" href={homeHref(page)}>
          PrettyDrama
        </a>
      </span>
      <span className="page-title">{title}</span>
      <span className="spacer" />
      {children}
    </header>
  );
}
