import React, { useEffect, useState } from "react";
import { fetchManifest } from "../shared/data.js";
import PageMark from "../shared/PageMark.jsx";
import { ACTOR_CARDS, PAGES } from "../shared/pages.js";
import "./home.css";

// Les deux accueils partagent tout sauf leur liste de cartes : `index.html`
// (acteurs) et `respo.html` (les quatre pages), cf. src/shared/pages.js.
export default function App({ cards = ACTOR_CARDS }) {
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

      {/* Les sceaux colorés en carré : l'accueil sert aussi de légende, on y
          apprend quelle couleur va avec quelle page. */}
      <main className="home-grid">
        {cards.map((key) => {
          const p = PAGES[key];
          return (
            <a key={key} className={`home-card card lift-hover page-${key}`} href={p.href}>
              {/* Décoratif : le libellé de la page suit immédiatement. */}
              <PageMark page={key} className="home-card-mark" label="" />
              <span className="home-card-title">{p.label}</span>
              <span className="home-card-desc">{p.desc}</span>
            </a>
          );
        })}
      </main>

      <footer className="home-footer">
        Un outil libre pour les troupes de théâtre,{" "}
        <a href="https://github.com/ThomasParistech/prettydrama-voices" target="_blank" rel="noreferrer">
          PrettyDrama
        </a>
      </footer>
    </div>
  );
}
