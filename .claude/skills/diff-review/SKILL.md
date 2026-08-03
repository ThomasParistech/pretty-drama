---
name: diff-review
description: Review everything not yet published on the main branch — bugs, CI safety, project invariants, bilingual language pass, tests and build, plus a front audit when the UI is touched. Fixes what is technical, escalates only product/UX/UI, ends with a ready-to-paste PR title. Use before committing or pushing, after UI changes, or on demand (/diff-review).
---

# Review of the current diff

Covers **everything not yet published**: unpushed commits, staged and unstaged changes,
untracked files. One final report, **short** (§7), ending with a PR title (§8).

## 1. Base and scope

The base is **never hardcoded**, it is computed:

```sh
# remote main branch, else fall back to HEAD
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD)
[ -z "$BASE" ] && git rev-parse -q --verify origin/main >/dev/null && BASE=origin/main
[ -z "$BASE" ] && BASE=HEAD
git merge-base HEAD "$BASE"   # on a work branch: start at the divergence point
```

On main: unpushed commits + index + worktree. No remote: base = `HEAD`. Never `git fetch`
without asking.

Delimit with `git log --oneline $BASE..HEAD`, `git diff $BASE --stat`, `git status
--porcelain`. **Untracked files are in scope** (read them); ignore `dist/`,
`node_modules/`, `clips/*.mp3`. Empty scope: say so and stop.

Sort touched files by decreasing risk: 1. **back** (`scripts/` + tests, CI code on hostile
input); 2. **CI** (`.github/`); 3. **shared front** (`src/shared/`, `vite.config.ts`);
4. **pages** (`src/<page>/`, `*.html`, CSS); 5. **data** (`data/`, `uploads/`);
6. **docs/config**.

## 2. Start the front audit in parallel

If front files (risk 3-4) are touched, launch the `front-reviewer` agent **immediately**
(Agent tool, `subagent_type: "front-reviewer"`; if unregistered, a `general-purpose` with
the instructions from `.claude/agents/front-reviewer.md`). It runs in the background while
you do the substance review. Pass it the touched files to prioritise; it sweeps every page
anyway. Its contract is `references/design-system.md`, confronted **both ways**.

It returns `file:line` findings marked `Safe: yes|no`. That marking is an estimate, not a
decision: re-read each in the code, then apply §6. An unverifiable finding is dropped, not
fixed "just in case". Its audit does **not** replace §3bis: it sweeps the whole site, you
read the diff.

## 3. Substance review

Read the diff file by file, and for each hunk enough surrounding code to judge in context:
**never a finding from the diff alone**.

- **`scripts/`**: bugs and edge cases; every external input (ZIP, hand-uploaded JSON) is
  hostile, so a malformed one is ignored or collected into `uploads_result.json` and the
  journal, never a workflow crash; paths via `scripts/common.py`, none hardcoded; error
  messages stay **French** (the Dashboard journal renders them, the coordinator's only
  channel).
- **`.github/`**: no injection in `run:` (user content through `env:`, never `${{ }}`
  interpolated into the script); minimal `permissions:`; airtight roles (`uploads.yml`
  alone writes to the repo and the journal, `build.yml` alone deploys and writes nothing
  but the README's site address); **distinct `concurrency` groups** (else the called
  workflow deadlocks with its caller); `jobs.site.uses` and the `paths`/`paths-ignore`
  filters preserved.
- **tests**: a behaviour change in `scripts/` with no matching test case is a finding;
  normalization is tested through the shared `normalize-cases.json`.
- **`data/*.json`**: consistent with the code that produces it. No hand edit that will
  diverge at the next build, unless it is an assumed fixture.
- **`src/<page>/App.tsx`**: review **every state of the page**. List its conditional
  `return`s (loading, read error, walled page, nothing selected, empty list) and judge each
  as a screen of its own: which header, which title, which data was loaded for it. A state
  reached only on one device (touch pointer, no microphone) is never visited during review,
  and that is where the contract silently breaks: a skipped `fetch`, or a `return` before
  it, leaves the header with no play title and no CSS shows it.
- **everywhere**: no secret or token in the diff, no em dash in user-visible text.

## 3 bis. Language pass (bilingual front)

**No visible string lives in a component.** Mandatory as soon as the diff touches a `.tsx`
or `.ts` under `src/`, even for a small change: that is how five whole pages stayed French
after being translated. Guards first, reading second.

