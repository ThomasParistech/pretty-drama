import React, { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import PageState from "../shared/PageState.jsx";
import UploadTile from "../shared/UploadTile.jsx";
import { fetchScript, downloadBlob, githubUploadUrl, HttpError } from "../shared/data.js";
import { isPlayId } from "../shared/plays.js";
import { EMPTY_SCRIPT, allLines, newId, indexAfterMove, indexAfterRemoval } from "./reducer.js";
import { historyReducer, initHistory } from "./history.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import { fmt, t, translator } from "../shared/locale.js";
import T from "../shared/T.jsx";
import { actLabel } from "../shared/structureLabels.js";
import { pageLabelKey } from "../shared/pages.js";
import { UndoIcon, RedoIcon, WarnIcon } from "../shared/icons.jsx";
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
  // `{ lineId, selection, focus }`, cleared once honoured. The search selects too,
  // sometimes WITHOUT taking the focus. The object clears itself, so its identity
  // separates two successive requests and no serial number is needed.
  const [focusRequest, setFocusRequest] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  // A state COMPARISON and not a flag: undoing back to the last download leaves
  // nothing to save. Identity is enough, the stack restores the very objects.
  const dirty = script !== saved;

  // Act and scene labels here follow the PLAY's language, not the reader's: this page
  // shapes the document the PDF prints. Everything else stays interface.
  // The LANGUAGE goes down as a prop, never this `tPlay`: `SceneEditor` is memoised
  // and a fresh function per render would re-render the scene on every keystroke.
  const tPlay = translator(script.language);

  const touchOnly = useTouchPointer();

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  // Undo/redo anywhere, textareas included: the browser's own would rewind one field
  // out of sync with the stack. With nothing to undo we let the key through.
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

  // Load the published script.json. Fetched even on the touch-walled screen, whose
  // header names the play like every other.
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
          // No published script yet: legitimate empty start.
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

  // Also LeaveGuard's rescue gesture and the first half of `upload`.
  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(script, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "script.json");
    dispatch({ type: "MARK_SAVED" });
  }, [script, dispatch]);

  // Null wherever the repo cannot be known, or when script.json lost its `id`. Read
  // here and not in the tile: it decides what the gesture is made of.
  const uploadUrl = isPlayId(script.id) ? githubUploadUrl(script.id) : null;

  // The tile ANNOUNCES, the box's button acts: the box comes FIRST so the download and
  // the tab that opens read as two steps of one gesture rather than two surprises.
  // Both fire in the SAME click, which is what pop-up blockers ask of `window.open`.
  // With no usable URL it stays a plain download and no box: this is the play's only
  // way out, but a box promising a page that never opens is worse than none.
  const [uploadNotice, setUploadNotice] = useState(false);
  const upload = useCallback(() => {
    if (uploadUrl) setUploadNotice(true);
    else download();
  }, [download, uploadUrl]);

  // The UUID is minted HERE, not in the reducer, which must stay pure, and it is also
  // how we know which textarea to focus.
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

  // One scene at a time. The indices are CLAMPED at render time, so a deletion never
  // leaves one dangling; the gestures below also move them so the column keeps showing
  // the same scene after the plan is reshuffled.
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

  // Both append at the end: navigate straight to the new one.
  const addAct = () => {
    dispatch({ type: "ADD_ACT" });
    goToScene(script.acts.length, 0);
  };
  // A GIVEN act: the plan adds the scene where it is asked to.
  const addScene = (ai) => {
    dispatch({ type: "ADD_SCENE", actIndex: ai });
    goToScene(ai, script.acts[ai].scenes.length);
  };

  // The question was already asked in StructurePanel; only the gaze moves here.
  const deleteAct = (ai) => {
    dispatch({ type: "DELETE_ACT", actIndex: ai });
    const nextAct = indexAfterRemoval(safeActIndex, ai);
    goToScene(nextAct, nextAct === safeActIndex ? safeSceneIndex : 0);
  };
  const deleteScene = (ai, si) => {
    dispatch({ type: "DELETE_SCENE", actIndex: ai, sceneIndex: si });
    if (ai === safeActIndex) setSceneIndex(indexAfterRemoval(safeSceneIndex, si));
  };

  // The gaze follows the moved object, or shifts when a neighbour crossed it.
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

  // "Structure" on arrival: it carries the page's navigation and the title field. A
  // constant, where a conditional default would need a seeding effect after the fetch.
  const [railSection, setRailSection] = useState("structure");
  const openSearch = useCallback(() => setRailSection("search"), []);
  const closeRail = useCallback(() => setRailSection(null), []);

  // The three state changes are in ONE handler, so React batches them: the row mounts
  // with its focus request in the same commit and the effect runs on a measured
  // textarea. No setTimeout, no requestAnimationFrame.
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
    // Do not steal Ctrl+F on a page showing one sentence.
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

  // AFTER loading, because the title only arrives with the script; BEFORE the read
  // error, which teaches nothing to someone who cannot edit anyway.
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
    // Window-height shell. Here the scroller is `.editor-layout` and not
    // `.page-scroll`: two columns scrolling separately. On an element and never on
    // `body`, so the full-page screens above keep normal scrolling.
    <div className="page-shell editor-shell">
      {/* No settings: the title field and the choice of scene live in the rail. */}
      <PlayHeader
        page="editor"
        title={script.title || t("common.untitledPlay")}
        hint={
          <>
            {/* Ordered as lived: type, then send. */}
            <T
              k="editor.hintTyping"
              p={{
                enter: <strong>{t("common.keyEnter")}</strong>,
                shiftEnter: <strong>{t("common.keyShiftEnter")}</strong>,
              }}
            />
            {/* A `<br />` and not a third paragraph: the header carries two. */}
            <br />
            {/* One GESTURE and none of the machinery: the doc says what to DO, the
                button says what it does. */}
            {t("editor.hintUpload")}
          </>
        }
        actions={
          <>
            {dirty && <span className="dirty-hint">{t("editor.dirty")}</span>}
            {/* Tooltips on a WRAPPER: a `disabled` control receives no mouse event, so
                its own `title` never shows (measured, Chrome and Safari). The
                accessible name stays on the button and never depends on the state. */}
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
            {/* The shared upload tile, same object as the Progress one. NO seal, hence
                no `page`: it would be the quill, which `PlayHeader` already shows in
                this very row. Disabled keeps its fill and only goes quiet: the row's
                main action must not change object between two states. */}
            <span
              className="btn-tip editor-upload-tip"
              title={t(dirty ? "editor.upload.tip" : "editor.upload.none")}
            >
              {/* `in-header`: the shared header repaint (theme.css), the same one the
                  Progress page's PDF tile wears. This page's accent makes it violet. */}
              <UploadTile className="in-header" onClick={upload} disabled={!dirty}>
                {/* The coloured words are a PARAMETER, so each language keeps its word
                    order. No extension: the file does not exist yet, this button makes
                    it, so the label says what the gesture DOES. */}
                <T
                  k="editor.upload"
                  p={{
                    script: (
                      <span className="upload-tile-word page-editor">
                        {t("editor.upload.script")}
                      </span>
                    ),
                  }}
                />
              </UploadTile>
            </span>
          </>
        }
      />

      {/* The rail BEFORE the content in the DOM as on screen, so tabbing runs
          header, rail, lines. */}
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

            {/* The column SAYS where one is writing; the rail does everything else. */}
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

      {/* No destructive gesture, hence no `confirmLabel`. Both halves fire from this
          one click, which is what pop-up blockers ask of `window.open`; the download
          goes first, being the file the next page asks for. */}
      {uploadNotice && (
        <ConfirmModal
          /* The TILE's label, composed from the same two keys: the button pressed and
             the box confirming it must name one gesture. */
          title={t("editor.upload", { script: t("editor.upload.script") })}
          primaryLabel={t("editor.uploadNotice.go")}
          onPrimary={() => {
            setUploadNotice(false);
            download();
            window.open(uploadUrl, "_blank", "noopener,noreferrer");
          }}
          onCancel={() => setUploadNotice(false)}
        >
          <p>
            {/* The break is a PARAMETER of one entry, so each language places it after
                its own last full stop. */}
            <T
              k="editor.uploadNotice.body"
              p={{ file: <code>script.json</code>, br: <br /> }}
            />
          </p>
        </ConfirmModal>
      )}

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

// A character that still owns lines is never silently removed: reassign (the safe way
// out, hence `primaryLabel`) or delete the lines. With no other character, only the
// latter is offered.
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
