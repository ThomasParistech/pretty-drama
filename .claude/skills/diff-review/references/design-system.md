# Design system — contract between the pages

Reference for the front review. If the code and this file diverge, the review must
say so: either the code is to be fixed, or this contract is to be updated (and the
"File map" table in `CLAUDE.md` with it).

## Pages

The repo hosts **several plays**, each fully siloed (see the "Layout" section of
`CLAUDE.md`). Two families of documents, therefore.

**The two ROOT pages**, above the plays, literal Vite entries:

| Entry | Page | Own CSS |
| --- | --- | --- |
| `index.html` | The troupe's play chooser | `src/home/home.css` + `src/chooser/chooser.css` |
| `respo.html` | The coordinator's play management (same `App.jsx`, `manage` flag) | same |

They carry the BRAND, not a page seal: no `page.*` key, no `desc`, the hero of the
home pages, and all their styling comes from `home.css`.

**The seven pages of a PLAY**, templates from `pages/` instantiated into each
play's folder by `vite.config.js`:

| Template | Page | Own CSS |
| --- | --- | --- |
| `pages/index.html` | The play's actor home (Rehearsal, Recorder, Stats) | `src/home/home.css` |
| `pages/respo.html` | The play's coordinator home (all 5 pages) | `src/home/home.css` (same `App.jsx`, other card list) |
| `pages/rehearsal.html` | Rehearsal | `src/rehearsal/rehearsal.css` |
| `pages/recorder.html` | Recorder | `src/recorder/recorder.css` |
| `pages/stats.html` | Stats | `src/stats/stats.css` |
| `pages/dashboard.html` | Dashboard | `src/dashboard/dashboard.css` |
| `pages/editor.html` | Editor | `src/editor/editor.css` |

Inside a play no path changes: `data/manifest.json` and `./rehearsal.html` are
relative paths that resolve in its folder. Three `src/shared/` helpers know about
the `plays/<id>/` layout, and no PAGE does: `chooserHref` (the "change play" link
at the foot of a play's home), `playHref` (the path written by the cards of both
root pages) and `githubRepoUrl` (which must recognise a root Pages site whose first
segment is `plays`).

**Seals (`--page-mark` / `--page-mark-soft`, `.page-<key>` classes in
`theme.css`)**: the brand, Rehearsal, Recorder and Stats share **exactly** the
same pair (burgundy `#8b2635` on sand `#f5eeda`); only the Dashboard (ink navy
`#1d4e89`, deliberately clear of the `--ok` green and the `--warn` amber that page
has to show as STATUSES) and the Editor (purple) have their own colour, because
they are the coordinator's two modes. Two neighbouring but distinct hues between troupe pages is a finding:
either it is the same seal, or it is frankly another colour. What tells these
pages apart is the icon. The favicon and the `theme-color` of the `.html`
duplicate the seal colour (a `<link>` tag cannot read a CSS variable), so the seven
troupe `.html` files carry the same pair: the two root ones (`index.html`,
`respo.html`) and the five templates of `pages/` that are not Progress or Editing. The favicon (and the
`apple-touch-icon.png` derived from it) **is** the seal pill, tile in
`--page-mark-soft` and glyph in `--page-mark`: a white glyph on a solid tile is a
finding, it is the seal's negative and these icons serve as the thumbnail of a
shared link. The `theme-color` stays the solid `--page-mark`.

## Tokens (`src/shared/theme.css`)

Every page loads `theme.css`. Colours, radii, shadows and fonts go through the
`:root` tokens: `--paper`, `--paper-dark`, `--card`, `--ink`, `--ink-soft`,
`--accent`, `--accent-dark` (hover of solid buttons), `--accent-soft`, `--gold`,
`--border`, `--ok(-soft)`, `--warn(-soft)`, `--radius`, `--shadow`,
`--shadow-hover` (hover of a clickable card, to be consumed only through
`.lift-hover`, see below), `--shadow-float` (a layer that FLOATS above the page
rather than sitting on it: the modal and Rehearsal's "your turn" pop-up, which
each wrote it on their own side), `--card-active` (current dialogue card),
`--focus-ring` / `--focus-ring-offset` (focus ring for elements that have none by
default: slider, cards, card links), `--notice-gutter` (side gutter of the
full-page `.page-notice` and `.load-error` cards, which centre with
`margin: auto`), `--font-ui`, `--font-serif`, plus the reserved tokens
`--header-accent` / `--header-serif` / `--header-shadow` (see below) and
`--ease-header` (the header collapse curve, neutralised by the
`prefers-reduced-motion` block).

