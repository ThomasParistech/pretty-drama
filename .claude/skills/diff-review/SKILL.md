---
name: diff-review
description: Review everything not yet published on the main branch — bugs, CI safety, project invariants, bilingual language pass, tests and build, plus a front audit when the UI is touched. Fixes what is technical, escalates only product/UX/UI, ends with a ready-to-paste PR title. Use before committing or pushing, after UI changes, or on demand (/diff-review).
---

# Review of the current diff

Covers **everything not yet published**: unpushed commits, staged and unstaged
changes, untracked files. The front audit is part of it (`front-reviewer` agent,
static review against the design system: visual consistency is guaranteed *by
construction*, shared components and tokens, not by comparing renders). One final
report, **short** (§7), ending with a PR title (§8).

## 1. Base and scope

The base is **never hardcoded**, it is computed:

```sh
# remote main branch, else fall back to HEAD
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD)
[ -z "$BASE" ] && git rev-parse -q --verify origin/main >/dev/null && BASE=origin/main
[ -z "$BASE" ] && BASE=HEAD
git merge-base HEAD "$BASE"   # on a work branch: start at the divergence point
```

On the main branch itself the review covers unpushed commits + index + worktree;
with no remote, base = `HEAD` (uncommitted changes only). Never `git fetch`
without asking.

Delimit with `git log --oneline $BASE..HEAD`, `git diff $BASE --stat`,
`git status --porcelain`. **Untracked files are in scope** (read them); ignore
`dist/`, `node_modules/`, `clips/*.mp3`. Empty scope: say so and stop.

Sort touched files by decreasing risk: 1. **back** (`scripts/` + tests, runs in
CI on hostile input); 2. **CI** (`.github/`); 3. **shared front**
(`src/shared/`, `vite.config.js`); 4. **pages** (`src/<page>/`, `*.html`, CSS);
5. **data** (`data/`, `uploads/`); 6. **docs/config**.

## 2. Start the front audit in parallel

If front files (risk 3-4) are touched, launch the `front-reviewer` agent
**immediately** (Agent tool, `subagent_type: "front-reviewer"`; if unregistered,
a `general-purpose` agent with the instructions from
`.claude/agents/front-reviewer.md`). It runs in the background while you do the
substance review. Pass it the touched front files to prioritise; it sweeps every
page anyway. Its contract is `references/design-system.md` (relative to this
skill), and the review confronts code and contract **both ways**.

It returns `file:line` findings marked `Safe: yes|no`. That marking is an
estimate, not a decision: re-read each one in the code before acting (an
unverifiable finding is dropped, not fixed "just in case"), then apply §6 and
merge into the final report. Its audit does **not** replace the §3bis language
pass: it sweeps the whole site, you read the diff that was just written.

## 3. Substance review

Read the diff file by file (`git diff $BASE -- <file>`), and for each hunk enough
surrounding code to judge in context: **never a finding from the diff alone**.

