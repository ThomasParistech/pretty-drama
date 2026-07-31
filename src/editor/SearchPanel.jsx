import React, { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon } from "../shared/icons.jsx";
import { characterColor, characterInk } from "../shared/characterColors.js";
import { matchExcerpt } from "./search.js";
import { fmt, t, translator } from "../shared/locale.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";

// The panel's two counts, composed into the sentences afterwards: the plural comes
// from `Intl.PluralRules` and no longer from an `n > 1 ? "s" : ""`, which stood no
// chance in English ("0 matches") and would not have survived a third language.
const matchCount = (count) => t("search.matchCount", { count });
const sceneCount = (count) => t("search.sceneCount", { count });

// The rail's "Search" section. Purely presentational: it receives the search state
// and some callbacks, it keeps none of it (changing section unmounts this
// component, see useSearch.js).
export default function SearchPanel({
  characters,
  language,
  query,
  setQuery,
  shownQuery,
  replacement,
  setReplacement,
  caseSensitive,
  setCaseSensitive,
  wholeWord,
  setWholeWord,
  replaceOpen,
  setReplaceOpen,
  total,
  groups,
  searching,
  currentMatch,
  next,
  prev,
  replaceCurrent,
  replaceAll,
  onSelect,
  focusSeq,
}) {
  const inputRef = useRef(null);
  const [confirmAll, setConfirmAll] = useState(false);

  // When the panel opens, and on every Ctrl+F (hence the counter: a panel that is
  // already open changes no state, there would be nothing to watch).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);

  const hasQuery = query.length > 0;

  return (
    <>
      {/* These settings do not scroll away with the results: one rereads the query,
          reticks "Whole word", relaunches a replacement while browsing a long list,
          and having to go back up the panel to find them was the most frequent
          gesture of the screen. It is `.editor-rail-body` that grants scrolling to
          `.search-results` alone. */}
      <div className="search-controls">
        {/* The label says what the checkbox does, the tooltip gives the example:
            the rule of the Rehearsal page's four checkboxes.
            **Above the field**, and that is a move: the two checkboxes used to
            separate the query from its replacement, whereas it is the two fields
            that belong together (one types one, one types the other, one rereads
            both before replacing). Two checkboxes that tune the search read
            perfectly well before it, a replacement field three blocks away from
            its query field did not read as its continuation. */}
        <div className="search-options">
          <label title={t("search.caseSensitive.tip")}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            {t("search.caseSensitive")}
          </label>
          <label title={t("search.wholeWord.tip")}>
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            {t("search.wholeWord")}
          </label>
        </div>

        <div className="search-query-row">
          {/* The replacement's disclosure is a chevron that pivots, to the LEFT of
              the field, as in a code editor: it commands what appears below it, so
              it is read first. It is FRAMED at rest and as tall as the field,
              unlike the bare chevron of the first attempt: it is the only path to
              the replacement, and a grey glyph with no frame at the edge of an
              input read as a decoration of that input. */}
          <button
            className="search-replace-toggle"
            aria-label={t("search.replace")}
            title={t(replaceOpen ? "search.hideReplace" : "search.showReplace")}
            aria-expanded={replaceOpen}
            aria-controls="search-replace"
            onClick={() => setReplaceOpen(!replaceOpen)}
          >
            <ChevronIcon />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="search-field"
            placeholder={t("search.placeholder")}
            // The label states the scope, which the placeholder has no room to
            // state: the search only sees the lines, neither act or scene titles
            // nor character names.
            aria-label={t("search.label")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter belongs to the FIELD and never to `window`: on window it
              // would also land in every line textarea, where it already creates
              // the next line. And it does not take the focus (see useSearch), so
              // as to stay repeatable.
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            }}
          />
        </div>

        {/* Unmounted and not merely hidden: the header keeps its settings mounted
            in order to animate an unknown height, here there is nothing to animate
            and nothing must stay in the keyboard path. The text already typed
            survives all the same, it lives in useSearch.
            **Right under the query field**, as in a code editor: the two fields are
            read and tabbed through one after the other, and the chevron that opens
            it is a couple of centimetres from what it makes appear. */}
        {replaceOpen && (
          <div className="search-replace" id="search-replace">
            <input
              type="text"
              className="search-field"
              placeholder={t("search.replacePlaceholder")}
              aria-label={t("search.replacePlaceholder")}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />

            {/* `.btn.small` and never `.btn.primary`: the solid accent is the
                site's download button, everywhere. */}
            <div className="search-actions">
              <span
                className="btn-tip"
                title={t(
                  currentMatch
                    ? "search.replaceCurrent.tip"
                    : total > 0
                      ? "search.pickFirst"
                      : "search.noneToReplace"
                )}
              >
                <button className="btn small" onClick={replaceCurrent} disabled={!currentMatch}>
                  {t("search.replace")}
                </button>
              </span>
              <span
                className="btn-tip"
                title={
                  total > 0
                    ? t("search.replaceAll.tip", { matches: matchCount(total) })
                    : t("search.noneToReplace")
                }
              >
                <button
                  className="btn small"
                  onClick={() => setConfirmAll(true)}
                  disabled={total === 0}
                >
                  {t("search.replaceAll")}
                </button>
              </span>
            </div>
          </div>
        )}

        {/* The count and the arrows close the settings, right above the list they
            count and browse. */}
        <div className="search-count-row">
          {/* Only the count is live: an aria-live on the list would chatter on
              every keystroke. No "3 of 12" next to the arrows, since the list is
              always displayed and marks the current row, so the position can be
              seen (VSCode writes it because its list collapses). */}
          <p className={`search-count ${searching ? "stale" : ""}`} aria-live="polite">
            {hasQuery
              ? total > 0
                ? t("search.count", {
                    matches: matchCount(total),
                    scenes: sceneCount(groups.length),
                  })
                : t("search.none")
              : ""}
          </p>
          {/* Tooltips carried by a wrapper and never by the button: a `disabled`
              control receives no mouse event, so its own `title` would not show at
              the moment it is useful. The accessible name, on the other hand, stays
              on the button and does not depend on the state. */}
          <span className="search-nav">
            <span
              className="btn-tip"
              title={t(total > 0 ? "search.prev.tip" : "search.noneToBrowse")}
            >
              <button
                className="btn icon small"
                onClick={() => prev(true)}
                disabled={total === 0}
                aria-label={t("search.prev")}
              >
                <ArrowUpIcon />
              </button>
            </span>
            <span
              className="btn-tip"
              title={t(total > 0 ? "search.next.tip" : "search.noneToBrowse")}
            >
              <button
                className="btn icon small"
                onClick={() => next(true)}
                disabled={total === 0}
                aria-label={t("search.next")}
              >
                <ArrowDownIcon />
              </button>
            </span>
          </span>
        </div>
      </div>

      {groups.length > 0 && (
        <ResultList
          groups={groups}
          characters={characters}
          language={language}
          currentMatch={currentMatch}
          onSelect={onSelect}
          searching={searching}
        />
      )}

      {confirmAll && (
        // The gesture can be undone in one step, and it is confirmed all the same,
        // for the reason that makes an act deletion be confirmed: what it touches
        // is not on screen, and it is the number that comes as a surprise.
        <ConfirmModal
          title={t("search.replaceAllTitle", { matches: matchCount(total) })}
          confirmLabel={t("search.replace")}
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => {
            setConfirmAll(false);
            replaceAll();
          }}
        >
          {/* `shownQuery` and not `query`: the title announces a number that comes
              from the deferred render (see useSearch.js), and it is that query
              `replaceAll` rewrites. Quoting the keystrokes in progress would make a
              sentence that counts one query and names another, for as long as the
              render takes to catch up.
              The quotation marks come from `fmt.quote` (so the non-breaking spaces
              in French, straight quotes in English) and no longer from `&nbsp;»`
              written by hand. An empty replacement field is legitimate (deleting a
              word everywhere): it is the second sentence that says so, rather than
              letting one believe in a replacement by nothing. */}
          <p>
            {replacement
              ? t("search.replaceAllInto", {
                  scenes: sceneCount(groups.length),
                  query: fmt.quote(shownQuery),
                  replacement: fmt.quote(replacement),
                })
              : t("search.replaceAllDelete", {
                  scenes: sceneCount(groups.length),
                  query: fmt.quote(shownQuery),
                })}
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

// No virtualisation? Impossible here, and this is not a choice of comfort:
// displaying every match (6216 for a single-character query on the real play) asked
// React to create, then to destroy on the next keystroke, tens of thousands of
// nodes. `useDeferredValue` (useSearch.js) fixed the render, which is
// interruptible, but the COMMIT phase is not: blocking tasks of 76 to 134 ms
// remained, so a stuttering keystroke. Measured.
//
// So only the visible slice is rendered, and it is the FIXED height of the rows
// that makes it possible: the position of each is computed without having measured
// it, so the total height is exact from the very first render and the scrollbar will
// never lie (that is the same requirement as the one that earned the fixed height,
// see editor.css).
//
// The two heights below are a CONTRACT with editor.css: `.search-row` is 66 px (62
// of row plus 4 of gutter) and `.search-group-head` 30. Changing them on one side
// without the other shifts the list under the scrollbar.
//
// Accepted price: a screen reader only announces the rendered items, not the 6216 of
// the list. That is the price of any windowed list; the count, on the other hand, is
// stated plainly just above, and it is the panel's only `aria-live`.
const ROW_H = 66;
const HEAD_H = 30;
// Enough to cover one flick of the wheel between two renders.
const OVERSCAN = 6;

function ResultList({ groups, characters, language, currentMatch, onSelect, searching }) {
  const boxRef = useRef(null);
  // The group headers name an act and a scene of the document, therefore in the
  // language of the PLAY, like the rail's plan and the column's title (see
  // structureLabels.js). The match count just above stays in the reader's: it is a
  // sentence of the interface.
  const tPlay = translator(language);
  const [view, setView] = useState({ top: 0, height: 0 });

  // One single flat list: the scene headers are items in it like any other. That is
  // what makes the arithmetic of the positions trivial (a cumulative array), where
  // windowing per group would require slicing every group.
  const items = useMemo(() => {
    const out = [];
    for (const group of groups) {
      out.push({ head: group, key: `t-${group.actIndex}-${group.sceneIndex}` });
      for (const match of group.matches) out.push({ match, key: `${match.lineId}-${match.start}` });
    }
    return out;
  }, [groups]);

  const offsets = useMemo(() => {
    const offs = new Array(items.length + 1);
    let y = 0;
    for (let i = 0; i < items.length; i++) {
      offs[i] = y;
      y += items[i].head ? HEAD_H : ROW_H;
    }
    offs[items.length] = y;
    return offs;
  }, [items]);

  const totalH = offsets[items.length] ?? 0;

  // The visible height is measured, it is not guessed: the panel gets resized (edge
  // handle, window, unfolding of the replacement).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => setView({ top: box.scrollTop, height: box.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Bring the current match into view: without this, "next" would mark a row that
  // is not rendered, therefore invisible and impossible to find.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !currentMatch) return;
    const i = items.findIndex((it) => it.match === currentMatch);
    if (i < 0) return;
    const top = offsets[i];
    const bottom = top + ROW_H;
    if (top < box.scrollTop) box.scrollTop = top - HEAD_H;
    else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight;
    }
  }, [currentMatch, items, offsets]);

  const first = indexAt(offsets, view.top, items.length);
  const last = indexAt(offsets, view.top + view.height, items.length);
  const from = Math.max(0, first - OVERSCAN);
  const to = Math.min(items.length, last + 1 + OVERSCAN);
  // The two shims are the list's padding: no extra element to create, and the total
  // height stays exact.
  const padTop = offsets[from];
  const padBottom = totalH - offsets[to];

  return (
    <div
      className={`search-results ${searching ? "stale" : ""}`}
      ref={boxRef}
      onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
    >
      <ul className="search-flat" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        {items.slice(from, to).map((item) =>
          item.head ? (
            <li className="search-group-head" key={item.key}>
              {/* No separator written between the two labels: at two different
                  weights there is nothing to separate, and a punctuation mark
                  between them would have to be translated for nothing. They are
                  derived from the group's rank (structureLabels.js), acts and
                  scenes no longer having a title. */}
              <h3 className="search-group-title">
                <span className="search-group-act">{actLabel(tPlay, item.head.actIndex)}</span>
                <span className="search-group-scene">
                  {sceneLabel(tPlay, item.head.sceneIndex)}
                </span>
              </h3>
            </li>
          ) : (
            <li className="search-row" key={item.key}>
              <Hit
                match={item.match}
                characters={characters}
                isCurrent={item.match === currentMatch}
                onSelect={onSelect}
              />
            </li>
          )
        )}
      </ul>
    </div>
  );
}

