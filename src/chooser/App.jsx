import React, { useEffect, useState } from "react";
import HomeFooter from "../shared/HomeFooter.jsx";
import HomeHero from "../shared/HomeHero.jsx";
import { HttpError, fetchPlaysIndex, fetchUnroutedHistory } from "../shared/data.js";
import { WarnIcon } from "../shared/icons.jsx";
import { fmt, formatWhen, t } from "../shared/locale.js";
import { playHref } from "../shared/pages.js";
import { isPlayId } from "../shared/plays.js";
import { formatShare } from "../shared/share.js";
import NewPlay, { NewPlayTile } from "./NewPlay.jsx";
import "../home/home.css";
import "./chooser.css";

// Both root pages. No link leads from the chooser to management, which is bookmarked.
export default function App({ manage = false }) {
  const [plays, setPlays] = useState(null);
  const [error, setError] = useState(null);
  const [unrouted, setUnrouted] = useState([]);
  // Lives here and not in NewPlay: the gesture is a tile in the grid plus a modal.
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchPlaysIndex()
      // Validate the id before `playHref` builds a path: plays.json is committed, hence
      // hand-editable. A malformed list reads as "no play".
      .then((index) =>
        setPlays(Array.isArray(index?.plays) ? index.plays.filter((p) => isPlayId(p?.id)) : [])
      )
      .catch((err) => {
        // 404 is legitimate emptiness (fresh fork); anything else is a breakdown.
        if (err instanceof HttpError && err.status === 404) {
          setPlays([]);
          return;
        }
        setError(t("chooser.loadError"));
      });
  }, []);

  useEffect(() => {
    // Upload accidents concern the coordinator only.
    if (!manage) return;
    fetchUnroutedHistory()
      .then((history) => setUnrouted(Array.isArray(history?.runs) ? history.runs : []))
      .catch(() => setUnrouted([]));
  }, [manage]);

  // By title in the reader's language; plays.json is ordered by id, knowing no locale.
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

      {/* Everything inside `main` so a landmark walk reaches the management blocks. Flex
          column, not a bare block: as flex items their margins do not collapse. */}
      <main className="chooser-main">
        <div className="home-grid">
          {/* Nothing while loading; emptiness and breakdown are never conflated. */}
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
              sorted.map((play) => <PlayCard key={play.id} play={play} manage={manage} />)
            ))
          )}
          {/* Ends the grid as the empty slot after the plays. Waits for the list: the id
              uniqueness check has nothing to compare against without it. */}
          {manage && !error && plays !== null && <NewPlayTile onOpen={() => setCreating(true)} />}
        </div>

        {manage && (
          <>
            {/* Creation needs the list (id uniqueness); the unrouted record does not, and
                may even be what explains the breakdown. */}
            {creating && plays !== null && (
              <NewPlay taken={plays} onClose={() => setCreating(false)} />
            )}
            <Unrouted runs={unrouted} />
          </>
        )}
      </main>

      <HomeFooter />
    </div>
  );
}

// One collator for the whole sort; localeCompare rebuilds one per call.
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

// What the play IS, plus the recorded share on management. Space alone separates them: a
// drawn separator dangles when the row wraps.
function PlayStats({ play, manage }) {
  const total = Number(play.lines) || 0;
  const recorded = Number(play.recorded) || 0;
  if (total === 0) {
    // "0 personnages 0 mots" describes nothing, and "0 %" reads as behind, not as a start.
    return <span className="chooser-card-empty">{t("chooser.emptyPlay")}</span>;
  }
  return (
    <span className="chooser-card-stats">
      <span>{t("chooser.characters", { count: Number(play.characters) || 0 })}</span>
      <span>{t("chooser.words", { count: Number(play.words) || 0 })}</span>
      {manage && (
        // formatShare, not fmt.percent: same rounding as the Speaking share legend, and it
        // says "< 0.1 %" where a bare percentage shows a "0.0 %" that reads as a bug.
        <span>{t("manage.recorded", { share: formatShare(recorded, total, t, fmt) })}</span>
      )}
    </span>
  );
}

// Same card on both root pages, only the destination differs. The whole card is the
// link, so it can never hold a second one.
function PlayCard({ play, manage }) {
  return (
    <a
      className="home-card card lift-hover chooser-card"
      href={playHref(play.id, manage ? "respo" : "index")}
    >
      <span className="home-card-title">{play.title || t("common.untitledPlay")}</span>
      <PlayStats play={play} manage={manage} />
    </a>
  );
}

// Shown only when non-empty, unlike a play's journal: a record of anomalies, not a channel,
// so an always-empty card would announce a non-problem.
function Unrouted({ runs }) {
  // `filesOf` (dashboard/App.jsx) is deliberately not reused: it also normalises type and
  // clip count for a four-column row this record does not draw.
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
            {/* formatWhen returns null on an unreadable timestamp; without the fallback
                the date vanished silently. */}
            <span className="chooser-unrouted-when">
              {formatWhen(file.at) || t("dashboard.journal.unknownDate")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
