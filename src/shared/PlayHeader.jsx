import React, { useState } from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";
import { t } from "./locale.js";
import { pageDescKey } from "./pages.js";

// Collapsible sticky header of the five play pages: seal and title in the top row
// (plus optional actions), the link back home and any settings in the folding area.
// No page label written out: the seal says which page you are on.
// The brand is NOT in the top row and leaving the page requires unfolding first: on
// mobile the thumb aims at the top of the bar to fold, and used to hit the home link,
// losing the chosen character and the unexported takes.
// The seal stays outside the toggle button: its role/aria-label would blur the
// button's accessible name.
// The `desc` paragraph is rendered here, from pages.js, word for word the one on the
// home card. `hint` is the header's own second paragraph. Never a third.
// The settings are clipped permanently: nothing overflows them any more (the colour
// popover that needed a timer to lift the clipping now lives in the Editing rail).
export default function PlayHeader({ page, title, actions, hint, children }) {
  const [open, setOpen] = useState(true);

  return (
    <header className={`play-header page-${page} ${open ? "open" : ""}`}>
      <div className="play-header-row">
        <PageMark page={page} />
        {/* One tooltip for every page: a per-content wording falls out of step. */}
        <button
          className="play-header-toggle"
          title={t("common.headerToggle")}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="play-header-title">{title}</span>
          {/* One chevron that pivots, not ▲/▼ swapped: the fold is animated. */}
          <span className="play-header-chevron" aria-hidden="true">
            ▼
          </span>
        </button>
        {actions}
      </div>
      {/* Settings stay mounted: that is what makes the fold animatable (1fr -> 0fr).
          Closed they are `visibility: hidden`, hence out of the keyboard path. */}
      <div className="play-header-settings">
        <div className="play-header-settings-inner">
          <p className="header-hint">{t(pageDescKey(page))}</p>
          {children}
          {hint && <p className="header-hint">{hint}</p>}
          <HomeLink page={page} />
        </div>
      </div>
    </header>
  );
}
