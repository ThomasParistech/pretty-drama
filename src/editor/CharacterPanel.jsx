import React, { useState } from "react";
import { CHARACTER_COLOR_KEYS, CHARACTER_COLORS } from "../shared/characterColors.js";
import { t } from "../shared/locale.js";
import CountBadge from "./CountBadge.jsx";
import { newId } from "./reducer.js";

// Character management: one chip per character plus the add form. Lines reference
// characters by id, so a rename propagates and never touches a line id.
// A real `<ul>` so a screen reader announces the cast as one object.
export default function CharacterPanel({ characters, lineCounts, dispatch, onRequestDelete }) {
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "ADD_CHARACTER", id: newId(), name });
    setNewName("");
  };

  return (
    <>
      {characters.length === 0 ? (
        <p className="character-empty">{t("characters.empty")}</p>
      ) : (
        <ul className="character-list">
          {characters.map((c) => (
            <CharacterItem
              key={c.id}
              character={c}
              lineCount={lineCounts.get(c.id) ?? 0}
              onRename={(name) => dispatch({ type: "RENAME_CHARACTER", id: c.id, name })}
              onSetColor={(color) => dispatch({ type: "SET_CHARACTER_COLOR", id: c.id, color })}
              onDelete={() => onRequestDelete(c)}
            />
          ))}
        </ul>
      )}

      <form
        className="character-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          placeholder={t("characters.namePlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        {/* Keeps `.btn` where "+ Act"/"+ Scene" are ghost tiles: this one SUBMITS a
            form and disables on an empty field, and a disabled ghost tile no longer
            reads as a control. The two are never seen side by side anyway. */}
        <button type="submit" className="btn small" disabled={!newName.trim()}>
          {t("characters.add")}
        </button>
      </form>
    </>
  );
}

function CharacterItem({ character, lineCount, onRename, onSetColor, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(character.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== character.name) onRename(draft);
    else setDraft(character.name);
  };

  return (
    <li className="character-item">
      <span className="character-chip">
        <button
          className="character-swatch"
          title={t("characters.changeColor")}
          aria-label={t("characters.changeColorOf", { name: character.name })}
          style={{ background: character.color }}
          onClick={() => setPickerOpen((o) => !o)}
        />

        {editing ? (
          <input
            type="text"
            className="character-rename-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(character.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          // `title` carries the NAME, as `.truncate` requires: the rail is 200 px wide
          // and a character's name is the one piece of user data here, so a cut one is
          // readable nowhere else. The gesture moves to `aria-label`, which also keeps
          // the name in the accessible name, exactly as `chip-delete` does below.
          <button
            className="character-name truncate"
            title={character.name}
            aria-label={t("characters.renameNamed", { name: character.name })}
            onClick={() => setEditing(true)}
          >
            {character.name}
          </button>
        )}
        <CountBadge count={lineCount} className="character-count" />
        <button
          className="chip-delete"
          title={t("characters.delete")}
          aria-label={t("characters.deleteNamed", { name: character.name })}
          onClick={onDelete}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </span>

      {/* The palette is a SIBLING of the chip, not its child: the rail's panel
          scrolls and would clip a box hung off the chip. */}
      {pickerOpen && (
        <>
          <div className="swatch-backdrop" onClick={() => setPickerOpen(false)} />
          {/* Two rows of ten: Tableau 10 then its light tints, the tab20 structure. */}
          <div className="swatch-popover">
            {CHARACTER_COLORS.map((color, i) => (
              <button
                key={color}
                className={`swatch ${color === character.color ? "current" : ""}`}
                /* Every swatch NAMES its colour: otherwise twenty homonyms.
                   The `.toLowerCase()` below looks like casing decided in a component,
                   and it is not a slip. The twenty names are capitalised because they
                   also stand ALONE (in `colorCurrent` and in the `title`), and only the
                   mid-sentence use needs them folded: French says "Choisir la couleur
                   bleu", English "Choose blue". Both are right, and both stay right in
                   any language whose colour names are not capitalised mid-sentence.
                   The alternative is a second set of TWENTY lowercase entries per
                   catalogue to serve one sentence; refused as such. A language that
                   really needs the capital there must gain those entries. */
                aria-label={
                  color === character.color
                    ? t("characters.colorCurrent", { color: t(CHARACTER_COLOR_KEYS[i]) })
                    : t("characters.colorChoose", {
                        color: t(CHARACTER_COLOR_KEYS[i]).toLowerCase(),
                      })
                }
                title={
                  color === character.color
                    ? t("characters.colorCurrent", { color: t(CHARACTER_COLOR_KEYS[i]) })
                    : t(CHARACTER_COLOR_KEYS[i])
                }
                style={{ background: color }}
                onClick={() => {
                  onSetColor(color);
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </li>
  );
}
