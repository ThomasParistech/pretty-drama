import React, { useState } from "react";
import ConfirmModal from "../shared/ConfirmModal.tsx";
import { WarnIcon } from "../shared/icons.tsx";
import { githubNewPlayUrl, githubRepoUrl } from "../shared/data.ts";
import { t } from "../shared/locale.ts";
import { DEV_PLAY_ID, mintPlayId } from "../shared/plays.ts";
import type { PlayEntry } from "../shared/types.ts";

// The site commits nothing, so the button opens GitHub's file editor on
// `uploads/_new-play/<id>.txt` with the title as content (`githubNewPlayUrl`). The Action
// mints the real id (`mint_play_id`, common.py); `mintPlayId` here only ANNOUNCES it, so a
// bad or duplicate title is refused on the spot rather than in the journal.

// Cited by the field's `aria-describedby`. A module constant: only one box per document.
const ERROR_ID = "new-play-error";

// Ends the grid as the empty slot after the plays. `haspopup` because it opens a modal.
// Hidden when the repository is unknown: this is the gate, the form has no other way in.
export function NewPlayTile({ onOpen }: { onOpen: () => void }) {
  if (!githubRepoUrl()) return null;
  return (
    <button
      type="button"
      className="chooser-new-tile"
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      {/* A drawn "+", one of the monochrome characters the site allows. */}
      <span className="chooser-new-tile-plus" aria-hidden={true}>
        +
      </span>
      {t("manage.new.title")}
    </button>
  );
}

export default function NewPlay({
  taken,
  onClose,
}: {
  taken: PlayEntry[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("manage.new.emptyTitle"));
      return;
    }
    const id = mintPlayId(trimmed);
    if (!id) {
      // Better than fabricating "play-1", which would live for years in the troupe's URL.
      setError(t("manage.new.badTitle"));
      return;
    }
    // Ask for another title rather than suffix a number silently. DEV_PLAY_ID on top of the
    // list: the test bench holds that address but is absent from plays.json (`taken`).
    if (id === DEV_PLAY_ID || taken.some((play) => play.id === id)) {
      setError(t("manage.new.taken"));
      return;
    }
    // An argument: data.ts runs under `node --test` and must never import locale.ts.
    const url = githubNewPlayUrl(id, trimmed, t("manage.new.fileNote"));
    // Unreachable, but it stops a future caller putting "null" in an address bar.
    if (!url) return;
    setError(null);
    // window.open and not an <a href>: the address depends on what was just typed and the
    // refusals must be able to stop it. Straight from the submit, so no popup blocker.
    window.open(url, "_blank", "noreferrer");
    onClose();
  };

  return (
    // The shared box (portal, Escape, backdrop, focus), never a hand-rolled dialog.
    <ConfirmModal
      title={t("manage.new.title")}
      primaryLabel={t("manage.new.create")}
      onPrimary={create}
      onCancel={onClose}
      bodyTakesFocus
    >
      <p className="chooser-new-hint">{t("manage.new.hint")}</p>
      {/* A real <form> even though the button lives in the box's action row: one text field
          and no submit button is exactly the case where the browser submits on Enter. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label className="chooser-new-field">
          {t("manage.new.label")}
          <input
            type="text"
            // `bodyTakesFocus` above is what keeps the box from taking this focus back.
            autoFocus
            value={title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              // The refusal described the previous value.
              setError(null);
            }}
          />
        </label>
      </form>
      {/* role="alert": it appears after a click, which a reader on the button would miss. */}
      {error && (
        <p className="chooser-new-error" id={ERROR_ID} role="alert">
          <WarnIcon />
          {error}
        </p>
      )}
    </ConfirmModal>
  );
}
