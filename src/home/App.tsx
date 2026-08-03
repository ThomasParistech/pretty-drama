import React, { useEffect, useState } from "react";
import { fetchManifest } from "../shared/data.ts";
import HomeFooter from "../shared/HomeFooter.tsx";
import HomeHero from "../shared/HomeHero.tsx";
import PageMark from "../shared/PageMark.tsx";
import { t } from "../shared/locale.ts";
import { ACTOR_CARDS, PAGES, chooserHref, pageDescKey, pageLabelKey } from "../shared/pages.ts";
import "./home.css";
import type { PageKey } from "../shared/pages.ts";

// Both home pages, differing only in their list of cards (cf. src/shared/pages.ts).
export default function App({
  cards = ACTOR_CARDS,
  page = "home",
}: {
  cards?: PageKey[];
  page?: PageKey;
}) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    fetchManifest()
      .then((m) => setTitle(m.title || null))
      .catch(() => {});
  }, []);

  return (
    <div className="home page-home">
      {/* No heading until the manifest arrives, and none if it never does: an empty one
          would hold its place in the hero for nothing. */}
      <HomeHero>{title && <h1 className="home-play-title">{title}</h1>}</HomeHero>

      {/* The seals in rows: this page doubles as the legend of which drawing means which
          page. */}
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
        {/* The only link that leaves a play, and the only place that knows a page's depth
            (`chooserHref`). It lives here and nowhere else. */}
        <p className="home-change-play">
          <a href={chooserHref(page)}>{t("home.changePlay")}</a>
        </p>
      </HomeFooter>
    </div>
  );
}