- **`scripts/`**: bugs and edge cases; every external input (ZIP, hand-uploaded
  JSON) is hostile, so a malformed one is ignored or collected into
  `uploads_result.json` and the journal, never a workflow crash; paths via
  `scripts/common.py`, none hardcoded; error messages stay **French** (they are
  rendered by the Dashboard journal, the coordinator's only channel).
- **`.github/`**: no injection in `run:` (user content — filenames, titles —
  through `env:`, never `${{ }}` interpolated into the script); minimal
  `permissions:`; the two workflows stay airtight (`uploads.yml` alone writes to
  the repo and the journal, `build.yml` alone deploys and writes nothing);
  **distinct `concurrency` groups** (else the called workflow deadlocks with its
  caller); `jobs.site.uses` and the `paths`/`paths-ignore` filters preserved.
- **tests**: a behaviour change in `scripts/` with no matching test case is a
  finding; normalization is tested through the shared `normalize-cases.json`.
- **`data/*.json`**: stays consistent with the code that produces it (Editor for
  `script.json`, `build_manifest`, `update_history`) — no hand edit that will
  diverge at the next build, unless it is an assumed test fixture.
- **`src/<page>/App.jsx`**: review **every state of the page**, not just the one
  in front of you. List its conditional `return`s (loading, read error, walled
  page, nothing selected, empty list) and judge each as a screen in its own
  right: which header, which title, which data was loaded for it. A state reached
  only on one device (touch pointer, no microphone) is never visited during
  review, and that is where the contract silently breaks — a skipped `fetch`, or
  a `return` placed before it, leaves the header with no play title and no CSS
  shows it.
- **everywhere**: no secret or token in the diff, no em dash in user-visible
  text. The front is bilingual: §3bis is a pass of its own, not a checklist line.

## 3 bis. Language pass (bilingual front)

**No visible string lives in a component**: everything goes through
`src/shared/locales/{fr,en}.js`. Mandatory as soon as the diff touches a `.jsx`
or `.js` under `src/`, even for a small change: that is exactly how five whole
pages stayed French after being translated. Guards first, reading second.

1. **Guards**, already in the Python suite (`scripts/tests/test_contracts.py`,
   class `TestCatalogues`) and JS (`src/shared/locales/parity.test.js`). A
   failure here is a **high** finding, never a test to relax: every key passed to
   `t()`/`<T>` exists in BOTH catalogues; no declared key is unused (an orphan
   key means a string believed translated and left hardcoded); no accented
   literal, no text-bearing attribute (`title`, `aria-label`, `placeholder`,
   `alt`, `hint`, `error`, `label`, `unit`, `confirmLabel`, `primaryLabel`,
   `saveLabel`) and no JSX text node carries a literal in `src/`; both catalogues
   share keys, placeholders and plural forms, and French has its non-breaking
   spaces.
2. **Reading**, because the guards have two documented blind spots: text
   adjacent to a brace on the same line, and unaccented English text stored in a
   variable. For **each front file in the diff**, list the strings the user will
   see and check each one:
   - it comes from `t()`/`<T>`, never a literal or a hand-assembled template;
   - a sentence carrying markup goes through `<T … p={{ … }} />`, the JSX
     becoming a parameter: split into fragments, it freezes French word order;
   - no hand-rolled plural (`n > 1 ? "s" : ""`), no number, percentage or date
     formatted by hand: `{ one, other }` + `t(key, { count })`, `fmt.percent`,
     `fmt.dateTime`, `fmt.quote`;
   - a label named in two places is INTERPOLATED from its key, not copied;
   - the new English entry is not a calque of the French, typography included
     (no non-breaking space, no French quotes);
   - no module covered by `node --test` imports `locale.js` (it reads URL,
     storage and navigator at import): it takes `t` as an argument, or returns a
     code the page translates.

   And **re-read the page in both languages**, at least mentally: a string that
   exists only in French shows up in English, an over-long one breaks a row. The
   report says which of the two was checked.

## 4. Project invariants

Check as soon as the diff touches the area:

- **Normalization**: one implementation (`scripts/normalize.py`), called only
  from `build_manifest.compute_status`. No JS normalizes: the browser ships
  **raw** text.
- **Line ids**: never recycled (they name the mp3s); `SAFE_ID`
  (`src/editor/reducer.js`) and `LINE_ID_PATTERN` (`scripts/process_uploads.py`)
  strictly identical.
- **ZIP contract**: if `downloadZip` (recorder) OR `parse_manifest` is touched,
  re-read **the other side** (manifest = bare `{lineId: raw text}` mapping, one
  `{lineId}.{ext}` audio per line, nothing else).
- **Sanitization mirrors**: `sanitize_script` (Python) stays the tolerant mirror
  of the editor's `sanitizeScript`; if one moves, the other follows.
- **Hostile uploads**: real size caps (ZIP headers lie), member names by
  `fullmatch`, all-or-nothing merge per ZIP, one broken ZIP never blocking the
  others, ZIP deleted even on error.
- **Takes**: memory only, `beforeunload` guard until exported,
  `URL.revokeObjectURL` on every replacement.

## 5. Executable checks

`python3 -m unittest discover -s scripts/tests` · `npm test` · `npm run build`.

Run all **three**, **twice**: once at the start (baseline — a pre-existing
failure is not blamed on your fixes) and once after every fix, front audit
included. A final failure is a high finding, output quoted verbatim.

## 6. Fixes: decide yourself, escalate what is not technical

The line is not "risky / not risky", it is **whose decision it is**. A technical
question, however heavy, is yours: you have the code, the tests and a way to
measure. Product, UX and UI belong to the coordinator, because nothing in the
repo settles them.

**Decide and apply, without asking** — open list, anything technical is yours
even if absent from it: any bug, edge case or missing test, even across several
files; **a data-format or ZIP-contract change**, provided BOTH sides move in the
same diff and a test covers it (that is what `test_contracts.py` exists for);
factorization (a CSS block or helper up into `theme.css` / `src/shared/`, a
shared JSX component, a DOM change when the render does not move); hardcoded
visible text → catalogue key in BOTH languages, missing key, copied label
becoming an interpolated key, punctuation lifted from JSX into the string;
accessibility (`title`/`aria-label`, focus ring, role, `.btn-tip` wrapper on a
button that disables); the docs (`CLAUDE.md`, `references/design-system.md`) when
the code is right against them; **dead-code removal**, provided non-use is
proven — grep the symbol AND runtime-composed keys (`page.${x}.label`), `.html`
entries, classes set in JSX. Proof made, delete; proof impossible, keep it and
say so in one line.

**Escalate, and only this** (`AskUserQuestion` if it blocks a batch, otherwise
the report's "To confirm" section): **product** (what a page must do, what is in
or out of scope, a gesture to add or remove); **UX** (what is asked of the user,
what a gesture means, what is confirmed); **UI** (a visible choice neither the
contract nor a site precedent settles: a new colour, a hierarchy, a layout); the
**tone** of a label when it carries a product stance, never its grammar or
punctuation; any action outside the worktree (commit, push, writing to `data/`).

Three reflexes before escalating something that *looks* like a UI question:

1. **Measure.** Many have a numeric answer, and the measurement can refuse the
   change: that is what saved `--rec-fresh`, which looked like a duplicate of
   `--ok` and holds AA on the pink card where `--ok` fails. Keep the measurement
   in a code comment so the question does not reopen.
2. **Look for the precedent.** The site already names, separates, aligns.
   Aligning on what exists (`common.actScene` rather than an invented "·") is a
   technical choice: the decision was already made elsewhere.
3. **Choose, then say so.** If you must arbitrate and the visible effect is
   thin, take the most defensible option, apply it, and write in one line what
   changes on screen. A report announcing a visible change beats a question that
   blocks a batch of fixes.

Real doubt is almost always about SCOPE ("is this still part of this diff?"), not
about the solution: apply and flag, do not ask. This review makes **no commit, no
stage, no push**.

## 7. Report

One terminal report (no file, no artifact), and **short**: it is the INVENTORY of
what was fixed, not the demonstration. The why of each fix already lives in the
code comment this repo requires anyway, and in the diff the reader has at hand. A
review report is not the review's log.

**Budget: about thirty lines total.** Overflow means the report is explaining
instead of listing.

One header line: base, scope ("N files vs origin/main, X untracked"), state of
the three checks.

### Fixed

One LINE per fix, by decreasing severity:

```
- [severity] file:line — the defect, in half a sentence.
```

No "Fix: applied" (everything here is), no category, no justification. Name the
DEFECT, never its three-step cause nor the chosen solution. `severity`: **high**
(data loss, workflow crash, broken invariant, user-visible bug), **medium**
(edge case, missing test, duplication, a11y), **low** (polish). **Low** fixes do
not take a line each: ONE line counts and names them ("5 polish items: dead CSS
rules, date fallback, two labels"). Past six high/medium lines, keep the six
worst and count the rest on one line.

### To confirm

What awaits the coordinator, and nothing else (product, UX, UI: §6). A technical
entry landing here is a fix you did not make. Two lines max per entry: the
question, then what you would do and what it changes on screen. Often empty, and
that is the good sign; empty, it reads "Nothing".

### All clear

**One line**, not one per dimension: fully compliant dimensions listed in a row
("invariants, ZIP contract, CI safety, tests 166 + 205, language: 9 front files
re-read in both languages"). The re-read file count is mandatory as soon as the
diff touches `src/`: it is the one promise the guards do not keep alone.

Then the §8 title, which closes the report.

**Not in it**: a "Refuted" section (a refuted finding is settled in a code
comment, see Guardrails, and costs the report one line at most when it required a
measurement); test output when they pass ("green" is enough; a failure is
quoted); what the diff DOES, which is the title's job; screenshots, tables, and
announcements of what you will do next.

## 8. PR title

The report ends with **one ready-to-paste line**, the PR title (or commit: this
repo works mostly straight on the main branch).

Convention read from `git log`, not invented: textual gitmoji (`:sparkles:`
feature, `:art:` UI and polish, `:bug:` fix) then a short lowercase sentence, in
French as soon as it carries content.

- It says what the diff **does**, never what the review fixed in it: the findings
  are a means, not the subject. "review fixes" teaches nothing to whoever reads
  the history in two years.
- One line, no final period, under about sixty characters.
- It names the **dominant** subject. If the diff carries several unrelated ones,
  **say so** and propose the seams (one title per batch and each one's files):
  that is an observation about the diff, not extra service. Never a portmanteau
  title ("misc", "UI + PDF + CI update").
- It mentions neither the docs (`CLAUDE.md`, `.claude/`) nor added tests: they
  follow the subject, they are not the subject.
- A body of at most 3 bullets (one per subject, in §1 risk order) is added only
  if the diff carries more than one subject. Otherwise the title suffices, and
  that is the common case.
- Like the rest, it is a **proposal**: no commit, no stage, no push, even if the
  title is approved in the next reply (that needs an explicit request).

## Guardrails

- Every finding is verified by re-reading the incriminated code before being
  reported — exact `file:line`, no "probable" finding; an unverifiable one is
  dropped.
- Large diff: prioritise in §1 risk order, but skip nothing silently — what was
  only skimmed is listed as such.
- Never "repair" `data/` by hand to make a check pass.
- A technical question is not put to the coordinator: it is measured, looked up
  in the repo's precedents, or decided (§6).
- A front-agent finding is not a decision taken: `Safe: yes` is re-read and can be
  **REFUTED** (measurement, precedent, constraint it could not see). An argued
  refusal is a review result, but it is written **in a code comment**, where it
  will stop the question from reopening, not in the report.
- The Editor has a deliberate re-skin ("Rail"): its token differences listed in
  the contract are not findings.
- If the code is right against the docs (front-reviewer `contract` category, or
  stale `CLAUDE.md`), update `references/design-system.md` AND the "File map"
  table in `CLAUDE.md` — do not "fix" the code.