1. **Guards**, in the Python suite (`test_contracts.py`, class `TestCatalogues`) and JS
   (`locales/parity.test.ts`). A failure is **high**, never a test to relax: every key
   passed to `t()`/`<T>` exists in BOTH catalogues; no declared key is unused (an orphan
   means a string believed translated and left hardcoded); no accented literal, no
   text-bearing attribute (`title`, `aria-label`, `placeholder`, `alt`, `hint`, `error`,
   `label`, `unit`, `confirmLabel`, `primaryLabel`, `saveLabel`) and no JSX text node
   carries a literal in `src/`; both catalogues share keys, placeholders and plural forms,
   and French has its non-breaking spaces.
2. **Reading**, the guards having two blind spots: text adjacent to a brace on the same
   line, and unaccented English text stored in a variable. For **each front file in the
   diff**, list the strings the user will see and check each:
   - from `t()`/`<T>`, never a literal or a hand-assembled template;
   - markup mid-sentence through `<T … p={{ … }} />`, the JSX becoming a parameter;
   - no hand-rolled plural, no number, percentage or date formatted by hand:
     `{ one, other }` + `t(key, { count })`, `fmt.percent`, `fmt.dateTime`, `fmt.quote`;
   - a label named twice is INTERPOLATED from its key, not copied;
   - the English entry is not a calque, typography included;
   - no module under `node --test` imports `locale.ts`: it takes `t` as an argument or
     returns a code the page translates.

   Then **re-read the page in both languages**, at least mentally. The report says which
   of the two was checked.

## 4. Project invariants

Check as soon as the diff touches the area:

- **Normalization**: one implementation (`scripts/normalize.py`), exactly two callers,
  `build_manifest.compute_status` and `script_diff.script_changes`, deliberately sharing
  the rule. No JS normalizes: the browser ships **raw** text (`editor/search.ts` folding is
  not this).
- **Line ids**: never recycled (they name the mp3s); `SAFE_ID` (`editor/reducer.ts`) and
  `LINE_ID_PATTERN` (`process_uploads.py`) strictly identical.
- **Play ids**: never re-minted, minted in one place (`mint_play_id`), validated **before**
  a path is built.
- **ZIP contract**: if `downloadZip` OR `parse_manifest` is touched, re-read **the other
  side** (bare `{lineId: raw text}` mapping, one `{lineId}.{ext}` per line, nothing else).
- **Sanitization mirrors**: `sanitize_script` stays the tolerant mirror of `sanitizeScript`;
  if one moves, the other follows.
- **Hostile uploads**: real size caps (ZIP headers lie), member names by `fullmatch`,
  all-or-nothing merge per ZIP, one broken ZIP never blocking the others, ZIP deleted even
  on error.
- **Takes**: memory only, `beforeunload` guard until exported, `URL.revokeObjectURL` on
  every replacement.

## 5. Executable checks

`python3 -m unittest discover -s scripts/tests` · `npm test` · `npm run build`.

All **three**, **twice**: at the start (baseline, so a pre-existing failure is not blamed
on your fixes) and after every fix, front audit included. A final failure is a high
finding, output quoted verbatim.

## 6. Fixes: decide yourself, escalate what is not technical

The line is not "risky / not risky", it is **whose decision it is**. A technical question,
however heavy, is yours: you have the code, the tests and a way to measure. Product, UX and
UI belong to the coordinator, because nothing in the repo settles them.

**Decide and apply, without asking** (open list, anything technical is yours even if absent
from it): any bug, edge case or missing test, across as many files as it takes; **a
data-format or ZIP-contract change**, provided BOTH sides move in the same diff and a test
covers it; factorization (a CSS block or helper up into `theme.css` / `src/shared/`, a
shared component, a DOM change when the render does not move); hardcoded visible text into
a catalogue key in BOTH languages, missing key, copied label becoming an interpolated key,
punctuation lifted from JSX into the string; accessibility (`title`/`aria-label`, focus
ring, role, `.btn-tip` wrapper on a button that disables); the docs when the code is right
against them; **dead-code removal** when non-use is proven (grep the symbol AND
runtime-composed keys like `page.${x}.label`, `.html` entries, classes set in JSX). Proof
made, delete; proof impossible, keep it and say so in one line.

