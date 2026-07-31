import React, { useEffect, useState } from "react";
import HomeFooter from "../shared/HomeFooter.jsx";
import HomeHero from "../shared/HomeHero.jsx";
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
import { isPlayId } from "../shared/plays.js";
import { formatShare } from "../shared/share.js";
import NewPlay from "./NewPlay.jsx";
import "../home/home.css";
import "./chooser.css";

// The two ROOT pages of the site, the ones living above the plays: the troupe's
// chooser (`index.html`) and the coordinator's play management page
// (`respo.html`). Same component, two sets of actions, just as the two home pages of
// a play share theirs.
//
// They are the ENTRANCE to the site, so they carry the brand and not a page seal:
// their hero is the one of the home pages (the two masks, the word "PrettyDrama"),
// and that is also why they reuse `home.css` instead of having their own styling.
// What belongs to them alone is in `chooser.css`: the play card, the creation
// gesture, the record of uploads that belong to no play.
//
// **No link leads from the chooser to the management page**: this is the same
// separation of addresses as the one between a play's two home pages, the troupe's
// address must not open onto the coordinator's tools. `respo.html` is bookmarked.
//
// Once a play is chosen, one is IN the play and the rest no longer exists: its seven
// pages live in its folder, only read its data, and the only path out of it is the
// "change play" link at the foot of its home page.
export default function App({ manage = false }) {
  const [plays, setPlays] = useState(null);
  const [error, setError] = useState(null);
  const [unrouted, setUnrouted] = useState([]);

  useEffect(() => {
    fetchPlaysIndex()
      // A malformed list reads as "no play": it is a derived file, and there is
      // nothing better to make of it.
      //
      // An entry whose id is not a valid one is dropped, and the id is validated
      // HERE, once, before anything builds a path out of it: this page turns it into
      // three (`playHref`, and the two GitHub links of `ManageCard`), which is the
      // project's rule everywhere (cf. `UploadLinks` in dashboard/App.jsx, and
      // `play_dir` on the Python side). `plays.json` is derived, but it is committed,
      // hence hand-editable in the repository like every other file the pages read.
      // Dropping such an entry loses nothing: `play_ids()` ignores a folder whose
      // name is not a valid id, so the play it claims has no folder and no page to
      // link to.
      .then((index) =>
        setPlays(Array.isArray(index?.plays) ? index.plays.filter((p) => isPlayId(p?.id)) : [])
      )
      .catch((err) => {
        // The distinction the whole site makes (cf. `HttpError` in data.js): a 404
        // is a LEGITIMATE emptiness (a freshly forked repo, the index has not been
        // built yet), and the page that creates the first play must open on it;
        // everything else is a BREAKDOWN, and announcing it as "no play" would lie
        // to the troupe on the site's entrance page, telling it that its plays have
        // vanished and leaving it no path.
        if (err instanceof HttpError && err.status === 404) {
          setPlays([]);
          return;
        }
        setError(t("chooser.loadError"));
      });
  }, []);

  useEffect(() => {
    // The record of uploads without a play only concerns the coordinator: the troupe has
    // no business reading upload accidents, and has nothing to answer them with.
    if (!manage) return;
    fetchUnroutedHistory()
      .then((history) => setUnrouted(Array.isArray(history?.runs) ? history.runs : []))
      .catch(() => setUnrouted([]));
  }, [manage]);

  // Sorted by TITLE and in the reader's language, whereas `data/plays.json` is
  // ordered by id: a machine file has no business knowing a locale (same rule as the
  // manifest's ranks, which the front end puts into words), and comparing accented
  // titles requires one.
  const sorted =
    plays === null
      ? null
      : [...plays].sort((a, b) =>
          collator.compare(a.title || t("common.untitledPlay"), b.title || t("common.untitledPlay"))
        );

  return (
    <div className="home page-home">
      <HomeHero>
        <h1 className="chooser-heading">{t(manage ? "manage.heading" : "chooser.heading")}</h1>
      </HomeHero>

      {/* `main` holds ALL the content, the grid of plays as well as the two blocks that
          belong to management, and the grid is a `div` inside it. The two blocks used to
          sit outside the landmark, which put two of the management page's three blocks,
          including the one that creates a play, out of reach of a landmark walk and of a
          "skip to content" jump. `.chooser-main` is a flex column and not a bare block
          so that the vertical rhythm does not change: as direct children of `.home`
          these blocks were flex items, whose margins do not collapse. */}
      <main className="chooser-main">
        <div className="home-grid">
          {/* Three states, and nothing while LOADING: the list arrives in one round
              trip on a file of a few lines, and a waiting screen that is replaced right
              away reads as a flicker. Emptiness and breakdown, on the other hand, are
              said out loud, and are never conflated. */}
          {error ? (
            <p className="chooser-error">
              <WarnIcon />
              {error}
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
        </div>

        {manage && (
          <>
            {/* Creating a play requires knowing which ones already exist: without the
                list, the id uniqueness check would say nothing and the coordinator could
                fabricate the duplicate of a play they cannot see. The upload would be
                refused by `validate_script`'s guard (an empty play never replaces a
                play that has lines), so nothing would be erased, but we do not offer a
                gesture we know can fail.
                The record of uploads without a play, on the other hand, does not depend
                on the list, and it stays displayed: it may even be what explains the
                breakdown. */}
            {plays !== null && <NewPlay taken={plays} />}
            <Unrouted runs={unrouted} />
          </>
        )}
      </main>

      {/* Nothing above the sentence, unlike a play's home page: its foot carries the
          "change play" link, and these two pages are where it leads. */}
      <HomeFooter />
    </div>
  );
}

// `Intl.Collator` and not `localeCompare` on every comparison: the comparator is
// built once for the whole sort, where the method rebuilds one per call.
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

// What a card says about its play's progress. Two numbers and a percentage, never a
// bar: the page chooses a play, it does not follow it, and the play's Progress page
// shows the detail per character and per scene.
function Progress({ play }) {
  const total = Number(play.lines) || 0;
  const recorded = Number(play.recorded) || 0;
  if (total === 0) {
    // "0 %" on a play that has just been created would read as being behind,
    // whereas it is a beginning.
    return <span className="chooser-card-empty">{t("chooser.emptyPlay")}</span>;
  }
  return (
    <>
      {/* `formatShare` and not `fmt.percent`: it is the same measure as the Speaking
          share page's legend, hence the same rounding rule, and it carries a
          threshold that matters here too. On a play of more than two thousand lines
          of which only one is recorded, a bare percentage shows "0.0 %" facing
          "1 line recorded", which reads as a bug; below a tenth of a point we say
          the threshold ("< 0.1 %") and not the value. */}
      <span className="chooser-card-share">{formatShare(recorded, total, t, fmt)}</span>
      <span className="chooser-card-count">
        {t("chooser.recorded", { count: recorded, total })}
      </span>
    </>
  );
}

// The troupe chooser's card: the whole card is the link, like the page cards of the
// home pages, because it has only one destination and because it is opened with a
// finger.
function ChooseCard({ play }) {
  return (
    <a className="home-card card lift-hover chooser-card" href={playHref(play.id, "index")}>
      <span className="home-card-title">{play.title || t("common.untitledPlay")}</span>
      <Progress play={play} />
    </a>
  );
}

// The management page's card. It is NOT a link, unlike the chooser's: it carries
// three of them (the play, its upload folder, its folder), and a link inside a link
// is not valid HTML. The title stays the big gesture, the other two are service
// links, at the foot of the card.
//
// Those two links are the reason for this page: the coordinator must not have to know
// GitHub in order to upload a file nor to remove a play, they click a link that takes
// them exactly to the right place.
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
      {/* Hidden outside github.io (local dev, custom domain), where the upload
          address cannot be guessed: we do not forge a 404, like the Progress page's
          upload card. */}
      {upload && folder && (
        <span className="chooser-card-links">
          {/* The accessible name NAMES the play, the visible label does not: on a page
              that lists the plays, these two links repeat once per card, and in a list
              of links (a screen reader's walk) "Upload files" four times in a row no
              longer says anything. On screen, the card already carries the title right
              above. */}
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

// The uploads no play has claimed: a file dropped at the root of `uploads/` without
// saying which play it belongs to, an upload folder whose name is not a valid id.
//
// **Displayed only when it carries something**, and that is the difference with a
// play's journal, which stays visible even when empty so as to make itself known
// before the first upload. This one is not a channel, it is a record of ANOMALIES:
// the normal channel is each play's journal, in its Progress page. A permanently
// empty card on the coordinator's entrance page would announce a problem where there is
// none.
//
// Nor does it take up the journal's four-column table (date, status, type, detail): a
// file no play claims has by definition succeeded at nothing, so the status column
// would only say one thing, and its type teaches nothing since the reason explains it
// in plain words. What remains is the name and the reason, which is what one comes
// here to read.
function Unrouted({ runs }) {
  // Same defensive guard as `filesOf` (src/dashboard/App.jsx) on the file name: this
  // journal too is hand-editable in the repo. We do not reuse `filesOf` for all that,
  // and it is not an oversight: it also normalises the TYPE and the clip count in
  // order to build a four-column row, of which this record displays none (cf. the
  // comment above).
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
            {/* Explicit fallback: `formatWhen` returns null on purpose on an
                unreadable timestamp, and without this the date vanished silently.
                Same key as a play's journal. */}
            <span className="chooser-unrouted-when">
              {formatWhen(file.at) || t("dashboard.journal.unknownDate")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
