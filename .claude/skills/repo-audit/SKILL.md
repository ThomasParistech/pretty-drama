---
name: repo-audit
description: Health audit of the WHOLE repo, not the diff — invariants proven tree-wide, CI safety, hostile-input robustness, test coverage, dead code, duplication, front consistency, doc drift. Fixes what is technical, escalates only product/UX/UI, one prioritised report. Use for a health baseline, after a big refactor, or on demand (/repo-audit). For "am I good to commit", use diff-review.
---

# Whole-repo audit

A deliberate pass over **all the code at `HEAD`**, not over work in progress.
Counterpart to `diff-review`: where that one judges a *change* in context before
a commit, this one hunts **systemic** problems (an invariant quietly violated
somewhere, dead code, stale docs) across the tree. Like `diff-review` it
**decides every technical question itself and escalates only product, UX and UI**
(§7); the deliverable is a cleaned worktree plus a prioritised, **short** report
(§9).

If the intent is "can I commit what I just did", use `diff-review` instead.

## 0. Frame

- **Scope = the whole tree at `HEAD`**, not `git diff`. No base is computed.
  Ignore `dist/`, `node_modules/`, `clips/*.mp3` and binaries.
- **Fix, and decide (§7).** No commit, no stage, no push: fixes stay in the
  worktree.
- **No blame.** A whole-repo audit says "this does not hold", not "you just broke
  this". Do not run `git blame` to attribute.
- Volume is the repo itself: prioritise by §2 risk order and **explicitly list**
  what was only skimmed.

Start by re-anchoring on `CLAUDE.md` (the "File map" table and the invariants):
that is the contract you confront the code with, **both ways** (§6).

## 1. Start the front audit in parallel

Launch the `front-reviewer` agent **immediately** (Agent tool,
`subagent_type: "front-reviewer"`; otherwise a `general-purpose` with the
instructions from `.claude/agents/front-reviewer.md`). It is already a whole-UI
audit against the design system, independent of any diff, so its scope coincides
with this skill's. It runs in the background during §2-§6.

Its findings come as `file:line` marked `Safe: yes|no`. **That marking is not a
decision**, it is an estimate: re-read each finding in the code, then apply §7,
which decides alone. Both directions count. A purely technical `Safe: no`
applies (it was marked so because it touches behaviour or JSX, not because the
choice escapes you). And a `Safe: yes` is **REFUTED** when a measurement, a repo
precedent or a constraint it could not see says otherwise: an argued refusal is
an audit result, and it is written **in a code comment**, not in the report,
because the code is what the next pass will read and therefore the only thing
that can stop the question from reopening. An unverifiable finding is dropped,
not fixed "just in case". Merge everything into the report (§9).

## 2. Zones, by decreasing risk

1. **back** (`scripts/` + tests): CI code on hostile input;
2. **CI** (`.github/`): workflow safety;
3. **shared front** (`src/shared/`, `vite.config.js`): affects everything;
4. **pages** (`src/<page>/`, `*.html`, CSS): covered by the front-reviewer;
5. **data** (`data/`): consistency with the producing code;
6. **docs/config** (`CLAUDE.md`, `README`, `.claude/`).

## 3. Invariants, proven tree-wide

The difference with `diff-review`: not checked only where a diff touches them,
but proven to hold **everywhere**. For each, start from the code, not the docs.

- **Normalization**: `grep` every text normalization in the tree. Only one
  implementation may exist (`scripts/normalize.py`), called **only** from
  `build_manifest.compute_status`. No `.js`/`.jsx` normalizes (the browser ships
  **raw** text). Any other caller, or JS normalization, is a high finding.
- **Line ids**: `SAFE_ID` (`src/editor/reducer.js`) and `LINE_ID_PATTERN`
  (`scripts/process_uploads.py`) must be the **same pattern**
  (`^[0-9a-zA-Z-]{1,64}$`). Read both and compare character by character. Check
  too that no path recycles an id.
- **ZIP contract**: read `downloadZip` (recorder `App.jsx`) AND `parse_manifest`
  side by side. The manifest stays a bare `{lineId: raw text}` mapping, one
  `{lineId}.{ext}` audio per line, nothing else. Any divergence is high.
- **Sanitization mirrors**: `sanitize_script` (Python) stays the tolerant mirror
  of `sanitizeScript` (Editor) — compare both, flag any rule present on one side
  only.
