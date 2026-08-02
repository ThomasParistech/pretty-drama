# PrettyDrama Voices

Free tool for theatre troupes: "Italian style" rehearsal with the actors' real voices.
Static site (GitHub Pages) + Python/ffmpeg GitHub Action. No server.

**A map plus the contracts that span files.** The reason for a single rule lives in a
comment at the site it applies to. `git log -p CLAUDE.md` has the long-form history.

## Writing rules

- **Repo is in English**: docs, comments, commit messages, workflows. README stays
  French (it is for the troupe); `locales/fr.js` values stay French, it is the catalogue.
- **UI is bilingual**, French default. **No visible string in a component**: everything
  through `src/shared/locales/{fr,en}.js`.
- **Never use an em dash**, including in the English catalogue.
- "le responsable" is **"the coordinator"**, never "your coordinator". The token `respo`
  survives only in identifiers and filenames.

## Layout

Each play is a silo: its own pages, data, clips, upload zone and journal.

```
index.html  respo.html      ROOT pages (chooser / management), Vite entries
pages/*.html                the 7 templates of a play, never served as-is
plays/<id>/
  *.html                    GENERATED at build from pages/, gitignored
  data/script.json          source of truth, committed, carries the play id
  data/{clips,history,manifest}.json   committed
  data/script.pdf           derived, COMMITTED (typeset on promotion, not on deploy)
  clips/<lineId>.mp3        committed
plays/dev/                  the site's TEST BENCH, a play like the others but unlisted
uploads/<id>/               that play's upload zone
uploads/_new-play/          play-CREATION zone: file = title, `---`, note
uploads/                    root: safety net for a script naming its own play
data/plays.json             play index, derived, committed
data/history.json           journal for uploads no play claimed
```

- **Inside a play no path changes** (`fetch("data/manifest.json")`, `./rehearsal.html`).
  Only `chooserHref`/`playHref` (`shared/pages.js`), `githubRepoUrl` (`shared/data.js`)
  and `vite.config.js` know about `plays/<id>/`.
- No `?play=<slug>`: links are bare relative hrefs, so the param dies on every nav.
- `plays/.gitkeep` and `uploads/.gitkeep` are tracked: `git add` of a missing path exits 128.
- **The upload FOLDER routes, the content verifies.** A corrupt ZIP still reaches its
  play's journal; the id inside only rejects a file dropped in another play's zone.
- A play is born in `uploads/_new-play/`: the site cannot commit, so creating one is an
  upload. **There the FOLDER is the whole instruction**: every file is one title, name and
  extension ignored, because the coordinator commits through GitHub's editor where both
  are editable fields. Content = title, `TITLE_SEPARATOR` (`---`), then a note the Action
  never reads. `_new-play` is outside `SAFE_PLAY_ID` (leading `_`), so it cannot collide.
  Deleting a play needs a commit, so it is done by hand on GitHub. Migrating a fork:
  `python3 scripts/migrate_to_plays.py <id>`.
- **`plays/dev/` is the test bench**, the ONLY play missing from `data/plays.json`
  (`listed_play_ids`), reachable only by typing `plays/dev/rehearsal.html`. Otherwise an
  ordinary play: same pipeline, deployed, own upload zone. It exists so a page can be
  tried on real data without writing test uploads into the troupe's journal, which every
  fork inherits. Its script covers on purpose an empty scene, a line with no text, a
  character with no colour and one with no line, an overflowing tirade, the three
  recording states, a stale line next to one whose apostrophe alone changed. Clips are
  tones, one pitch per character. `DEV_PLAY_ID` is an address no troupe can take.

## Architecture

React + Vite, multi-page (no SPA), `base: "./"`, relative paths throughout. The 2 root
pages are literal Vite entries; the 7 `pages/` templates are written into each play's
folder by `writePlayPages` (`vite.config.js`) at CONFIG time. **Creating a play while the
dev server runs requires a restart.**

Two workflows, airtight roles:
- `uploads.yml` (push touching `uploads/**`) processes uploads, writes the journal,
  commits, **then calls `build.yml`**.
