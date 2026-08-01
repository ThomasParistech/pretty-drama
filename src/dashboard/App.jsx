import React, { useLayoutEffect, useRef, useState } from "react";
import PageMark from "../shared/PageMark.jsx";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageState from "../shared/PageState.jsx";
import UploadTile from "../shared/UploadTile.jsx";
import useManifest from "../shared/useManifest.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import T from "../shared/T.jsx";
import { CheckIcon, CrossIcon, DownloadIcon, WarnIcon } from "../shared/icons.jsx";
import { githubUploadUrl, slugify } from "../shared/data.js";
import formatWhen from "../shared/formatWhen.js";
import { isPlayId } from "../shared/plays.js";
import "./dashboard.css";

// Pure read of data/manifest.json: recording progress per character, so the
// coordinator knows who to chase.
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

// The journal keeps about thirty uploads (MAX_RUNS on the Python side), each of
// which may carry several files: enough to go beyond sixty rows. The scrolling
// table holds them, this cap is only a safeguard.
const JOURNAL_ROWS = 60;

// The type's label, outside the table: the seal carries it on screen, the word
// now only serves the tooltip and screen readers. The three keys are the ones
// `kind_of` (process_uploads.py) writes into the journal, so they stay in
// French: this is DATA, not interface text, and the displayed word lives in
// the catalogues.
const KIND_LABEL_KEY = {
  voix: "dashboard.kind.voix",
  script: "dashboard.kind.script",
  inconnu: "dashboard.kind.inconnu",
};

// An upload's files, normalised: the manifest may come from an earlier version
// of the format, or have been tinkered with by hand like script.json.
function filesOf(run) {
  const files = run && Array.isArray(run.files) ? run.files : [];
  return files
    .filter((f) => f && typeof f.file === "string")
    .map((f) => ({
      file: f.file,
      kind: f.kind === "voix" || f.kind === "script" ? f.kind : "inconnu",
      error: typeof f.error === "string" ? f.error : null,
      clips: Number.isFinite(f.clips) ? f.clips : 0,
      // What a promoted script CHANGED (scripts/script_diff.py). It defaults to
      // null and not to `{}`, and the difference is the whole reason it is spelled
      // out: an empty object is a real answer ("this promotion moved nothing", which
      // the row says in words), whereas null means the entry was written before the
      // Action diffed anything at all, and those old rows must keep looking exactly
      // as they did rather than suddenly claim a play never changed.
      changes:
        f.changes && typeof f.changes === "object" && !Array.isArray(f.changes)
          ? f.changes
          : null,
    }));
}

// Everything a promoted script can publish, each field paired with the sentence that
// reads it, and the ORDER of this object is the order they are read in: the birth of
// the play, then the lines, then the cast, then the document, then the catch-all.
//
// The field names are the ones scripts/script_diff.py writes (plus `created`, which
// `promote_script` adds), and `TestScriptDiffFields` in scripts/tests/test_contracts.py
// holds the two sides together by reading both: renamed here alone, a change would
// simply stop being displayed, with no error anywhere to notice it by, on the one row
// of this table the whole diff exists to fill.
//
// An object and not an array of pairs, and that is not a style choice: the i18n scan of
// test_contracts.py reads the literals of a table whose name ends in KEYS and stops at
// the first closing bracket, so a nested array would hide every key but the first from
// the guard that checks they exist in both catalogues.
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

