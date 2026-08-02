import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildReplaceEdits, replaceOneEdit, searchScript } from "./search.js";

// State of the editor's search. It lives here and not in SearchPanel because changing
// rail section UNMOUNTS the panel and would drop the query.
// Matches are always recomputed from the script, never snapshotted: stale offsets
// point into a text that no longer exists, so a click would select the wrong span.
// The anchor is a POSITION and not a rank: ranks slide on every keystroke. When no
// match sits exactly there, `currentIndex` is -1 and "next" picks up where you were.
export default function useSearch({ script, dispatch, goToMatch, isOpen, onOpen, onClose, enabled }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(null);
  // Folded away by default: most searches are for a passage to touch up by hand.
  // Here and not in SearchPanel, like the query, because the panel unmounts.
  const [replaceOpen, setReplaceOpen] = useState(false);
  // A counter and not a boolean: Ctrl+F on an ALREADY open panel must refocus and
  // select even though no state changes.
  const [focusSeq, setFocusSeq] = useState(0);

  const options = useMemo(() => ({ caseSensitive, wholeWord }), [caseSensitive, wholeWord]);

  // Searching is free; DISPLAYING thousands of results is not (measured: 329 ms
  // blocking for "e" and its 6216 matches), and the field stutters meanwhile.
  // `useDeferredValue` gives the field its keystroke at once and lets React abandon
  // an already stale list pass. `content-visibility` does not help: it spares layout
  // and paint, not React's work.
  const shownQuery = useDeferredValue(query);
  const shownOptions = useDeferredValue(options);
  // The count and the list describe the LAST RENDERED query, never the one being
  // typed, so this is what lets the panel say so without lying.
  const searching = query !== shownQuery || options !== shownOptions;

  const { matches, total, groups } = useMemo(
    () => searchScript(script, shownQuery, shownOptions),
    [script, shownQuery, shownOptions]
  );

  const currentIndex = useMemo(() => {
    if (!current) return -1;
    return matches.findIndex((m) => m.lineId === current.lineId && m.start === current.start);
  }, [matches, current]);

  const anchorOn = (match, start = match.start) => ({
    lineId: match.lineId,
    lineOrdinal: match.lineOrdinal,
    start,
  });

  const goTo = useCallback(
    (match, focus) => {
      setCurrent(anchorOn(match));
      goToMatch(match, focus);
    },
    [goToMatch]
  );

  // `focus`: Enter and F3 must NOT take the keyboard, or the caret lands in a line
  // textarea where Enter creates the next line and the key stops repeating. A click
  // on a result does focus.
  const next = useCallback(
    (focus = false) => {
      if (total === 0) return;
      if (currentIndex >= 0) return goTo(matches[(currentIndex + 1) % total], focus);
      if (!current) return goTo(matches[0], focus);
      const after = matches.find(
        (m) =>
          m.lineOrdinal > current.lineOrdinal ||
          (m.lineOrdinal === current.lineOrdinal && m.start >= current.start)
      );
      goTo(after ?? matches[0], focus);
    },
    [matches, total, currentIndex, current, goTo]
  );

  const prev = useCallback(
    (focus = false) => {
      if (total === 0) return;
      if (currentIndex >= 0) return goTo(matches[(currentIndex - 1 + total) % total], focus);
      if (!current) return goTo(matches[total - 1], focus);
      let before = null;
      for (const m of matches) {
        const earlier =
          m.lineOrdinal < current.lineOrdinal ||
          (m.lineOrdinal === current.lineOrdinal && m.start < current.start);
        if (!earlier) break;
        before = m;
      }
      goTo(before ?? matches[total - 1], focus);
    },
    [matches, total, currentIndex, current, goTo]
  );

  const replaceCurrent = useCallback(() => {
    if (currentIndex < 0) return;
    const match = matches[currentIndex];
    const edit = replaceOneEdit(match, replacement);
    dispatch({
      type: "SET_LINE_TEXTS",
      edits: [{ lineId: edit.lineId, text: edit.text }],
    });
    // The anchor moves PAST what was written, or "next" lands back on a replacement
    // that contains the query.
    setCurrent(anchorOn(match, edit.nextStart));
  }, [matches, currentIndex, replacement, dispatch]);

  const replaceAll = useCallback(() => {
    // Re-derived from the play and not from the displayed array (which the panel
    // caps): a display ceiling must never decide what gets rewritten.
    const edits = buildReplaceEdits(script, shownQuery, shownOptions, replacement);
    if (edits.length === 0) return;
    dispatch({ type: "SET_LINE_TEXTS", edits });
    setCurrent(null);
    // The DISPLAYED query, not the field's: the confirmation announced a count that
    // came from the displayed list.
  }, [script, shownQuery, shownOptions, replacement, dispatch]);

  const openAndFocus = useCallback(() => {
    onOpen();
    setFocusSeq((n) => n + 1);
  }, [onOpen]);

  // SEPARATE from the undo/redo effect (App.jsx), which resubscribes on every edit:
  // merged, both would resubscribe on every keystroke. Disjoint keys, both bubbling,
  // so registration order does not matter.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      // An open ConfirmModal calls preventDefault in the CAPTURE phase without
      // stopPropagation: without this, its Escape would close the panel behind it.
      if (e.defaultPrevented) return;

      // Ctrl+H opens the search WITH the replacement unfolded.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        seedFromSelection(setQuery);
        setReplaceOpen(true);
        openAndFocus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        // Taking over the browser's Ctrl+F on purpose: it does not read textarea
        // values, and only one scene is mounted, so it would find almost nothing.
        e.preventDefault();
        seedFromSelection(setQuery);
        openAndFocus();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
        return;
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, isOpen, onClose, openAndFocus, next, prev]);

  return {
    query,
    setQuery,
    // The RENDERED query: the "Replace all" confirmation must quote the one its count
    // came from, not the keystrokes in progress.
    shownQuery,
    replacement,
    setReplacement,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    replaceOpen,
    setReplaceOpen,
    matches,
    total,
    groups,
    searching,
    currentIndex,
    next,
    prev,
    select: goTo,
    replaceCurrent,
    replaceAll,
    focusSeq,
    openAndFocus,
  };
}

// Ctrl+F from a line picks up the selected text, like a code editor. A multiline
// selection is ignored.
function seedFromSelection(setQuery) {
  const el = document.activeElement;
  if (!el || el.tagName !== "TEXTAREA" || !el.classList.contains("line-text")) return;
  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart === selectionEnd) return;
  const seed = value.slice(selectionStart, selectionEnd);
  if (seed && !seed.includes("\n")) setQuery(seed);
}
