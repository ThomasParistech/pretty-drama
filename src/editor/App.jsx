import React, { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import PageState from "../shared/PageState.jsx";
import { fetchScript, downloadBlob, HttpError } from "../shared/data.js";
import { EMPTY_SCRIPT, allLines, newId, indexAfterMove, indexAfterRemoval } from "./reducer.js";
import { historyReducer, initHistory } from "./history.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageMark from "../shared/PageMark.jsx";
import { fmt, t, translator } from "../shared/locale.js";
import T from "../shared/T.jsx";
import { actLabel } from "../shared/structureLabels.js";
import { PAGES, pageLabelKey } from "../shared/pages.js";
import { DownloadIcon, UndoIcon, RedoIcon, WarnIcon } from "../shared/icons.jsx";
import CharacterPanel from "./CharacterPanel.jsx";
import EditorRail from "./EditorRail.jsx";
import SearchPanel from "./SearchPanel.jsx";
import useSearch from "./useSearch.js";
import StructurePanel from "./StructurePanel.jsx";
import SceneEditor from "./SceneEditor.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import LeaveGuard from "../shared/LeaveGuard.jsx";
import useTouchPointer from "./useTouchPointer.js";
import "./editor.css";

export default function App() {
  // scriptReducer wrapped in an undo stack (see history.js): `script` is the
  // present state, `past` the previous ones, `saved` the one that matches the
  // last downloaded script.json.
  const [{ present: script, past, future, saved }, dispatch] = useReducer(
    historyReducer,
    EMPTY_SCRIPT,
    initHistory
  );
  const [loading, setLoading] = useState(true);
  const [loadInfo, setLoadInfo] = useState("");
  // Blocking error: the published script EXISTS but could not be read.
  // Starting empty here would let the coordinator overwrite the real play.
  const [loadError, setLoadError] = useState(null);
  // Focus and/or selection request addressed to ONE line, cleared as soon as it
  // is honoured: `{ lineId, selection: [start, end] | null, focus }`.
  // Generalises the original `focusLineId` (the line just created takes the
  // caret): the search also needs to select, and sometimes WITHOUT stealing the
  // focus. Since the object clears itself, its identity is enough to tell two
  // successive requests on the same line apart, so no serial number here (unlike
  // the search field, see useSearch.js).
  const [focusRequest, setFocusRequest] = useState(null);
  // Pending character deletion needing a decision (has lines).
  const [deleteRequest, setDeleteRequest] = useState(null);
  // Is there anything to download? A state comparison, not a flag raised by
  // the first edit: undoing back to the last downloaded state (or to the
  // loaded script, when nothing was downloaded yet) leaves nothing to save.
  // Identity is enough, the stack stores the very objects it restores.
  const dirty = script !== saved;

  // The act and scene labels of THIS page are composed in the language of the
  // PLAY and not in the reader's (see structureLabels.js): here one shapes the
  // document, and "Acte II" is the heading the PDF will print. It is the only one
  // of the five pages in that case, the other four merely navigating a play they
  // do not touch. The rest of the editor's text stays in the reader's language:
  // that is interface.
  // The language goes down as a PROP (and never this `tPlay`) to the two
  // components that need it below: `SceneEditor` is in `React.memo`, and a fresh
  // function on every render would make it re-render the whole scene on every
  // keystroke.
  const tPlay = translator(script.language);

  // Computer-only page (see useTouchPointer): on a touch pointer it renders an
  // explanation screen instead of the editor.
  const touchOnly = useTouchPointer();

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  // Ctrl+Z / Ctrl+Y (and Cmd+Z / Cmd+Shift+Z on Mac) anywhere, including
  // inside a textarea: the browser's own undo would only rewind that one
  // field, out of sync with our stack. When there is nothing to undo or redo
  // we let the key through, so the native undo of a field still works.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.altKey) return;
      const key = e.key.toLowerCase();
      const wantsRedo = key === "y" || (key === "z" && e.shiftKey);
      const wantsUndo = key === "z" && !e.shiftKey;
      if (wantsRedo && canRedo) {
        e.preventDefault();
        redo();
      } else if (wantsUndo && canUndo) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // "Reprise" mode: load the published script.json to continue editing it.
  // Fetched even when the page is walled off (touch screen), and not for nothing:
  // that screen's header names the play like the site's five other headers.
  // Skipping the fetch was a saving of nothing at all (one JSON, on a page that
  // then shows a single sentence) paid for by the site's only top row writing
  // "Editing" instead of the play's title.
  useEffect(() => {
    let cancelled = false;
    fetchScript()
      .then((raw) => {
        if (cancelled) return;
        dispatch({ type: "LOAD_SCRIPT", script: raw });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 404) {
          // Genuinely no published script yet: legitimate empty start.
          setLoadInfo(t("editor.noPublishedScript"));
        } else {
          setLoadError(t("editor.readError"));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(script, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "script.json");
    dispatch({ type: "MARK_SAVED" });
  }, [script, dispatch]);

  // Insert a new line and focus it: the UUID is minted here (not in the
  // reducer, which must stay pure) so we know which textarea to focus.
  // The default character (same speaker as the previous line) is computed
  // by the reducer.
  const addLine = useCallback(
    (actIndex, sceneIndex, afterLineId) => {
      const id = newId();
      dispatch({ type: "ADD_LINE", id, actIndex, sceneIndex, afterLineId });
      setFocusRequest({ lineId: id, selection: null, focus: true });
    },
    [dispatch]
  );

  // Stable identity: LineRow uses it in an effect dependency list.
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  // One scene at a time, designated in the rail's "Structure" section (which took
  // over the header's two selects, see StructurePanel.jsx). The indices are
  // clamped at render time, so a deletion can never leave one dangling; the
  // gestures below also put them back where they belong, so that the text column
  // keeps showing THE SAME scene after the plan is reshuffled.
  const [actIndex, setActIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const safeActIndex = Math.max(0, Math.min(actIndex, script.acts.length - 1));
  const act = script.acts[safeActIndex] ?? null;
  const safeSceneIndex = Math.max(0, Math.min(sceneIndex, (act?.scenes.length ?? 1) - 1));
  const scene = act?.scenes[safeSceneIndex] ?? null;

  const goToScene = (ai, si) => {
    setActIndex(ai);
    setSceneIndex(si);
  };

  // ADD_ACT / ADD_SCENE append at the end: navigate straight to the new one.
  const addAct = () => {
    dispatch({ type: "ADD_ACT" });
    goToScene(script.acts.length, 0);
  };
  // A given act, no longer "the current act": the rail's plan adds the scene
  // where it is asked to.
  const addScene = (ai) => {
    dispatch({ type: "ADD_SCENE", actIndex: ai });
    goToScene(ai, script.acts[ai].scenes.length);
  };

  // Deletions: the question has already been asked (the plan confirms when the
  // object is not empty, see StructurePanel), only moving the gaze is left.
  const deleteAct = (ai) => {
    dispatch({ type: "DELETE_ACT", actIndex: ai });
    const nextAct = indexAfterRemoval(safeActIndex, ai);
    goToScene(nextAct, nextAct === safeActIndex ? safeSceneIndex : 0);
  };
  const deleteScene = (ai, si) => {
    dispatch({ type: "DELETE_SCENE", actIndex: ai, sceneIndex: si });
    if (ai === safeActIndex) setSceneIndex(indexAfterRemoval(safeSceneIndex, si));
  };

  // Reorder: the gaze follows the moved object, and shifts when it is a neighbour
  // that crossed it (indexAfterMove, tested next to MOVE_*).
  const moveAct = (from, to) => {
    dispatch({ type: "MOVE_ACT", from, to });
    setActIndex(indexAfterMove(safeActIndex, from, to));
  };
  const moveScene = (ai, from, to) => {
    dispatch({ type: "MOVE_SCENE", actIndex: ai, from, to });
    if (ai === safeActIndex) setSceneIndex(indexAfterMove(safeSceneIndex, from, to));
  };

  // One O(lines) pass instead of one full-script scan per character per render.
  const lineCounts = useMemo(() => {
    const counts = new Map();
    for (const line of allLines(script)) {
      if (line.characterId != null) {
        counts.set(line.characterId, (counts.get(line.characterId) ?? 0) + 1);
      }
    }
    return counts;
  }, [script]);

  // The rail's open section, or null (collapsed). "Structure" on arrival, no
  // longer "Characters": it is the one that now carries the page's navigation, so
  // closing it would hide the choice of scene, which the header's two selects used
  // to show without being asked. It also shows the play's title field, which used
  // to live in the header too. A constant is enough, where "open on Characters
  // only if the play has none" would need a seeding effect after the fetch.
  const [railSection, setRailSection] = useState("structure");
  const openSearch = useCallback(() => setRailSection("search"), []);
  const closeRail = useCallback(() => setRailSection(null), []);

  // Go to a match. The four state changes live in the SAME handler, so React
  // batches them into a single render: the target scene is already designated
  // there, the targeted row mounts with its focus request in the same commit, and
  // the effect runs afterwards, on a textarea that is laid out and measured.
  // Neither setTimeout nor requestAnimationFrame.
  const goToMatch = useCallback((match, focus) => {
    setActIndex(match.actIndex);
    setSceneIndex(match.sceneIndex);
    setFocusRequest({
      lineId: match.lineId,
      selection: [match.start, match.end],
      focus: Boolean(focus),
    });
  }, []);

  const search = useSearch({
    script,
    dispatch,
    goToMatch,
    isOpen: railSection !== null,
    onOpen: openSearch,
    onClose: closeRail,
    // On the touch-wall screen, Ctrl+F would be taken away from the browser for a
    // page that only shows one sentence.
    enabled: !touchOnly && !loadError,
  });

  const requestDeleteCharacter = useCallback(
    (character) => {
      const count = lineCounts.get(character.id) ?? 0;
      if (count === 0) {
        dispatch({ type: "DELETE_CHARACTER", id: character.id, mode: "deleteLines" });
      } else {
        setDeleteRequest({ character, count });
      }
    },
    [dispatch, lineCounts]
  );

  if (loading) {
    return <PageState page="editor" loading={t("common.loadingScript")} />;
  }

  // Before the other loaded states: on a touch screen the page never shows the
  // editor, only why and where to open it. It still names the play, like the
  // site's five headers: this is a final screen and not a wait. It therefore comes
  // AFTER the loading (the title only arrives with the script, and the header says
  // nothing as long as it does not know it) but BEFORE the read error: an
  // unreadable script teaches nothing to someone who cannot edit.
  if (touchOnly) {
    return (
      <PageState
        page="editor"
        title={script.title || t("common.untitledPlay")}
        error={
          <>
            <WarnIcon />
            {t("editor.touchOnly", { page: t(pageLabelKey("editor")) })}
          </>
        }
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        page="editor"
        error={
          <>
            <WarnIcon />
            {loadError}
          </>
        }
        className="load-error"
      />
    );
  }

  return (
    // Shell the height of the window: the header at the top in the flow, then the
    // rail and the text column, each scrolling on its own. `.page-shell` is shared
    // with the Speaking share page (theme.css); `.editor-shell` now only sets the
    // height, `vh` instead of the default `dvh`. The scrolling-area role is NOT
    // held by `.page-scroll` here: it is `.editor-layout`, a grid whose two
    // columns each scroll on their own, where the Speaking share page has a single
    // flow to scroll. Put here and not on `body`: the full-page screens rendered
    // above keep normal scrolling.
    <div className="page-shell editor-shell">
      {/* A header WITHOUT settings, like the Progress one: the play's title and
          the choice of scene have moved to the rail's "Structure" section (see
          StructurePanel.jsx), so all that is left here is what the site's five
          pages have in common, the play's title in serif, the doc and the way
          back home. It still collapses, like the other four. */}
      <PlayHeader
        page="editor"
        title={script.title || t("common.untitledPlay")}
        hint={
          <>
            {/* The two sentences are in the order in which they are lived: what
                serves during typing first, what serves once one has finished
                next (type, download, upload). The other way round announced the
                way out of the page before entering it, and cut the file's
                journey in two. Accepted price: this page's `hint` is the only
                one not to open on an imperative (see pages.js), it arrives one
                sentence later. And no "press the button": that is the finger's
                verb, and this is the only page the finger does not open (see
                useTouchPointer.js). */}
            <T
              k="editor.hintTyping"
              p={{
                enter: <strong>{t("common.keyEnter")}</strong>,
                shiftEnter: <strong>{t("common.keyShiftEnter")}</strong>,
              }}
            />
            {/* A `<br />` and above all not a third paragraph: the header only
                carries two (see PlayHeader.jsx), and the two sentences really
                are the same voice, one moment of the work apart. So the line
                breaks where the work changes nature, during typing then once it
                is finished, rather than at the width of the window. */}
            <br />
            {/* The green Progress seal rather than an underlined word: the
                destination is a page of the site, which the company recognises by
                its badge (home, headers, upload journal), and a plain hyperlink in
                the middle of a doc sentence was the only underlined thing in the
                whole header. The word stays inside the link: it is what names the
                page, the seal is decorative.
                The link is a PARAMETER of the sentence: cut around it, the
                sentence froze the French word order inside the component. */}
            <T
              k="editor.hintDownload"
              p={{
                page: (
                  <a className="hint-page-link page-dashboard" href={PAGES.dashboard.href}>
                    <PageMark page="dashboard" className="hint-page-mark" label="" />
                    {t(pageLabelKey("dashboard"))}
                  </a>
                ),
              }}
            />
          </>
        }
        actions={
          <>
            {dirty && <span className="dirty-hint">{t("editor.dirty")}</span>}
            {/* The three buttons of this row go dark, and each explains why in
                its tooltip. That tooltip is therefore carried by a wrapper and
                never by the button: a `disabled` control receives no mouse event,
                so its own `title` does not show (Chrome, Safari), and the
                explanation never arrived at the moment it is useful. The
                accessible name, on the other hand, stays on the button: it is the
                `aria-label`, which does not change from one state to the other (a
                button's name does not depend on its state, only the tooltip says
                why it sleeps). */}
            <span className="history-group">
              <span
                className="btn-tip"
                title={t(canUndo ? "editor.undo.tip" : "editor.undo.none")}
              >
                <button
                  className="btn icon"
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label={t("editor.undo")}
                >
                  <UndoIcon />
                </button>
              </span>
              <span
                className="btn-tip"
                title={t(canRedo ? "editor.redo.tip" : "editor.redo.none")}
              >
                <button
                  className="btn icon"
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label={t("editor.redo")}
                >
                  <RedoIcon />
                </button>
              </span>
            </span>
            {/* Icon only: the button lives next to the undo/redo pair, already
                wordless, and its written label was the only text of the row to
                compete with the play's title on a narrow window. The verb is
                carried by the tooltip and the aria-label, and the header's doc
                sentence says what the gesture is for.
                Dark when there is nothing to download (`dirty` is a comparison of
                states, not a flag: undoing back to the last download turns it off
                too), like the two history buttons next to it: uploading the script
                exactly as it is already published teaches the Action nothing, and
                a button that is always live makes one doubt whether anything is
                left to send. Tooltip on the wrapper, like the other two, for the
                same reason. */}
            <span
              className="btn-tip"
              title={t(dirty ? "editor.download" : "editor.download.none")}
            >
              <button
                className="btn primary icon script-download-btn"
                onClick={download}
                disabled={!dirty}
                aria-label={t("editor.download")}
              >
                <DownloadIcon />
              </button>
            </span>
          </>
        }
      />

      {/* The rail BEFORE the content, in the DOM as on screen: tabbing starts
          from the header, goes through the rail, reaches the lines, which is also
          the order the character chips had back when they followed the act and
          scene selects. */}
      <div className="editor-layout">
        <EditorRail
          section={railSection}
          onSection={setRailSection}
          structure={
            <StructurePanel
              script={script}
              actIndex={safeActIndex}
              sceneIndex={safeSceneIndex}
              dispatch={dispatch}
              onGo={goToScene}
              onAddAct={addAct}
              onAddScene={addScene}
              onDeleteAct={deleteAct}
              onDeleteScene={deleteScene}
              onMoveAct={moveAct}
              onMoveScene={moveScene}
            />
          }
          characters={
            <CharacterPanel
              characters={script.characters}
              lineCounts={lineCounts}
              dispatch={dispatch}
              onRequestDelete={requestDeleteCharacter}
            />
          }
          search={
            <SearchPanel
              characters={script.characters}
              language={script.language}
              query={search.query}
              setQuery={search.setQuery}
              shownQuery={search.shownQuery}
              replacement={search.replacement}
              setReplacement={search.setReplacement}
              caseSensitive={search.caseSensitive}
              setCaseSensitive={search.setCaseSensitive}
              wholeWord={search.wholeWord}
              setWholeWord={search.setWholeWord}
              replaceOpen={search.replaceOpen}
              setReplaceOpen={search.setReplaceOpen}
              total={search.total}
              groups={search.groups}
              searching={search.searching}
              currentMatch={search.currentIndex >= 0 ? search.matches[search.currentIndex] : null}
              next={search.next}
              prev={search.prev}
              onSelect={search.select}
              replaceCurrent={search.replaceCurrent}
              replaceAll={search.replaceAll}
              focusSeq={search.focusSeq}
            />
          }
        />

        <main className="editor-column">
          <div className="editor-main">
            {loadInfo && <p className="load-info">{loadInfo}</p>}

            {/* The act's title, plainly: the column SAYS where one is writing, the
                rail does all the rest (create, rename, delete, reorder, navigate).
                It used to carry the act's renaming and the ✕ that deleted it;
                nothing is left that appears, disappears or opens above the text
                one is typing. */}
            {act && <h2 className="act-title">{actLabel(tPlay, safeActIndex)}</h2>}

            {scene && (
              <SceneEditor
                scene={scene}
                actIndex={safeActIndex}
                sceneIndex={safeSceneIndex}
                language={script.language}
                characters={script.characters}
                dispatch={dispatch}
                addLine={addLine}
                focusRequest={focusRequest}
                onFocusHandled={handleFocusHandled}
              />
            )}
          </div>
        </main>
      </div>

      <LeaveGuard
        active={dirty}
        title={t("editor.leaveTitle")}
        saveLabel={t("editor.leaveSave")}
        onSave={download}
      >
        <p>
          <T k="editor.leaveBody" p={{ file: <code>script.json</code> }} />
        </p>
      </LeaveGuard>

      {deleteRequest && (
        <DeleteCharacterModal
          request={deleteRequest}
          characters={script.characters}
          onCancel={() => setDeleteRequest(null)}
          onConfirm={(mode, reassignTo) => {
            dispatch({ type: "DELETE_CHARACTER", id: deleteRequest.character.id, mode, reassignTo });
            setDeleteRequest(null);
          }}
        />
      )}
    </div>
  );
}

// Guard against ghost data: a character that still owns lines cannot be
// silently removed: the user chooses to reassign or delete those lines.
//
// Built on the shared ConfirmModal, like the line, scene and act confirmations:
// it used to reimplement the same box by hand, and therefore silently differed on
// everything that component brings (Escape, initial focus, portal rendering,
// role="dialog"). Reassigning is the safe way out, hence the `primaryLabel`;
// deleting the lines is the destructive gesture. With no other character to give
// them to, only the latter is left.
function DeleteCharacterModal({ request, characters, onCancel, onConfirm }) {
  const others = characters.filter((c) => c.id !== request.character.id);
  const [reassignTo, setReassignTo] = useState(others[0]?.id ?? null);

  return (
    <ConfirmModal
      title={t("common.deleteConfirm", { name: fmt.quote(request.character.name) })}
      confirmLabel={t("editor.deleteCharacterLines")}
      onConfirm={() => onConfirm("deleteLines")}
      primaryLabel={others.length > 0 ? t("editor.reassign") : undefined}
      onPrimary={() => onConfirm("reassign", reassignTo)}
      onCancel={onCancel}
    >
      <p>
        <T
          k="editor.deleteCharacterBody"
          p={{ count: <strong>{t("common.lineCount", { count: request.count })}</strong> }}
        />
      </p>
      {others.length > 0 && (
        <label className="reassign-row">
          {t("editor.reassignTo")}
          <select value={reassignTo ?? ""} onChange={(e) => setReassignTo(e.target.value)}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </ConfirmModal>
  );
}
