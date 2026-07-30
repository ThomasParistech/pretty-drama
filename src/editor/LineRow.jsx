import React, { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { characterColor, characterInk } from "../shared/characterColors.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { excerpt } from "../shared/data.js";
import { fmt, t } from "../shared/locale.js";

// One dialogue line: drag handle + character <select> + text + delete.
// Enter inside the textarea inserts a new line right after (like typing in a
// text file, but every "line" is a structured object with a stable id).
//
// React.memo + handlers built here from the stable `dispatch`/`addLine`
// props: rows whose `line` object kept its identity skip re-rendering, so a
// keystroke re-renders only the edited row's scene, not the whole play.
export default React.memo(function LineRow({
  line,
  characters,
  actIndex,
  sceneIndex,
  focusRequest,
  onFocusHandled,
  dispatch,
  addLine,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.id,
  });

  const textareaRef = useRef(null);
  // Deleting a line that has text asks first (an empty line goes silently).
  const [confirming, setConfirming] = useState(false);

  // Auto-grow the textarea to fit its content.
  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(autoGrow, [line.text]);

  // Demande de focus et/ou de sélection adressée à CETTE réplique
  // (`{selection, focus}`, cf. App.jsx). Elle vaut pour la réplique qu'on vient
  // de créer (focus, pas de sélection) comme pour une correspondance de la
  // recherche (sélection, et focus seulement quand on a cliqué le résultat : à
  // la touche Entrée le champ de recherche doit garder le clavier pour rester
  // répétable).
  useEffect(() => {
    const el = textareaRef.current;
    if (!focusRequest || !el) return;
    if (focusRequest.focus) el.focus();
    if (focusRequest.selection) {
      const [start, end] = focusRequest.selection;
      // Le navigateur borne déjà, on borne quand même : la demande porte les
      // offsets d'un texte, et rien ne doit dépendre du fait que ce texte est
      // encore exactement le même.
      const max = el.value.length;
      el.setSelectionRange(Math.min(start, max), Math.min(end, max));
      // `focus()` amène l'élément à l'écran, `setSelectionRange` non : sans ça,
      // une navigation au clavier sélectionnerait hors champ de vision. Le
      // conteneur défilé est la colonne de l'éditeur, pas la fenêtre.
      el.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    }
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  // "Rail" design: white background everywhere, the character's color is
  // only an accent — it paints the drag handle and the character select.
  //
  // Les deux sont du TEXTE (le glyphe ⠿ et le nom dans le select, tous deux en
  // 15 px), donc c'est l'encre et pas l'aplat : la palette est faite pour des
  // surfaces, et son olive est à 1.87:1 sur le blanc. Seules les pastilles
  // pleines gardent la couleur telle quelle. Cf. `characterInk`.
  const color = characterColor(characters, line.characterId);
  const ink = color === null ? null : characterInk(color);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const known = color != null;

  return (
    <div ref={setNodeRef} style={style} className="line-row">
      <button
        className="drag-handle"
        title={t("common.dragHandle")}
        aria-label={t("common.dragHandle")}
        style={{ color: ink ?? "var(--ed-ghost)" }}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <select
        className="line-character"
        aria-label={t("line.character")}
        style={{ color: ink ?? "var(--ink-soft)" }}
        value={known ? line.characterId : ""}
        onChange={(e) =>
          dispatch({
            type: "SET_LINE_CHARACTER",
            actIndex,
            sceneIndex,
            lineId: line.id,
            characterId: e.target.value,
          })
        }
      >
        {!known && <option value="">{t("line.characterUnset")}</option>}
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* onBlur closes the undo step: a later edit of this same line becomes
          a separate one (see history.js). */}
      <textarea
        ref={textareaRef}
        className="line-text"
        rows={1}
        placeholder={t("line.placeholder")}
        value={line.text}
        onChange={(e) =>
          dispatch({ type: "EDIT_TEXT", actIndex, sceneIndex, lineId: line.id, text: e.target.value })
        }
        onInput={autoGrow}
        onBlur={() => dispatch({ type: "HISTORY_BREAK" })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addLine(actIndex, sceneIndex, line.id);
          }
        }}
      />

      <button
        className="btn icon small line-delete"
        title={t("line.delete")}
        aria-label={t("line.delete")}
        onClick={() => {
          if (line.text.trim() === "") {
            dispatch({ type: "DELETE_LINE", actIndex, sceneIndex, lineId: line.id });
          } else {
            setConfirming(true);
          }
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>

      {confirming && (
        <ConfirmModal
          title={t("line.deleteConfirm")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            dispatch({ type: "DELETE_LINE", actIndex, sceneIndex, lineId: line.id });
          }}
        >
          <p className="confirm-quote">{fmt.quote(excerpt(line.text))}</p>
        </ConfirmModal>
      )}
    </div>
  );
});
