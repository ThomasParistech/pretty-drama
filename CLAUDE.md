# PrettyDrama Voices

Free tool for theatre troupes: "Italian style" rehearsal with the actors' real voices.
Static site (GitHub Pages) + Python/ffmpeg GitHub Action. No server.

**A map plus the contracts that span files.** The reason for a single rule lives in a
comment at the site it applies to. `git log -p CLAUDE.md` has the long-form history.

## Writing rules

- **Repo is in English**: docs, comments, commit messages, workflows. README stays
  French (it is for the troupe); `locales/fr.ts` values stay French, it is the catalogue.
- **UI is bilingual**, French default. **No visible string in a component**: everything
  through `src/shared/locales/{fr,en}.ts`.
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
  Only `chooserHref`/`playHref` (`shared/pages.ts`), `githubRepoUrl` (`shared/data.ts`)
  and `vite.config.ts` know about `plays/<id>/`.
- No `?play=<slug>`: links are bare relative hrefs, so the param dies on every nav.
- `plays/.gitkeep` and `uploads/.gitkeep` are tracked: `git add` of a missing path exits 128.
- **The upload FOLDER routes, the content verifies.** A corrupt ZIP still reaches its
  play's journal; the id inside only rejects a file dropped in another play's zone.
- A play is born in `uploads/_new-play/`: the site cannot commit, so creating one is an
  upload. **There the FOLDER is the whole instruction**: every file is one title, name and
  extension ignored, because the coordinator commits through GitHub's editor where both
  are editable fields. Content = title, `TITLE_SEPARATOR` (`---`), then a note the Action
  never reads. `_new-play` is outside `SAFE_PLAY_ID` (leading `_`), so it cannot collide.
  Deleting a play needs a commit, so it is done by hand on GitHub. The one-shot
  `scripts/migrate_to_plays.py`, which moved a v1 fork's single play (root `data/` and
  `clips/`) into `plays/<id>/`, is gone: that layout is not in this repo any more, and
  `git log` still has the script for a fork that never ran it.
- **`plays/dev/` is the test bench**, the ONLY play missing from `data/plays.json`
  (`listed_play_ids`), reachable only by typing `plays/dev/rehearsal.html`. Otherwise an
  ordinary play: same pipeline, deployed, own upload zone. It exists so a page can be
  tried on real data without writing test uploads into the troupe's journal, which every
  fork inherits. Its script is a whole real play, VERBATIM: Molière, *Le Médecin malgré
  lui* (public domain, transcribed from the Louandre edition on fr.wikisource), 3 acts,
  26 scenes, 595 lines, 11 characters, an unequal cast (Sganarelle 224 lines, Perrin 6),
  characters who speak in one act only and tirades long enough to overflow a card. The
  didascalie printed next to a name becomes a leading `(à part.)` in the line's text,
  because a line holds one string. **No clips**: every line is `manquant`, so the
  recorded states are checked by recording into the bench, not by committed audio, and
  no synthetic case (empty scene, line with no text, character with no colour) is
  grafted on any more. `DEV_PLAY_ID` is an address no troupe can take.

## Architecture

React + Vite + **TypeScript**, multi-page (no SPA), `base: "./"`, relative paths
throughout. The 2 root pages are literal Vite entries; the 7 `pages/` templates are
written into each play's folder by `writePlayPages` (`vite.config.ts`) at CONFIG time.
**Creating a play while the dev server runs requires a restart.**

**Nothing COMPILES the types.** Vite (esbuild) and `node --test` (Node's native type
stripping) both ERASE them, so `tsc --noEmit` is the only thing that reads them:
`npm run typecheck`, a step of `build.yml` before the build, because the build succeeds on
the very code it refuses. Hence also **`allowImportingTsExtensions`**: import specifiers
carry the REAL extension (`./data.ts`, `./App.tsx`), because the pure modules run under
`node --test` with no bundler and Node resolves what is written.

