import React from "react";
import PageMark from "./PageMark.jsx";

// The brand hero of the four documents that carry one: the two ROOT pages (the
// troupe's play chooser and the play management page) and a play's two home pages.
//
// It is the only place on the site where the brand is DISPLAYED rather than linked
// (the five other pages reach it through `HomeLink`, in the foot of their header), so
// it is also the only place that needs the two masks at a size where they are told
// apart. That is a single object, and it was written twice, comment included, in
// `home/App.jsx` and `chooser/App.jsx`: two renderings of one brand cannot stay in
// agreement, one can. Same reasoning as `HomeLink`, which a header and a loading
// screen share for the same reason.
//
// `children` is the heading, and it is the only thing that differs: the play's title
// on a play's home page, the page's own heading on the two root pages. It is the
// caller's, because only the caller knows whether it has one (a play whose manifest
// has not arrived yet has no title to show, and shows nothing rather than an empty
// line).
export default function HomeHero({ children }) {
  return (
    <header className="home-hero">
      <div className="home-brand">
        {/* Decorative: the word "PrettyDrama" is right next to it. */}
        <PageMark page="home" className="home-brand-mark" label="" />
        PrettyDrama
      </div>
      {children}
    </header>
  );
}