// The first item whose bottom goes past `y`, by binary search over the cumulative
// positions (they are increasing by construction).
function indexAt(offsets, y, count) {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Renders the BUTTON alone, with no list item: `.search-row` is the `<li>`. One more
// `<li>` here (there was one) was at once a list item nested inside a list item,
// therefore invalid HTML that a screen reader announces as one more list, and a
// visible bug: `.search-hit` takes `height: 100%`, and a percentage resolves against
// the parent's height, and that parent had none set. So the card fell back to the
// height of its content, an excerpt that fits on one line (or a line whose character
// has disappeared) left 14 to 18 px of cream below it, and the list's leading looked
// as though it changed from one row to the next.
function Hit({ match, characters, isCurrent, onSelect }) {
  const { before, hit, after } = matchExcerpt(match);
  const character = characters.find((c) => c.id === match.characterId) ?? null;
  const color = characterColor(characters, match.characterId);
  const ink = color === null ? null : characterInk(color);

  return (
    <button
      type="button"
      className={`search-hit ${isCurrent ? "current" : ""}`}
      // The current match is not signalled by colour alone.
      aria-current={isCurrent ? "true" : undefined}
      // A click focuses the line and selects the found text in it: one is going to
      // edit there, unlike Enter and F3, which leave the keyboard to the field.
      onClick={() => onSelect(match, true)}
    >
      {character && (
        // The name is text at 11 px: it is the ink and not the palette's flat
        // colour, which is made for surfaces (see `characterInk`).
        <span className="search-hit-who" style={{ color: ink ?? undefined }}>
          {character.name}
        </span>
      )}
      {/* `<mark>` is exactly right here: this is a text excerpt, not a textarea. */}
      <span className="search-hit-text">
        {before}
        <mark>{hit}</mark>
        {after}
      </span>
    </button>
  );
}
