import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import EditableTitle from "./EditableTitle.jsx";
import LineRow from "./LineRow.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

// React.memo: only the scene being edited changes identity per keystroke.
export default React.memo(function SceneEditor({
  scene,
  actIndex,
  sceneIndex,
  sceneCount,
  characters,
  dispatch,
  addLine,
  focusLineId,
  onFocusHandled,
}) {
  const sensors = useSensors(
    // Small activation distance so simple clicks in the row don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      dispatch({ type: "MOVE_LINE", actIndex, sceneIndex, activeId: active.id, overId: over.id });
    }
  };

  const canAddLines = characters.length > 0;
  // Deleting a scene that still holds lines asks first (an empty one goes
  // silently).
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="scene-block">
      <div className="scene-header">
        <EditableTitle
          value={scene.title}
          className="scene-title"
          onChange={(title) => dispatch({ type: "RENAME_SCENE", actIndex, sceneIndex, title })}
        />
        <span className="scene-line-count">
          {scene.lines.length} réplique{scene.lines.length > 1 ? "s" : ""}
        </span>
        {sceneCount > 1 && (
          <button
            className="btn icon small"
            title="Supprimer cette scène"
            aria-label="Supprimer cette scène"
            onClick={() => {
              if (scene.lines.length === 0) {
                dispatch({ type: "DELETE_SCENE", actIndex, sceneIndex });
              } else {
                setConfirming(true);
              }
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title={`Supprimer « ${scene.title} » ?`}
          confirmLabel="Supprimer"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            dispatch({ type: "DELETE_SCENE", actIndex, sceneIndex });
          }}
        >
          <p>
            {scene.lines.length > 1
              ? `${scene.lines.length} répliques seront supprimées.`
              : "1 réplique sera supprimée."}
          </p>
        </ConfirmModal>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={scene.lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <div className="line-list">
            {scene.lines.map((line, i) => (
              <React.Fragment key={line.id}>
                {/* Discreet hover-revealed insert point between two lines. */}
                {i > 0 && (
                  <div className="insert-zone">
                    <button
                      type="button"
                      onClick={() => addLine(actIndex, sceneIndex, scene.lines[i - 1].id)}
                    >
                      <span className="insert-pill">+ insérer</span>
                    </button>
                  </div>
                )}
                <LineRow
                  line={line}
                  characters={characters}
                  actIndex={actIndex}
                  sceneIndex={sceneIndex}
                  autoFocus={focusLineId === line.id}
                  onFocusHandled={onFocusHandled}
                  dispatch={dispatch}
                  addLine={addLine}
                />
              </React.Fragment>
            ))}
            {/* Same insert point after the LAST line (appends to the scene). */}
            {scene.lines.length > 0 && canAddLines && (
              <div className="insert-zone end">
                <button type="button" onClick={() => addLine(actIndex, sceneIndex, null)}>
                  <span className="insert-pill">+ insérer</span>
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* No "+ Réplique" button: once a first line exists, Enter inside a
          line creates the next one (faster). Empty scenes still need a way
          to create that first line. */}
      {scene.lines.length === 0 && canAddLines && (
        <button className="add-first-line-btn" onClick={() => addLine(actIndex, sceneIndex, null)}>
          Écrire la première réplique : les suivantes se créent avec la touche Entrée.
        </button>
      )}
      {!canAddLines && (
        <p className="scene-empty-hint">
          Ajoutez d'abord un personnage dans le bandeau ci-dessus pour pouvoir saisir des répliques.
        </p>
      )}
    </div>
  );
});