- `build.yml` (any other push, dispatch, `workflow_call`) builds and deploys Pages, and
  **writes nothing to the repo but the site's address in the README**. No journal, ever.

Do not break: the explicit call (a `GITHUB_TOKEN` push triggers no workflow); **distinct
`concurrency` groups** (a called workflow sharing its caller's group is killed as a
deadlock); `paths-ignore: uploads/**` in `build.yml`; its checkout on `ref:
github.ref_name`, not the run SHA, **in both jobs that check out**.

**The site's address is not knowable before a deployment** (`<owner>.github.io/<repo>/`,
both halves change when the template is copied), so the README ships its site links on
`example.com` placeholders. Each carries an invisible `<!-- ref: SITE_… -->` naming the
PAGE it wants; the `readme` job feeds `deploy`'s `page_url` to
`scripts/ci/update_readme_urls.py`, which rewrites the target of every ref in `PATHS`
(`SITE_HOME` -> ``, `SITE_RESPO` -> `respo.html`) and commits only if something changed.
**The README's French is never generated**: only targets inside the parentheses change.

The ref names the DESTINATION, so idempotence is arithmetic and there is no memory to
keep in step. `SITE_` is the claimed namespace; a `SITE_…` ref absent from `PATHS` stops
the run rather than silently never updating. **Only pages present in EVERY copy belong in
`PATHS`** (this prose is never regenerated, so a page a fork can delete would leave a 404
in every inherited README). `test_readme.py` holds `PATHS` and the README to the same set
of refs, both directions. The `build` job prints the same two addresses into
`$GITHUB_STEP_SUMMARY`, which must not depend on the README step having worked.

The `readme` job is separate so `build` stays read-only (hence `uploads.yml`'s `site` job
must delegate `contents: write`: a called workflow never gets more than its caller), and
`continue-on-error` so a convenience cannot redden a run that PUBLISHED. The address has
two sources, `page_url` then the Pages API, because losing it leaves the links on
`example.com` until another deployment. A fork that removes the links exits 0.

**Any link into GitHub the README carries is RELATIVE, `../../…`.** A root README renders
at `/<owner>/<repo>/blob/<branch>/README.md`, so `../../x` names the reader's own repo
without knowing either half of the address; an absolute one sends every troupe to the
template. Only routes GitHub really serves: `/deployments/<environment>` is NOT one
(measured 404; use `/deployments/activity_log?environment=…`), and a relative link at a
dead path renders exactly like a live one, which no test can reach from CI.
`test_readme.py` checks the depth, the absence of a branch name, and that no absolute
link names a repository sub-page.

**The install is the only moment the coordinator is on GitHub**, so it is the only moment
a workflow speaks to them there, in ONE channel, `$GITHUB_STEP_SUMMARY`: `pages-check`
when publishing is off, and the two addresses once the deploy succeeded. Outside the
install neither workflow reports to them (no issue, no README status): the only feedback
channel is the Dashboard's upload journal, so a failed run goes unreported and the commit
precedes the deploy.

**One exception, the one the journal cannot cover**: publishing off means the journal
sits on a site that does not exist. Hence the `pages-check` job. **No workflow can switch
Pages on** (needs `administration:write`, which is why `enablement:` is deliberately not
set on `configure-pages`), so it checks: Pages on AND `build_type == "workflow"`, since
publishing from a branch serves the repo root and answers a blank page rather than a 404.
When off it writes the fix into `$GITHUB_STEP_SUMMARY`, raises an `::error::` with the
same fix in one line, and **fails**; `build` needs it, so it shows as skipped. A separate
job so it fails in four seconds and GitHub names it in the e-mail.

**Failing is the point, and the push that CREATES main is what pays for it.** Both
workflows skip that push (`if: github.event.created != true`). A fresh copy triggers both
yet has nothing to publish and nothing to process: README step 2 has not happened, so
failing would mail an English "Run failed" to someone doing as told, and succeeding would
green-tick a repo with no site. `pages-check` cannot skip itself (its answer exists only
at runtime), hence the job-level `if`. Every run that DOES reach the check belongs to a
repo whose install is over, where a publish that cannot publish is a real problem.

