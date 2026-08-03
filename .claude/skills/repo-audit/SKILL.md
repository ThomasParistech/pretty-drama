---
name: repo-audit
description: Health audit of the WHOLE repo, not the diff — invariants proven tree-wide, CI safety, hostile-input robustness, test coverage, dead code, duplication, front consistency, doc drift. Fixes what is technical, escalates only product/UX/UI, one prioritised report. Use for a health baseline, after a big refactor, or on demand (/repo-audit). For "am I good to commit", use diff-review.
---

# Whole-repo audit

A pass over **all the code at `HEAD`**, not over work in progress. Counterpart to
`diff-review`: that one judges a *change* in context before a commit, this one hunts
**systemic** problems (an invariant quietly violated somewhere, dead code, stale docs)
across the tree. Same split as `diff-review`: **decide every technical question yourself,
escalate only product, UX and UI** (§7). Deliverable: a cleaned worktree plus a
prioritised, **short** report (§9).

If the intent is "can I commit what I just did", use `diff-review` instead.

## 0. Frame

- **Scope = the whole tree at `HEAD`.** No base computed. Ignore `dist/`, `node_modules/`,
  `clips/*.mp3` and binaries.
- **Fix, and decide (§7).** No commit, no stage, no push: fixes stay in the worktree.
- **No blame.** Say "this does not hold", not "you just broke this". No `git blame`.
- Prioritise by §2 risk order and **explicitly list** what was only skimmed.

Start by re-anchoring on `CLAUDE.md` (the "File map" table and the invariants): the
contract you confront the code with, **both ways** (§6).

## 1. Start the front audit in parallel

Launch the `front-reviewer` agent **immediately** (Agent tool, `subagent_type:
"front-reviewer"`; otherwise a `general-purpose` with the instructions from
`.claude/agents/front-reviewer.md`). It is already a whole-UI audit against the design
system, so its scope coincides with this skill's. It runs in the background during §2-§6.

Its findings come as `file:line` marked `Safe: yes|no`. **That marking is not a decision**,
it is an estimate: re-read each in the code, then apply §7. Both directions count. A purely
technical `Safe: no` applies (marked so because it touches behaviour or JSX, not because
the choice escapes you), and a `Safe: yes` can be **REFUTED** by a measurement, a repo
precedent or a constraint it could not see. An argued refusal is an audit result, written
**in a code comment**, not in the report: the code is what the next pass reads, so it is
the only thing that can stop the question from reopening. An unverifiable finding is
dropped, not fixed "just in case".

## 2. Zones, by decreasing risk

1. **back** (`scripts/` + tests): CI code on hostile input;
2. **CI** (`.github/`): workflow safety;
3. **shared front** (`src/shared/`, `vite.config.ts`): affects everything;
4. **pages** (`src/<page>/`, `*.html`, CSS): covered by the front-reviewer;
5. **data** (`data/`): consistency with the producing code;
6. **docs/config** (`CLAUDE.md`, `README`, `.claude/`).

## 3. Invariants, proven tree-wide

Not checked only where a diff touches them, but proven to hold **everywhere**. For each,
start from the code, not the docs.

- **Normalization**: `grep` every text normalization in the tree. One implementation only
  (`scripts/normalize.py`), with exactly two callers,
  `build_manifest.compute_status` and `script_diff.script_changes`. No `.ts`/`.tsx`
  normalizes (the browser ships **raw** text; `editor/search.ts` folding is not this). Any
  other caller, or JS normalization, is high.
- **Line ids**: `SAFE_ID` (`editor/reducer.ts`) and `LINE_ID_PATTERN`
  (`process_uploads.py`) must be the **same pattern** (`^[0-9a-zA-Z-]{1,64}$`), compared
  character by character. Check no path recycles an id.
- **Play ids**: `SAFE_PLAY_ID` (`shared/plays.ts`) and `PLAY_ID_PATTERN` (`common.py`)
  identical; never re-minted; minted in one place; validated before a path is built.
- **ZIP contract**: read `downloadZip` AND `parse_manifest` side by side. Bare
  `{lineId: raw text}` mapping, one `{lineId}.{ext}` per line, nothing else. Divergence is
  high.
