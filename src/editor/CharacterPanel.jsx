import React, { useState } from "react";
import { CHARACTER_COLOR_KEYS, CHARACTER_COLORS } from "../shared/characterColors.js";
import { t } from "../shared/locale.js";
import CountBadge from "./CountBadge.jsx";
import { newId } from "./reducer.js";

// Character management: one chip per character (colour swatch, in-place renaming,
// line count, deletion) and the add form. Lines only reference these entries by
// id, so a rename propagates everywhere and never touches a line id.
//
// It lives in the rail's "Characters" section (see EditorRail.jsx), and no longer
// in the header, where the other pages have their character select: the header is
// shared by five pages and only has room for what the five have in common,
// whereas this list grows with the cast.
//
// A real `<ul>`: a screen reader announces "list of 7 items", so the play's cast
// becomes one object and not a string of buttons.
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
        {/* "+ Character" and not "+ Add": the rail's three add buttons are read in
            the same piece of furniture ("+ Act", "+ Scene"), so they all name the
            object they create, and the neighbouring field already says "Character
            name".
            It does keep `.btn`, though, where the other two became ghost tiles
            (`.structure-add`), and the question was raised in review: THIS button
            SUBMITS a form, it validates the entry of the field to its left and
            goes dark as long as that entry is empty, whereas "+ Act" and "+ Scene"
            act on click and cannot be disabled. A disabled ghost tile next to an
            empty field would no longer read as a control at all; and the two forms
            are never seen side by side, since only one rail section is open at a
            time. */}
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
          <button
            className="character-name truncate"
            title={t("characters.rename")}
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

      {/* The palette is a SIBLING of the chip and no longer its child: it settles
          in the panel's flow, below the character, and pushes the following ones
          down (the rail's panel scrolls, so it would clip a box hung off the
          chip).
          The full-screen backdrop that closes it stays: one clicks a colour, or
          beside it to give up. */}
      {pickerOpen && (
        <>
          <div className="swatch-backdrop" onClick={() => setPickerOpen(false)} />
          {/* Twenty swatches in two rows of ten (see `.swatch-popover`): the top
              row is Tableau 10, the bottom one its ten light tints, that is to say
              the very structure of the tab20 the palette is drawn from. */}
          <div className="swatch-popover">
            {CHARACTER_COLORS.map((color, i) => (
              <button
                key={color}
                className={`swatch ${color === character.color ? "current" : ""}`}
                /* Every swatch NAMES itself: twenty "Choose this colour" buttons
                   were twenty homonyms, and the colour, their only piece of
                   information, was not spoken aloud.
                   In French, "la couleur X" and not "le X": out of twenty names,
                   four begin with a vowel (orange, olive, and their light tints)
                   and the article does not elide before them. An apposed colour
                   name needs no agreement, whereas an adjective would call for one
                   ("la couleur orange", but "la pastille orange"). */
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