`strict` is on, with no `any` at a call site the checker can serve. The four doors of
`stats.ts`, `sanitizeScript` and the journal normalisers take `unknown` or cast once at
the top INSTEAD: their whole job is a hand-edited `script.json` or `manifest.json`, so
the tolerance is the contract and the guards below the cast are what enforce it. The JSON
shapes those functions produce live in `shared/types.ts`, TYPES ONLY, next to the Python
writer each one mirrors.

Two workflows, airtight roles:
- `uploads.yml` (push touching `uploads/**`) processes uploads, writes the journal,
  commits, **then calls `build.yml`**.
- `build.yml` (any other push, dispatch, `workflow_call`) builds and deploys Pages, and
  **writes nothing to the repo at all**. No journal, ever. It is `contents: read` from
  end to end, so `uploads.yml`'s `site` job has nothing to delegate; anything it ever
  starts committing must be granted in BOTH files, a called workflow never getting more
  than its caller.

Do not break: the explicit call (a `GITHUB_TOKEN` push triggers no workflow); **distinct
`concurrency` groups** (a called workflow sharing its caller's group is killed as a
deadlock); `paths-ignore: uploads/**` in `build.yml`; its checkout on `ref:
github.ref_name`, not the run SHA, **in both jobs that check out**.

**The site's address is not knowable before a deployment** (`<owner>.github.io/<repo>/`,
both halves change when the template is copied) and **nothing in this repo stores it**.
GitHub shows it in two places the coordinator owns: **Settings → Pages**, always live and
documented, and the repository's **About** panel once they tick "Use your GitHub Pages
website", which is a SNAPSHOT into the repo's `homepage` field (a rename leaves it dead
until re-ticked) and is nowhere in GitHub's docs, label included. Hence both, not one.
Neither can be automated: writing `homepage` needs `administration:write`, the very
permission that blocks enabling Pages. The README therefore describes the SHAPE of the two addresses (the site itself,
and the same plus `respo.html`) rather than their values, and no workflow writes into it.

That is a deletion, not an omission. Storing a third copy meant a rewriting script, its
own test suite, a `<!-- ref: SITE_… -->` micro-format, a `contents: write` on `build.yml`
that `uploads.yml` had to delegate, and a bot commit in every troupe's history, all to
restate something GitHub renders for free on the repo's front page. **Do not reintroduce
it.** The `build` job still prints both addresses into `$GITHUB_STEP_SUMMARY`, the only
place the MANAGEMENT one is spelled out, but nobody is expected to read it: the install
ends on a commit, not a workflow run.

**Any link into GitHub the README carries is RELATIVE, `../../…`.** A root README renders
at `/<owner>/<repo>/blob/<branch>/README.md`, so `../../x` names the reader's own repo
without knowing either half of the address; an absolute one sends every troupe to the
template. Only routes GitHub really serves: `/deployments/<environment>` is NOT one
(measured 404; use `/deployments/activity_log?environment=…`), and a relative link at a
dead path renders exactly like a live one, which no test can reach from CI.
`test_readme.py` checks the depth, the absence of a branch name, and that no absolute
link names a repository sub-page. Two exceptions, both deliberate: `/new/<branch>` and
`/upload/<branch>` DO name a branch, because those two routes need a real one (they
answer with the repo home page otherwise), and absolute they are the severe case, since
they would commit the troupe's play or voices INTO the template.

**The install is the only moment the coordinator is on GitHub**, so it is the only moment
a workflow speaks to them there, in ONE channel, `$GITHUB_STEP_SUMMARY`: the pages check
when publishing is off, and the two addresses once the deploy succeeded. Outside the
install neither workflow reports to them (no issue, no README status): the only feedback
channel is the Dashboard's upload journal, so a failed run goes unreported and the commit
precedes the deploy.

