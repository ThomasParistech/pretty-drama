import React, { useLayoutEffect, useRef, useState } from "react";
import PageMark from "../shared/PageMark.jsx";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageState from "../shared/PageState.jsx";
import UploadTile from "../shared/UploadTile.jsx";
import useManifest from "../shared/useManifest.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, formatWhen, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import T from "../shared/T.jsx";
import { CheckIcon, CrossIcon, DownloadIcon, WarnIcon } from "../shared/icons.jsx";
import { githubUploadUrl, slugify } from "../shared/data.js";
import { isPlayId } from "../shared/plays.js";
import "./dashboard.css";

// Pure read of the manifest: recording progress per character.
export default function App() {
  const { manifest, error: loadError } = useManifest();
  if (loadError) {
    return <PageState page="dashboard" error={loadError} />;
  }
  if (!manifest) {
    return <PageState page="dashboard" />;
  }
  return <Dashboard manifest={manifest} />;
}

// A safeguard: the journal keeps ~30 uploads (MAX_RUNS, Python side), each of several files.
const JOURNAL_ROWS = 60;

// The keys are what `kind_of` (process_uploads.py) writes, hence French: this is DATA.
const KIND_LABEL_KEY = {
  voix: "dashboard.kind.voix",
  script: "dashboard.kind.script",
  inconnu: "dashboard.kind.inconnu",
};

// Normalised: the manifest may predate the format, or have been hand-edited.
function filesOf(run) {
  const files = run && Array.isArray(run.files) ? run.files : [];
  return files
    .filter((f) => f && typeof f.file === "string")
    .map((f) => ({
      file: f.file,
      kind: f.kind === "voix" || f.kind === "script" ? f.kind : "inconnu",
      error: typeof f.error === "string" ? f.error : null,
      clips: Number.isFinite(f.clips) ? f.clips : 0,
      // scripts/script_diff.py. `{}` means "moved nothing", null means the entry predates
      // the diff and must stay blank.
      changes:
        f.changes && typeof f.changes === "object" && !Array.isArray(f.changes)
          ? f.changes
          : null,
    }));
}

// Every field a promoted script can publish, in DISPLAY ORDER. The names are `script_diff`'s
// (plus `created`, from `promote_script`); renamed on one side, a change silently stops
// showing, which test_contracts.py catches. FLAT, not an array of pairs: the i18n scan reads
// a `…KEYS` table's literals up to the first closing bracket.
const CHANGE_LABEL_KEYS = {
  created: "dashboard.journal.changeCreated",
  linesAdded: "dashboard.journal.changeAdded",
  linesRemoved: "dashboard.journal.changeRemoved",
  linesEdited: "dashboard.journal.changeEdited",
  linesReassigned: "dashboard.journal.changeReassigned",
  castAdded: "dashboard.journal.changeCastAdded",
  castRemoved: "dashboard.journal.changeCastRemoved",
  castRenamed: "dashboard.journal.changeCastRenamed",
  title: "dashboard.journal.changeTitle",
  language: "dashboard.journal.changeLanguage",
  other: "dashboard.journal.changeOther",
};

// Each part is a WHOLE catalogue phrase joined by `fmt.list`, never a separator written
// here, so the translator owns the elision and the list. A field's VALUE says flag (`true`)
// or count (`{count}`), so no second table has to be kept in step. Empty renders "aucun
// changement", which `script_changes`'s `other` field keeps honest.
function changesOf(changes) {
  const parts = [];
  for (const [field, key] of Object.entries(CHANGE_LABEL_KEYS)) {
    const value = changes[field];
    if (value === true) parts.push(t(key));
    else if (Number.isFinite(value) && value > 0) parts.push(t(key, { count: value }));
  }
  return parts.length > 0 ? fmt.list(parts) : t("dashboard.journal.changeNone");
}