**`workflow_dispatch` on `build.yml` is the republish button**, named as such in the
README: step 3 of the install (switching Pages on fires no event) and the answer to a
site that looks stale.

## Commands

- `npm run dev` (middleware serves repo data with real 404s), `npm start`, `npm run build`.
- Manual prod check: `npm run build && cp -r data dist/data && rsync -a
  --exclude='*.html' plays/ dist/plays/ && npm run preview`. Excluding `.html` is
  mandatory: worktree ones are templates, `dist/` ones have hashed asset URLs.
- `python3 -m unittest discover -s scripts/tests`
- `npm test` = `node --test` **with no argument** (Node 22+ reads a positional as a file).
  **Pure** front logic only, no test dependency, no React rendering, so DOM work is
  checked by hand.
- Try a page: the test bench. Both servers print it next to Chooser and Manage
  (`printHomeUrls`), `npm start` opens it as a third tab, both only if `plays/dev/` is
  still there. Edit its `data/script.json` or `data/history.json`, `python3
  scripts/build_manifest.py`, reload.

## Pipeline

`script.json` (from the Editor, promoted through the upload zone) and a Recorder ZIP
(`{play: id, clips: {lineId: raw text}}` plus one `{lineId}.{ext}` per line) both land in
`uploads/<id>/`. A play is CREATED by a file in `uploads/_new-play/`. Then, in order:

1. `process_uploads.py`: transcodes voices (ffmpeg, mono 64 kbps mp3), merge
   **all-or-nothing per ZIP**; validates and promotes a script **verbatim**; creates a
   play from a title (`read_title` strict, `mint_play_id` names it, a taken address is
   refused before anything is written, `promote_script` is the single door to
   `script.json`), filed as kind `script` by the ZONE since `kind_of` never sees it;
   deletes each file even on error; writes `uploads_result.json`. A refused creation
   reports to the ROOT journal.
   `work()` returns **the journal fields of its kind** and `record` merges them blind:
   `clips` for a ZIP, `changes` for a script. Those changes are `script_diff.py` diffing
   the promotion **by line id** (added / removed / edited / reassigned, then the cast,
   then `title` and `language`), empty values omitted. `promote_script` is the only place
   holding both versions AND knowing whether there was a script at that address, which it
   hands down as `created` (a birth reports its SIZE only: a title is initial state).
   **An empty `changes` renders as "aucun changement", so it must never be a lie**:
   `other` fires when the two SANITIZED documents still differ and nothing else did. It is
   a floor, not an audit, so it only ever speaks alone.
2. `update_history.py`: one entry per affected play plus the root journal, one timestamp
   per run. Written by `uploads.yml` only, so a journal holds only uploads.
3. `build_manifest.py`: joins `script.json` and `clips.json` into `manifest.json`, **the
   only file pages read**. Status per line `ok` / `perime` / `manquant`. A play whose
   script will not parse is **skipped with its manifest untouched**.
4. `build_plays_index.py`: `data/plays.json`, from FOLDERS not manifests, ordered by id
   (pages sort by title with `Intl.Collator`). Carries cast size, length in words
   (`count_words`, twin of `countWords` in `stats.js`), lines and recorded.
5. `build_script_pdf.py`: `data/script.pdf`, **committed**, the only derived file
   `build.yml` does not rebuild. `uploads.yml` typesets it on the runs that promoted a
   script and for those plays only (`git status --porcelain -uall` names them, so a
   byte-identical promotion typesets nothing), deleting the old PDF FIRST so a failed
   typesetting commits an absence rather than a document that disagrees with the play. It
   **cannot fail the run**. Committed because it is the one derived file whose rebuild
   costs 45 s of apt. **The counterpart**: a `script.json` edited by hand IN THE REPO
   keeps its old PDF until the next upload. Written at all four sites (`.gitignore`,
   `build.yml`, `uploads.yml`, `build_script_pdf.py`).