- **Hostile uploads**: real size caps (ZIP headers are not trusted), member names
  by `fullmatch`, all-or-nothing merge per ZIP, one broken ZIP never blocking
  others, ZIP deleted even on error.
- **Takes**: memory only, `beforeunload` guard until exported,
  `URL.revokeObjectURL` on every replacement.
- **Bilingual**: NO visible string lives in a component. Sweep all of `src/`
  (except `src/shared/locales/`) for a displayed literal: text between tags,
  `title`, `aria-label`, `placeholder`, `alt`, and the text props (`hint`,
  `error`, `label`, `unit`, `confirmLabel`, `primaryLabel`, `saveLabel`). This is
  the invariant CI guards best (`TestCatalogues` in
  `scripts/tests/test_contracts.py`, plus `src/shared/locales/parity.test.js`),
  so run those first; what remains by hand is what they cannot see: text adjacent
  to a brace on the same line, and unaccented English text stored in a variable.
  Check too that nothing covered by `node --test` imports `locale.js` (it reads
  URL, storage and navigator at import): a pure module takes `t` as an argument,
  or returns a code the page translates.

## 4. Safety and robustness (whole-repo)

- **`.github/`**: sweep **every** `run:` for injection (user content — filenames,
  titles — through `env:`, never `${{ }}` interpolated into the script); minimal
  `permissions:`; `concurrency` present and **with distinct groups between caller
  and callee** (else deadlock); airtight roles (`uploads.yml` alone writes to the
  repo and the journal, `build.yml` alone deploys); **no feedback to the
  coordinator written on GitHub** (no issue, no README status: the only channel
  is the upload journal on the Dashboard).
- **`scripts/`**: every external input (ZIP, hand-uploaded JSON) treated as
  hostile — ignored or collected into `uploads_result.json` and then the journal,
  never a workflow crash; paths via `scripts/common.py`, none hardcoded; error
  messages in French (they end up rendered by the Dashboard journal).
- **Secrets**: no token or secret in clear anywhere in the tree (broad grep).

## 5. Debt: tests, dead code, duplication

- **Coverage**: any `scripts/` behaviour without a matching test case is a
  finding (normalization is tested through `normalize-cases.json`). Flag
  untested branches of the hostile-input paths.
- **Dead code**: exports, functions, components, CSS never referenced; orphan
  files; `vite.config.js` entries with no `.html` and the reverse. Confirm
  non-use by `grep` before reporting.
- **Duplication**: near-identical CSS blocks in 2+ files (lift into
  `theme.css`), JS helpers duplicated across pages (lift into `src/shared/`). The
  front-reviewer covers page CSS; you cover `src/shared/`, `scripts/` and the
  shared↔page boundary.

## 6. Documentation drift

A whole-repo audit is the right moment (`diff-review` only does it if the diff
touches the docs). Confront both ways: the **"File map"** table in `CLAUDE.md`
(does each cited file or symbol still exist, in the right place, with the
described role?) and `references/design-system.md` (in the diff-review skill)
versus the real code.

**If the code is right against the docs**, that is a `doc` finding: update
`CLAUDE.md` and/or `design-system.md` — **never** "fix" the code to match stale
docs. Reminder: the Editor's "Rail" re-skin is deliberate; its documented token
deviations are not findings.

## 7. Fixes: decide yourself, escalate what is not technical

You fix, you do not merely report, and **you decide**. The line is not "risky /
not risky", it is **whose decision it is**: a technical question, however heavy,
is yours (you have the code, the tests and a way to measure); product, UX and UI
belong to the coordinator, because nothing in the repo settles them. Same split
as `diff-review`, at repo scale.

**Decide and apply, without asking** — open list, anything technical is yours
even if absent from it: any bug, edge case or missing test, even across several
files; **a data-format or ZIP-contract change**, provided BOTH sides move in the
same pass and a test covers it (that is what `test_contracts.py` exists for);
tree-wide factorization (a CSS block or helper up into `theme.css` /
`src/shared/`, a shared JSX component, a DOM change when the render does not
move); hardcoded visible text → catalogue key in BOTH languages, missing key,
copied label becoming an interpolated key, punctuation lifted from JSX into the
string, absent or misleading error message; accessibility (`title`/`aria-label`,
focus ring, role, touch target, tooltip wrapper on a control that disables); the
docs when the code is right against them (§6); **dead-code removal**, provided
non-use is PROVEN — grep the symbol, runtime-composed keys (`page.${x}.label`),
`.html` entries, classes set in JSX, names reached by reflection. Proof made,
delete; proof impossible, keep the code and say so in one line. Proof decides,
not comfort.

