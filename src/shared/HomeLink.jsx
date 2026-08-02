import React from "react";
import PageMark from "./PageMark.jsx";
import { t } from "./locale.js";
import { homeHref } from "./pages.js";

// The link back home, in the foot of both shared headers (`PageHeader` and
// `PlayHeader`) so the brand never jumps between a page's loading and loaded states.
// The verb is in the `aria-label`; the logo and the site name say the destination.
// The button takes the colour of the page it LEAVES, hence `tone={page}` on the seal:
// what says "home" is the drawing, not the colour (theme.css seal doctrine).
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
