import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildReplaceEdits, replaceOneEdit, searchScript } from "./search.js";

// The state of the editor's search: the query, the two options, the replacement
// text, and the ANCHOR of the current match.
//
// It lives here and not in SearchPanel, because changing rail section unmounts the
// panel: a query lost while going off to rename a character would be a regression
// felt at every moment.
//
// **The matches are always FRESH**, recomputed by `useMemo` from the script. Never
// a snapshot taken on submit: a snapshot would not merely be stale, it would be
// wrong, its offsets pointing into a text that no longer exists, so a click would
// select the wrong portion and a replacement would cut at the wrong index. The cost
// is of the order of tens of microseconds per keystroke, the folding being memoised
// per line (see search.js).
//
// **The anchor is not a rank.** Ranks slide on every keystroke and the number of
// matches changes on every replacement: we remember a POSITION (`{lineId,
// lineOrdinal, start}`) and find its rank again per render. When no match is exactly
// there (after a replacement, after a keystroke that changed the found text, after a
// change of query, after a Ctrl+Z on a "Replace all"), `currentIndex` is -1: the
// count is displayed, no row is marked as current, and "next" picks up where one had
// got to. All of that falls out of the derived computation, without one line of code
// per case.
export default function useSearch({ script, dispatch, goToMatch, isOpen, onOpen, onClose, enabled }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(null);
  // The replacement is FOLDED AWAY by default, as in a code editor: most of the
  // time one searches for a line in order to go and touch it up by hand, and a
  // "Replace with" field that is always open offers a mass rewrite to someone who
  // only wanted to find a passage again. The flag lives here and not in SearchPanel,
  // like the query: changing rail section unmounts the panel, and reopening on a
  // folded-away replacement would lose the replacement text already typed.
  const [replaceOpen, setReplaceOpen] = useState(false);
  // A counter and not a boolean: Ctrl+F on an ALREADY open panel must refocus the
  // field and select everything, even though no state changes. A line's focus
  // request, on the other hand, does not need one: it clears itself as soon as it is
  // honoured (see focusRequest in App.jsx).
  const [focusSeq, setFocusSeq] = useState(0);

  const options = useMemo(() => ({ caseSensitive, wholeWord }), [caseSensitive, wholeWord]);

  // **The keystroke does not render the list in the same task as itself.** Searching
  // is free (a few tens of microseconds, see search.js), but DISPLAYING several
  // thousand results costs React the creation of as many components: measured, a
  // blocking task of 329 ms for the query "e" and its 6216 matches, 88 ms from 750
  // onwards. During that time the field does not refresh, so the keystroke stutters.
  // `content-visibility` (editor.css) does nothing about it: it spares the layout and
  // the painting, not React's work.
  // `useDeferredValue` gives the query back to the field straight away and the list
  // in an interruptible pass: React can slice it up and ABANDON the slice that is
  // already stale when the next keystroke arrives. So we no longer pay for the render
  // of the intermediate states ("v", "vo", "vou" while typing "vous").
  // Rejected alternative: putting a ceiling back on the number of results displayed,
  // that is to say taking back with one hand what "show everything" had just given.
  const shownQuery = useDeferredValue(query);
  const shownOptions = useDeferredValue(options);
  // The render on screen lags behind the field: that is what makes it possible to
  // signal that without lying (the count and the list describe the SAME query, that
  // of the last render, never the one being typed).
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

  // `focus` distinguishes the two gestures, and that is not a detail: Enter in the
  // field and F3 must NOT take the keyboard, otherwise the caret goes off into a
  // line textarea where Enter already creates the next line, and the key stops
  // repeating. A click on a result, on the other hand, does focus: one is going to
  // edit there.
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
    // The anchor moves PAST what has just been written: "next" therefore cannot
    // land back on the replacement itself, which may contain the query.
    setCurrent(anchorOn(match, edit.nextStart));
  }, [matches, currentIndex, replacement, dispatch]);

  const replaceAll = useCallback(() => {
    // Re-derived from the play and not from the displayed array (which the panel
    // caps): a display ceiling must never decide what gets rewritten.
    const edits = buildReplaceEdits(script, shownQuery, shownOptions, replacement);
    if (edits.length === 0) return;
    dispatch({ type: "SET_LINE_TEXTS", edits });
    setCurrent(null);
    // The displayed query and not the field's: it is the count announced by the
    // confirmation that must be rewritten, and it comes from the displayed list.
  }, [script, shownQuery, shownOptions, replacement, dispatch]);

  const openAndFocus = useCallback(() => {
    onOpen();
    setFocusSeq((n) => n + 1);
  }, [onOpen]);

  // The page's shortcuts. An effect SEPARATE from the undo/redo one (App.jsx), which
  // resubscribes on every edit (its dependencies are `canUndo`/`canRedo`): mixing
  // them would resubscribe both on every keystroke and would tangle two dependency
  // lists. Both listen in the bubbling phase and share disjoint keys, so the order of
  // registration is immaterial.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      // An open ConfirmModal listens for Escape in the CAPTURE phase and calls
      // preventDefault without stopPropagation: without this guard, an Escape meant
      // to close the modal would also close the panel behind it. The guard lives
      // here and not in the shared component, which the Recording page uses too.
      if (e.defaultPrevented) return;

      // Ctrl+H, the companion of Ctrl+F: it opens the search WITH its replacement
      // unfolded. Without it, a replacement folded away by default costs one more
      // click every single time.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        seedFromSelection(setQuery);
        setReplaceOpen(true);
        openAndFocus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        // We take over the browser's Ctrl+F, on purpose: its search does not read
        // the value of textareas, and only one scene is mounted at a time, so it
        // would find almost nothing.
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
    // The RENDERED query, the one the count, the list and `replaceAll` describe.
    // Exposed because the "Replace all" confirmation must quote that one and not the
    // field's: its title announces a number that comes from the deferred render, so
    // quoting the keystrokes in progress would make a sentence that counts one query
    // and names another.
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

// Ctrl+F from a line picks up the selected text, like a code editor: it is the
// gesture one makes to look for "that other place where I wrote this". A multiline
// selection is ignored, one does not search for it.
function seedFromSelection(setQuery) {
  const el = document.activeElement;
  if (!el || el.tagName !== "TEXTAREA" || !el.classList.contains("line-text")) return;
  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart === selectionEnd) return;
  const seed = value.slice(selectionStart, selectionEnd);
  if (seed && !seed.includes("\n")) setQuery(seed);
}
