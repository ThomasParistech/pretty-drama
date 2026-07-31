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
// **The button takes the colour of the page it leaves**, not the wine of the
// brand: `page-${page}` on the link, and the same key passed to the seal as
// `tone` so the badge follows instead of resetting the tokens on itself. On the
// coordinator's two pages it therefore reads navy (Progress) or purple
// (Editing) down to the hover wash, which is `--page-mark-soft`; on the other
// four `page-<key>` already holds the wine and the sand, so nothing moves there.
// The button is the foot of THIS header, so it wears the colour of this header;
// what says "home" is the drawing of the two masks, exactly as the doctrine of
// the seals has it (theme.css: it is the icons that say where one is).
export default function HomeLink({ page }) {
  return (
    <div className="play-header-foot">
      <a
        className={`play-header-home page-${page}`}
        href={homeHref(page)}
        aria-label={t("common.homeLink")}
        title={t("common.homeLink")}
      >
        <PageMark page="home" tone={page} className="play-header-home-mark" label="" />
        <span className="play-header-home-word">PrettyDrama</span>
      </a>
    </div>
  );
}