- **Sanitization mirrors**: `sanitize_script` stays the tolerant mirror of `sanitizeScript`.
  Compare both, flag any rule present on one side only, minus the three documented
  asymmetries (id re-minting, structure flooring, play id).
- **Hostile uploads**: real size caps (ZIP headers are not trusted), member names by
  `fullmatch`, all-or-nothing merge per ZIP, one broken ZIP never blocking others, ZIP
  deleted even on error.
- **Takes**: memory only, `beforeunload` guard until exported, `URL.revokeObjectURL` on
  every replacement.
- **Bilingual**: NO visible string in a component. Sweep all of `src/` (except
  `locales/`) for a displayed literal: text between tags, `title`, `aria-label`,
  `placeholder`, `alt`, and the text props (`hint`, `error`, `label`, `unit`,
  `confirmLabel`, `primaryLabel`, `saveLabel`). CI guards this best (`TestCatalogues` in
  `test_contracts.py`, plus `locales/parity.test.ts`), so run those first; by hand, cover
  what they cannot see: text adjacent to a brace on the same line, and unaccented English
  text stored in a variable. Check too that nothing under `node --test` imports `locale.ts`
  (it reads URL, storage and navigator at import): a pure module takes `t` as an argument
  or returns a code the page translates.

## 4. Safety and robustness (whole-repo)