## Cross-file contracts

`scripts/tests/test_contracts.py` enforces these by READING both sources, never by
copying expected values. Breaking a pair breaks CI.

| Contract | Sides |
| --- | --- |
| `^[0-9a-zA-Z-]{1,64}$` | `SAFE_ID` (`editor/reducer.js`), `LINE_ID_PATTERN` (`process_uploads.py`) |
| `^[a-z0-9][a-z0-9-]{0,63}$` | `SAFE_PLAY_ID` (`shared/plays.js`), `PLAY_ID_PATTERN` (`common.py`) |
| Title -> play id, through `scripts/tests/play-id-cases.json` (read by both suites) | `mintPlayId` (`shared/plays.js`) announces, `mint_play_id` (`common.py`) decides |
| Fields of a brand new play | `EMPTY_SCRIPT` (`editor/reducer.js`), `new_play_script` (`common.py`) |
| Creation zone `_new-play`, never a valid play id | `NEW_PLAY_DIR` (`shared/data.js`), `NEW_PLAY_DIR` (`process_uploads.py`) |
| The test bench `dev`, a real play id no title may take | `DEV_PLAY_ID` (`shared/plays.js`) refuses the title, `DEV_PLAY_ID` (`common.py`) hides the play |
| `---` closes the title and opens the note | `TITLE_SEPARATOR` (`shared/data.js`) writes it, (`process_uploads.py`) reads it |
| Act/scene labels, roman numerals | `shared/structureLabels.js`, `build_script_pdf.py` |
| Vite entries = root `.html` files | `vite.config.js` |
| ZIP format | `downloadZip` (`recorder/App.jsx`), `parse_manifest` (`process_uploads.py`) |
| No page CSS redefines `--header-*`; no header rule consumes `--accent` / `--font-serif` / `--shadow` | `theme.css` vs `editor.css` |
| Every `PAGES` key has its two seal variables | `shared/pages.js`, `theme.css` |
| Colour is only validated as `#rrggbb`, never repaired | `build_manifest.py` |
| i18n: every `t()`/`<T>` key exists in both catalogues, no key unused, no visible literal in `src/` | all of `src/` |
| The fields of a script promotion | `script_changes` (`script_diff.py`) writes them, `CHANGE_LABEL_KEYS` (`dashboard/App.jsx`) has a sentence for each, in display order. Renamed on one side, the change silently stops showing. A field's VALUE says whether it is a count (`{count}`) or a flag |

## Invariants

- **Text normalization has one implementation**, `scripts/normalize.py`, with exactly two
  callers: `build_manifest.compute_status` (is a recording stale) and
  `script_diff.script_changes` (was a line really edited). Same rule for both on purpose:
  the journal's "edited" count is read as "these have to be recorded again", so a curly
  apostrophe must not appear in it while the grid keeps the line green. The browser ships
  **raw** text. The folding in `editor/search.js` is not this.
- **Line ids are never recycled** (they name the mp3s). **Play ids are never re-minted**
  (they name a folder and a URL). Validate a play id **before** building a path. A play id
  is minted in **one** place, `mint_play_id`; the front's `mintPlayId` only announces it.
- **`sanitize_script` (Python) tolerantly mirrors `sanitizeScript` (JS)**: malformed input
  is ignored, never a crash. Three deliberate asymmetries: JS re-mints bad or duplicate
  ids, Python only requires a non-empty string; JS floors the structure, Python never; the
  play id is validated identically. Everything else must agree, including that a character
  with no real name is dropped by both.
- **`sanitizeScript` never moves a line between characters.** On a duplicate id the first
  holder keeps id and lines, the second gets a fresh id and none.
- **A no-op must not create a new state** (`updateScene`, `scriptReducer`, and
  `history.js` comparing by identity).
- **`validate_script` is stricter than `sanitize_script`** on purpose: a candidate with no
  lines never replaces a play that has some.
- **Hostile uploads**: real size caps (ZIP headers lie), member names by fullmatch, one
  broken file never blocking the others.
