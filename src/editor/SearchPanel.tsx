import React, { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../shared/ConfirmModal.tsx";
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon } from "../shared/icons.tsx";
import { characterColor, characterInk } from "../shared/characterColors.ts";
import { matchExcerpt } from "./search.ts";
import { fmt, t, translator } from "../shared/locale.ts";
import { actLabel, sceneLabel } from "../shared/structureLabels.ts";
import type { Match, MatchGroup } from "./search.ts";
import type { Character } from "../shared/types.ts";

// One row of the flat list: a scene header OR a hit, never both.
type Item =
  | { head: MatchGroup; match?: undefined; key: string }
  | { head?: undefined; match: Match; key: string };

// The panel's two counts, interpolated into the sentences afterwards.
const matchCount = (count: number) => t("search.matchCount", { count });
const sceneCount = (count: number) => t("search.sceneCount", { count });

// The rail's "Search" section, purely presentational: the state lives in useSearch.ts
// because changing section unmounts this component.
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
}: {
  characters: Character[];
  language: string;
  query: string;
  setQuery: (query: string) => void;
  shownQuery: string;
  replacement: string;
  setReplacement: (replacement: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (on: boolean) => void;
  wholeWord: boolean;
  setWholeWord: (on: boolean) => void;
  replaceOpen: boolean;
  setReplaceOpen: (open: boolean) => void;
  total: number;
  groups: MatchGroup[];
  searching: boolean;
  currentMatch: Match | null;
  // `focus`: a CLICK on an arrow takes the keyboard, Enter and F3 must not.
  next: (focus?: boolean) => void;
  prev: (focus?: boolean) => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
  onSelect: (match: Match, focus?: boolean) => void;
  focusSeq: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  // Hence the counter: an already open panel changes no state to watch.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);

  const hasQuery = query.length > 0;

  return (
    <>
      {/* These settings do not scroll away: only `.search-results` scrolls. */}
      <div className="search-controls">
        {/* Above the field, so the query and its replacement stay adjacent. */}
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
          {/* FRAMED and field-height: it is the only path to the replacement, and a
              bare chevron beside an input reads as decoration of that input. */}
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
            // The label states the scope: the search only sees the lines.
            aria-label={t("search.label")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter belongs to the FIELD, never to `window`, where it would also
              // land in every line textarea and create a line.
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            }}
          />
        </div>

        {/* Unmounted and not hidden: nothing to animate, and nothing must stay in the
            keyboard path. The typed text survives in useSearch. */}
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

            {/* Never `.btn.primary`: the solid accent is the download button. */}
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

        <div className="search-count-row">
          {/* Only the count is live: an aria-live on the list would chatter on every
              keystroke. No "3 of 12": the list is always shown and marks the row. */}
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
          {/* Tooltip on a WRAPPER: a `disabled` control receives no mouse event, so
              its own `title` never shows when it is useful. */}
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
        // Confirmed although undoable in one step: what it touches is off screen,
        // and the number is the surprise.
        <ConfirmModal
          title={t("search.replaceAllTitle", { matches: matchCount(total) })}
          confirmLabel={t("search.replace")}
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => {
            setConfirmAll(false);
            replaceAll();
          }}
        >
          {/* `shownQuery` and not `query`: the title's count comes from the deferred
              render, and that is the query `replaceAll` rewrites. An empty
              replacement is legitimate, hence the second sentence. */}
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

// Windowed, and it has to be: 6216 matches for a one-character query left 76 to 134 ms
// of blocking COMMIT, which `useDeferredValue` cannot interrupt. Measured.
// The FIXED row height is what makes it possible: positions are computed without
// measuring, so the total height is exact from the first render.
// CONTRACT with editor.css: `.search-row` is 66 px (62 + 4 gutter), `.search-group-head`
// 30. Changed on one side only, the list shifts under the scrollbar.
// Accepted: a screen reader only announces the rendered items; the count above is the
// panel's only `aria-live`.
const ROW_H = 66;
const HEAD_H = 30;
const OVERSCAN = 6;

function ResultList({
  groups,
  characters,
  language,
  currentMatch,
  onSelect,
  searching,
}: {
  groups: MatchGroup[];
  characters: Character[];
  language: string;
  currentMatch: Match | null;
  onSelect: (match: Match, focus?: boolean) => void;
  searching: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Group headers name parts of the DOCUMENT, so the play's language; the count above
  // is interface, so the reader's.
  const tPlay = translator(language);
  const [view, setView] = useState({ top: 0, height: 0 });

  // One flat list, headers included: positions are then a cumulative array, where
  // windowing per group would mean slicing every group.
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const group of groups) {
      out.push({ head: group, key: `t-${group.actIndex}-${group.sceneIndex}` });
      for (const match of group.matches) out.push({ match, key: `${match.lineId}-${match.start}` });
    }
    return out;
  }, [groups]);

  const offsets = useMemo(() => {
    const offs: number[] = new Array(items.length + 1);
    let y = 0;
    for (let i = 0; i < items.length; i++) {
      offs[i] = y;
      y += items[i]!.head ? HEAD_H : ROW_H;
    }
    offs[items.length] = y;
    return offs;
  }, [items]);

  const totalH = offsets[items.length] ?? 0;

  // Measured and not guessed: the panel gets resized.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => setView({ top: box.scrollTop, height: box.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Without this, "next" marks a row that is not rendered, hence invisible.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !currentMatch) return;
    const i = items.findIndex((it) => it.match === currentMatch);
    if (i < 0) return;
    const top = offsets[i]!;
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
  // Padding rather than shim elements: nothing extra to create.
  const padTop = offsets[from]!;
  const padBottom = totalH - offsets[to]!;

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
              {/* No separator: two weights need none, and it would be one more
                  thing to translate. */}
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

// First item whose bottom passes `y`, binary search over the cumulative positions.
function indexAt(offsets: number[], y: number, count: number): number {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1]! <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// The BUTTON alone, no `<li>`: `.search-row` is the list item. Nesting one here is
// invalid HTML AND breaks `.search-hit { height: 100% }`, which resolves against a
// parent with no height and leaves the rows unevenly tall.
function Hit({
  match,
  characters,
  isCurrent,
  onSelect,
}: {
  match: Match;
  characters: Character[];
  isCurrent: boolean;
  onSelect: (match: Match, focus?: boolean) => void;
}) {
  const { before, hit, after } = matchExcerpt(match);
  const character = characters.find((c) => c.id === match.characterId) ?? null;
  const color = characterColor(characters, match.characterId);
  const ink = color === null ? null : characterInk(color);

  return (
    <button
      type="button"
      className={`search-hit ${isCurrent ? "current" : ""}`}
      // Not signalled by colour alone.
      aria-current={isCurrent ? "true" : undefined}
      // A click focuses the line: one edits there, unlike Enter and F3.
      onClick={() => onSelect(match, true)}
    >
      {character && (
        // Text, so the ink and not the flat colour (see `characterInk`).
        <span className="search-hit-who" style={{ color: ink ?? undefined }}>
          {character.name}
        </span>
      )}
      <span className="search-hit-text">
        {before}
        <mark>{hit}</mark>
        {after}
      </span>
    </button>
  );
}
