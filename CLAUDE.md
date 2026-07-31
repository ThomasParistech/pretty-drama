# PrettyDrama Voices

Free tool for theatre troupes: "Italian style" rehearsal with the actors' real voices.
Static site (GitHub Pages) + Python/ffmpeg GitHub Action. No server.

**This file is a map plus the contracts that span files.** The reasoning behind any
single rule lives in a comment at the site it applies to, and those comments are
detailed on purpose: read them before changing something that looks odd. `git log -p
CLAUDE.md` has the long-form history.

## Writing rules

- **Repo is in English**: docs, comments, commit messages, workflows. README stays
  French (it is for the troupe). `locales/fr.js` values stay French: it is the catalogue.
- **UI is bilingual**, French default. **No visible string in a component**: all through
  `src/shared/locales/{fr,en}.js`.
- **Never use an em dash**, including in the English catalogue.
- "le responsable" is **"the coordinator"** in English, never "your coordinator". The
  token `respo` survives only in identifiers and filenames (`respo.html`, `page.respo.*`).

## Layout

Each play is a silo: its own pages, data, clips, upload zone and journal.

```
index.html  respo.html      ROOT pages (chooser / management), Vite entries
pages/*.html                the 7 templates of a play, never served as-is
plays/<id>/
  *.html                    GENERATED at build from pages/, gitignored
  data/script.json          source of truth, committed, carries the play id
  data/{clips,history,manifest}.json   committed
  data/script.pdf           derived, gitignored
  clips/<lineId>.mp3        committed
uploads/<id>/               that play's upload zone
uploads/                    root: the only play-CREATION channel
data/plays.json             play index, derived, committed
data/history.json           journal for uploads no play claimed
```

- **Inside a play no path changes** (`fetch("data/manifest.json")`, `./rehearsal.html`).
  Only these know about `plays/<id>/`: `chooserHref`, `playHref` (`shared/pages.js`),
  `githubRepoUrl`, `githubPlayFolderUrl` (`shared/data.js`), `vite.config.js`.
- No `?play=<slug>`: links are bare relative hrefs, so the param dies on every nav.
- `plays/.gitkeep` and `uploads/.gitkeep` are tracked: `uploads.yml` runs `git add -A
  plays data uploads`, and `git add` of a missing path fails with code 128.
- **The upload FOLDER routes, the content verifies.** A file belongs to the zone it
  landed in, so a corrupt ZIP still reaches its play's journal; the id inside only
  rejects a file dropped in another play's zone.
- A play is born from a script upload into an orphan zone. Deleting one needs a commit,
  so it happens by hand on GitHub. Migrating a fork:
  `python3 scripts/migrate_to_plays.py <id>`.

## Architecture

React + Vite, multi-page (no SPA), `base: "./"`, relative paths throughout. The 2 root
pages are literal Vite entries; the 7 `pages/` templates are written into each play's
folder by `writePlayPages` (`vite.config.js`) at CONFIG time. **Creating a play while the
dev server runs requires a restart.**

Two workflows, airtight roles:
- `uploads.yml` (push touching `uploads/**`) processes uploads, writes the journal,
  commits, **then calls `build.yml`**.
- `build.yml` (any other push, dispatch, `workflow_call`) builds and deploys Pages,
  **never writes to the repo**.

Do not break: the explicit call (a `GITHUB_TOKEN` push triggers no workflow); **distinct
`concurrency` groups** (a called workflow sharing its caller's group is killed as a
deadlock); `paths-ignore: uploads/**` in `build.yml`; its checkout on
`ref: github.ref_name`, not the run SHA.

**Neither reports to the coordinator on GitHub** (no issue, no README status). The only
feedback channel is the Dashboard's upload journal, so a failed run goes unreported and
the commit precedes the deploy.

## Commands

- `npm run dev` (middleware serves repo data with real 404s), `npm start`,
  `npm run build`.
- Manual prod check: `npm run build && cp -r data dist/data && rsync -a
  --exclude='*.html' plays/ dist/plays/ && npm run preview`. Excluding `.html` is
  mandatory: worktree ones are templates, `dist/` ones have hashed asset URLs.
- `python3 -m unittest discover -s scripts/tests`
- `npm test` = `node --test` **with no argument** (Node 22+ reads a positional as a
  file; bare, the default patterns work from Node 20 to 24). **Pure** front logic only,
  no test dependency, no React rendering, so DOM work is checked by hand.
- Test a page without building: hand-edit `plays/<id>/data/manifest.json`, `npm run dev`.
  Populate a journal: `cp scripts/tests/history-example.json
  plays/<id>/data/history.json && python3 scripts/build_manifest.py`.

## Pipeline

`script.json` (from the Editor, promoted through the upload zone) and a Recorder ZIP
(`{play: id, clips: {lineId: raw text}}` plus one `{lineId}.{ext}` per line) both land in
`uploads/<id>/`. Then, in order:

1. `process_uploads.py`: transcodes voices (ffmpeg, mono 64 kbps mp3), merge
   **all-or-nothing per ZIP**; validates and promotes a script **verbatim**; deletes each
   file even on error; writes `uploads_result.json`.
2. `update_history.py`: one entry per affected play plus the root journal, one timestamp
   per run. Written by `uploads.yml` only, so a journal holds only uploads.
3. `build_manifest.py`: joins `script.json` and `clips.json` into `manifest.json`, **the
   only file pages read**. Status per line `ok` / `perime` / `manquant`. A play whose
   script will not parse is **skipped with its manifest untouched**.
4. `build_plays_index.py`: `data/plays.json`, from FOLDERS not manifests, ordered by id
   (the pages sort by title with `Intl.Collator`).
5. `build_script_pdf.py`: `data/script.pdf`, gitignored, built by `build.yml` only, and
   it **cannot fail the deploy**.

## Cross-file contracts

`scripts/tests/test_contracts.py` enforces these by READING both sources, never by
copying expected values. Breaking a pair breaks CI.

| Contract | Sides |
| --- | --- |
| `^[0-9a-zA-Z-]{1,64}$` | `SAFE_ID` (`editor/reducer.js`), `LINE_ID_PATTERN` (`process_uploads.py`) |
| `^[a-z0-9][a-z0-9-]{0,63}$` | `SAFE_PLAY_ID` (`shared/plays.js`), `PLAY_ID_PATTERN` (`common.py`) |
| Act/scene labels, roman numerals | `shared/structureLabels.js`, `build_script_pdf.py` |
| Vite entries = root `.html` files | `vite.config.js` |
| ZIP format | `downloadZip` (`recorder/App.jsx`), `parse_manifest` (`process_uploads.py`) |
| No page CSS redefines `--header-*`; no header rule consumes `--accent` / `--font-serif` / `--shadow` | `theme.css` vs `editor.css` |
| Every `PAGES` key has its two seal variables | `shared/pages.js`, `theme.css` |
| Colour is only validated as `#rrggbb`, never repaired | `build_manifest.py` |
| i18n: every `t()`/`<T>` key exists in both catalogues, no key unused, no visible literal in `src/` | all of `src/` |

## Invariants

- **Text normalization has one implementation**, `scripts/normalize.py`, called only
  from `build_manifest.compute_status`. The browser ships **raw** text. The folding in
  `editor/search.js` is not this.
- **Line ids are never recycled** (they name the mp3s). **Play ids are never re-minted**
  (they name a folder and a URL). Validate a play id **before** building a path.
- **`sanitize_script` (Python) tolerantly mirrors `sanitizeScript` (JS)**: malformed
  input is ignored, never a crash. Three deliberate asymmetries: JS re-mints bad or
  duplicate ids, Python only requires a non-empty string; JS floors the structure,
  Python never; the play id is validated identically on both sides. Everything else must
  agree, including that a character with no real name is dropped by both.
- **`sanitizeScript` never moves a line between characters.** On a duplicate id the
  first holder keeps id and lines, the second gets a fresh id and none.
- **A no-op must not create a new state** (`updateScene`, `scriptReducer`, and
  `history.js` comparing by identity).
- **`validate_script` is stricter than `sanitize_script`** on purpose: a candidate with
  no lines never replaces a play that has some.
- **Hostile uploads**: real size caps (ZIP headers lie), member names by fullmatch, one
  broken file never blocking the others.
- **Takes live in memory only**, one per line, `URL.revokeObjectURL` on replacement.
- **No local persistence of work** (rail width, Stats slider, takes, script being
  edited). Sole exception `prettydrama.lang`.
- **No visible string in a component**, down to downloaded filenames.
- **No emoji in the UI**: SVG in `shared/icons.jsx`, font-sized, `currentColor`.
  Exceptions are the monochrome characters that follow the font (`✓ ✕ ↓ ▼ ⠿ ?`) and
  `FlagIcon`, which is drawn rather than the flag emoji.
- **The journal is the project's only error channel.** A rejected file is reported
  nowhere else, which is why it is capped, says it is capped, and renders even when empty.

## i18n

Pure engine `shared/i18n.js`, environment face `shared/locale.js` (reads `?lang=`, then
the stored choice, then the browser). **A module singleton, not a React context**:
multi-page site, and switching language navigates.

- Markup inside a sentence goes through `<T k="…" p={{ … }} />`, the JSX becoming a
  parameter. Never split a sentence into fragments: it freezes French word order.
- **No hand-rolled plurals**: `{ one, other }` with `t(key, { count })`. Numeric
  parameters are formatted by the engine, not at the call site.
- **French typography lives inside the strings** (non-breaking spaces, guillemets), not
  in the JSX. `parity.test.js` checks they are present in `fr.js` and absent from `en.js`.
