import React from "react";
import LocaleSwitch from "./LocaleSwitch.tsx";
import T from "./T.tsx";
import type { ReactNode } from "react";

// Foot of the four pages carrying a brand hero. The language switch lives here and
// nowhere else: a language is a SITE setting, chosen on the way in (cf. LocaleSwitch.tsx).
// `children` precedes the sentence; only a play's home page has any (the "change play" link).
export default function HomeFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="home-footer">
      {children}
      <T
        k="home.footer"
        p={{
          link: (
            <a
              href="https://github.com/ThomasParistech/pretty-drama"
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