- A page **may** re-skin tokens in a `:root` local to its CSS, and two do: the
  Editor, wholesale (the "Rail" design: accent `#7a5cc0`, IBM Plex/Spectral fonts,
  warmed neutrals), and the Dashboard, the accent triplet only (`--accent`
  `#1d4e89` + its soft and dark, the same navy as its seal). The Dashboard's is
  what lets the grid band, the journal head and both file tiles read ONE navy: the
  seal tokens are set on the `<header>` ELEMENT, so nothing in the body of the page
  can reach them.
- **Invariant**: a re-skin must never change the visible identity of a shared
  component. The brand and the header title (PageHeader/PlayHeader) render
  identically on every page through the reserved tokens `--header-accent`,
  `--header-serif` and `--header-shadow`, which no page redefines.
  **`scripts/tests/test_contracts.py` enforces this in CI**: it reads the list of
  `--header-*` in theme.css, fails if a page CSS redefines one, and fails too if a
  header rule consumes `--accent`, `--font-serif`, `--shadow` (re-skinned by the
  Editor) or `--page-mark(-soft)` (re-skinned by EVERY page, through the
  `page-<key>` class both headers set on their root). The guard is about
  REDEFINITION, not reading: a page may READ a reserved token when it must render
  exactly like the header, and `--header-shadow` is the only one two pages still
  do read (Stats, whose legend bar carries the same shadow as the band above it,
  and the Editor's `--ed-panel-shadow`, that page having set `--shadow: none`).
  Nothing reads `--header-accent` any more: the Editor's `.btn.primary` is now the
  upload tile's own object, a pale `--accent-soft` fill with `--ed-accent-ink`, and
  the act tile of the rail plan is a tint of the page's own violet, the wine being
  left to the logo at the header foot, the one place that wears it at full
  strength. Neither is a finding; redefining a reserved token is. Note too that
  the Progress page's PDF download carries no `.btn` class at all: it is the file
  tile (`.upload-tile`, see the "File tile" row of the map below), documented at
  `.dash-script-tile` (`dashboard.css`). A single exemption to the seal-token
  guard, `.play-header-home*`: the home link is the FOOT of the header it closes,
  so it wears that header's colour (badge, word, hover wash and focus ring
  together, navy on Progress and purple on Editing) and carries `page-${page}`
  itself, a class set in JSX that this guard, which reads only CSS, cannot see.
  What says "home" there is the drawing of the two masks, not the hue. That is
  exactly how a header shadow disappeared on the Editor page alone. If a shared
  component's identity (accent colour, font, size) goes through a re-skinnable
  token, that is a high finding; re-skinned "matching" neutrals (`--card`,
  `--border`, `--ink-soft`) are tolerated in shared components as long as they
  stay perceptually equivalent.

  Two named exceptions, not to be reported. **`.flag-icon`** (`theme.css`), the
  flags of both language switches: the only image in the repo that is neither
  `currentColor` nor sized on the font-size, because a flag has its own colours
  and a fixed size (24x16). One rule for its two consumers (the foot of the home
  pages and the rail plan), the same pattern as below. Its outline is an outer
  `box-shadow` and not a `border`: without it the white band of the tricolour and
  the white ground of the Union Jack melt into the cream paper. And
  **`.confirm-quote`** (`theme.css`), which consumes `--font-serif` **on
  purpose**, as its rule follows `--border`: the quotation of a line must read in
  the serif of ITS page's lines (Cormorant on the Recorder, Spectral on the
  Editor), because what is quoted is the page's content, not the shared chassis.
  Unlike a header, which must render the same everywhere and therefore takes
  `--header-serif`. Corollary: every font consumed by a shared component must be
  loaded by the Google Fonts `<link>` of each `.html` concerned (weight included,
  otherwise a silent faux weight).