// The diff of a script promotion, as one enumeration: "12 répliques ajoutées,
// 3 supprimées, 5 modifiées".
//
// Each part is a WHOLE phrase from the catalogue and they are joined by `fmt.list`,
// never by a separator written here: the translator gets to decide whether the noun is
// repeated ("3 lines removed") or elided ("3 removed"), and how a language strings a
// list together is that language's business. Plurals come from the engine, so
// "1 réplique ajoutée" needs nothing on this side.
//
// A field is a COUNT or a FLAG, and the value says which: `true` renders the sentence
// bare ("pièce créée", "titre modifié"), a number renders it with `{count}`. Reading
// that off the data rather than off a second table is what keeps ONE ordered list here:
// there is nothing to keep in step, and `created` stopped being a case of its own. It
// is also the guard against a hand-edited journal, `{count}` being meaningless on a
// boolean and a count of zero having nothing to say.
//
// The birth of the play is a part like the others: a `.json` that creates a play both
// brings it into being and fills it, so the row reads "pièce créée, 120 répliques
// ajoutées", which is exactly what happened. A play born from a title has nothing to
// count, and that lone mention is what stops its row from being blank.
//
// Nothing left to say means the promotion changed nothing the site reads, and the row
// SAYS so. That is the whole point: a blank cell reads as "the tool has no idea what
// became of your file". It is also why `script_changes` carries an `other` field, so
// that this sentence can never be a lie (see the long note there).
function changesOf(changes) {
  const parts = [];
  for (const [field, key] of Object.entries(CHANGE_LABEL_KEYS)) {
    const value = changes[field];
    if (value === true) parts.push(t(key));
    else if (Number.isFinite(value) && value > 0) parts.push(t(key, { count: value }));
  }
  return parts.length > 0 ? fmt.list(parts) : t("dashboard.journal.changeNone");
}

// A row's detail: a voices file names its ZIP and counts its lines; a script names it
// and says what it CHANGED; a failure names the file and gives its reason, the only
// text that comes from the Action.
//
// The script row used to return null here, on the grounds that the seal said enough
// and the file name said nothing. It was the one empty cell of the table, and it fell
// on the upload the coordinator has the least intuition about: a voice ZIP announces
// itself (they received it, they know whose it is), where `script.json` is a file they
// downloaded from the Editing page minutes ago and cannot tell apart from the previous
// one. So the promotion is diffed in the Action and the counts land here.
//
// Same SHAPE as the voices row, deliberately: file name in `<code>`, then what the
// upload did, both as parameters of one entry so the order stays the translator's.
// A row from a journal written before the diff existed keeps returning null, which is
// what it looked like then.
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
  // The file name is a PARAMETER and not a fragment placed before the count:
  // juxtaposed in the JSX, their order and the space between them were frozen
  // in the component.
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

// A single status scale for the whole grid: cells, status column, names, scenes, acts.
// On a cell it is the background tint, on a header the ink.
function statusClass(ok, total) {
  if (total === 0) return "empty";
  return ok < total ? "todo" : "done";
}

// The summary marker of an ACT, at the left of its label: a green tick once everything
// in it is recorded, and NOTHING at all as long as lines are missing.
//
// An act spans several scene columns, so it is the one label of the grid with no cell
// of its own in the two summaries (the totals row gives one to each scene, the status
// column one to each character). This tick is what stands in for it.
//
// It replaces the amber/green background the header kinds used to carry. The tint
// said the same thing, but it said it in colour ALONE, so it needed the legend to be
// read at all and left nothing for a screen reader; and painting a whole act cost the
// grid its calm, the amber of "behind" covering three quarters of the table on a play
// that has just started.
//
// The waiting state draws nothing, where it used to draw an hourglass. The grid says
// what is left in FIGURES all around this label, so a second sign for "there is work
// left" only repeated it, one step further from the numbers that answer "how much".
// What is left is the one thing worth spotting from afar, a finished act.
//
// Nothing to record: no marker either, the same silence as a cell with no line (a
// green tick over an empty act would claim work that does not exist). The status
// class of the header carries the ink, so the state is encoded once, by `statusClass`.
function HeadMark({ ok, total }) {
  if (total === 0 || ok < total) return null;
  const label = t("dashboard.mark.done");
  return (
    <span className="dash-mark" role="img" aria-label={label} title={label}>
      <CheckIcon />
    </span>
  );
}

