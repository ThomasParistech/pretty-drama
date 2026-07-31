import React from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";

// Header of the `PageState` screens (loading, unreadable manifest, browser
// unable to record, Editing opened with a finger): the ones that have no
// settings to carry. No page mounts it directly.
//
// Same geometry as `PlayHeader`, and that is not cosmetic: these screens are
// the waiting room of those very pages, so seal and title in the top row, the
// link back home (`HomeLink`, brand included) in the foot. The brand used to
// live up in the top left here while `PlayHeader` put it at the bottom, so much
// so that on every opening of one of the five pages the site name showed up at
// the top then jumped to the foot when the manifest arrived.
//
// `page` is the key from src/shared/pages.js: it picks the seal, through the
// class set here.
//
// **`title` says ONLY the play title, and it is optional.** No header on the
// site writes its page label ("Rehearsal", "Editing"): it is the seal that says
// where you are, and the browser tab repeats it. As long as the play is
// unknown, the top row therefore has nothing to say and the title is not
// rendered at all. That is the only way for the title to APPEAR instead of
// REPLACING another one: a label written during loading got covered by the play
// title a fraction of a second later, and that flicker showed on every page
// opening. The emptiness costs nothing (the height of the row is set by the
// seal, so nothing moves when the title arrives), and the screen's message, for
// its part, is in the card below.
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