- **Hover of clickable surfaces: `.lift-hover` (theme.css), not the copied
  pair.** The gesture is a step upward plus `--shadow-hover`, and it lives in a
  single class, set in JSX. A `transform: translateY(…)` + `box-shadow:
  var(--shadow-hover)` rewritten in a page CSS is therefore a `duplication`
  finding: that was the case on the cards of both home pages, the upload button
  and the PDF button, across three files. The step is tuned by `--lift` on the
  element (default `-1px`, `-3px` on the home cards, which are tall): that is the
  only legitimate deviation, because it depends on the size of the surface and not
  on the gesture. Two traps to know before reporting: the `transition` stays with
  each surface (it is ONE property, so a local declaration would override the
  shared file's), so a surface taking the class must list `transform` and
  `box-shadow` in its own transition; and `.play-header-home` does **not** take it
  (it keeps the step but replaces the shadow with the seal's cream wash: another
  gesture, not this one mistuned).
- **Shared classes to prefer over copying their declarations**, all in
  `theme.css` and all set in JSX: `.truncate` (the overflow/ellipsis/nowrap triple
  for a name that must not push its neighbours; the max width and the `flex` stay
  local, and the caller must always double it with a `title`), `.btn-tip` (the
  wrapper carrying the tooltip of a button that DISABLES, since a `disabled`
  control receives no mouse event: to be used anywhere a button can be
  `disabled`, the `aria-label` staying on the button), `.page-shell` /
  `.page-scroll` (a shell the height of the window whose content alone scrolls,
  tuned by `--shell-height`: `100vh` on the Editor, the default `100dvh`
  elsewhere), and the `.checks-row label, .search-options label` rule (the
  geometry of a checkbox label). Rewriting one of these in a page CSS is a
  `duplication` finding.
- **Invariant**: the page background stays the shared cream — `--paper` is
  `#faf6ef` on every page, re-skin included.
- **A local colour is not necessarily a duplication.** Before proposing to derive
  a page token from a theme token of the same semantics, check the BACKGROUND it
  is painted on: `--rec-todo` / `--rec-fresh` (`recorder.css`) look like `--warn`
  / `--ok` but live on the pink "my lines" card (`--accent-soft`), where `--ok`
  drops to 4.31:1 and fails AA. The measurement is in the file's comment; it is
  not a finding.
- No hardcoded colour/shadow/radius in a page CSS when an equivalent token
  exists. Hardcoded values are reserved for genuinely local cases (and must stay
  harmonious on cream).

## Structural components

| Element | Source | Pages |
| --- | --- | --- |
| Brand header (seal + play title in the top row, brand and home link at the foot) | `src/shared/PageHeader.jsx` — no longer mounted directly by any page: it only serves as the header of `PageState` screens, the ones with no settings to carry. **Same geometry as `PlayHeader`, and the same `HomeLink` at the foot**: these screens are the waiting state of the five play-header pages, so a brand placed at the top here and at the bottom there jumped from one end of the header to the other when the manifest arrived. Its `title` is the **play title, and nothing else**; it is optional, and the `<span>` is not rendered without it (loading, unreadable manifest): never a page label here, see below. Its typography is the SAME CSS rule as `.play-header-title`, not one that resembles it | through `PageState` only |
| Play header (seal + play title, collapsible; **no** page label written out, it crowded the bar on mobile: the seal says the page) | `src/shared/PlayHeader.jsx` — the top row says ONLY the play title, the collapse button swallows it whole; the word "PrettyDrama" and the home link live at the foot of the expanded header (`.play-header-home`, logo + word; the class it sets on itself is described in the Home link row below, the single place for it). Act/scene selects are passed as `children` by the pages that have them (`.selects-row`), because their variants are real: `disabled` while recording, "to record" counters. Both scene menus are FILTERED by `sceneChoices` (`shared/data.js`) once a character is chosen, to the scenes that character speaks in, the `<option value>` staying the scene's rank in the ACT (hiding an option never renumbers the ones that stay) and the whole act coming back when they speak nowhere in it, an empty menu offering no way out. The Recorder's three menus then carry `optionSuffix`, THREE cases and not two: `(n à enregistrer)`, a bare `✓` when all are done, and `(aucune réplique)` where the character never speaks, a tick there claiming finished work that never existed. The mark is a monochrome glyph because an `<option>` is drawn by the BROWSER and holds no element of ours. **Two pages pass none**, the Dashboard and the Editor: the latter moved its whole plan (play title, act/scene, "+ Scene"/"+ Act") into the "Structure" section of its rail, because it SHAPES the structure where the other two walk through it. **The header collapses on all five pages, these two included** (which have no settings at all): their expanded area then holds only the doc and the home link, and a page that did not collapse would be the only one keeping its header under the thumb | Rehearsal, Recorder, Stats, Editor, Dashboard |
| Bottom control bar `.controls` + `.ctrl-btn` | CSS in `theme.css` | Rehearsal, Recorder |
| Indexed progress slider | `src/shared/ProgressBar.jsx` | Rehearsal, Recorder |
| Dialogue cards `.dialogue-card` (+ shared "my lines" palette `.mine` and `.active` border) | `theme.css` — pages set `.mine` next to their semantic class and keep only their real deviations | Rehearsal, Recorder |
| Buttons `.btn` / `.btn.primary` | `theme.css` | all |
| File tile (white card, opening drawing, label whose coloured group of words names the file) | `src/shared/UploadTile.jsx` + `.upload-tile*` (`theme.css`). ONE look for "a file passes between the coordinator and the repository", in BOTH directions: the class name says `upload` for history only, see the paragraph at the class. The component covers the two uploads (a link to GitHub on Progress, a button on Editing since the file must be downloaded first); the PDF download of Progress composes the same classes by hand (`.dash-script-tile`), the component being a GitHub link or a button and neither being a download. The direction is carried by the opening drawing (a seal for what leaves, `DownloadIcon` for what comes back) and by the verb, never by the shape. The coloured word takes the page one is READING, never the page the file comes from: on Progress the PDF tile lives in the header and carries `page-dashboard`, while the voices tile sits in the BODY, where the seal tokens (set on the `<header>` element) resolve to nothing, so it carries no `page-<key>` at all and takes the page's re-skinned `--accent` through `.dash-actions .upload-tile-word`. Its SEAL still draws Recording's mic, `tone` on `PageMark` being what splits the drawing from the colour | Progress (voices, PDF), Editing (script) |
| Home link (logo in both masks + the word "PrettyDrama", between two short rules) | `src/shared/HomeLink.jsx`, **one component for both headers**. Carries `page-${page}` on the link itself, and passes the same key to the seal as `tone`: badge, word, hover wash (`--page-mark-soft`) and focus ring all take the colour of the page one is LEAVING, so navy on Progress and purple on Editing, wine on the four others. `test_contracts.py` forbids seal tokens to header rules and exempts `.play-header-home*` by name, that JSX-set class being invisible to it | both headers, so the five pages and their waiting screens |
| Page seal (round pill + icon) | `src/shared/PageMark.jsx` (+ `PAGES` in `src/shared/pages.js`) — the `page-<key>` class it sets carries its colours, so it displays correctly anywhere, including outside a header. `label` prop when the seal does not designate its own page (the journal's Type column: the mic there means "Voice"), and `label=""` when it is **decorative**, i.e. when the word is already written right next to it (home cards, hero brand, the home link at the header foot which already carries its `aria-label`, and the file tile, whose label names the file): otherwise every link announces itself twice. `tone` when the DRAWING and the COLOURS part company, which happens in exactly two places, the home link and the voices tile of Progress | both headers, the home cards, the Dashboard's voices tile, and BOTH icon columns of its journal (the Status column reuses the `.page-mark` pill with `--ok`/`--warn` hues instead of a page colour) |
| Header doc `.header-hint` (one class only, both paragraphs share the style: their place is what tells them apart) | `theme.css` for the style, but **rendered by `PlayHeader` itself**, never by the pages: the first paragraph is `PAGES[page].desc` (the same one as the home card, one place for both uses), the second the optional `hint` prop. The two bracket the settings (`desc` at the top of the expanded header, `hint` at the foot) | all five: `desc` everywhere, `hint` only on Recorder and Editor |
| Destructive-action confirmation | `src/shared/ConfirmModal.jsx` — rendered in a portal, Escape cancels, initial focus on the button being proposed. **Never `window.confirm`** (unthemed native dialog). Quotation of the targeted line: `.confirm-quote` (`theme.css`) + `excerpt` (`data.js`) | Editor (line, scene, act), Recorder (discard a take), and through `LeaveGuard` |
| Page-exit guard (undownloaded work) | `src/shared/LeaveGuard.jsx` — link clicks intercepted in the capture phase + `beforeunload` as a net | Editor, Recorder |
| SITE language switch (two flags) | `src/shared/LocaleSwitch.jsx` — two real links carrying `?lang=`, hence right-click and new tab, and no state: the next load is what stores the choice (`locale.js`). **Mounted at the foot of the home pages and by them ALONE** (the two root pages, which are the site's entrance, and a play's two home pages), and that is a rule, not an accident: a language is a SITE setting, so it is chosen on the way in, and the foot of the shared header is a finished composition (the seal alone and centred, framed by two short rules) that a second object would knock off-centre. A language's name is written **in that language** (`Français`, `English`), never translated: it is the only accented literal the CI guard exempts by name. Not to be confused with the PLAY's language, which shows the same flags in the rail plan but is a FIELD editing `script.json`, with a translated language name | the home pages |
| Sentence carrying markup | `src/shared/T.jsx` — `<T k="…" p={{ … }} />`, the JSX fragment becoming a PARAMETER of the sentence. A sentence split into fragments in the component is a finding, see the Text section | every one quoting a `<strong>`, a `<code>`, an icon or a link mid-sentence |
| Act and scene labels | `src/shared/structureLabels.js` — DERIVED from rank (`actLabel(t, i)`, `sceneLabel(t, i)`), acts and scenes carrying no title in `script.json`. Pure, `t` received as an argument, and that is what lets the two language axes coexist: the four NAVIGATING pages pass the reader's `t`, the Editor a `t` bound to `script.language` (see Text, "Two language axes"). Python holds a second implementation for paper (`STRUCTURE`, `roman_numeral` in `build_script_pdf.py`), from the PLAY's language, so the rail plan and the paper say the same word, and `TestStructureLabels` forbids the two to diverge | both scope selects, Dashboard, Stats, Search, rail plan, PDF |
| Line count of a play object | `src/editor/CountBadge.jsx` — bare number on screen (the count column must align), the sentence in the `aria-label`, `role="img"` to make it valid on a `<span>`. Both rail panels each had their own copy, though their CSS was already shared (`.character-count, .structure-count`) | the "Structure" and "Characters" sections of the Editor rail |
| Mounting a page | `src/shared/mountPage.jsx` — `applyDocumentLanguage` then `createRoot(...).render(...)`, and the `theme.css` import, whose ORDER matters (before the page CSS, which overrides it): hence importing this module BEFORE `App.jsx` in every entry point. The entries were so many copies of the same body | the nine entry points (`main.jsx` / `respo.jsx`) |
| "(3/12)" numbering of my lines | `src/shared/data.js` — `myLineNumbers` (the Map) and `myLineNumber` (the label, `t` received as an argument: this module is covered by `node --test`). The template was written in two JSX files, parentheses and slash included | Rehearsal, Recorder |
| Manifest fetch | `src/shared/useManifest.js` | Rehearsal, Recorder, Stats, Dashboard (the home page calls `fetchManifest` directly: it has neither a loading nor an error screen, a missing manifest just leaves the title empty) |
| Full-page loading/error screen | `src/shared/PageState.jsx`: BOTH states take the shared `.page-notice` card (the wait as much as the message: it is the same screen at two moments, and the second almost always follows the first) | all but the home page |

**No header writes its page label.** A page name spelled out in a top row is a
finding, without exception: the seal says the page, and the browser tab repeats
it. The `title` of both headers says ONLY the play title, and it is optional.

**Waiting screen or final screen** (the distinction `PageState` does not make on
its own): a screen you pass through (loading, unreadable manifest) does not know
the play yet, so its header **says nothing**; it does not fall back to the page
label. The title must APPEAR when the manifest arrives, and never COVER another
one: a label set during loading flickered on every page open. That is free, the
row height being fixed by the seal and not by the title. A **final** screen is the
page's final content for this user, and it holds to the header contract: it names
the play. What separates it from a waiting screen is not the severity of the
message but the fact that you stay there: a browser with no microphone is not
going to find one, so that screen **is** the page. There are **three**, all
rendered after loading on purpose: the Editor opened with a finger
(`src/editor/App.jsx`), the Recorder on a browser that cannot record
(`src/recorder/App.jsx`) and the Rehearsal of a still-empty play
(`src/rehearsal/App.jsx`). The fallback when the play has no title is the same
untitled-play label on all of them, as on the five headers. A corollary to check
in the code and not only in the render: the page must **load what it takes for
that** (the walled Editor does its script `fetch` for its title alone); an
`if (…) return` placed before the load to "save" a request ends up readable in the
header, and that is exactly the bug that produced a page label at the top of the
mobile screen.

Related rules:

- No em dash in user-visible text, headers included (`CLAUDE.md` convention:
  colon, semicolon, comma, parentheses or one more sentence).
- Same pink/gold palette for "my lines" on Rehearsal (`.active`) and Recorder
  (`.own`/`.active`).
- Pages never implement their own variant of one of these components (no second
  header, no homemade bottom bar, no re-coded progress slider); when a page has
  act/scene selects they stay `children` of the shared header, and a page that
  passes none keeps the header as is rather than deriving one (see table above).

## Factorization

- A style used by **at least two pages** lives in `theme.css`, never copy-pasted
  between two page CSS files.
- A JSX component/hook/helper used by at least two pages lives in `src/shared/`.
- A page CSS contains only what is specific to the page; if it redefines a
  `theme.css` class, that is a deliberate variant, not a duplicate.

## Accessibility

- Visible focus on every interactive element (the global `:focus` of `theme.css`
  or a per-page equivalent).
- Every icon button carries a `title` or `aria-label`, and it comes from the
  catalogue (see "Text"): it is the first place a forgotten string hides, because
  it is only read on hover or by a screen reader.
- Touch targets ≥ 40 px in the control bars (mobile use). Three assumed
  exceptions, not to be reopened: Rehearsal's checkbox labels stay at 32 px below
  800 px (`rehearsal.css`), because that height IS the row's line height and at
  40 px the two rows of boxes read as two unrelated groups; the clickable width, a
  whole sentence, compensates. Stats' two pie legends stop at 32 px for the same
  reason (`stats.css`), and only the top legend bar goes to 40 px: those legends
  are first of all tables of numbers, and with ten characters 40 px per row added
  400 px to EACH of the two panels on a phone; there too the whole row is the
  target, from one card edge to the other. And the Editor no longer has any touch
  target: the page does not open on a `coarse` pointer
  (`src/editor/useTouchPointer.js`).
- Readable contrast on cream (`--ink-soft` is the minimum for informative text;
  nothing lighter).

## Responsive

- Every page is usable at 375 px wide: no horizontal scroll, bars and headers
  collapse (existing media queries around 800 px).
- Actors mostly use their phone: Rehearsal and Recorder come first.

## Text

The site is **bilingual** (French by default, English), and that is a structural
constraint before it is a style one: **no visible string lives in a component**.
Everything goes through the `src/shared/locales/fr.js` and `en.js` catalogues,
read by `t()` / `<T>` (engine `src/shared/i18n.js`, locale resolved by
`src/shared/locale.js`).

- **Zero visible literal in `src/`**, catalogues aside: no text between two tags,
  no `title`, `aria-label`, `placeholder`, `alt`, no prop carrying text (`hint`,
  `error`, `label`, `loading`, `unit`, `confirmLabel`, `primaryLabel`,
  `saveLabel`). A
  `title="Rename"` is a **high** finding, not a detail: it will never be
  translated and nothing on screen shows it on the French side.
- **A sentence stays a sentence.** Text carrying markup in the middle
  (`<strong>`, `<code>`, an icon, a link, a coloured `<span>`) goes through
  `<T k="…" p={{ … }} />`, the JSX fragment becoming a PARAMETER. Splitting the
  sentence into JSX fragments freezes French word order in the component, and that
  is unrepairable in translation.
- **No hand-rolled plurals.** No `n > 1 ? "s" : ""`: a `{ one, other }` catalogue
  entry and `t(key, { count })`, the choice coming from `Intl.PluralRules`
  ("0 réplique" in French, "0 lines" in English, which a ternary cannot do). Same
  rule for percentages and dates: `fmt.percent` / `fmt.dateTime`, never a
  `.replace(".", ",")` nor a hardcoded `"fr-FR"`.
- **A number is grouped by its locale**, "10 307" and "10,307". Inside a sentence
  the ENGINE does it: every numeric parameter of `t()` goes through
  `Intl.NumberFormat`, so there is nothing to write at the call site and nothing
  to forget. `fmt.number` serves only numbers written ALONE, outside any sentence
  (the total at the centre of the Stats ring, the counts in its legend); a bare
  number rendered directly in JSX is a finding.
- **Quotes come from `fmt.quote`**, never from hand-written `«&nbsp;…&nbsp;»`:
  French wants its non-breaking spaces, English curly quotes.
- **An ENUMERATION of already-translated phrases is joined by `fmt.list`**
  (`Intl.ListFormat`, `type: "unit"`), never by a `", "` written in the component
  nor by a catalogue entry made of one comma: how a language strings a list
  together is a fact of that language, exactly like the space before a French `?`.
  The upload journal's script row is the case (`changesOf`, `dashboard/App.jsx`).
  `type: "unit"` and not the default `"conjunction"`, which in English adds a
  spoken ", and" that turns a row of measurements into a sentence about them; the
  two agree in French. Measured, not assumed.
- **French typography lives INSIDE the strings** (non-breaking space before `?`,
  `!`, `:`, guillemets), never in the JSX: it is a fact of the language, hence the
  translator's business, and English does not carry it.
- **A shared label exists only once**, and that goes down to PUNCTUATION: a
  separator, a parenthesis and a fraction slash are facts of language, so they
  live in the string and never in the JSX (`recorder.lineCounter` is "{n}/{total}"
  in both catalogues, French included, which is what settles the slash). **One
  named exception**, `CellMark` in `dashboard/App.jsx`: its two numbers must be two
  elements to carry two weights, so routing their slash through the catalogue would
  mean one `<T>` per CELL, several hundred on a play of twenty characters and forty
  scenes, in exchange for a character both languages write the same way. The code
  says so at the site; do not re-open it. When two places name the same thing,
  the second INTERPOLATES the first's key (Stats' empty state quotes
  `stats.scopeAllOption`, the empty-scene help quotes `rail.characters`, the
  option suffix `common.optionNote` quotes `common.lineCount` on Rehearsal and
  `recorder.toRecord` on Recording, so the brackets are written once and the
  plural tuned in one place only) or both share a common key (`common.actScene` names the
  act + scene pair for Stats AND the Dashboard, which used to write a "·" by hand;
  `common.myLineNumber` names "(3/12)" for Rehearsal and the Recorder). The
  heaviest case, and the only one held by CI: the **name of a page quoted in a
  sentence** goes through a `{page}` fed by `t(pageLabelKey(...))`, never through
  the word written out. The `test_contracts.py` guard only sees the "page X" /
  "mode X" turn of phrase, and that is deliberate: in French page names are common
  nouns, so a sentence starting with one is legitimate.
- **Two language axes, not to be confused**: the INTERFACE locale (chosen by the
  reader, `LocaleSwitch`) and the PLAY's language (`script.language`, chosen in
  the rail plan, which drives the PDF, the synthetic voice and the Editor's act
  and scene labels). Line text follows the second. An act or scene label
  **depends on the page**, and it is the only text on the site in that case:
  READER locale on the four pages that only NAVIGATE (Rehearsal, Recorder,
  Dashboard, Stats), where choosing a scene in a play you are not touching is
  written in the language you read; PLAY language in the Editor, where you shape
  the document and where "Acte II" is word for word the running head the PDF will
  print. That is what makes `t` a PARAMETER of `actLabel`/`sceneLabel` and not an
  import: the Editor passes a translator bound to `script.language` (`translator`
  in `locale.js`). An assumed corollary, not to be reported as a defect: on a play
  whose language is not the reader's, the same scene is called "Scene 3" in the
  Editor and "Scène 3" on the Dashboard, and the sentence QUOTING a label stays in
  the reader's language ("Déplacer Act I"), a string parameter passing through
  intact.
- **What a pure module never does**: import `locale.js`. It reads the URL,
  storage and the navigator as soon as it is imported, so it breaks `node --test`.
  A module covered by the tests receives `t` as an argument (`stats.js`) or
  returns a CODE the page translates (`useRecorder.js` and its `"mic"`).
- Style, in both languages: consistent tone (no `tutoiement`, infinitive or
  polite imperative), no em dash, and English does not translate word for word
  what only exists in French ("répéter à l'italienne" → "run your lines",
  "le responsable" → "the coordinator", never "your coordinator").