// What ONE cell of the grid says, and what the status column beside the names says
// about a whole character: "recorded out of total", the ratio, on a background tinted
// by the state. It reads without a key, which a bare count of what is missing does not:
// "2/5" carries the size of the job along with what is left of it, and the coordinator
// reads the two together ("Claire has five lines here and has sent two").
//
// ONE exception, the finished cell, and it is what the tint alone could not do: it
// drops the ratio and takes the green tick. "5/5" is a subtraction to be made before
// one can be sure there is nothing left to do, and there are a hundred of them on a
// grid; the tick answers before it is read, and what a finished column looks like is
// the one thing the page is scanned for.
//
// Nothing to record: an empty cell, white, and nothing to announce either. It is then
// the only thing on the row that says nothing at all, which is exactly right.
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
  // Two elements and not one string: the two numbers do not have the same weight (the
  // recorded one stands out from the total). Each goes through `fmt.number`, the
  // formatter for numbers written alone, outside any sentence.
  // The slash STAYS in the JSX, and that is deliberate even though a fraction slash is
  // normally a fact of language kept in the string (`recorder.lineCounter` is
  // "{n}/{total}" in both catalogues, French included, which is what settles it): the
  // two numbers have to be two elements for their weights, so routing the separator
  // through the catalogue would mean a `<T>` per CELL, that is several hundred on a play
  // of twenty characters and forty scenes, in exchange for a character both languages
  // write the same way.
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
      // The full label for the tooltip, and the NUMBER alone in the column
      // header, which is narrow. No more regex to extract that number from a
      // title: the rank gives it directly (`sceneNumber` disappeared along with
      // the stored titles).
      act: actLabel(t, actIndex),
      // `fmt.number` and not `String`: it is the site's rule for a figure written
      // ALONE, outside any sentence (cf. CountBadge.jsx), and this one's own tooltip
      // already follows it, `sceneLabel` handing its rank to the engine.
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

  // Lines pointing at no (known) character: they inflate the totals but
  // belong to nobody and NOBODY can record them: surface them loudly so the
  // coordinator fixes the script instead of chasing a phantom "41/42".
  const knownIds = new Set(manifest.characters.map((c) => c.id));
  const orphanLines = manifest.lines.filter(
    (l) => l.characterId == null || !knownIds.has(l.characterId)
  );

  // Upload journal: absent from a manifest rebuilt before it existed.
  const runs = Array.isArray(manifest.history) ? manifest.history : [];

  return (
    <>
      {/* Its compact sentence and nothing else (no `hint`): the page has no
          setting, but its header folds like the three others (it carries the way
          back to the home page), and unfolding it only to find a link felt
          empty. It says what the page is for, never how to read the grid (that
          is `.dash-legend`'s job, under the table) nor how to upload (the upload
          card is right below, it reads on its own).
          The PDF tile is its `actions`, the place the Editing page gives to its
          update tile: the two pages now put the gesture that carries the play
          ITSELF in the top row, and the row is always visible where the body
          scrolls away. What stays below, in `.dash-actions`, is the upload of the
          voices, which belongs with the grid and the journal it feeds. */}
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
            {/* The bold count is a PARAMETER: cutting the sentence around the
                <strong> would freeze the French word order in the component. */}
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
                  {/* The act + scene pair through the shared key `common.actScene`,
                      like the Speaking share page's scope: the separator is a fact
                      of language, and it was a "·" written in the JSX here and a
                      comma over there, on the same site. */}
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

        {/* Two empty states and not one, because the grid has two ways of having
            nothing to draw and they do not say the same thing. The two conditions
            used to share the "no characters" sentence, which then stated something
            false about the very thing the page had: a play can carry its whole cast
            and not a single scene (a script edited by hand in the repository, with
            `acts: []`, which `sanitize_script` deliberately does not floor where the
            editor does). Characters first, since without them the scenes have no row
            to be drawn on. */}
        {rows.length === 0 ? (
          <div className="empty-state">{t("common.noCharacters", { page: t(pageLabelKey("editor")) })}</div>
        ) : scenes.length === 0 ? (
          <div className="empty-state">{t("common.emptyPlay", { page: t(pageLabelKey("editor")) })}</div>
        ) : (
          <ProgressTable acts={actCols} scenes={scenes} rows={rows} />
        )}

        <p className="dash-legend">{t("dashboard.legend")}</p>

        {/* No <h2> over the grid, though the journal below has one: it was tried and
            the page read worse for it. The grid IS the page (the header's sentence
            already says so, and it fills the screen under the two upload/download
            gestures), so naming it added a heading that repeated the page and pushed
            the table down; the journal's own title, for its part, is what tells a
            second and quite different block apart at the foot of the page. */}
        <Journal runs={runs} />
      </div>
    </>
  );
}