**One exception, the one the journal cannot cover**: publishing off means the journal
sits on a site that does not exist. Hence the pages check. **No workflow can switch
Pages on** (needs `administration:write`, which is why `enablement:` is deliberately not
set on `configure-pages`), so it checks: Pages on AND `build_type == "workflow"`, since
publishing from a branch serves the repo root and answers a blank page rather than a 404.
When off it writes the fix into `$GITHUB_STEP_SUMMARY`, raises an `::error::` with the
same fix in one line, and **fails**. It is the FIRST step of `build`, before the checkout
and the toolchains, so it still answers in seconds; it was a job of its own until a second
runner cost more wall clock (a good ten seconds of the coordinator's wait) than the name
GitHub then put in the failure mail. That name is now the workflow's, and the `::error::`
title is what carries the reason.

**Failing is the point, and the push that CREATES main is what pays for it.** Both
workflows skip that push (`if: github.event.created != true`). A fresh copy triggers both
yet has nothing to publish and nothing to process: the coordinator has not been asked to
switch Pages on yet, so failing would mail an English "Run failed" to someone doing as
told, and succeeding would
green-tick a repo with no site. The pages check cannot skip itself (its answer exists
only at runtime), hence the job-level `if` on `build`. Every run that DOES reach the check belongs to a
repo whose install is over, where a publish that cannot publish is a real problem.

**`workflow_dispatch` on `build.yml` is the republish button**, the answer to a site that
looks stale. It is NOT the install's first deploy: switching Pages on fires no event, so
something must push, and asking a non-technical coordinator to find the Actions tab is
four clicks into a vocabulary they do not have. The install ends on the everyday
create-a-play gesture instead (`../../new/<BRANCH>?filename=uploads/<NEW_PLAY_DIR>/…`),
the same file in the same zone the site's "Nouvelle pièce" tile writes. **Markdown cannot
import `githubNewPlayUrl`**, so the link is hand-written and `test_contracts.py` is what
holds the two together, pinning the branch, the zone and the prefilled body; a JS helper
would only add an abstraction with one caller. **The prefilled first line is EMPTY on
purpose**: the coordinator types the title there, and a file committed untouched is
refused by name instead of minting a play called after the placeholder. Everything BELOW
that line is `manage.new.fileNote` verbatim, because the box is the same box whichever
route opened it, and one gesture must not explain itself two ways. It
lands in `uploads/**`, so `uploads.yml` runs and CALLS `build.yml`: the site
publishes as a side effect of the first useful thing they do, and they end the install
with a play rather than an empty list. `process_uploads.py` exits 0 even when it refuses
a file, so a mistyped title still deploys the site and reports itself in the root
journal: the install cannot dead-end. Nothing else can do this job. GitHub starts no run
when Pages is switched on ("GitHub Pages does not associate a specific workflow to the
GitHub Pages settings"); a job that WAITS for the human jams `concurrency: pages` and
silently cancels the coordinator's next upload; a `schedule:` poller mails the TEMPLATE
author from every fork and auto-disables at 60 days.

**The README is copied verbatim** by "Use this template", which is the other reason it
carries no address: a value written here would open the TEMPLATE's live site in every
copy ever made, two links that work and belong to someone else, reading as a finished
install until the first upload never lands. Worse than a 404, which at least looks like
a problem.

## Commands

- `npm run dev` (middleware serves repo data with real 404s), `npm start`, `npm run build`.
- Manual prod check: `npm run build && cp -r data dist/data && rsync -a
  --exclude='*.html' plays/ dist/plays/ && npm run preview`. Excluding `.html` is
  mandatory: worktree ones are templates, `dist/` ones have hashed asset URLs.
- `python3 -m unittest discover -s scripts/tests`
- `npm test` = `node --test` **with no argument** (Node 22+ reads a positional as a file).
  **Pure** front logic only, no test dependency, no React rendering, so DOM work is
  checked by hand.
- `npm run typecheck` = `tsc --noEmit`. Not optional and not a formality: it is the ONLY
  reader of the types (cf. Architecture), and CI runs it before the build.
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
   (`count_words`, twin of `countWords` in `stats.ts`), lines and recorded.
5. `build_script_pdf.py`: `data/script.pdf`, **committed**, the only derived file
   `build.yml` does not rebuild. `uploads.yml` typesets it on the runs that promoted a
   script and for those plays only (`git status --porcelain -uall` names them, so a
   byte-identical promotion typesets nothing), deleting the old PDF FIRST so a failed
   typesetting commits an absence rather than a document that disagrees with the play. It
   **cannot fail the run**. Committed because it is the one derived file whose rebuild
   costs 45 s of apt. **The counterpart**: a `script.json` edited by hand IN THE REPO
   keeps its old PDF until the next upload. Written at all four sites (`.gitignore`,
   `build.yml`, `uploads.yml`, `build_script_pdf.py`).
   **A script with no lines is not typeset at all**: it is given
   `scripts/blank-script.pdf`, a committed blank page, because that is what LaTeX would
   print and it is the state a play is BORN in. So the install's first deploy never waits
   for the apt, and `ci/has_lines.py` is what decides (any surprise answers "no lines",
   the side that skips). An emptied script gets the blank page too, hence copy AFTER the
   delete: it must lose the PDF of the lines it no longer has.

## Cross-file contracts

`scripts/tests/test_contracts.py` enforces these by READING both sources, never by
copying expected values. Breaking a pair breaks CI.

| Contract | Sides |
| --- | --- |
| `^[0-9a-zA-Z-]{1,64}$` | `SAFE_ID` (`editor/reducer.ts`), `LINE_ID_PATTERN` (`process_uploads.py`) |
| `^[a-z0-9][a-z0-9-]{0,63}$` | `SAFE_PLAY_ID` (`shared/plays.ts`), `PLAY_ID_PATTERN` (`common.py`) |
| Title -> play id, through `scripts/tests/play-id-cases.json` (read by both suites) | `mintPlayId` (`shared/plays.ts`) announces, `mint_play_id` (`common.py`) decides |
| Fields of a brand new play | `EMPTY_SCRIPT` (`editor/reducer.ts`), `new_play_script` (`common.py`) |
| Creation zone `_new-play`, never a valid play id | `NEW_PLAY_DIR` (`shared/data.ts`), `NEW_PLAY_DIR` (`process_uploads.py`), and the README's install link, which hand-writes both it and `BRANCH` |
| The test bench `dev`, a real play id no title may take | `DEV_PLAY_ID` (`shared/plays.ts`) refuses the title, `DEV_PLAY_ID` (`common.py`) hides the play |
| `---` closes the title and opens the note | `TITLE_SEPARATOR` (`shared/data.ts`) writes it, (`process_uploads.py`) reads it, and the README's install link prefills it. That link is checked by CALLING `read_title` on the body it prefills: untouched it must be REFUSED, titled it must yield the title |
| The note prefilled into GitHub's editor, one sentence for ONE box reached two ways | `manage.new.fileNote` (`locales/fr.ts`), which the site passes through `githubNewPlayUrl`, and the README's install link, which spells the same French out because markdown cannot call a catalogue. Compared whole, non-breaking spaces included |
| Act/scene labels, roman numerals | `shared/structureLabels.ts`, `build_script_pdf.py` |
| Vite entries = root `.html` files | `vite.config.ts` |
| The typecheck is the ONLY reader of the types, so it must be strict, see everything, and run | `tsconfig.json` (strict, `noEmit`, `include`), `package.json` (`typecheck`), `build.yml` (the step, BEFORE the build). `TestTypeChecking` reads all three, refuses any option set to `false` (`strict` is a family that can be disabled one member at a time behind it), and refuses a source outside `include` |
| `@types/react` is on react's own MAJOR | `package.json`, both halves. One major ahead, the check describes hooks and a `ref` prop this React does not ship, so the code passes here and breaks in the browser, which is the one failure nothing else would catch |
| An import specifier names the file it resolves | every `src/**` module and `node --test`, which runs the pure ones with NO bundler and resolves what is WRITTEN. Enforced, not just documented: a `.js` left over or an extension left off is caught by `TestTypeChecking` before it is a module-not-found |
| ZIP format | `downloadZip` (`recorder/App.tsx`), `parse_manifest` (`process_uploads.py`) |
| No page CSS redefines `--header-*`; no header rule consumes `--accent` / `--font-serif` / `--shadow` | `theme.css` vs `editor.css` |
| Every `PAGES` key has its two seal variables | `shared/pages.ts`, `theme.css` |
| Colour is only validated as `#rrggbb`, never repaired | `build_manifest.py` |
| i18n: every `t()`/`<T>` key exists in both catalogues, no key unused, no visible literal in `src/` | all of `src/` |
| The fields of a script promotion | `script_changes` (`script_diff.py`) writes them, `CHANGE_LABEL_KEYS` (`dashboard/App.tsx`) has a sentence for each, in display order. Renamed on one side, the change silently stops showing. A field's VALUE says whether it is a count (`{count}`) or a flag |

## Invariants

- **Text normalization has one implementation**, `scripts/normalize.py`, with exactly two
  callers: `build_manifest.compute_status` (is a recording stale) and
  `script_diff.script_changes` (was a line really edited). Same rule for both on purpose:
  the journal's "edited" count is read as "these have to be recorded again", so a curly
  apostrophe must not appear in it while the grid keeps the line green. The browser ships
  **raw** text. The folding in `editor/search.ts` is not this.
- **Line ids are never recycled** (they name the mp3s). **Play ids are never re-minted**
  (they name a folder and a URL). Validate a play id **before** building a path. A play id
  is minted in **one** place, `mint_play_id`; the front's `mintPlayId` only announces it.
- **`sanitize_script` (Python) tolerantly mirrors `sanitizeScript` (JS)**: malformed input
  is ignored, never a crash. Four deliberate asymmetries: JS re-mints bad or duplicate
  ids, Python only requires a non-empty string; JS floors the structure, Python never; JS
  FILLS a missing colour (`firstFreeColor`, the same rule the manifest-reading pages apply
  through `assignColors`), Python only copies a `#rrggbb` through; the play id is validated
  identically. Everything else must agree, including that a character with no real name is
  dropped by both.
- **`sanitizeScript` never moves a line between characters.** On a duplicate id the first
  holder keeps id and lines, the second gets a fresh id and none.
- **A no-op must not create a new state** (`updateScene`, `scriptReducer`, and
  `history.ts` comparing by identity).
- **`validate_script` is stricter than `sanitize_script`** on purpose: a candidate with no
  lines never replaces a play that has some.
- **Hostile uploads**: real size caps (ZIP headers lie), member names by fullmatch, one
  broken file never blocking the others.
- **Takes live in memory only**, one per line, `URL.revokeObjectURL` on replacement.
- **No local persistence of work** (rail width, Stats slider, takes, script being edited).
  Sole exception `prettydrama.lang`.
- **No visible string in a component**, down to downloaded filenames.
- **No emoji in the UI**: SVG in `shared/icons.tsx`, font-sized, `currentColor`.
  Exceptions are the monochrome characters that follow the font (`✓ ✕ ↓ ▼ ⠿ ?`) and
  `FlagIcon`, which is drawn.
- **The journal is the project's only error channel.** A rejected file is reported nowhere
  else, which is why it is capped, says it is capped, and renders even when empty.

## i18n

Pure engine `shared/i18n.ts`, environment face `shared/locale.ts` (reads `?lang=`, then
the stored choice, then the browser). **A module singleton, not a React context**:
multi-page site, and switching language navigates.

- Markup inside a sentence goes through `<T k="…" p={{ … }} />`, the JSX becoming a
  parameter. Never split a sentence into fragments: it freezes French word order.
- **No hand-rolled plurals**: `{ one, other }` with `t(key, { count })`. Numeric
  parameters are formatted by the engine, not at the call site.
- **French typography lives inside the strings** (non-breaking spaces, guillemets), not in
  the JSX. `parity.test.ts` checks they are present in `fr.ts` and absent from `en.ts`.
- A label named twice is written once, the second interpolating the first's key.
- **Reader locale vs PLAY language** (`script.language`): `shared/structureLabels.ts`
  follows the reader on the four navigating pages and the play's language in the Editor,
  where you shape the document the PDF prints. Hence `t` is a **parameter** of
  `actLabel`/`sceneLabel`; the language descends as a **string**, never the translator.
- A module under `node --test` never imports `locale.ts` (it reads URL, storage and
  navigator on import): it takes `t` as an argument or returns a CODE the page translates.

## File map

| Area | Files |
| --- | --- |
| Root pages | `src/chooser/` (one component, `manage` flag; no link from chooser to management). One `PlayCard` for both, the whole card a link, `manage` adding the recorded share. `NewPlay.tsx`: `NewPlayTile` ends the GRID (dashed, `aria-haspopup`) and opens the shared `ConfirmModal`, never a panel. ONE click from there, `githubNewPlayUrl` (`shared/data.ts`), nothing downloaded; the tile hides when the repo is unknown |
| A play's 2 home pages | `src/home/App.tsx` + `ACTOR_CARDS`/`RESPO_CARDS` (`shared/pages.ts`); the actor list omits the editor |
| Headers | `shared/PlayHeader.tsx` (five pages), `shared/PageHeader.tsx` (manifest-less, via `PageState`), `shared/HomeLink.tsx` (at the header foot, not the top row) |
| The 4 brand pages | `shared/HomeHero.tsx` / `shared/HomeFooter.tsx`, worn by the 2 root pages and a play's 2 home pages, so the brand is written once. `LocaleSwitch` lives in the FOOTER and nowhere else: a language is a site setting, chosen on the way in |
| Shared look | `shared/theme.css`: `.dialogue-card`, `.page-shell`/`.page-scroll`, `.truncate`, `.btn-tip`, `.lift-hover`, `.page-notice`, `.confirm-quote`, `.flag-icon`, `.upload-tile` (`.in-header` carrying the whole header-tile look, a carrier adding its ink only), `--shadow-float`, `--tile-lit` (the Editor's `--ed-tile-lit` is that token renamed) |
| Rehearsal / Recorder | `shared/ProgressBar.tsx`, `shared/useScrollToActiveCard.ts`, `recorder/useRecorder.ts`, `downloadZip` (`recorder/App.tsx`). Both act and scene menus offer `actChoices`/`sceneChoices` (`shared/data.ts`, one rule at two levels): once a character is chosen, only the acts and scenes they speak in, as INDEXES into the play / into the act (hiding an option never renumbers the rest), and the whole level when they speak nowhere in it. Each page then moves off an act or scene the menu no longer holds, ACT FIRST since it renews the scenes, the Recorder with `setActIndex`/`setSceneIndex`, Rehearsal through `changeAct`/`changeScene` so playback stops too. `recorder.noLinesInScene` therefore survives only for a character silent in the WHOLE play, where both fallbacks fire |
| Colours | `shared/characterColors.ts` (Tableau 10, stored per character; lightness distinguishes). Filling has one implementation: the front's `assignColors` |
| Stats | `src/stats/stats.ts` (pure, tested) does the maths; `App.tsx` only draws |
| Dashboard | `dashboard/App.tsx`: `ProgressTable`, `Journal` (`detailOf` per kind; a script row reads its `changes` through `CHANGE_LABEL_KEYS` + `changesOf`, each field a WHOLE catalogue phrase joined by `fmt.list`, and `changes: null` means a journal written before the diff existed, so it stays blank), `githubUploadUrl` (`shared/data.ts`); its tile takes the VOICES only. Second page after the Editor to re-skin `--accent` on its own `:root` |
| Editor | its upload tile downloads `script.json` then opens the play's upload page; `editor/EditorRail.tsx` (one section open at a time), `StructurePanel` (only the play has a name, acts and scenes derive labels from rank), `history.ts` (wraps a pure `scriptReducer`; `dirty = present !== saved`), `search.ts` (pure; no regex; length-preserving folding) |
| File tiles | `shared/UploadTile.tsx` + `.upload-tile` (`theme.css`): ONE look for "a file passes between the coordinator and the repo", both ways. A link on the Dashboard (voices), a button in the Editor (script, downloaded first), and the Dashboard's PDF download composing the same classes (`.dash-script-tile`). The direction is in the opening drawing and the verb, never the shape; the coloured word takes the page one READS (`tone` on `PageMark`) |
| Guards | `shared/LeaveGuard.tsx` (capture-phase clicks + `beforeunload`), `shared/ConfirmModal.tsx` (portal, replaces `window.confirm`; `bodyTakesFocus` for the one box that is a FORM) |
| Types | `shared/types.ts`: the JSON contracts (`Script`, `Manifest`, `PlayEntry`, `History`, `ScriptChanges`) plus `Translate` / `Formats` / `Locale`, and the one `declare global` (Safari's `webkitAudioContext`, which the three audio sites would otherwise reach through `window as any`). TYPES ONLY, so it reaches no bundle. `ScriptAction` lives in `editor/reducer.ts`, which owns it |
| Python shared | `scripts/common.py`: `REPO_ROOT`, `write_json`, `load_json`, the play layout helpers, and a play's identity (`PLAY_ID_PATTERN`, `mint_play_id`, `new_play_script`) |
| Dev server | `serveRepoData` in `vite.config.ts`, which serves the PDF from the repo like everything else |

## Traps

Each has a comment at the site. Do not "fix" one without reading it.

- README links into GitHub are relative and climb **exactly** `../../` (`test_readme.py`).
- The upload and creation URLs name `main` (`BRANCH`, `shared/data.ts`).
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
- `mountPage.tsx` imports `theme.css` before `App.tsx` in every entry point, and that
  order matters.
- Each CSS file neutralizes its own animations in its own `prefers-reduced-motion` block.
- Import specifiers name `.ts` / `.tsx`, never `.js`: `node --test` resolves what is
  written. Renaming a module means rewriting its callers' specifiers.
- No `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`, anywhere (`TestTypeChecking`).
  A cast is the honest way to overrule the checker: it says what the value IS, where
  those three say only "not now". The four tolerant doors cast once at the top.
- **A comment naming a file names one that exists**, extension included. The CSS has no
  import for a rename to follow, so its comments went stale on their own during the
  TypeScript migration; `TestTypeChecking` now reads every text file for it.
- **`test_contracts.py` reads these sources by SHAPE**, so a type annotation lands
  between the name and the `=`: every `const NAME` pattern there tolerates an optional
  `: Type`, and the JSX-text scan skips what looks like an annotation (`TYPE_FRAGMENT`,
  whose bound is written at the site). Annotate `PAGES`, `EMPTY_SCRIPT`, `LOCALES`, a
  `*_KEYS` table or `CHARACTER_COLORS` and the pattern is what to check first.

## Known gap: Action error strings

The failure reasons `scripts/` writes into `history.json` are still French. They are DATA
rendered by the bilingual Journal, so translating them would just swap one hardcoded
language for another. The fix is emitting error CODES the front translates, as
`useRecorder.ts` does with `"mic"`. The Python tests assert on the current strings, so
this is a coordinated change, not a find-and-replace.
