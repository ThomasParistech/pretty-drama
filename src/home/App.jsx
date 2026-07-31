import React, { useEffect, useState } from "react";
import { fetchManifest } from "../shared/data.js";
import LocaleSwitch from "../shared/LocaleSwitch.jsx";
import PageMark from "../shared/PageMark.jsx";
import T from "../shared/T.jsx";
import { t } from "../shared/locale.js";
import { ACTOR_CARDS, PAGES, chooserHref, pageDescKey, pageLabelKey } from "../shared/pages.js";
import "./home.css";

// Les deux accueils partagent tout sauf leur liste de cartes : `index.html`
// (les trois pages de la troupe) et `respo.html` (les cinq), cf.
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
      <header className="home-hero">
        <div className="home-brand">
          {/* Décoratif : le mot « PrettyDrama » est juste à côté. */}
          <PageMark page="home" className="home-brand-mark" label="" />
          PrettyDrama
        </div>
        {title && <h1 className="home-play-title">{title}</h1>}
      </header>

      {/* Les sceaux en rangées : l'accueil sert aussi de légende, on y apprend
          quel dessin va avec quelle page. Les trois pages de la troupe partagent
          le même sceau (le bordeaux sur sable de la marque), donc c'est l'icône
          qui les distingue, et seuls les deux modes du responsable ont leur
          couleur propre. */}
      <main className="home-grid">
        {cards.map((key) => {
          const p = PAGES[key];
          return (
            <a key={key} className={`home-card card lift-hover page-${key}`} href={p.href}>
              {/* Décoratif : le libellé de la page suit immédiatement. */}
              <PageMark page={key} className="home-card-mark" label="" />
              <span className="home-card-title">{t(pageLabelKey(key))}</span>
              <span className="home-card-desc">{t(pageDescKey(key))}</span>
            </a>
          );
        })}
      </main>

      {/* The language switch lives HERE and nowhere else: a language is a site
          setting, so it is chosen on the way in, and the shared play header has no
          room for it (cf. LocaleSwitch.jsx). Both home pages carry it, so the two
          audiences each have it at hand. */}
      <footer className="home-footer">
        {/* Le SEUL lien du site qui sorte d'une pièce, et le seul endroit qui
            connaisse la profondeur d'une page (`chooserHref`). Il vit au pied de
            l'accueil de la pièce et nulle part ailleurs : on change de pièce en
            repassant par l'entrée, comme on y change de langue. Les cinq autres
            pages n'en portent pas, leur bandeau ramenant déjà ici. */}
        <p className="home-change-play">
          <a href={chooserHref(page)}>{t("home.changePlay")}</a>
        </p>
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
    </div>
  );
}