- A label named twice is written once, the second interpolating the first's key.
- **Reader locale vs PLAY language** (`script.language`): `shared/structureLabels.js`
  follows the reader on the four navigating pages and the play's language in the Editor,
  where you shape the document the PDF prints. Hence `t` is a **parameter** of
  `actLabel`/`sceneLabel`; the language descends as a **string**, never the translator.
- A module under `node --test` never imports `locale.js` (it reads URL, storage and
  navigator on import): it takes `t` as an argument or returns a CODE the page translates.

## File map

| Area | Files |
| --- | --- |
| Root pages | `src/chooser/` (one component, `manage` flag; no link from chooser to management) |
| A play's 2 home pages | `src/home/App.jsx` + `ACTOR_CARDS`/`RESPO_CARDS` (`shared/pages.js`); the actor list omits the editor |
| Headers | `shared/PlayHeader.jsx` (five pages), `shared/PageHeader.jsx` (manifest-less, via `PageState`), `shared/HomeLink.jsx` (at the header foot, not the top row) |
| Shared look | `shared/theme.css`: `.dialogue-card`, `.page-shell`/`.page-scroll`, `.truncate`, `.btn-tip`, `.lift-hover`, `.page-notice`, `.confirm-quote`, `.flag-icon`, `--shadow-float` |
| Rehearsal / Recorder | `shared/ProgressBar.jsx`, `shared/useScrollToActiveCard.js`, `recorder/useRecorder.js`, `downloadZip` (`recorder/App.jsx`) |
| Colours | `shared/characterColors.js` (Tableau 10, stored per character; lightness is what distinguishes). Filling has one implementation: the front's `assignColors` |
| Stats | `src/stats/stats.js` (pure, tested) does all the maths; `App.jsx` only draws |
| Dashboard | `dashboard/App.jsx`: `ProgressTable`, `Journal`, `githubUploadUrl` (`shared/data.js`) |
| Editor | `editor/EditorRail.jsx` (one section open at a time), `StructurePanel` (the plan; only the play has a name, acts and scenes derive labels from rank), `history.js` (wraps a pure `scriptReducer`; `dirty = present !== saved`), `search.js` (pure; no regex; length-preserving folding) |
| Guards | `shared/LeaveGuard.jsx` (capture-phase clicks + `beforeunload`), `shared/ConfirmModal.jsx` (portal, replaces `window.confirm`) |
| Python shared | `scripts/common.py`: `REPO_ROOT`, `write_json`, `load_json`, and the play layout helpers |
| Dev server | `serveRepoData` and `ensureScriptPdf` in `vite.config.js` |

## Traps

Each has a comment explaining it at the site. Do not "fix" one without reading that.

- The GitHub URLs name `main` (`BRANCH`, `shared/data.js`). `/upload/<branch>` needs a
  branch that exists and fails onto the repo home page, never a 404; `/tree/` aliases
  `master`, which is what hid the mistake.
- Collapse tracks are `minmax(0, 1fr)` / `minmax(0, 0fr)`, never `1fr`/`0fr`.
- `min-height: 0` on `.play-header-settings-inner` and `.editor-rail-body`.
- `.editor-layout` states `grid-template-rows: minmax(0, 1fr)` explicitly.
- The rail clips with `overflow: clip`, never `hidden`, and takes no `position`/`z-index`.
- `flex: none` on `.editor-rail-panel`; `.character-list` is `flex: 0 1 auto`.
- `.page-shell` sits on an element, never on `body`.
- The Dashboard table is `border-collapse: separate`; the frozen corner takes `--paper`;
  the top rule is not applied to every `.dash-name`.
- Nothing `fixed` inside `container: ed-column`.
- Tooltips of buttons that disable go on a `.btn-tip` wrapper; `select:disabled` needs
  an explicit rule.
- Stats block width rounds to a whole multiple of the column count, with a
  one-pixel-per-square `min-width` floor.
- Scroll-follow clamps its target to the scroller's real range and has a second exit;
  the seek-drag flag is consumed; `onPointerMove` repeats `scrub`'s guard.
- `dragging` and `resizing` drop transitions mid-drag.
- `transition` stays on each surface, never hoisted into `.lift-hover`.
- The seal-shrinking mobile rule never targets bare `.page-mark`.
- `if (e.defaultPrevented) return;` in the search shortcut handler.
- `--rec-*` do not derive from `--warn`/`--ok` (measured AA failure on the pink card).
- Checkbox rows stay `flex-wrap`, never a fixed column count.
- `mountPage.jsx` imports `theme.css`, and that order matters: import it before
  `App.jsx` in every entry point.
- Each CSS file neutralizes its own animations in its own
  `prefers-reduced-motion` block.

## Known gap: Action error strings

The failure reasons `scripts/` writes into `history.json` are still French. They are
DATA rendered by the bilingual Journal, so translating them would just swap one
hardcoded language for another and a French coordinator would read English. The fix is
emitting error CODES the front translates, as `useRecorder.js` does with `"mic"`. The
Python tests assert on the current strings, so this is a coordinated change, not a
find-and-replace.