// One shape per kind: the file name in `<code>` then what the upload did, both parameters
// so the order stays the translator's. `changes == null` predates the diff and stays blank.
function detailOf(row) {
  if (row.error) {
    return (
      <T
        k="dashboard.journal.detailError"
        p={{ file: <code>{row.file}</code>, reason: row.error }}
      />
    );
  }
  if (row.kind === "script") {
    if (row.changes == null) return null;
    return (
      <T
        k="dashboard.journal.detailScript"
        p={{ file: <code>{row.file}</code>, changes: changesOf(row.changes) }}
      />
    );
  }
  // A PARAMETER, not a fragment: juxtaposed in JSX, the order and spacing freeze here.
  return (
    <T
      k="dashboard.journal.detailVoices"
      p={{
        file: <code>{row.file}</code>,
        count: t("common.lineCount", { count: row.clips }),
      }}
    />
  );
}

function okCount(lines) {
  return lines.filter((l) => l.status === "ok").length;
}

// One status scale for the whole grid: a background tint on a cell, the ink on a header.
function statusClass(ok, total) {
  if (total === 0) return "empty";
  return ok < total ? "todo" : "done";
}

// An act spans several columns, so it has no summary cell of its own and this tick stands
// in. Only the FINISHED state draws: a tick over an empty act would claim work that is not.
function HeadMark({ ok, total }) {
  if (total === 0 || ok < total) return null;
  const label = t("dashboard.mark.done");
  return (
    <span className="dash-mark" role="img" aria-label={label} title={label}>
      <CheckIcon />
    </span>
  );
}

// "recorded/total". A finished cell drops the ratio for a tick, "5/5" being a subtraction
// to make a hundred times over; an empty one says nothing.
function CellMark({ ok, total }) {
  if (total === 0) return null;
  if (ok >= total) {
    const label = t("dashboard.mark.done");
    return (
      <span className="dash-tick" role="img" aria-label={label} title={label}>
        <CheckIcon />
      </span>
    );
  }
  // Two elements, the numbers not having the same weight. The slash stays in the JSX by
  // exception: routing it would mean a `<T>` per CELL, for a character both languages share.
  return (
    <>
      <span className="dash-cell-ok">{fmt.number(ok)}</span>
      <span className="dash-cell-total">/{fmt.number(total)}</span>
    </>
  );
}