- **`.github/`**: sweep **every** `run:` for injection (user content through `env:`, never
  `${{ }}` interpolated into the script); minimal `permissions:`; `concurrency` present and
  **with distinct groups between caller and callee** (else deadlock); airtight roles
  (`uploads.yml` alone writes to the repo and the journal, `build.yml` alone deploys and
  writes nothing but the README's site address); **no feedback to the coordinator on
  GitHub outside the install** (no issue, no README status: the only channel is the upload
  journal on the Dashboard).
- **`scripts/`**: every external input treated as hostile, ignored or collected into
  `uploads_result.json` and then the journal, never a workflow crash; paths via
  `scripts/common.py`, none hardcoded; error messages in French (the Dashboard journal
  renders them).
- **Secrets**: no token or secret in clear anywhere in the tree (broad grep).

## 5. Debt: tests, dead code, duplication

- **Coverage**: any `scripts/` behaviour without a matching test case is a finding
  (normalization is tested through `normalize-cases.json`). Flag untested branches of the
  hostile-input paths.
- **Dead code**: exports, functions, components, CSS never referenced; orphan files;
  `vite.config.ts` entries with no `.html` and the reverse. Confirm non-use by `grep` first.
- **Duplication**: near-identical CSS blocks in 2+ files (lift into `theme.css`), JS
  helpers duplicated across pages (lift into `src/shared/`). The front-reviewer covers page
  CSS; you cover `src/shared/`, `scripts/` and the shared/page boundary.

## 6. Documentation drift

The right moment for it (`diff-review` only does it if the diff touches the docs).
Confront both ways: the **"File map"** table in `CLAUDE.md` (does each cited file or symbol
still exist, in the right place, with the described role?) and
`.claude/skills/diff-review/references/design-system.md` versus the real code.

**If the code is right, that is a `doc` finding**: update `CLAUDE.md` and/or
`design-system.md`. **Never** "fix" the code to match stale docs. The Editor's "Rail"
re-skin is deliberate; its documented token deviations are not findings.

## 7. Fixes: decide yourself, escalate what is not technical

You fix, you do not merely report, and **you decide**. The line is not "risky / not risky",
it is **whose decision it is**: a technical question, however heavy, is yours (you have the
code, the tests and a way to measure); product, UX and UI belong to the coordinator,
because nothing in the repo settles them.

**Decide and apply, without asking** (open list, anything technical is yours even if absent
from it): any bug, edge case or missing test, across as many files as it takes; **a
data-format or ZIP-contract change**, provided BOTH sides move in the same pass and a test
covers it; tree-wide factorization (a CSS block or helper up into `theme.css` /
`src/shared/`, a shared component, a DOM change when the render does not move); hardcoded
visible text into a catalogue key in BOTH languages, missing key, copied label becoming an
interpolated key, punctuation lifted from JSX into the string, absent or misleading error
message; accessibility (`title`/`aria-label`, focus ring, role, touch target, tooltip
wrapper on a control that disables); the docs when the code is right against them (§6);
**dead-code removal** when non-use is PROVEN (grep the symbol, runtime-composed keys like
`page.${x}.label`, `.html` entries, classes set in JSX, names reached by reflection). Proof
made, delete; proof impossible, keep the code and say so in one line. Proof decides, not
comfort.

**Escalate, and only this** (`AskUserQuestion` if it blocks a batch, otherwise "To
confirm"): **product** (what a page must do, what is in or out of scope, a gesture to add or
remove, data to start storing); **UX** (what is asked of the user, what a gesture means,
what gets confirmed); **UI** (a visible choice neither the contract nor a site precedent
settles: a new colour, a hierarchy, a layout); the **tone** of a label when it carries a
product stance, never its grammar or punctuation; any action outside the worktree (commit,
push, writing to `data/`).

Three reflexes before escalating something that *looks* like a UI question. An audit
produces many, and most have an answer inside the repo:

1. **Measure.** "Are these two greens the same?" is computed (contrast ratio on the REAL
   background, ΔE), and the measurement can REFUSE the change: that is what saved
   `--rec-fresh`, which looked like a duplicate of `--ok` and holds AA on the pink card
   where `--ok` fails at 4.31:1. Keep it in a code comment so the question does not reopen.
2. **Look for the precedent.** Aligning on what exists (`common.actScene` rather than an
   invented "·") is a technical choice: it was already decided elsewhere.
3. **Choose, then say so.** Thin visible effect: take the most defensible option, apply it,
   and write in one line what changes on screen.

## 8. Executable checks

`python3 -m unittest discover -s scripts/tests` · `npm test` · `npm run build`.

**Twice**: at the start (baseline, so a pre-existing failure is not blamed on your fixes)
and after every fix, front included. A final failure is a high finding, output quoted
verbatim.

## 9. Report

One terminal report (no file, no artifact), and **short**: the INVENTORY of what was fixed,
not the demonstration. The why already lives in the code comment this repo requires anyway.

An audit legitimately raises more entries than a diff review, so it is not their NUMBER
that is bounded but their length: **one line each**.

One header line: scope ("whole repo at `HEAD`, commit `<sha>`"), state of the checks, and
what was skimmed for lack of time.

### Fixed

One LINE per fix, by decreasing severity:

```
- [severity] file:line — the defect, in half a sentence.
```

No "Fix: applied", no category, no justification. Name the DEFECT, never its three-step
cause nor the chosen solution. `severity`: **high** (broken invariant, CI hole, data loss,
visible bug), **medium** (edge case, missing test, duplication, a11y, dead code), **low**
(polish, docs). **A repeating family is one line, not ten**: the same defect across twelve
files reads "twelve occurrences" with two or three named as examples. **Low** fixes take
ONE line for all of them.

### To confirm

What awaits the coordinator, and nothing else (§7). A technical entry landing here is a fix
you did not make. Two lines max per entry: the question, then what you would do and what it
changes on screen. Often empty, which is the good sign; empty, it reads "Nothing".

### All clear

**One line**, not one per dimension ("invariants, CI safety, tests, front, docs"). Then
**one sentence** on the repo's health, closing the report.

**Not in it**: a "Refuted" section (a refuted front finding is written with its measurement
**in a code comment**, which is what stops the next audit from re-proposing it, the next
audit reading the code and not this report; one line here at most); check output when they
pass ("green" is enough); screenshots, tables, and announcements of what comes next.

## Guardrails

- Every finding is verified by re-reading the code: exact `file:line`, never a "probable"
  finding. An unverifiable one is dropped, not fixed "just in case".
- Never "repair" `data/` by hand to make a check pass: if repo data contradicts the docs,
  the docs say what state the TEMPLATE ships in, and prototyping data is cleaned separately.
- A technical question is not put to the coordinator: measure it, look up the repo's
  precedents, or decide (§7).
- Never fix the code to match stale docs: the docs follow the code (§6).
- Do not confuse this with `diff-review`: if the intended scope is work in progress, stop
  and redirect there.