- **Takes live in memory only**, one per line, `URL.revokeObjectURL` on replacement.
- **No local persistence of work** (rail width, Stats slider, takes, script being edited).
  Sole exception `prettydrama.lang`.
- **No visible string in a component**, down to downloaded filenames.
- **No emoji in the UI**: SVG in `shared/icons.jsx`, font-sized, `currentColor`.
  Exceptions are the monochrome characters that follow the font (`✓ ✕ ↓ ▼ ⠿ ?`) and
  `FlagIcon`, which is drawn.
- **The journal is the project's only error channel.** A rejected file is reported nowhere
  else, which is why it is capped, says it is capped, and renders even when empty.

## i18n

Pure engine `shared/i18n.js`, environment face `shared/locale.js` (reads `?lang=`, then
the stored choice, then the browser). **A module singleton, not a React context**:
multi-page site, and switching language navigates.

- Markup inside a sentence goes through `<T k="…" p={{ … }} />`, the JSX becoming a
  parameter. Never split a sentence into fragments: it freezes French word order.
- **No hand-rolled plurals**: `{ one, other }` with `t(key, { count })`. Numeric
  parameters are formatted by the engine, not at the call site.
- **French typography lives inside the strings** (non-breaking spaces, guillemets), not in
  the JSX. `parity.test.js` checks they are present in `fr.js` and absent from `en.js`.
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
| Root pages | `src/chooser/` (one component, `manage` flag; no link from chooser to management). One `PlayCard` for both, the whole card a link, `manage` adding the recorded share. `NewPlay.jsx`: `NewPlayTile` ends the GRID (dashed, `aria-haspopup`) and opens the shared `ConfirmModal`, never a panel. ONE click from there, `githubNewPlayUrl` (`shared/data.js`), nothing downloaded; the tile hides when the repo is unknown |
| A play's 2 home pages | `src/home/App.jsx` + `ACTOR_CARDS`/`RESPO_CARDS` (`shared/pages.js`); the actor list omits the editor |
| Headers | `shared/PlayHeader.jsx` (five pages), `shared/PageHeader.jsx` (manifest-less, via `PageState`), `shared/HomeLink.jsx` (at the header foot, not the top row) |
| Shared look | `shared/theme.css`: `.dialogue-card`, `.page-shell`/`.page-scroll`, `.truncate`, `.btn-tip`, `.lift-hover`, `.page-notice`, `.confirm-quote`, `.flag-icon`, `.upload-tile`, `--shadow-float` |
| Rehearsal / Recorder | `shared/ProgressBar.jsx`, `shared/useScrollToActiveCard.js`, `recorder/useRecorder.js`, `downloadZip` (`recorder/App.jsx`). Both scene menus offer `sceneChoices` (`shared/data.js`): once a character is chosen, only the scenes they speak in, as INDEXES into the act (hiding an option never renumbers the rest), and the whole act when they speak nowhere in it. Each page then moves off a scene the menu no longer holds, the Recorder with `setSceneIndex`, Rehearsal through `changeScene` so playback stops too |
| Colours | `shared/characterColors.js` (Tableau 10, stored per character; lightness distinguishes). Filling has one implementation: the front's `assignColors` |
| Stats | `src/stats/stats.js` (pure, tested) does the maths; `App.jsx` only draws |
| Dashboard | `dashboard/App.jsx`: `ProgressTable`, `Journal` (`detailOf` per kind; a script row reads its `changes` through `CHANGE_LABEL_KEYS` + `changesOf`, each field a WHOLE catalogue phrase joined by `fmt.list`, and `changes: null` means a journal written before the diff existed, so it stays blank), `githubUploadUrl` (`shared/data.js`); its tile takes the VOICES only. Second page after the Editor to re-skin `--accent` on its own `:root` |
| Editor | its upload tile downloads `script.json` then opens the play's upload page; `editor/EditorRail.jsx` (one section open at a time), `StructurePanel` (only the play has a name, acts and scenes derive labels from rank), `history.js` (wraps a pure `scriptReducer`; `dirty = present !== saved`), `search.js` (pure; no regex; length-preserving folding) |
| File tiles | `shared/UploadTile.jsx` + `.upload-tile` (`theme.css`): ONE look for "a file passes between the coordinator and the repo", both ways. A link on the Dashboard (voices), a button in the Editor (script, downloaded first), and the Dashboard's PDF download composing the same classes (`.dash-script-tile`). The direction is in the opening drawing and the verb, never the shape; the coloured word takes the page one READS (`tone` on `PageMark`) |
| Guards | `shared/LeaveGuard.jsx` (capture-phase clicks + `beforeunload`), `shared/ConfirmModal.jsx` (portal, replaces `window.confirm`; `bodyTakesFocus` for the one box that is a FORM) |
| Python shared | `scripts/common.py`: `REPO_ROOT`, `write_json`, `load_json`, the play layout helpers, and a play's identity (`PLAY_ID_PATTERN`, `mint_play_id`, `new_play_script`) |
| Dev server | `serveRepoData` in `vite.config.js`, which serves the PDF from the repo like everything else |

