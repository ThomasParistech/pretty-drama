import React, { useState } from "react";
import PageMark from "./PageMark.jsx";
import HomeLink from "./HomeLink.jsx";
import { t } from "./locale.js";
import { pageDescKey } from "./pages.js";

// Collapsible sticky header shared by the rehearsal, recording, stats, editor
// and dashboard pages: page mark and play title on one row (plus optional action
// buttons on the right); a folded/unfolded area below, holding the link back
// home and, on the pages that have some, their settings (children).
// Still no page label spelled out (it cluttered the bar on mobile): it is the
// coloured seal that says which page you are on.
//
// **The word "PrettyDrama" is no longer in the top row.** It now lives next to
// the logo, in the foot of the unfolded header: the top row is the only line
// always visible, and on mobile the brand ate half the width of the play title
// there, which got cut off with an "…". The play title is the only thing this
// row must say (the seal says the page), and the site name reads perfectly well
// one line below, once unfolded, where it is also the destination of the link.
//
// The link back home therefore lives in the unfolded header
// (`.play-header-home`: two-masks logo + the word). On mobile, the thumb aims at
// the top of the bar to fold it and used to land on the brand, so the most
// common gesture of the page led to the main menu, losing the chosen character
// and, on the Recording page, the takes not yet exported. Everything the finger
// can reach in the row now folds the header; leaving the page requires
// unfolding it first.
// The page seal stays outside the button (it carries its role/aria-label, which
// would blur the accessible name of the button): it has never done anything on
// click, it is the only zone of the row that stays inert.
//
// The header folds on ALL FIVE pages, including the Progress page, which has no
// settings at all: folding no longer opens onto emptiness since it now carries
// the link back home, and a page where it did not fold would be the only one to
// keep its header open under the thumb.
//
// **The page's doc is rendered here, not in the pages.** The first paragraph is
// the `desc` from `pages.js`, word for word the one on the home card: the
// promise and the arrival must describe the same page, and a sentence copied
// into two files ends up drifting. The second one (`hint`, optional) is what the
// header adds: the details that would make no sense on a card, when you are
// still choosing where to go. Two paragraphs in all, never three: that is the
// room a header leaves above the content.
// The settings are clipped permanently (`overflow: hidden` on
// `.play-header-settings`, theme.css). This component used to carry an
// `animating` state and a 340 ms timer to lift that clipping as soon as the
// header was open and still, and that had only one reason: the colour popover of
// a character chip had to be able to overflow the editor's header. The chips now
// live in the Editing rail, so none of the five pages has any content
// overflowing its settings, and none runs a timer on every fold any more.
export default function PlayHeader({ page, title, actions, hint, children }) {
  const [open, setOpen] = useState(true);

  return (
    <header className={`play-header page-${page} ${open ? "open" : ""}`}>
      <div className="play-header-row">
        <PageMark page={page} />
        {/* Tooltip in a single label, and not "the settings": the Progress
            header contains only a sentence and the logo back home, so one
            tooltip per content would fall out of step at the first addition. */}
        <button
          className="play-header-toggle"
          title={t("common.headerToggle")}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="play-header-title">{title}</span>
          {/* A single chevron that pivots (and not ▲/▼ swapped): the fold is
              animated, the arrow must follow the same movement. */}
          <span className="play-header-chevron" aria-hidden="true">
            ▼
          </span>
        </button>
        {actions}
      </div>
      {/* The settings stay mounted: that is what makes the fold animatable
          (1fr → 0fr grid). Closed, they are `visibility: hidden`, hence out of
          the keyboard path. */}
      <div className="play-header-settings">
        <div className="play-header-settings-inner">
          {/* The compact sentence ALWAYS opens the unfolded header, right under
              the play title and above the settings: what the page is for reads
              before you touch it, and it is thus in the same place on the five
              pages (a doc that moves from one page to the next has to be
              hunted for every time). */}
          <p className="header-hint">{t(pageDescKey(page))}</p>
          {children}
          {/* The details, for their part, stay in the foot: you read them once,
              they must not push the settings away from the title. Same class and
              therefore same style as the compact sentence: it is the same voice,
              one notch of detail apart, and it is the place that tells them
              apart. (A `header-hint-more` class existed here; nothing styled it,
              it only promised a nuance the design refuses.) */}
          {hint && <p className="header-hint">{hint}</p>}
          {/* In the foot of the unfolded header and centred: a way out of the
              page is not put above the page's settings, and centred it is not
              confused with any of the left-hand columns. This is where the site
              name reads, no longer in the top row, where it cropped the play
              title on mobile. The link itself (logo + word, rules included)
              lives in `HomeLink`, shared with `PageHeader` so that the brand is
              in the same place during loading and after. */}
          <HomeLink page={page} />
        </div>
      </div>
    </header>
  );
}