// Upload journal: the coordinator's ONLY feedback on what the GitHub Action did with
// their files (they read neither the CI logs nor the issues). The entries come
// from data/history.json, copied into the manifest.
//
// ONE ROW PER FILE, not per upload: each file has its own fate (a damaged ZIP in
// the middle of three good ones does not stop the others), so each row carries
// its own status. The date repeats for files uploaded together, which groups them
// visually without having to nest them.
//
// The table stays displayed even when empty (a line of explanation in place of
// the uploads): it is the project's only feedback channel, so the coordinator must know
// that it exists and where to look at it BEFORE their first upload, otherwise a
// failure would find them in front of a page that never promised anything.
function Journal({ runs }) {
  const all = runs.flatMap((run) => filesOf(run).map((file) => ({ ...file, at: run.at })));
  const rows = all.slice(0, JOURNAL_ROWS);
  // The cap is a safeguard, but it must not cut silently: this is the project's
  // only feedback channel, and a table that stops without saying so reads as
  // "there is nothing more", including for a failed upload that has just fallen
  // off the bottom.
  const hidden = all.length - rows.length;
  return (
    <section className="dash-journal">
      <h2>{t("dashboard.journal.title")}</h2>
      {/* The container scrolls, never the page: the journal keeps about thirty
          uploads, it must not lengthen the Progress page endlessly. Like the grid
          above, it is therefore a named and focusable region: it scrolls on both
          axes and contains nothing focusable, so without `tabIndex` it could be
          walked neither by keyboard nor by screen reader. */}
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

// Status by drawing alone, in the same green and amber as the grid above. It
// borrows the seals' pill (`page-mark`) so that the table's two icon columns are
// of the same family, with the status tints in place of a page colour. The word
// goes into the `aria-label`: the column is too narrow for it, but a screen
// reader must not end up in front of a mute cell.
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

// The upload's type carried by the seal of the page that produces that file: the
// Recording page's mic for voices, the Editing page's quill for the script. They are
// the seals of the two upload tiles of the site (the mic on this page, the quill on
// the Editing page), so the association reads without a legend. A file that is
// neither a ZIP nor a script is claimed by no page: neutral pill, without a page
// colour.
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
  // Explicit `label`: in this column the seal says the file's TYPE, not the page
  // whose colours it carries.
  return (
    <span title={label}>
      <PageMark page={page} className="dash-journal-mark" label={label} />
    </span>
  );
}

// The coordinator's daily gesture: dropping the ZIP of voices they received into
// the GitHub upload screen of THEIR repo.
//
// VOICES ONLY, and it is said in the label. The tile used to name the two files the
// upload folder accepts, the voices and the script.json, because the folder really
// does take both (the Action deduces the type from the extension alone). But the
// script is not a file a coordinator RECEIVES: they write it on the Editing page,
// which now carries its own tile for it, download included (see `upload` there).
// Naming it here as well made this button the destination of a file one had first
// to go and fetch elsewhere, and left the Editing page ending on a download whose
// sequel was written on another page.
//
// The expected extension is said in parentheses in the label itself, rather than
// as example file names on a second line: it is the extension alone that decides
// the processing (`kind_of`), and the button fits on one line.
// Hidden outside github.io (local dev, custom domain) where the URL cannot be
// guessed.
function UploadLinks({ playId }) {
  // THIS play's upload folder, `uploads/<id>/`. It is the folder that routes the
  // file towards its play, never its content: a damaged ZIP, hence an unreadable
  // one, must still land in its play's journal. The coordinator never types this path,
  // they click this button from the play they are working on.
  //
  // Without a valid id (a hand-edited `script.json` that has lost its `id` field),
  // the card hides itself instead of aiming at the root of `uploads/`: over there a
  // ZIP of voices is refused, and the refusal goes into the ROOT journal, which this
  // play's Progress page never displays. The coordinator would have uploaded with nothing
  // being said on the page in front of them, which is worse than an absent button.
  // Same rule as outside github.io: we do not forge an address we know will not
  // work.
  const url = isPlayId(playId) ? githubUploadUrl(playId) : null;
  if (!url) return null;
  // No container here: `.dash-actions` is the tile's own row (cf. dashboard.css). It
  // held the PDF tile too until that one moved into the header, and it is the reason
  // that block hides itself when empty: this component is the only thing left in it,
  // and it renders nothing outside github.io.
  return (
    // `tone="dashboard"`: the mic keeps its DRAWING, which says the voices come from
    // the Recording page, and takes THIS page's colour, like the coloured word beside
    // it. The wine of Recording was the only foreign colour on the page, and it read
    // as a warning on the one gesture the coordinator repeats every week; the Editing
    // tile, for its part, has always coloured its word with the page it sits on, so
    // this is the rule of the two tiles and not an exception here.
    <UploadTile page="recorder" tone="dashboard" href={url}>
      {/* The coloured group of words is a PARAMETER: it carries this page's colour and
          the sentence keeps its own language's word order. The old JSX was six fragments
          inside four nested spans, where the order mattered.
          NO `page-<key>` class on it, where the site's other tiles have one, and it is
          not an omission. It carried `page-recorder`, which rendered "voix (ZIP)" in
          Recording's WINE while every comment around it said the page's colour: the
          class is what gives `.upload-tile-word` its ink (theme.css), and
          `page-dashboard` would hand out the seal's `--page-mark`, which is set on the
          `<header>` ELEMENT and so reads as nothing this far down the page. The tile
          takes the page's `--accent` instead, re-skinned on `:root` and pinned by
          `.dash-actions .upload-tile-word` (dashboard.css). */}
      <T
        k="dashboard.upload"
        p={{
          voices: (
            <span className="upload-tile-word">
              {/* The format is a parameter of the WORD and not a span written after it:
                  the parentheses and the space that carries them are punctuation, so
                  they live in the string like every other separator on the site, and a
                  language free to put the format first can. Nested `<T>`, the format
                  itself being markup (its own weight, `.upload-tile-format`). */}
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

// The play's script laid out for printing, built at every deployment by
// scripts/build_script_pdf.py from the SAME script.json as the site (so never a
// draft from the editor: what has not been uploaded is not in it).
//
// On the Progress page and not on a home page, because it is up to the coordinator to
// decide which version is authoritative and when to distribute it. The file stays
// served at a public URL of the site: this is the same discretion as respo.html,
// not a lock.
//
// It wears the site's TILE, the one of the Editing page's "Mettre à jour le script de
// la pièce" and of the voices tile below: an arrow, then a sentence whose coloured
// group of words names the file. It was the solid `.btn` pill before, and side by side
// with the voices tile that reading did not hold: two cards in a row are two moves of
// the same visit, whereas a pill next to a card reads as the page's one button and the
// card as mere decoration. The look says what is true, that these are two files and
// two directions, and the DIRECTION is what the arrow and the verb carry.
// Everything visual therefore comes from `.upload-tile` (theme.css), whose name is now
// short of the truth: it is the shape of a FILE gesture, not of an upload. See the
// comment at the class.
//
// It is rendered as the `actions` of `PlayHeader`, and TINTED there (the page's navy,
// `.dash-script-tile` in dashboard.css), exactly as the Editing page's update tile is
// in its own header. Consequence worth knowing: the tile no longer sits beside the
// voices one, so nothing has to equalise their heights. It no longer depends on sitting
// inside the element that carries `page-dashboard` either, the page's colour being
// re-skinned onto `--accent` at `:root` and therefore readable anywhere in it.
//
// No seal here, unlike on the voices tile: there the mic designates the page the
// voices come from, and a seal on a file one DOWNLOADS would make two opposite
// gestures read under the same pill. The download arrow says everything, and it takes
// the place the seal holds on the neighbour.
//
// "the play to print" and not "the play's script": the Editing page's upload tile
// says "the play's script (JSON)", and two labels sharing their group of words could
// no longer be told apart except by the acronym. Yet PDF is the only one of the three
// (ZIP, JSON, PDF) a coordinator reads without thinking about it: the difference
// cannot be made to rest on the one they do not know.
// "to print" says the use, and the word "script" stays with the upload, where it
// designates the working file.
const SCRIPT_PDF_HREF = "data/script.pdf";

function ScriptPdfLink({ title }) {
  // The button is UNCONDITIONAL: the printable script is not an option of the
  // page, it is one of its two gestures, and it renders along with it.
  //
  // It started out otherwise, and the attempt is instructive: `ScriptPdfLink`
  // probed `data/script.pdf` with `HEAD` on mount and rendered nothing until the
  // response was in, on the grounds of `githubUploadUrl()`, which hides the
  // upload card rather than forging a 404. That cost two things. On the published
  // site, the coordinator's only download button arrived AFTER the page, so it pushed
  // the table downwards under their eyes at every opening; in dev, where the PDF
  // is gitignored, it never arrived at all, and the page did not show half of
  // what it has to show. The price paid for that was theoretical: a missing file
  // in production presupposes that the LaTeX install or the compilation failed
  // (build.yml's two steps are in `continue-on-error`), and a 404 named
  // "transport-de-femmes.pdf" can be diagnosed, whereas a button that does not
  // exist is not even looked for.
  // The file's production therefore follows the button, and not the other way
  // round: build.yml builds it before deploying, and in dev the middleware
  // downloads it from the published site on the first request (`ensureScriptPdf`
  // in vite.config.js), the PDF being nowhere in the repo.
  //
  // The slug's fallback is MANDATORY and is chosen per caller: "???" is a
  // non-empty title of which nothing remains after cleaning, and a character's
  // fallback (slugify's original use) makes no sense on a play's PDF. It comes
  // from the catalogue, like every downloaded file name.
  const name = slugify(title, t("dashboard.pdfSlug"));
  return (
    // `download` renames along the way: the coordinator gets "transport-de-femmes.pdf"
    // and not "script.pdf", which says nothing once in the downloads folder.
    <a
      className="upload-tile card lift-hover dash-script-tile"
      href={SCRIPT_PDF_HREF}
      download={`${name}.pdf`}
    >
      <DownloadIcon />
      {/* The same two spans as `UploadTile`'s body, the shared classes included: the
          arrow stands where its seal stands, then the label. Not the component itself,
          which is a link to GitHub in a new tab or a button, and neither of those is a
          download. */}
      <span className="upload-tile-text">
        <T
          k="dashboard.pdf"
          p={{
            play: (
              <span className="upload-tile-word page-dashboard">
                {/* Same shape as the voices tile: the format is a parameter of the
                    word, so its parentheses and the space before them stay in the
                    string. */}
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

// Characters × scenes grid: "recorded / total" in each cell, on a tinted background
// (`CellMark`). Acts and scene numbers carry a tick once their whole column is in
// (`HeadMark`), so a finished scene reads at a glance without counting the cells.
//
// A character's own total is a COLUMN, right after the names, and no longer a marker
// tucked in front of the name. It is the figure the coordinator acts on ("Claire, four
// of twelve"), so it deserves the same shape as the cells it sums up, and reading it
// down the page needs the ratios under one another rather than after names of every
// length. That is also why the names align RIGHT: they end against their own count
// instead of drifting away from it.
//
// The names AND that column are frozen (CSS), the rest scrolls inside the container: a
// play with fifteen scenes fits on no phone, and a lone "2/5" without its name says
// nothing. The scrolling container is therefore a named and focusable region: it
// contains no focusable element, so without `tabIndex` it could be walked neither
// by keyboard nor by screen reader.
function ProgressTable({ acts, scenes, rows }) {
  // The only thing the CSS cannot work out on its own: the width of the names column,
  // which the status column beside it needs as its `left` offset to freeze in turn.
  //
  // That column has NO width of its own (`width: 1%` in dashboard.css): it takes the
  // width of the longest name of the cast, and a play whose characters are called Anne
  // and Luc must not pay for a column cut for the longest name a phone could hold. So
  // the width is a result, read off the drawn table rather than decided in advance.
  //
  // A layout effect and not an effect: it runs before the first paint, so the fallback
  // written at the `left` (`0px`) is never seen. A `ResizeObserver` afterwards, because
  // that width moves without React: the window is resized, the language is switched on
  // a name that translates, the serif font arrives after the first paint. Writing the
  // value back cannot loop, `left` on a frozen cell changing no width; and an identical
  // number re-rendered nothing, React comparing state by value.
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
            {/* The corner is TWO cells and not one spanning cell: each of the two
                frozen columns has to carry its own `left` offset (see dashboard.css),
                and the first of the two halves is the element measured above, being the
                one cell of that column that is always there whatever the cast. */}
            <th className="dash-corner dash-corner-name" ref={nameCorner} />
            <th className="dash-corner dash-corner-status" />
            {acts.map((act) => (
              <th
                key={act.key}
                className={`dash-act ${statusClass(act.ok, act.total)}`}
                colSpan={act.span}
              >
                {/* The tick and the label are wrapped, in both header kinds: the cell
                    itself must stay a `table-cell` (a `display: flex` on a `th` is
                    re-wrapped in an anonymous cell by the table fixup, which costs a
                    frozen column its freezing and every header its rules), so the row
                    that lays the two side by side is an element INSIDE it. */}
                <span className="dash-head">
                  <HeadMark ok={act.ok} total={act.total} />
                  {act.title}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="dash-corner dash-corner-name" />
            {/* The one corner cell that is NOT silent, and it is silent on screen all
                the same: the status column has no visible title (44 px wide on a phone,
                and the ratios say what they are), so a screen reader reading a cell of
                it would hear the character's name and nothing about the column. An
                `aria-label` on the header cell of the last header row is what names it,
                the accessible name of a `th` being what the cells under it are
                announced with. The legend under the table says the same thing to
                whoever reads it with their eyes. */}
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
                {/* No `HeadMark` here, where the acts still carry one: the totals row
                    just below gives each scene its ratio and its tick, and a second
                    tick over the number would say the same thing twice, in a cell 44 px
                    wide on a phone. An act has no cell of its own in that row (it spans
                    several), so there the tick stays its only signal. */}
                {scene.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* The scenes' own totals, the row that mirrors the status column of the
              names: what the whole cast owes in that scene, in the same shape as one
              cell of the grid. It opens the body rather than closing it, for the same
              reason the status column comes right after the names and not at the far
              right: a summary one has to go looking for at the end of a table that
              scrolls both ways is a summary nobody reads.
              Where it crosses the two frozen columns it carries the EMPTY corner and not
              the play's own total: that cell would have been the one figure of the grid
              summing up two summaries at once, a number nobody comes here for, sitting
              in the corner the eye lands on first. The corner therefore simply grows by
              a row, and the grid keeps one silent block at its top left.
              The count comes from the scenes and not from `rows`, hence from every line
              of the play including those pointing at no character: it is the truth about
              a scene, and the gap between it and the sum of the characters is exactly
              what the orphans banner above the grid is for. */}
          <tr className="dash-totals">
            {/* Named for a screen reader and blank on screen, exactly like the header of
                the status column above and for the same reason: the row carries no title
                of its own, so its cells would be announced under the name of the scene
                and nothing else, indistinguishable from a character's. It is the FIRST
                cell that takes it, the one a row is announced by. */}
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
              {/* The name is wrapped so it can be truncated when room runs out
                  (the column is frozen, it takes room from the scenes); the
                  `title` then renders it in full. No `.dash-head` flex row around it
                  any more: the marker that used to sit beside the name is the status
                  column next door, and all that is left in the cell is the name. */}
              <th
                className={`dash-name ${statusClass(row.ok, row.total)}`}
                title={row.character.name}
              >
                <span className="dash-name-text truncate">{row.character.name}</span>
              </th>
              {/* The character's whole play, in the same shape as one of their cells:
                  the ratio over all the scenes, or the tick. */}
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
