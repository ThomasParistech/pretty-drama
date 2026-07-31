import React from "react";
import LocaleSwitch from "./LocaleSwitch.jsx";
import T from "./T.jsx";

// The foot of the four documents that carry a brand hero: what the site is, and the
// language switch.
//
// **The language switch lives here and nowhere else**: a language is a SITE setting,
// so it is chosen on the way in, and the shared play header has no room for it (cf.
// LocaleSwitch.jsx). All four of these pages carry it, so both audiences have it at
// hand wherever they came in.
//
// Below the sentence and not beside it: the sentence says what the site is, the switch
// is a control, and on one line "PrettyDrama FR | EN" read as a list of links.
//
// Shared because the two root pages and a play's two home pages wrote it out
// identically, the project's own address included. That URL is the one thing here that
// nothing would have caught drifting: it is a literal, so no guard compares its two
// copies, and a repository rename would have been fixed in one file out of two.
//
// `children` is what precedes the sentence, and only a play's home page has any: the
// "change play" link, the single link on the site that leaves a play. The two root
// pages are already the place it leads to.
export default function HomeFooter({ children }) {
  return (
    <footer className="home-footer">
      {children}
      <T
        k="home.footer"
        p={{
          link: (
            <a
              href="https://github.com/ThomasParistech/prettydrama-voices"
              target="_blank"
              rel="noreferrer"
            >
              PrettyDrama
            </a>
          ),
        }}
      />
      <LocaleSwitch />
    </footer>
  );
}
