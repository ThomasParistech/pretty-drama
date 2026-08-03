# Design system, contract between the pages

Reference for the front review. Code and this file diverge: say which is wrong. If the
code is right, update this file AND the "File map" table in `CLAUDE.md`.

## Pages

**Two ROOT pages**, above the plays, literal Vite entries. They carry the BRAND, not a
page seal: no `page.*` key, no `desc`, the hero, all styling from `home.css`.

| Entry | Page | Own CSS |
| --- | --- | --- |
| `index.html` | The troupe's play chooser | `src/home/home.css` + `src/chooser/chooser.css` |
| `respo.html` | The coordinator's play management (same `App.tsx`, `manage` flag) | same |

**Seven pages of a PLAY**, templates from `pages/` instantiated into each play's folder by
`vite.config.ts`:

| Template | Page | Own CSS |
| --- | --- | --- |
| `pages/index.html` | The play's actor home (Rehearsal, Recorder, Stats) | `src/home/home.css` |
| `pages/respo.html` | The play's coordinator home (all 5 pages) | `src/home/home.css` (same `App.tsx`, other card list) |
| `pages/rehearsal.html` | Rehearsal | `src/rehearsal/rehearsal.css` |
| `pages/recorder.html` | Recorder | `src/recorder/recorder.css` |
| `pages/stats.html` | Stats | `src/stats/stats.css` |
| `pages/dashboard.html` | Dashboard | `src/dashboard/dashboard.css` |
| `pages/editor.html` | Editor | `src/editor/editor.css` |

Inside a play no path changes. Only three `src/shared/` helpers know the `plays/<id>/`
layout, no PAGE does: `chooserHref`, `playHref`, `githubRepoUrl` (which must recognise a
root Pages site whose first segment is `plays`).

**Seals** (`--page-mark` / `--page-mark-soft`, `.page-<key>` in `theme.css`):

- Brand, Rehearsal, Recorder, Stats share **exactly** one pair (burgundy `#8b2635` on sand
  `#f5eeda`). Only the Dashboard (navy `#1d4e89`, kept clear of the `--ok` green and
  `--warn` amber it shows as STATUSES) and the Editor (purple) have their own. The icon,
  not the hue, tells the troupe pages apart. Two neighbouring but distinct hues between
  them is a finding.
- Favicon and `theme-color` duplicate the seal colour in each `.html` (a `<link>` cannot
  read a CSS variable). The favicon and its `apple-touch-icon.png` **are** the seal pill:
  tile in `--page-mark-soft`, glyph in `--page-mark`. A white glyph on a solid tile is a
  finding. `theme-color` stays the solid `--page-mark`.

## Tokens (`src/shared/theme.css`)

