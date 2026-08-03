import React from "react";
import PageMark from "./PageMark.tsx";
import HomeLink from "./HomeLink.tsx";
import type { ReactNode } from "react";
import type { PageKey } from "./pages.ts";

// Header of the `PageState` screens (loading, error), mounted through PageState only.
// Same geometry as `PlayHeader` because these screens are those pages' waiting room:
// a brand that moves between the two flickers on every page opening.
// `page` is the key from pages.ts. `title` is ONLY the play title and is optional:
// no header writes its page label (the seal says where you are), and rendering nothing
// until the play is known makes the title APPEAR instead of replacing a placeholder.
export default function PageHeader({
  page,
  title = "",
  children,
}: {
  page: PageKey;
  title?: string;
  children?: ReactNode;
}) {
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
