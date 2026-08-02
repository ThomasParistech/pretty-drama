import React from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";

// Header of the `PageState` screens (loading, error), mounted through PageState only.
// Same geometry as `PlayHeader` because these screens are those pages' waiting room:
// a brand that moves between the two flickers on every page opening.
// `page` is the key from pages.js. `title` is ONLY the play title and is optional:
// no header writes its page label (the seal says where you are), and rendering nothing
// until the play is known makes the title APPEAR instead of replacing a placeholder.
export default function PageHeader({ page, title = "", children }) {
  return (
    <header className={`page-header page-${page}`}>
      <div className="page-header-row">
        <PageMark page={page} />
        {title ? <span className="page-title">{title}</span> : null}
        <span className="spacer" />
        {children}
      </div>
      <HomeLink page={page} />
    </header>
  );
}