## Traps

Each has a comment at the site. Do not "fix" one without reading it.

- README links into GitHub are relative and climb **exactly** `../../` (`test_readme.py`).
- The upload and creation URLs name `main` (`BRANCH`, `shared/data.js`).
  `/upload/<branch>` and `/new/<branch>` need a branch that really exists and fail onto
  the repo home page, never a 404; `/tree/` resolves names it rejects, which hides a wrong
  value.
- `githubNewPlayUrl` keeps the slashes of `filename=uploads/_new-play/<id>.txt`
  **literal**. Encoded, GitHub reads the whole thing as a file name and commits the play
  at the repo root, where no Action watches. The `.txt` is a courtesy, never a contract.
- Collapse tracks are `minmax(0, 1fr)` / `minmax(0, 0fr)`, never `1fr`/`0fr`.
- `min-height: 0` on `.play-header-settings-inner` and `.editor-rail-body`.
- `.editor-layout` states `grid-template-rows: minmax(0, 1fr)` explicitly.
- The rail clips with `overflow: clip`, never `hidden`, and takes no `position`/`z-index`.
- `flex: none` on `.editor-rail-panel`; `.character-list` is `flex: 0 1 auto`.
- `.page-shell` sits on an element, never on `body`.
- The Dashboard table is `border-collapse: separate`; the frozen corner takes `--paper`;
  the top rule is not applied to every `.dash-name`.
- Nothing `fixed` inside `container: ed-column`.
- Tooltips of buttons that disable go on a `.btn-tip` wrapper; `select:disabled` needs an
  explicit rule.
- The Stats block always takes the FULL width of its card: the "Words per line" slider
  changes the grain inside the viewBox, never the drawing's width (so `crispEdges` snaps
  cells to whole pixels and one can be 1 px wider than its neighbour).
- Scroll-follow clamps its target to the scroller's real range and has a second exit; the
  seek-drag flag is consumed; `onPointerMove` repeats `scrub`'s guard.
- `dragging` and `resizing` drop transitions mid-drag.
- `transition` stays on each surface, never hoisted into `.lift-hover`.
- The seal-shrinking mobile rule never targets bare `.page-mark`.
- `if (e.defaultPrevented) return;` in the search shortcut handler.
- `--rec-*` do not derive from `--warn`/`--ok` (measured AA failure on the pink card).
- Checkbox rows stay `flex-wrap`, never a fixed column count.
- `mountPage.jsx` imports `theme.css` before `App.jsx` in every entry point, and that
  order matters.
- Each CSS file neutralizes its own animations in its own `prefers-reduced-motion` block.

## Known gap: Action error strings

The failure reasons `scripts/` writes into `history.json` are still French. They are DATA
rendered by the bilingual Journal, so translating them would just swap one hardcoded
language for another. The fix is emitting error CODES the front translates, as
`useRecorder.js` does with `"mic"`. The Python tests assert on the current strings, so
this is a coordinated change, not a find-and-replace.