function Dashboard({ manifest }) {
  // Flat list of scene columns, keeping the act grouping for the header row.
  const scenes = manifest.acts.flatMap((act, actIndex) =>
    act.scenes.map((scene, sceneIndex) => ({
      key: `${actIndex}-${sceneIndex}`,
      // Full label in the tooltip, the NUMBER alone in the narrow column header.
      act: actLabel(t, actIndex),
      // `fmt.number` and not String: the rule for a figure written outside any sentence.
      label: fmt.number(sceneIndex + 1),
      title: sceneLabel(t, sceneIndex),
      lines: scene.lines,
      total: scene.lines.length,
      ok: okCount(scene.lines),
    }))
  );

  // Act header cells, with their own aggregate status (all scenes of the act).
  const actCols = manifest.acts
    .map((act, i) => {
      const lines = act.scenes.flatMap((scene) => scene.lines);
      return {
        key: i,
        title: actLabel(t, i),
        span: act.scenes.length,
        total: lines.length,
        ok: okCount(lines),
      };
    })
    .filter((act) => act.span > 0);

  const rows = manifest.characters.map((c) => {
    const cells = scenes.map((scene) => {
      const lines = scene.lines.filter((l) => l.characterId === c.id);
      return { total: lines.length, ok: okCount(lines) };
    });
    return {
      character: c,
      cells,
      total: cells.reduce((sum, cell) => sum + cell.total, 0),
      ok: cells.reduce((sum, cell) => sum + cell.ok, 0),
    };
  });

  // Lines nobody can record: surfaced loudly, or the coordinator chases a phantom "41/42".
  const knownIds = new Set(manifest.characters.map((c) => c.id));
  const orphanLines = manifest.lines.filter(
    (l) => l.characterId == null || !knownIds.has(l.characterId)
  );

  // Upload journal: absent from a manifest rebuilt before it existed.
  const runs = Array.isArray(manifest.history) ? manifest.history : [];

  return (
    <>
      {/* The PDF tile is the header's `actions`, like the Editing page's update tile: the
          gesture carrying the play ITSELF stays in the always-visible top row. */}
      <PlayHeader
        page="dashboard"
        title={manifest.title || t("common.untitledPlay")}
        actions={<ScriptPdfLink title={manifest.title || ""} />}
      />
      <div className="container">
        <div className="dash-actions">
          <UploadLinks playId={manifest.id} />
        </div>

        {orphanLines.length > 0 && (
          <div className="dash-orphans card">
            <WarnIcon />
            {/* The bold count is a PARAMETER: splitting the sentence freezes word order. */}
            <T
              k="dashboard.orphans"
              p={{
                count: (
                  <strong>
                    {t("dashboard.orphans.count", { count: orphanLines.length })}
                  </strong>
                ),
                page: t(pageLabelKey("editor")),
              }}
            />
            <ul>
              {orphanLines.map((l) => (
                <li key={l.id}>
                  {/* Shared `common.actScene`: the separator is a fact of language. */}
                  <span className="dash-pending-loc">
                    {t("common.actScene", {
                      act: actLabel(t, l.actIndex),
                      scene: sceneLabel(t, l.sceneIndex),
                    })}
                  </span>{" "}
                  <span className="dash-pending-text">{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Two empty states: a play can have its whole cast and not one scene
            (`sanitize_script` does not floor the structure). Characters first, since
            without them the scenes have no row to draw on. */}
        {rows.length === 0 ? (
          <div className="empty-state">{t("common.noCharacters", { page: t(pageLabelKey("editor")) })}</div>
        ) : scenes.length === 0 ? (
          <div className="empty-state">{t("common.emptyPlay", { page: t(pageLabelKey("editor")) })}</div>
        ) : (
          <ProgressTable acts={actCols} scenes={scenes} rows={rows} />
        )}

        <p className="dash-legend">{t("dashboard.legend")}</p>

        {/* No <h2> over the grid though the journal has one: the grid IS the page. */}
        <Journal runs={runs} />
      </div>
    </>
  );
}

// The project's ONLY error channel: the coordinator reads no CI log. One row per FILE, each
// having its own fate. Rendered even when empty, so it is known before the first upload.
function Journal({ runs }) {
  const all = runs.flatMap((run) => filesOf(run).map((file) => ({ ...file, at: run.at })));
  const rows = all.slice(0, JOURNAL_ROWS);
  // The cap must not cut silently, or a failure just off the bottom reads as no failure.
  const hidden = all.length - rows.length;
  return (
    <section className="dash-journal">
      <h2>{t("dashboard.journal.title")}</h2>
      {/* The container scrolls, never the page. `tabIndex` because it holds nothing
          focusable, so without it the scroller is unreachable by keyboard. */}
      <div
        className="dash-journal-wrap"
        tabIndex={0}
        role="region"
        aria-label={t("dashboard.journal.region")}
      >
        <table className="dash-journal-table">
          <thead>
            <tr>
              <th>{t("dashboard.journal.date")}</th>
              <th>{t("dashboard.journal.status")}</th>
              <th>{t("dashboard.journal.type")}</th>
              <th>{t("dashboard.journal.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="dash-journal-empty" colSpan={4}>
                  {t("dashboard.journal.empty")}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={`${row.at}-${row.file}-${i}`}>
                <td className="dash-journal-when">{formatWhen(row.at) || t("dashboard.journal.unknownDate")}</td>
                <td>
                  <Status failed={Boolean(row.error)} />
                </td>
                <td>
                  <KindMark kind={row.kind} />
                </td>
                <td className="dash-journal-detail">{detailOf(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="dash-journal-more">{t("dashboard.journal.more", { count: hidden })}</p>
      )}
    </section>
  );
}

// Borrows the seals' pill so the two icon columns match. The word goes to the aria-label,
// the column being too narrow, but the cell must not be mute.
function Status({ failed }) {
  const label = t(failed ? "dashboard.journal.failed" : "dashboard.journal.ok");
  return (
    <span
      className={`page-mark dash-journal-mark ${failed ? "ko" : "ok"}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {failed ? <CrossIcon /> : <CheckIcon />}
    </span>
  );
}

// The seal of the page that PRODUCES the file; a file claimed by no page gets a neutral pill.
function KindMark({ kind }) {
  const label = t(KIND_LABEL_KEY[kind] ?? KIND_LABEL_KEY.inconnu);
  if (kind === "inconnu") {
    return (
      <span className="page-mark dash-journal-mark unknown" role="img" aria-label={label} title={label}>
        ?
      </span>
    );
  }
  const page = kind === "script" ? "editor" : "recorder";
  // Explicit `label`: here the seal says the file's TYPE, not the page it borrows from.
  return (
    <span title={label}>
      <PageMark page={page} className="dash-journal-mark" label={label} />
    </span>
  );
}

// Dropping a received ZIP into the repo's upload screen. VOICES ONLY, the script having its
// own tile on the Editing page. Hidden where the URL cannot be guessed (dev, custom domain).
function UploadLinks({ playId }) {
  // The FOLDER routes, never the content, so a damaged ZIP still reaches its play's journal.
  // Without a valid id the tile hides rather than aim at the root of `uploads/`, whose
  // refusals go to the ROOT journal this page never shows.
  const url = isPlayId(playId) ? githubUploadUrl(playId) : null;
  if (!url) return null;
  return (
    // `tone="dashboard"`: the mic keeps its DRAWING but takes THIS page's colour.
    <UploadTile page="recorder" tone="dashboard" href={url}>
      {/* The coloured words are a PARAMETER, so the sentence keeps its word order. NO
          `page-<key>` class here, unlike the site's other tiles: `page-dashboard` hands out
          `--page-mark`, scoped to the `<header>` element and dead this far down. The ink
          comes from `--accent`, pinned in dashboard.css. */}
      <T
        k="dashboard.upload"
        p={{
          voices: (
            <span className="upload-tile-word">
              {/* The format is a parameter of the WORD, its parentheses being punctuation. */}
              <T
                k="dashboard.upload.voices"
                p={{
                  format: (
                    <span className="upload-tile-format">{t("common.format.zip")}</span>
                  ),
                }}
              />
            </span>
          ),
        }}
      />
    </UploadTile>
  );
}

// From the SAME script.json as the site, never an editor draft. Committed beside it and
// typeset by uploads.yml on promotion, so it is served from the repo in dev too.
const SCRIPT_PDF_HREF = "data/script.pdf";

function ScriptPdfLink({ title }) {
  // UNCONDITIONAL: probing with HEAD first made the button arrive after the page and shove
  // the table down. A missing file means the typesetting failed, and a 404 can be diagnosed
  // where an absent button is not even looked for. The slug fallback is mandatory and per
  // caller, from the catalogue like every downloaded file name.
  const name = slugify(title, t("dashboard.pdfSlug"));
  return (
    // `download` renames it: "script.pdf" says nothing in a downloads folder.
    <a
      className="upload-tile card lift-hover in-header dash-script-tile"
      href={SCRIPT_PDF_HREF}
      download={`${name}.pdf`}
    >
      <DownloadIcon />
      {/* `UploadTile`'s spans and classes, not the component: that one is never a download. */}
      <span className="upload-tile-text">
        <T
          k="dashboard.pdf"
          p={{
            play: (
              <span className="upload-tile-word page-dashboard">
                {/* As on the voices tile, the format is a parameter of the word. */}
                <T
                  k="dashboard.pdf.play"
                  p={{
                    format: (
                      <span className="upload-tile-format">{t("common.format.pdf")}</span>
                    ),
                  }}
                />
              </span>
            ),
          }}
        />
      </span>
    </a>
  );
}

// Characters x scenes. The names column AND the character total beside it are frozen (CSS),
// the rest scrolls: a lone "2/5" without its name says nothing. `tabIndex` on the scroller,
// which holds nothing focusable.
function ProgressTable({ acts, scenes, rows }) {
  // The one thing CSS cannot work out: the names column's width, which the frozen status
  // column needs as its `left`. It has no width of its own (`width: 1%`), so the value is a
  // RESULT read off the drawn table. A layout effect, so the `0px` fallback is never
  // painted, plus a ResizeObserver, the width moving without React. It cannot loop.
  const nameCorner = useRef(null);
  const [nameWidth, setNameWidth] = useState(0);
  useLayoutEffect(() => {
    const el = nameCorner.current;
    if (!el) return undefined;
    const read = () => setNameWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="dash-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={t("dashboard.table")}
    >
      <table className="dash-table" style={{ "--dash-name-w": `${nameWidth}px` }}>
        <thead>
          <tr>
            {/* TWO corner cells: each frozen column carries its own `left`. */}
            <th className="dash-corner dash-corner-name" ref={nameCorner} />
            <th className="dash-corner dash-corner-status" />
            {acts.map((act) => (
              <th
                key={act.key}
                className={`dash-act ${statusClass(act.ok, act.total)}`}
                colSpan={act.span}
              >
                {/* Wrapped: a `display: flex` on a `th` is re-wrapped in an anonymous cell
                    by the table fixup, which costs a frozen column its freezing. */}
                <span className="dash-head">
                  <HeadMark ok={act.ok} total={act.total} />
                  {act.title}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="dash-corner dash-corner-name" />
            {/* Blank but named: a `th`'s accessible name announces the cells under it. */}
            <th
              className="dash-corner dash-corner-status"
              aria-label={t("dashboard.total.play")}
            />
            {scenes.map((scene) => (
              <th
                key={scene.key}
                title={t("common.actScene", { act: scene.act, scene: scene.title })}
                className={`dash-scene ${statusClass(scene.ok, scene.total)}`}
              >
                {/* No `HeadMark`: the totals row below gives each scene its own tick. */}
                {scene.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Per-scene totals, opening the body: a summary at the end of a table that
              scrolls both ways is a summary nobody reads. The count comes from the SCENES,
              hence from every line including the orphans the banner above reports. */}
          <tr className="dash-totals">
            {/* Named for a screen reader: without it the row's cells are announced under a
                scene name alone. The FIRST cell takes it, a row being announced by it. */}
            <th
              className="dash-corner dash-corner-name"
              aria-label={t("dashboard.total.cast")}
            />
            <th className="dash-corner dash-corner-status" />
            {scenes.map((scene) => (
              <td key={scene.key} className={statusClass(scene.ok, scene.total)}>
                <CellMark ok={scene.ok} total={scene.total} />
              </td>
            ))}
          </tr>
          {rows.map((row) => (
            <tr key={row.character.id}>
              {/* Wrapped so it can truncate when room runs out; `title` gives it in
                  full. */}
              <th
                className={`dash-name ${statusClass(row.ok, row.total)}`}
                title={row.character.name}
              >
                <span className="dash-name-text truncate">{row.character.name}</span>
              </th>
              {/* The character over the whole play, in the shape of one of their cells. */}
              <td className={`dash-status ${statusClass(row.ok, row.total)}`}>
                <CellMark ok={row.ok} total={row.total} />
              </td>
              {row.cells.map((cell, i) => (
                <td key={scenes[i].key} className={statusClass(cell.ok, cell.total)}>
                  <CellMark ok={cell.ok} total={cell.total} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
