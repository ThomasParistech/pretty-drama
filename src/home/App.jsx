import React, { useEffect, useState } from "react";
import { fetchManifest } from "../shared/data.js";
import HomeFooter from "../shared/HomeFooter.jsx";
import HomeHero from "../shared/HomeHero.jsx";
import PageMark from "../shared/PageMark.jsx";
import { t } from "../shared/locale.js";
import { ACTOR_CARDS, PAGES, chooserHref, pageDescKey, pageLabelKey } from "../shared/pages.js";
import "./home.css";

// The two home pages share everything except their list of cards: `index.html`
// (the troupe's three pages) and `respo.html` (all five), cf.
// src/shared/pages.js.
export default function App({ cards = ACTOR_CARDS, page = "home" }) {
  const [title, setTitle] = useState(null);

  useEffect(() => {
    fetchManifest()
      .then((m) => setTitle(m.title || null))
      .catch(() => {});
  }, []);

  return (
    <div className="home page-home">
      {/* No title as long as the manifest has not arrived, and none either if it never
          does: an empty heading would hold its place in the hero for nothing. */}
      <HomeHero>{title && <h1 className="home-play-title">{title}</h1>}</HomeHero>

      {/* The seals in rows: the home page also serves as a legend, one learns
          there which drawing goes with which page. The troupe's three pages share
          the same seal (the brand's burgundy on sand), so it is the icon that
          tells them apart, and only the coordinator's two modes have their own
          colour. */}
      <main className="home-grid">
        {cards.map((key) => {
          const p = PAGES[key];
          return (
            <a key={key} className={`home-card card lift-hover page-${key}`} href={p.href}>
              {/* Decorative: the page's label follows immediately. */}
              <PageMark page={key} className="home-card-mark" label="" />
              <span className="home-card-title">{t(pageLabelKey(key))}</span>
              <span className="home-card-desc">{t(pageDescKey(key))}</span>
            </a>
          );
        })}
      </main>

      <HomeFooter>
        {/* The ONLY link on the site that leaves a play, and the only place that
            knows a page's depth (`chooserHref`). It lives at the foot of the play's
            home page and nowhere else: one changes play by going back through the
            entrance, just as one changes language there. The five other pages do
            not carry it, their header already bringing one back here. This is also
            the whole of what a play's home page adds to the shared foot, which is why
            it is what `HomeFooter` takes as children. */}
        <p className="home-change-play">
          <a href={chooserHref(page)}>{t("home.changePlay")}</a>
        </p>
      </HomeFooter>
    </div>
  );
}
