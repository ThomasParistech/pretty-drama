import React from "react";
import PageMark from "./PageMark.jsx";

// Brand hero of the four pages that display the brand rather than link to it (the two
// root pages, a play's two home pages). `children` is the heading, left to the caller
// because only it knows whether there is one yet (no title before the manifest lands).
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
