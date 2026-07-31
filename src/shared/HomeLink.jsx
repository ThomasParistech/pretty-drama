import React from "react";
import PageMark from "./PageMark.jsx";
import { t } from "./locale.js";
import { homeHref } from "./pages.js";

// The link back home, the only outgoing link of the pages that are not the home
// page: the two-masks logo and the word "PrettyDrama" to its right, framed by
// two short rules that close the header the way a tailpiece closes a page.
// Still no written "Back home": the logo and the site name say the destination,
// and it is the `aria-label` that carries the verb (it does contain the visible
// text; the seal, for its part, turns decorative).
//
// **A single component for both headers**, and that is the point. `PageHeader`
// is the header of the `PageState` screens, that is, the loading screen of the
// pages that `PlayHeader` then tops: the brand used to live up in the top left
// there while `PlayHeader` put it in the foot, so on every opening of the
// Rehearsal, the Recording, the Progress or the Editing page the site name
// showed up at the top then jumped to the bottom when the manifest arrived. Two
// renderings of the same object cannot stay in agreement; a single one can.
//
// `page-home` is set on the link itself: that is what gives the hover the cream
// of the brand (`--page-mark-soft`) without hard-coding it into theme.css. On
// the manager's pages the header class sets that token to green or purple; set
// here, it gives the link back the sand of the masks, which is also the
// background of its badge.
export default function HomeLink({ page }) {
  return (
    <div className="play-header-foot">
      <a
        className="play-header-home page-home"
        href={homeHref(page)}
        aria-label={t("common.homeLink")}
        title={t("common.homeLink")}
      >
        <PageMark page="home" className="play-header-home-mark" label="" />
        <span className="play-header-home-word">PrettyDrama</span>
      </a>
    </div>
  );
}