Every page loads it. Colours, radii, shadows and fonts go through `:root`: `--paper`,
`--paper-dark`, `--card`, `--ink`, `--ink-soft`, `--accent`, `--accent-dark`,
`--accent-soft`, `--gold`, `--border`, `--ok(-soft)`, `--warn(-soft)`, `--radius`,
`--shadow`, `--shadow-hover` (consumed only through `.lift-hover`), `--shadow-float` (a
layer FLOATING above the page: modal, Rehearsal's "your turn" pop-up), `--card-active`,
`--focus-ring(-offset)` (elements with no default ring: slider, cards, card links),
`--notice-gutter`, `--tile-lit` (the lit surface of a header file tile, the accent at 22 %
on white, declared beside the accent it mixes so a re-skinning page re-derives it: the
Editor's `--ed-tile-lit` is that token under a local name), `--font-ui`, `--font-serif`,
the reserved `--header-accent` / `--header-serif` / `--header-shadow`, and `--ease-header`.

**Re-skins.** A page may re-skin tokens in a local `:root`, and two do: the Editor
wholesale (the "Rail": accent `#7a5cc0`, IBM Plex/Spectral, warmed neutrals), the
Dashboard the accent triplet only (navy, same as its seal, so the grid band, journal head
and both file tiles read ONE navy; the seal tokens sit on the `<header>` ELEMENT and
nothing in the body reaches them).

**Invariant**: a re-skin never changes the visible identity of a shared component. A
shared component drawing its accent, font or size from a re-skinnable token is **high**.
Re-skinned matching neutrals (`--card`, `--border`, `--ink-soft`) are tolerated while
perceptually equivalent. `--paper` stays `#faf6ef` on every page, re-skin included.

`test_contracts.py` enforces it: fails if a page CSS **redefines** a `--header-*`, or if a
header rule consumes `--accent`, `--font-serif`, `--shadow` or `--page-mark(-soft)`.

The guard is about REDEFINITION, not reading. Not findings:

- `--header-shadow` read by Stats (legend bar matching the band above) and by the Editor's
  `--ed-panel-shadow` (that page sets `--shadow: none`).
- Nothing reads `--header-accent` any more: the Editor's `.btn.primary` is the upload
  tile's own object (`--accent-soft` fill, `--ed-accent-ink`), the rail plan's act tile a
  tint of the page's violet, the wine left to the logo at the header foot.
- The Dashboard's PDF download carries no `.btn`: it is the file tile, documented at
  `.dash-script-tile` (`dashboard.css`).
- `.play-header-home*`, exempted by name: the home link is the FOOT of the header it
  closes, so it wears that header's colour and carries `page-${page}` itself, a JSX-set
  class the CSS-only guard cannot see.
- `.flag-icon`: the only image neither `currentColor` nor font-sized, a flag having its
  own colours and a fixed size (24x16). Its outline is an outer `box-shadow`, not a
  `border`, or the tricolour's white band and the Union Jack's white ground melt into the
  cream.
- `.confirm-quote` consuming `--font-serif` **on purpose**: a quoted line reads in the
  serif of ITS page (Cormorant on the Recorder, Spectral on the Editor).
- The two ELEMENT rules of `theme.css` that read `--accent` deliberately, so a re-skinned
  page tints its own controls: `select:focus/input:focus/textarea:focus` (the focus ring)
  and `input[type="checkbox"]`'s `accent-color`. What is shared there is the GEOMETRY, not
  the colour, so the Editor's boxes and rings are violet and Rehearsal's wine.

Corollary: every font a shared component consumes must be loaded by the Google Fonts
`<link>` of each `.html` concerned, weight included, or it renders as a faux weight.

**Hover: `.lift-hover`, never the copied pair.** Step up + `--shadow-hover`, one class set
in JSX. A `transform: translateY(…)` + `box-shadow: var(--shadow-hover)` rewritten in a
page CSS is a `duplication` finding. Only legitimate deviation: `--lift` on the element
(default `-1px`, `-3px` on the tall home cards). Two traps: the `transition` stays with
each surface (one property, a local declaration would override the shared file), so a
surface taking the class must list `transform` and `box-shadow` in its own transition; and
`.play-header-home` does **not** take it (same step, seal's cream wash instead of the
shadow).

**Shared classes to prefer over copying their declarations**, all in `theme.css`, all set
in JSX. Rewriting one is a `duplication` finding:

- `.truncate`: overflow/ellipsis/nowrap. Max width and `flex` stay local; the caller must
  double it with a `title`.
- `.btn-tip`: wrapper carrying the tooltip of a button that DISABLES (a `disabled` control
  receives no mouse event). The `aria-label` stays on the button.
- `.page-shell` / `.page-scroll`: window-height shell whose content alone scrolls, tuned
  by `--shell-height` (`100vh` on the Editor, `100dvh` elsewhere).
- `.checks-row label, .search-options label`: checkbox-label geometry.
- `.upload-tile.in-header`: the WHOLE look of a file tile worn in a header (fill, lit
  hover through `--tile-lit`, focus, reduced motion). A carrier adds its ink only.

**A local colour is not necessarily a duplication.** Check the BACKGROUND first:
`--rec-todo` / `--rec-fresh` (`recorder.css`) look like `--warn` / `--ok` but live on the
pink "my lines" card (`--accent-soft`), where `--ok` drops to 4.31:1 and fails AA. The
measurement is in the file. Not a finding.

No hardcoded colour/shadow/radius in a page CSS when an equivalent token exists; hardcoded
values are for genuinely local cases and must stay harmonious on cream.

## Structural components

| Element | Source and rules | Pages |
| --- | --- | --- |
| Brand header | `src/shared/PageHeader.tsx`. Heads `PageState` screens only, never mounted by a page. Same geometry as `PlayHeader` and the same `HomeLink` at the foot. Its `title` is the **play title and nothing else**, optional, `<span>` not rendered without it. Same CSS rule as `.play-header-title`, not a lookalike | through `PageState` only |
| Play header (seal + play title, collapsible; **no** page label written out) | `src/shared/PlayHeader.tsx`. Top row says ONLY the play title; "PrettyDrama" and the home link live at the foot of the expanded header. Act/scene selects come as `children` (`.selects-row`), their variants being real (`disabled` while recording, "to record" counters). Both scene menus are FILTERED by `sceneChoices` (`shared/data.ts`) once a character is chosen: `<option value>` stays the scene's rank in the ACT (hiding an option never renumbers the rest), and the whole act comes back when the character speaks nowhere in it. The Recorder's menus carry `optionSuffix` with THREE cases: `(n à enregistrer)`, a bare `✓` when done, `(aucune réplique)` where the character never speaks (a tick there would claim work that never existed). The mark is a monochrome glyph, an `<option>` being drawn by the browser. Dashboard and Editor pass no selects (the Editor moved its plan into the rail's "Structure" section, it SHAPES the structure). **The header collapses on all five**, those two included | Rehearsal, Recorder, Stats, Editor, Dashboard |
| Bottom control bar `.controls` + `.ctrl-btn` | `theme.css` | Rehearsal, Recorder |
| Indexed progress slider | `src/shared/ProgressBar.tsx` | Rehearsal, Recorder |
| Dialogue cards `.dialogue-card` (+ `.mine` palette, `.active` border) | `theme.css`; pages set `.mine` beside their semantic class and keep only real deviations | Rehearsal, Recorder |
| Buttons `.btn` / `.btn.primary` | `theme.css` | all |
| File tile | `src/shared/UploadTile.tsx` + `.upload-tile*` (`theme.css`). ONE look for "a file passes between the coordinator and the repository", BOTH directions; the class name says `upload` for history only. Covers the two uploads (GitHub link on Progress, button on Editing since the file downloads first); the PDF download composes the same classes by hand (`.dash-script-tile`), the component being a link or a button and neither being a download. Direction is the opening drawing (a seal for what leaves, `DownloadIcon` for what returns) and the verb, never the shape. The coloured word takes the page one is READING: the PDF tile sits in the header with `page-dashboard`, the voices tile in the BODY where the seal tokens resolve to nothing, so it carries no `page-<key>` and takes the re-skinned `--accent` through `.dash-actions .upload-tile-word`. Its seal still draws Recording's mic, `tone` on `PageMark` splitting drawing from colour | Progress (voices, PDF), Editing (script) |
| Home link | `src/shared/HomeLink.tsx`, **one component for both headers**. Carries `page-${page}` on the link and passes the same key as the seal's `tone`: badge, word, hover wash and focus ring take the colour of the page one is LEAVING | both headers |
| Page seal (round pill + icon) | `src/shared/PageMark.tsx` + `PAGES` (`src/shared/pages.ts`). Its `page-<key>` class carries its colours, so it displays anywhere, header or not. `label` when the seal does not designate its own page (the journal's Type column: the mic means "Voice"); `label=""` when **decorative**, the word being already beside it (home cards, hero brand, home link, file tile), else every link announces itself twice. `tone` when DRAWING and COLOURS part company: exactly two places, the home link and the voices tile | both headers, home cards, Dashboard's voices tile, both icon columns of its journal (Status reuses the pill with `--ok`/`--warn`) |
| Header doc `.header-hint` (one class for both paragraphs, their place tells them apart) | Style in `theme.css`, **rendered by `PlayHeader`**, never by a page: first paragraph `PAGES[page].desc` (same as the home card), second the optional `hint`. The two bracket the settings | all five: `desc` everywhere, `hint` on Recorder and Editor |
| Destructive-action confirmation | `src/shared/ConfirmModal.tsx`: portal, Escape cancels, initial focus on the proposed button. **Never `window.confirm`**. Line quotation: `.confirm-quote` + `excerpt` (`data.ts`) | Editor (line, scene, act), Recorder (discard a take), `LeaveGuard` |
| Page-exit guard (undownloaded work) | `src/shared/LeaveGuard.tsx`: capture-phase link clicks + `beforeunload` as a net | Editor, Recorder |
| SITE language switch (two flags) | `src/shared/LocaleSwitch.tsx`: two real links carrying `?lang=`, so right-click and new tab work, and no state (the next load stores the choice). **Mounted at the foot of the home pages and by them ALONE**: a language is a SITE setting, chosen on the way in, and the shared header's foot is a finished composition a second object would knock off-centre. A language's name is written **in that language** (`Français`, `English`), the only accented literal the CI guard exempts by name. Not the PLAY's language, which shows the same flags in the rail plan but is a FIELD editing `script.json` | the home pages |
| Sentence carrying markup | `src/shared/T.tsx`, `<T k="…" p={{ … }} />`, the JSX becoming a PARAMETER. A sentence split into fragments is a finding | every one quoting a `<strong>`, `<code>`, an icon or a link mid-sentence |
| Act and scene labels | `src/shared/structureLabels.ts`, DERIVED from rank (`actLabel(t, i)`, `sceneLabel(t, i)`), acts and scenes having no title. Pure, `t` as an argument, which is what lets the two language axes coexist. Python holds a second implementation for paper (`STRUCTURE`, `roman_numeral` in `build_script_pdf.py`), from the PLAY's language; `TestStructureLabels` forbids divergence | both scope selects, Dashboard, Stats, Search, rail plan, PDF |
| Line count of a play object | `src/editor/CountBadge.tsx`: bare number on screen (the column must align), sentence in the `aria-label`, `role="img"` to be valid on a `<span>` | Editor rail, "Structure" and "Characters" |
| Mounting a page | `src/shared/mountPage.tsx`: `applyDocumentLanguage` then `createRoot(...).render(...)`, and the `theme.css` import, whose ORDER matters (before the page CSS that overrides it), hence importing this module BEFORE `App.tsx` in every entry point | the nine entry points |
| "(3/12)" numbering of my lines | `src/shared/data.ts`: `myLineNumbers` (Map) and `myLineNumber` (label, `t` as an argument, this module being under `node --test`) | Rehearsal, Recorder |
| Manifest fetch | `src/shared/useManifest.ts` | Rehearsal, Recorder, Stats, Dashboard (the home page calls `fetchManifest` directly: no loading and no error screen, a missing manifest just leaves the title empty) |
| Full-page loading/error screen | `src/shared/PageState.tsx`: BOTH states take the shared `.page-notice` card, being one screen at two moments | the five play pages (Rehearsal, Recorder, Stats, Dashboard, Editor). The four BRAND pages have no `page` key and so no seal to head a state with: a play's home page leaves the title empty, the two root pages report inline (`.chooser-error`, `.chooser-new-error`) |

**No header writes its page label**, without exception: the seal says the page and the tab
repeats it. Both headers' `title` is the play title, and it is optional.

**Waiting screen or final screen**, the distinction `PageState` does not make itself. A
screen you pass THROUGH (loading, unreadable manifest) does not know the play yet, so its
header **says nothing** and does not fall back to the page label: the title APPEARS when
the manifest arrives and never covers another one. A **final** screen is this user's final
content and holds to the header contract: it names the play. The test is not the severity
of the message but whether you stay there. There are **three**, all rendered after loading
on purpose: the Editor on a finger, the Recorder on a browser that cannot record, the
Rehearsal of a still-empty play. Fallback when the play has no title: the same
untitled-play label as the five headers. Check in the CODE, not only in the render, that
the page **loads what it takes** (the walled Editor does its `fetch` for its title alone);
an `if (…) return` placed before the load ends up readable in the header.

Related rules:

- No em dash in user-visible text, headers included.
- Same pink/gold "my lines" palette on Rehearsal (`.active`) and Recorder
  (`.own`/`.active`).
- No page implements its own variant of a shared component (no second header, no homemade
  bottom bar, no re-coded slider). Act/scene selects stay `children` of the shared header;
  a page passing none keeps the header as is.

## Factorization

- A style used by **at least two pages** lives in `theme.css`, never copy-pasted.
- A JSX component/hook/helper used by at least two pages lives in `src/shared/`.
- A page CSS holds only what is specific to it; redefining a `theme.css` class is a
  deliberate variant, not a duplicate.

## Accessibility

- Visible focus on every interactive element.
- Every icon button carries a `title` or `aria-label`, from the catalogue: the first place
  a forgotten string hides, being read only on hover or by a screen reader.
- Touch targets >= 40 px in the control bars. Three assumed exceptions, not to be
  reopened: Rehearsal's checkbox labels stay 32 px below 800 px (that height IS the row's
  line height; the clickable width compensates); Stats' two pie legends stop at 32 px,
  only the top legend bar going to 40 px (with ten characters, 40 px per row added 400 px
  to each panel on a phone; the whole row is the target); the Editor has no touch target
  left, not opening on a `coarse` pointer (`useTouchPointer.ts`).
- Readable contrast on cream: `--ink-soft` is the minimum for informative text.

## Responsive

- Every page usable at 375 px: no horizontal scroll, bars and headers collapse (media
  queries around 800 px).
- Actors mostly use their phone: Rehearsal and Recorder come first.

## Text

**Bilingual** (French default, English), a structural constraint before a style one:
everything goes through `src/shared/locales/{fr,en}.ts`, read by `t()` / `<T>` (engine
`i18n.ts`, locale resolved by `locale.ts`).

- **Zero visible literal in `src/`**, catalogues aside: no text between tags, no `title`,
  `aria-label`, `placeholder`, `alt`, no text-carrying prop (`hint`, `error`, `label`,
  `loading`, `unit`, `confirmLabel`, `primaryLabel`, `saveLabel`). A `title="Rename"` is
  **high**: it will never be translated and nothing shows it on the French side.
- **A sentence stays a sentence.** Markup mid-sentence goes through
  `<T k="…" p={{ … }} />`, the JSX becoming a PARAMETER. Split into fragments it freezes
  French word order, which translation cannot repair.
- **No hand-rolled plurals**: `{ one, other }` + `t(key, { count })`, via
  `Intl.PluralRules` ("0 réplique" but "0 lines", which a ternary cannot do). Same for
  percentages and dates: `fmt.percent` / `fmt.dateTime`, never `.replace(".", ",")` nor a
  hardcoded `"fr-FR"`.
- **Numbers are grouped by locale.** Inside a sentence the ENGINE does it: every numeric
  parameter of `t()` goes through `Intl.NumberFormat`. `fmt.number` serves only numbers
  written ALONE (the Stats ring total, its legend counts); a bare number rendered directly
  in JSX is a finding.
- **Quotes come from `fmt.quote`**, never hand-written `«&nbsp;…&nbsp;»`.
- **An ENUMERATION of translated phrases is joined by `fmt.list`** (`Intl.ListFormat`,
  `type: "unit"`), never a `", "` in the component nor a catalogue entry made of one
  comma. The case is the journal's script row (`changesOf`, `dashboard/App.tsx`).
  `type: "unit"` and not the default `"conjunction"`, which in English adds a spoken
  ", and" that turns a row of measurements into a sentence about them. Measured.
- **French typography lives INSIDE the strings** (non-breaking space before `?`, `!`, `:`,
  guillemets), never in the JSX.
- **A shared label exists only once**, down to PUNCTUATION: separators, parentheses and a
  fraction slash live in the string (`recorder.lineCounter` is "{n}/{total}" in both
  catalogues). **One named exception**, `CellMark` (`dashboard/App.tsx`): its two numbers
  must be two elements to carry two weights, so routing the slash through the catalogue
  would mean one `<T>` per CELL, several hundred per play, for a character both languages
  write the same way. Do not reopen it.
  When two places name the same thing, the second INTERPOLATES the first's key (Stats'
  empty state quotes `stats.scopeAllOption`; the empty-scene help quotes `rail.characters`;
  `common.optionNote` quotes `common.lineCount` on Rehearsal and `recorder.toRecord` on
  Recording, so the brackets are written once and the plural tuned in one place), or both
  share a key (`common.actScene`, `common.myLineNumber`). Held by CI: a **page name quoted
  in a sentence** goes through `{page}` fed by `t(pageLabelKey(...))`, never the word
  written out. The guard only sees the "page X" / "mode X" turn of phrase, deliberately:
  in French page names are common nouns, so a sentence may legitimately start with one.
- **Two language axes.** The INTERFACE locale (reader's choice, `LocaleSwitch`) and the
  PLAY's language (`script.language`, chosen in the rail plan, driving the PDF, the
  synthetic voice and the Editor's labels). Line text follows the second. An act or scene
  label **depends on the page**, the only text on the site in that case: READER locale on
  the four NAVIGATING pages, PLAY language in the Editor, where "Acte II" is word for word
  the running head the PDF prints. Hence `t` is a PARAMETER of `actLabel`/`sceneLabel`, the
  Editor passing a translator bound to `script.language`. Assumed corollary, not a defect:
  on a play whose language is not the reader's, the same scene is "Scene 3" in the Editor
  and "Scène 3" on the Dashboard, and a sentence QUOTING a label stays in the reader's
  language ("Déplacer Act I").
- **A pure module never imports `locale.ts`** (it reads URL, storage and navigator on
  import, breaking `node --test`): it takes `t` as an argument (`stats.ts`) or returns a
  CODE the page translates (`useRecorder.ts` and its `"mic"`).
- Style, both languages: consistent tone (no `tutoiement`, infinitive or polite
  imperative), no em dash, and English never calques the French ("répéter à l'italienne"
  into "run your lines", "le responsable" into "the coordinator", never "your
  coordinator").