**Escalate, and only this** (`AskUserQuestion` if it blocks a batch of fixes,
otherwise the "To confirm" section): **product** (what a page must do, what is in
or out of scope, a gesture to add or remove, data to start storing); **UX** (what
is asked of the user, what a gesture means, what gets confirmed); **UI** (a
visible choice neither the contract nor a site precedent settles: a new colour, a
hierarchy, a layout); the **tone** of a label when it carries a product stance,
never its grammar or punctuation; any action outside the worktree (commit, push,
writing to `data/`).

Three reflexes before escalating something that *looks* like a UI question — a
whole-repo audit produces many, and most have an answer inside the repo:

1. **Measure.** "Are these two greens the same?" is computed (contrast ratio on
   the REAL background, ΔE), and the measurement can REFUSE the change: that is
   what saved `--rec-fresh`, which looked like a duplicate of `--ok` and holds AA
   on the pink card where `--ok` fails at 4.31:1. Keep the measurement in a code
   comment so the question does not reopen at the next audit.
2. **Look for the precedent.** The site already names, separates, aligns.
   Aligning on what exists (`common.actScene` rather than an invented "·") is a
   technical choice: the decision was already made elsewhere.
3. **Choose, then say so.** If you must arbitrate and the visible effect is thin,
   take the most defensible option, apply it, and write in one line what changes
   on screen.

## 8. Executable checks

`python3 -m unittest discover -s scripts/tests` · `npm test` · `npm run build`.

Run them **twice**: at the start (baseline — a pre-existing failure is not blamed
on your fixes) and after every fix, front included. A final failure is a high
finding, output quoted verbatim.

## 9. Report

One terminal report (no file, no artifact), and **short**: it is the INVENTORY of
what was fixed, not the demonstration. The why of each fix already lives in the
code comment this repo requires anyway, and in the diff the reader has at hand.
An audit report is not the audit's log.

A whole-repo audit legitimately raises more entries than a diff review, so it is
not their NUMBER that is bounded but their length: **one line each**.

One header line: scope ("whole repo at `HEAD`, commit `<sha>`"), state of the
checks, and what was skimmed for lack of time.

### Fixed

One LINE per fix, by decreasing severity:

```
- [severity] file:line — the defect, in half a sentence.
```

No "Fix: applied" (everything here is), no category, no justification. Name the
DEFECT, never its three-step cause nor the chosen solution. `severity`: **high**
(broken invariant, CI hole, data loss, visible bug), **medium** (edge case,
missing test, duplication, a11y, dead code), **low** (polish, docs). **A
repeating family is one line, not ten**: the same defect across twelve files
reads "twelve occurrences" with two or three named as examples — the most useful
finding of an audit, and the fastest to become unreadable. **Low** fixes take
ONE line for all of them.

### To confirm

What awaits the coordinator, and nothing else (product, UX, UI: §7). A technical
entry landing here is a fix you did not make. Two lines max per entry: the
question, then what you would do and what it changes on screen. Often empty, and
that is the good sign; empty, it reads "Nothing".

### All clear

**One line**, not one per dimension ("invariants, CI safety, tests, front,
docs"). Then **one sentence** on the repo's health, closing the report.

**Not in it**: a "Refuted" section (a refuted front finding is written with its
measurement **in a code comment**, and THAT is what stops the next audit from
re-proposing it, since the next audit reads the code and not this report; it
costs one line here at most); check output when they pass ("green" is enough; a
failure is quoted); screenshots, tables, and announcements of what you will do
next.

## Guardrails

- Every finding is verified by re-reading the incriminated code — exact
  `file:line`, never a "probable" finding. An unverifiable one is dropped, not
  fixed "just in case".
- Never "repair" `data/` by hand to make a check pass: if repo data contradicts
  the docs, the docs say what state the TEMPLATE ships in, and prototyping data
  is cleaned separately.
- A technical question is not put to the coordinator: it is measured, looked up
  in the repo's precedents, or decided (§7).
- Never fix the code to match stale docs: the docs follow the code (§6).
- Do not confuse this with `diff-review`: if the intended scope is work in
  progress (before a commit), stop and redirect there.