**Escalate, and only this** (`AskUserQuestion` if it blocks a batch, otherwise "To
confirm"): **product** (what a page must do, what is in or out of scope, a gesture to add
or remove); **UX** (what is asked of the user, what a gesture means, what is confirmed);
**UI** (a visible choice neither the contract nor a site precedent settles: a new colour, a
hierarchy, a layout); the **tone** of a label when it carries a product stance, never its
grammar or punctuation; any action outside the worktree (commit, push, writing to `data/`).

Three reflexes before escalating something that *looks* like a UI question:

1. **Measure.** The measurement can refuse the change: that is what saved `--rec-fresh`,
   which looked like a duplicate of `--ok` and holds AA on the pink card where `--ok`
   fails. Keep it in a code comment so the question does not reopen.
2. **Look for the precedent.** Aligning on what exists (`common.actScene` rather than an
   invented "·") is a technical choice: it was already decided elsewhere.
3. **Choose, then say so.** Thin visible effect: take the most defensible option, apply it,
   and write in one line what changes on screen.

Real doubt is almost always about SCOPE ("is this still part of this diff?"), not about the
solution: apply and flag. This review makes **no commit, no stage, no push**.

## 7. Report

One terminal report (no file, no artifact), and **short**: the INVENTORY of what was fixed,
not the demonstration. The why already lives in the code comment this repo requires anyway.

**Budget: about thirty lines.** Overflow means the report is explaining, not listing.

One header line: base, scope ("N files vs origin/main, X untracked"), state of the three
checks.

### Fixed

One LINE per fix, by decreasing severity:

```
- [severity] file:line — the defect, in half a sentence.
```

No "Fix: applied", no category, no justification. Name the DEFECT, never its three-step
cause nor the chosen solution. `severity`: **high** (data loss, workflow crash, broken
invariant, user-visible bug), **medium** (edge case, missing test, duplication, a11y),
**low** (polish). **Low** fixes share ONE line that counts and names them ("5 polish items:
dead CSS rules, date fallback, two labels"). Past six high/medium lines, keep the six worst
and count the rest on one line.

### To confirm

What awaits the coordinator, and nothing else (§6). A technical entry landing here is a fix
you did not make. Two lines max per entry: the question, then what you would do and what it
changes on screen. Often empty, which is the good sign; empty, it reads "Nothing".

### All clear

**One line**, not one per dimension ("invariants, ZIP contract, CI safety, tests 166 + 205,
language: 9 front files re-read in both languages"). The re-read count is mandatory as soon
as the diff touches `src/`: the one promise the guards do not keep alone.

Then the §8 title, which closes the report.

**Not in it**: a "Refuted" section (a refuted finding is settled in a code comment and
costs one line here at most); test output when they pass ("green" is enough); what the diff
DOES, which is the title's job; screenshots, tables, and announcements of what comes next.

## 8. PR title

**One ready-to-paste line** (or commit message: this repo works mostly straight on main).

Convention read from `git log`, not invented: textual gitmoji (`:sparkles:` feature,
`:art:` UI and polish, `:bug:` fix) then a short lowercase sentence, in French as soon as
it carries content.

- Says what the diff **does**, never what the review fixed in it.
- One line, no final period, under about sixty characters.
- Names the **dominant** subject. Several unrelated ones: **say so** and propose the seams
  (one title per batch, with its files). Never a portmanteau ("misc", "UI + PDF + CI").
- Mentions neither the docs nor added tests: they follow the subject.
- A body of at most 3 bullets (one per subject, in §1 risk order) only if the diff carries
  more than one subject. Otherwise the title suffices, the common case.
- A **proposal**: no commit, no stage, no push, even if approved in the next reply (that
  needs an explicit request).

## Guardrails

- Every finding is verified by re-reading the code before being reported: exact
  `file:line`, no "probable" finding; an unverifiable one is dropped.
- Large diff: prioritise in §1 risk order, but skip nothing silently. What was only skimmed
  is listed as such.
- Never "repair" `data/` by hand to make a check pass.
- A technical question is not put to the coordinator: measure it, look up the repo's
  precedents, or decide (§6).
- A front-agent `Safe: yes` can be **REFUTED** (measurement, precedent, constraint it could
  not see). An argued refusal is a review result, written **in a code comment** where it
  stops the question from reopening, not in the report.
- The Editor's "Rail" re-skin is deliberate: its token differences listed in the contract
  are not findings.
- If the code is right against the docs, update `references/design-system.md` AND the "File
  map" table in `CLAUDE.md`. Do not "fix" the code.
