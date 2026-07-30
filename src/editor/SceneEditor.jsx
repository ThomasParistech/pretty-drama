import React from "react";
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
import LineRow from "./LineRow.jsx";
import { sceneLabel } from "../shared/structureLabels.js";
import { fmt, t, translator } from "../shared/locale.js";

// React.memo: only the scene being edited changes identity per keystroke. D'où la
// langue de la pièce reçue en CHAÎNE et le traducteur construit ici : un `t` lié,
// passé en prop, serait une valeur fraîche à chaque rendu du parent et ferait
// rendre toute la scène à chaque frappe.
export default React.memo(function SceneEditor({
  scene,
  actIndex,
  sceneIndex,
  language,
  characters,
  dispatch,
  addLine,
  focusRequest,
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

  return (
    <div className="scene-block">
      {/* Le titre et le compte, rien de plus : renommer la scène et la supprimer
          sont des gestes du plan de la pièce (section « Structure » du rail),
          pas du texte qu'on écrit. La colonne dit où l'on est, le rail façonne
          et nomme.
          Le titre est dans la langue de la PIÈCE (c'est l'intertitre du
          document, cf. structureLabels.js), le compte de répliques dans celle du
          lecteur (c'est de l'interface) : les deux voisinent, et c'est bien deux
          choses différentes qu'ils disent. */}
      <div className="scene-header">
        <h3 className="scene-title">{sceneLabel(translator(language), sceneIndex)}</h3>
        <span className="scene-line-count">
          {t("common.lineCount", { count: scene.lines.length })}
        </span>
      </div>

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
                      <span className="insert-pill">{t("scene.insert")}</span>
                    </button>
                  </div>
                )}
                {/* `focusRequest` est passé tel quel à la rangée visée, et
                    `null` à toutes les autres : `null` est superficiellement égal
                    à leur rendu précédent, donc React.memo continue de les
                    sauter, et seule la rangée visée se rend à nouveau. */}
                <LineRow
                  line={line}
                  characters={characters}
                  actIndex={actIndex}
                  sceneIndex={sceneIndex}
                  focusRequest={focusRequest?.lineId === line.id ? focusRequest : null}
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
                  <span className="insert-pill">{t("scene.insert")}</span>
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
          {t("scene.firstLine")}
        </button>
      )}
      {/* Le nom de la section du rail est INTERPOLÉ depuis sa propre clé : le
          recopier ici le ferait dériver au premier renommage. */}
      {!canAddLines && (
        <p className="scene-empty-hint">
          {t("scene.needCharacter", { section: fmt.quote(t("rail.characters")) })}
        </p>
      )}
    </div>
  );
});
