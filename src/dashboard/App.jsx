import React from "react";
import PageMark from "../shared/PageMark.jsx";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageState from "../shared/PageState.jsx";
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
    }));
}

// A row's detail, optional: the badge and the status already say the essential.
// A successful script therefore has nothing to add (its file name says nothing);
// a voices file names its ZIP and counts its lines; a failure names the file and
// gives its reason, the only text that comes from the Action.
function detailOf(row) {
  if (row.error) {
    return (
      <T
        k="dashboard.journal.detailError"
        p={{ file: <code>{row.file}</code>, reason: row.error }}
      />
    );
  }
  if (row.kind === "script") return null;
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

// A single status scale for the whole grid: cells, names, scenes, acts.
function statusClass(ok, total) {
  if (total === 0) return "empty";
  return ok < total ? "todo" : "done";
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
          card is right below, it reads on its own). */}
      <PlayHeader page="dashboard" title={manifest.title || t("common.untitledPlay")} />
      <div className="container">
        <div className="dash-actions">
          <UploadLinks playId={manifest.id} />
          <ScriptPdfLink title={manifest.title || ""} />
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
// Recording page's mic for voices, the Editing page's quill for the script. They
// are the same two seals as the upload button at the top of the page, so the
// association reads without a legend. A file that is neither a ZIP nor a script is
// claimed by no page: neutral pill, without a page colour.
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

// The coordinator's daily gesture: dropping a file they received (a ZIP of voices) or
// produced (the script.json from the Editing page) into the GitHub upload screen
// of THEIR repo. A single button because there is only one folder, `uploads/`:
// the Action deduces the type from the extension. Two cards towards the same URL
// would read as two different destinations.
// What one uploads is therefore read in the label, not in the choice of button:
// the two seals frame the text (the Recording page's mic on the left, the Editing
// page's quill on the right) and both words carry their page's colour.
// "Upload" stays in black: it is the gesture, it belongs to neither of the two.
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
  // No container here: the page's two cards share `.dash-actions`, which aligns
  // them to the same width (cf. dashboard.css).
  return (
    <a className="dash-upload card lift-hover" href={url} target="_blank" rel="noreferrer">
      <PageMark page="recorder" className="dash-upload-mark" />
      {/* The two coloured words are PARAMETERS: each carries its page's colour, and
          the sentence keeps its own language's word order. The old JSX was six
          fragments inside four nested spans, where the order mattered. */}
      <span className="dash-upload-text">
        <T
          k="dashboard.upload"
          p={{
            voices: (
              <span className="dash-upload-word page-recorder">
                {t("dashboard.upload.voices")}{" "}
                <span className="dash-upload-format">(ZIP)</span>
              </span>
            ),
            script: (
              <span className="dash-upload-word page-editor">
                {t("dashboard.upload.script")}{" "}
                <span className="dash-upload-format">(JSON)</span>
              </span>
            ),
          }}
        />
      </span>
      <PageMark page="editor" className="dash-upload-mark" />
    </a>
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
// `.btn.primary`, the site's download button: the same as the ZIP of takes
// (Recording page) and as the script (Editing page). A download presents itself
// the same way everywhere, and the flat accent separates it clearly from the
// upload card right above, which is the page's other gesture (going to upload on
// GitHub) and has no reason to look like it.
//
// No seal here, unlike on the upload card: there the quill designates the
// script.json one UPLOADS, taking it back for a PDF one DOWNLOADS would make two
// opposite gestures read under the same pill. The download arrow says everything.
//
// "the play to print" and not "the play's script": the upload card right above
// already says "the play's script (JSON)", and two labels sharing their group of
// words could no longer be told apart except by the acronym. Yet PDF is the only
// one of the three (ZIP, JSON, PDF) a coordinator reads without thinking about it: the
// difference cannot be made to rest on the one they do not know.
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
      className="btn primary dash-script-btn lift-hover"
      href={SCRIPT_PDF_HREF}
      download={`${name}.pdf`}
    >
      <DownloadIcon />
      <span>
        <T
          k="dashboard.pdf"
          p={{ format: <span className="dash-script-format">(PDF)</span> }}
        />
      </span>
    </a>
  );
}

// Characters × scenes grid: "recorded / total" ratio in each cell. Acts,
// scene numbers and character names carry the same amber/green tint as the
// cells, so a whole row, column or act reads as done at a glance.
//
// The names column is frozen (CSS), the rest scrolls inside the container: a play
// with fifteen scenes fits on no phone, and a "2/5" cell without its name says
// nothing. The scrolling container is therefore a named and focusable region: it
// contains no focusable element, so without `tabIndex` it could be walked neither
// by keyboard nor by screen reader.
function ProgressTable({ acts, scenes, rows }) {
  return (
    <div
      className="dash-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={t("dashboard.table")}
    >
      <table className="dash-table">
        <thead>
          <tr>
            <th className="dash-corner" />
            {acts.map((act) => (
              <th
                key={act.key}
                className={`dash-act ${statusClass(act.ok, act.total)}`}
                colSpan={act.span}
              >
                {act.title}
              </th>
            ))}
          </tr>
          <tr>
            <th className="dash-corner" />
            {scenes.map((scene) => (
              <th
                key={scene.key}
                title={t("common.actScene", { act: scene.act, scene: scene.title })}
                className={`dash-scene ${statusClass(scene.ok, scene.total)}`}
              >
                {scene.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.character.id}>
              {/* The name is wrapped so it can be truncated when room runs out
                  (the column is frozen, it takes room from the scenes); the
                  `title` then renders it in full. */}
              <th
                className={`dash-name ${statusClass(row.ok, row.total)}`}
                title={row.character.name}
              >
                <span className="dash-name-text truncate">{row.character.name}</span>
              </th>
              {row.cells.map((cell, i) =>
                // No line in this scene: empty cell, without a marker.
                cell.total === 0 ? (
                  <td key={scenes[i].key} className="empty" />
                ) : (
                  <td key={scenes[i].key} className={statusClass(cell.ok, cell.total)}>
                    {/* Two elements and not one string: the two numbers do not
                        have the same weight (the recorded one stands out from the
                        total). Each goes through `fmt.number`, the formatter for
                        numbers written alone, outside any sentence.
                        The slash STAYS in the JSX, and that is deliberate even though
                        a fraction slash is normally a fact of language kept in the
                        string (`recorder.lineCounter` is "{n}/{total}" in both
                        catalogues, French included, which is what settles it): the two
                        numbers have to be two elements for their weights, so routing
                        the separator through the catalogue would mean a `<T>` per CELL,
                        that is several hundred on a play of twenty characters and forty
                        scenes, in exchange for a character both languages write the
                        same way. */}
                    <span className="dash-cell-ok">{fmt.number(cell.ok)}</span>
                    <span className="dash-cell-total">/{fmt.number(cell.total)}</span>
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
