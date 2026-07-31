import React, { useEffect, useState } from "react";
import LocaleSwitch from "../shared/LocaleSwitch.jsx";
import PageMark from "../shared/PageMark.jsx";
import T from "../shared/T.jsx";
import formatWhen from "../shared/formatWhen.js";
import {
  HttpError,
  fetchPlaysIndex,
  fetchUnroutedHistory,
  githubPlayFolderUrl,
  githubUploadUrl,
} from "../shared/data.js";
import { WarnIcon } from "../shared/icons.jsx";
import { fmt, t } from "../shared/locale.js";
import { playHref } from "../shared/pages.js";
import { formatShare } from "../shared/share.js";
import NewPlay from "./NewPlay.jsx";
import "../home/home.css";
import "./chooser.css";

// Les deux pages RACINE du site, celles qui vivent au-dessus des pièces : le
// sélecteur de la troupe (`index.html`) et la gestion des pièces du responsable
// (`respo.html`). Même composant, deux jeux d'actions, comme les deux accueils d'une
// pièce partagent le leur.
//
// Elles sont l'ENTRÉE du site, donc elles portent la marque et pas un sceau de page :
// leur hero est celui des accueils (les deux masques, le mot « PrettyDrama »), et
// c'est aussi pour ça qu'elles réutilisent `home.css` au lieu d'avoir leur propre
// habillage. Ce qui leur appartient en propre est dans `chooser.css` : la carte de
// pièce, le geste de création, le relevé des dépôts sans pièce.
//
// **Aucun lien ne mène du sélecteur vers la gestion** : c'est la même séparation
// d'adresses que celle des deux accueils d'une pièce, l'adresse de la troupe ne doit
// pas ouvrir sur les outils du responsable. `respo.html` se bookmarke.
//
// Une fois une pièce choisie, on est DANS la pièce et le reste n'existe plus : ses
// sept pages vivent dans son dossier, ne lisent que ses données, et le seul chemin
// qui en sorte est le lien « changer de pièce » au pied de son accueil.
export default function App({ manage = false }) {
  const [plays, setPlays] = useState(null);
  const [error, setError] = useState(null);
  const [unrouted, setUnrouted] = useState([]);

  useEffect(() => {
    fetchPlaysIndex()
      // Une liste difforme se lit comme « aucune pièce » : c'est un fichier dérivé, et
      // il n'y a rien de mieux à en tirer.
      .then((index) => setPlays(Array.isArray(index?.plays) ? index.plays : []))
      .catch((err) => {
        // La distinction que tout le site fait (cf. `HttpError` dans data.js) : un
        // 404 est un vide LÉGITIME (dépôt fraîchement forké, l'index n'a pas encore
        // été construit), et la page qui crée la première pièce doit s'ouvrir dessus ;
        // tout le reste est une PANNE, et l'annoncer « aucune pièce » mentirait à la
        // troupe sur la page d'entrée du site, en lui disant que ses pièces ont
        // disparu et sans lui laisser de chemin.
        if (err instanceof HttpError && err.status === 404) {
          setPlays([]);
          return;
        }
        setError(t("chooser.loadError"));
      });
  }, []);

  useEffect(() => {
    // Le relevé des dépôts sans pièce n'intéresse que le responsable : la troupe n'a
    // pas à lire les accidents de dépôt, et elle n'a rien pour y répondre.
    if (!manage) return;
    fetchUnroutedHistory()
      .then((history) => setUnrouted(Array.isArray(history?.runs) ? history.runs : []))
      .catch(() => setUnrouted([]));
  }, [manage]);

  // Tri par TITRE et dans la langue du lecteur, alors que `data/plays.json` est rangé
  // par identifiant : un fichier machine n'a pas à connaître de locale (même règle
  // que les rangs du manifest, que le front met en mots), et comparer des titres
  // accentués en demande une.
  const sorted =
    plays === null
      ? null
      : [...plays].sort((a, b) =>
          collator.compare(a.title || t("common.untitledPlay"), b.title || t("common.untitledPlay"))
        );

  return (
    <div className="home page-home">
      <header className="home-hero">
        <div className="home-brand">
          {/* Décoratif : le mot « PrettyDrama » est juste à côté. */}
          <PageMark page="home" className="home-brand-mark" label="" />
          PrettyDrama
        </div>
        <h1 className="chooser-heading">{t(manage ? "manage.heading" : "chooser.heading")}</h1>
      </header>

      <main className="home-grid">
        {/* Trois états, et rien pendant le CHARGEMENT : la liste arrive en un
            aller-retour sur un fichier de quelques lignes, et un écran d'attente qui
            se remplace aussitôt se lit comme un clignotement. Le vide et la panne, eux,
            se disent, et ne se confondent pas. */}
        {error ? (
          <p className="chooser-error">
            <WarnIcon /> {error}
          </p>
        ) : (
          sorted !== null &&
          (sorted.length === 0 ? (
            <p className="chooser-empty">{t(manage ? "manage.empty" : "chooser.empty")}</p>
          ) : (
            sorted.map((play) =>
              manage ? (
                <ManageCard key={play.id} play={play} />
              ) : (
                <ChooseCard key={play.id} play={play} />
              )
            )
          ))
        )}
      </main>

      {manage && (
        <>
          {/* Créer une pièce demande de savoir lesquelles existent déjà : sans la
              liste, le contrôle d'unicité de l'identifiant ne dirait rien et le respo
              pourrait fabriquer le doublon d'une pièce qu'il ne voit pas. Le dépôt
              serait refusé par le garde-fou de `validate_script` (une pièce vide ne
              remplace jamais une pièce qui a des répliques), donc rien ne s'effacerait,
              mais on ne propose pas un geste dont on sait qu'il peut échouer.
              Le relevé des dépôts sans pièce, lui, ne dépend pas de la liste, et il
              reste affiché : c'est peut-être même lui qui explique la panne. */}
          {plays !== null && <NewPlay taken={plays} />}
          <Unrouted runs={unrouted} />
        </>
      )}

      {/* Le sélecteur de langue vit au pied des accueils, et ces deux pages en sont
          désormais l'entrée : une langue est un réglage de SITE, elle se choisit en
          entrant (cf. LocaleSwitch.jsx). */}
      <footer className="home-footer">
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

// `Intl.Collator` et pas `localeCompare` sur chaque comparaison : le comparateur est
// construit une fois pour tout le tri, là où la méthode en refabrique un par appel.
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

// Ce qu'une carte dit de l'avancement de sa pièce. Deux nombres et un pourcentage,
// jamais une barre : la page choisit une pièce, elle ne la suit pas, et l'Avancement
// de la pièce montre le détail par personnage et par scène.
function Progress({ play }) {
  const total = Number(play.lines) || 0;
  const recorded = Number(play.recorded) || 0;
  if (total === 0) {
    // « 0 % » sur une pièce qu'on vient de créer se lirait comme un retard, alors
    // que c'est un début.
    return <span className="chooser-card-empty">{t("chooser.emptyPlay")}</span>;
  }
  return (
    <>
      {/* `formatShare` et pas `fmt.percent` : c'est la même mesure que la légende de
          la Répartition, donc la même règle d'arrondi, et elle porte un seuil qui
          compte ici aussi. Sur une pièce de plus de deux mille répliques dont une
          seule est enregistrée, un pourcentage nu affiche « 0,0 % » en face de
          « 1 réplique enregistrée », ce qui se lit comme un bug ; en dessous du
          dixième de point on dit le seuil (« < 0,1 % ») et pas la valeur. */}
      <span className="chooser-card-share">{formatShare(recorded, total, t, fmt)}</span>
      <span className="chooser-card-count">
        {t("chooser.recorded", { count: recorded, total })}
      </span>
    </>
  );
}

// La carte du sélecteur de la troupe : toute la carte est le lien, comme les cartes
// de page des accueils, parce qu'elle n'a qu'une destination et qu'elle s'ouvre au
// doigt.
function ChooseCard({ play }) {
  return (
    <a className="home-card card lift-hover chooser-card" href={playHref(play.id, "index")}>
      <span className="home-card-title">{play.title || t("common.untitledPlay")}</span>
      <Progress play={play} />
    </a>
  );
}

// La carte de la page de gestion. Ce n'est PAS un lien, contrairement à celle du
// sélecteur : elle en porte trois (la pièce, sa zone de dépôt, son dossier), et un
// lien dans un lien n'est pas du HTML valable. Le titre reste le grand geste, les
// deux autres sont des liens de service, en pied de carte.
//
// Ces deux liens sont la raison de cette page : le responsable ne doit pas avoir à
// connaître GitHub pour déposer un fichier ni pour retirer une pièce, il clique un
// lien qui l'amène exactement au bon endroit.
function ManageCard({ play }) {
  const upload = githubUploadUrl(play.id);
  const folder = githubPlayFolderUrl(play.id);
  const last = play.lastDeposit ? formatWhen(play.lastDeposit) : null;
  const name = play.title || t("common.untitledPlay");
  return (
    <div className="home-card card chooser-card">
      <a className="home-card-title chooser-card-link" href={playHref(play.id, "respo")}>
        {name}
      </a>
      <Progress play={play} />
      <span className="chooser-card-when">
        {last ? t("manage.lastDeposit", { date: last }) : t("manage.neverDeposited")}
      </span>
      {/* Masqués hors github.io (dev local, domaine perso), où l'adresse du dépôt
          est indevinable : on ne forge pas un 404, comme la carte de dépôt de
          l'Avancement. */}
      {upload && folder && (
        <span className="chooser-card-links">
          {/* Le nom accessible NOMME la pièce, le libellé visible pas : sur une page
              qui liste les pièces, ces deux liens se répètent une fois par carte, et
              en liste de liens (le parcours d'un lecteur d'écran) « Déposer des
              fichiers » quatre fois de suite ne dit plus rien. À l'écran, la carte
              porte déjà le titre juste au-dessus. */}
          <a
            href={upload}
            target="_blank"
            rel="noreferrer"
            aria-label={t("manage.deposit.aria", { title: name })}
          >
            {t("manage.deposit")}
          </a>
          <a
            href={folder}
            target="_blank"
            rel="noreferrer"
            aria-label={t("manage.folder.aria", { title: name })}
          >
            {t("manage.folder")}
          </a>
        </span>
      )}
    </div>
  );
}

// Les dépôts qu'aucune pièce n'a réclamés : un fichier posé à la racine d'`uploads/`
// sans dire de quelle pièce il est, un dossier de dépôt dont le nom n'est pas un
// identifiant valide.
//
// **Affiché seulement quand il porte quelque chose**, et c'est la différence avec le
// journal d'une pièce, qui reste visible même vide pour se faire connaître avant le
// premier dépôt. Celui-ci n'est pas un canal, c'est un relevé d'ANOMALIES : le canal
// normal est le journal de chaque pièce, dans son Avancement. Une carte vide en
// permanence sur la page d'entrée du responsable annoncerait un problème là où il n'y
// en a aucun.
//
// Il ne reprend pas non plus le tableau à quatre colonnes du journal (date, statut,
// type, détail) : un fichier qu'aucune pièce ne réclame n'a par définition rien
// réussi, donc la colonne de statut ne dirait qu'une chose, et son type n'apprend
// rien puisque le motif l'explique en clair. Restent le nom et la raison, ce qu'on
// vient y lire.
function Unrouted({ runs }) {
  // Même garde défensive que `filesOf` (src/dashboard/App.jsx) sur le nom de fichier :
  // ce journal-ci est aussi hand-éditable dans le dépôt. On ne réutilise pas `filesOf`
  // pour autant, et ce n'est pas un oubli : il normalise en plus le TYPE et le compte
  // de clips pour bâtir une rangée à quatre colonnes, dont ce relevé n'affiche
  // aucune (cf. le commentaire au-dessus).
  const files = runs.flatMap((run) =>
    (Array.isArray(run?.files) ? run.files : [])
      .filter((file) => file && typeof file.file === "string")
      .map((file) => ({ ...file, at: run.at }))
  );
  if (files.length === 0) return null;
  return (
    <section className="chooser-unrouted card">
      <h2>{t("manage.unrouted.title")}</h2>
      <p className="chooser-unrouted-hint">{t("manage.unrouted.hint")}</p>
      <ul>
        {files.map((file, i) => (
          <li key={`${file.at}-${i}`}>
            <span className="chooser-unrouted-file">{file.file}</span>
            <span className="chooser-unrouted-why">{file.error}</span>
            {/* Repli explicite : `formatWhen` rend null exprès sur un horodatage
                illisible, et sans lui la date disparaissait en silence. Même clé que
                le journal d'une pièce. */}
            <span className="chooser-unrouted-when">
              {formatWhen(file.at) || t("dashboard.journal.unknownDate")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
