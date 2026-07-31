import React, { useState } from "react";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { WarnIcon } from "../shared/icons.jsx";
import { githubNewPlayUrl, githubRepoUrl } from "../shared/data.js";
import { t } from "../shared/locale.js";
import { mintPlayId } from "../shared/plays.js";

// Creating a play: a title, a button, and the play is on its way.
//
// ONE action, and that is the whole point of this component. The site is static, it can
// commit nothing, so a play is still born from a file arriving in `uploads/` like
// everything that enters this repo. But the coordinator no longer carries that file:
// the button opens GitHub's own file editor with the name and the content already in
// place (`githubNewPlayUrl`, shared/data.js), and confirming the commit is all that is
// left to do. It used to be download, find the file again, open the upload page, drop
// it, commit: five steps and a file wandering through a downloads folder.
//
// The file carries the TITLE and nothing else, as plain text on one line. The play's
// identifier is not written into it: the Action derives it from that title on arrival
// (`mint_play_id`, scripts/common.py), which is the one place a play gets named.
//
// It lands in `uploads/_new-play/`, the creation zone, and not in `uploads/<id>/`, which
// does not exist yet. There the FOLDER is the whole instruction, like everywhere else in
// this repo: the Action reads every file dropped in it as one play title, name and
// extension ignored, precisely because both are editable fields on the GitHub page this
// button opens (cf. `githubNewPlayUrl` in shared/data.js and `process_new_play_zone` in
// scripts/process_uploads.py). Once the play is born, the Action creates its own upload
// folder for it, and all its later uploads go through that one.
//
// `mintPlayId` still runs here, but only to ANNOUNCE: it is what lets this page refuse
// an unusable title or a duplicate on the spot, where the Action would only be able to
// say so in the journal minutes later. It also names the file GitHub is about to open,
// hence the folder about to be created.

// The `id` the field cites in `aria-describedby` when it is refused. A module
// constant: there is only ever one creation box open per document, and the box is named
// by its own title (`ConfirmModal` carries it into `aria-label`).
const ERROR_ID = "new-play-error";

// The entry to the gesture, and the only thing the page shows of it until it is asked
// for: a tile at the END OF THE GRID, in the row of the plays, drawn in a dashed outline
// so it reads as the empty slot after them rather than as a play.
//
// A whole card with a field and a button used to sit under the list, open at all times.
// It asked for a play on every visit, and a company creates one perhaps twice a year:
// the page's subject is the plays that exist, not the next one. So the offer shrinks to
// a "+" that costs a glance, and the form appears only for whoever asks.
//
// It is a grid item, unlike the two management blocks below the grid, and the comment
// in chooser.css that forbids those from taking a play's width is not contradicted: it
// forbids a BLOCK from reading as one more play, whereas this tile reads as the next
// slot, which is exactly the offer.
//
// What it opens is a MODAL and not a panel underneath, which is why it says `haspopup`
// and not `expanded`: the form is three fields' worth of a gesture that leaves for
// GitHub straight away, and unfolding it into the page pushed the plays down and left
// the eye to find where it had gone. The box arrives in front, takes the focus, and
// Escape or the backdrop returns the page exactly as it was.
//
// Hidden wherever the repository cannot be known (a custom domain), as the upload card
// of the Progress page hides itself: there is no address to send the coordinator to, and
// a button that leads nowhere is worse than an absent one. It is the REPOSITORY that is
// tested and not the final URL, which needs a title nobody has typed yet. This is the
// gate of the whole gesture: the form has no other way in, so it needs no test of its
// own (and `create` re-tests the URL it is about to open).
export function NewPlayTile({ onOpen }) {
  if (!githubRepoUrl()) return null;
  return (
    <button
      type="button"
      className="chooser-new-tile"
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      {/* A drawn "+" and not an icon: it is one of the monochrome characters the site
          allows itself (like the "+ Acte" of the editor's outline), it follows the font
          and it needs no viewBox to stay centred. */}
      <span className="chooser-new-tile-plus" aria-hidden={true}>
        +
      </span>
      {t("manage.new.title")}
    </button>
  );
}

export default function NewPlay({ taken, onClose }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("manage.new.emptyTitle"));
      return;
    }
    const id = mintPlayId(trimmed);
    if (!id) {
      // A title made entirely of punctuation leaves no address: better to say so
      // than to fabricate a folder named "play-1", which would live for years in
      // the troupe's URL.
      setError(t("manage.new.badTitle"));
      return;
    }
    // Two plays with the same id would step on each other (same folder, same upload
    // folder); two plays with the same title would furthermore be impossible to tell
    // apart in the chooser. So we ask for another title rather than suffixing a
    // number behind the coordinator's back.
    if (taken.some((play) => play.id === id)) {
      setError(t("manage.new.taken"));
      return;
    }
    // The note travels as an argument, not read from the catalogue by `data.js`: that
    // module is covered by `node --test` and must not import `locale.js` (same rule as
    // `slugify`'s fallback, which lives at its call sites for the same reason).
    const url = githubNewPlayUrl(id, trimmed, t("manage.new.fileNote"));
    // Cannot happen: the whole block is hidden when the repository is unknown. The test
    // stands so that a future caller cannot turn a null into the string "null" in an
    // address bar.
    if (!url) return;
    setError(null);
    // A new tab, like every other GitHub link on the site: the coordinator comes back
    // to this page to see their play show up. `window.open` and not an `<a href>`,
    // because the address depends on what has just been typed and because the three
    // refusals above must be able to stop the gesture; it is called straight from the
    // submit, so no popup blocker sees it as unsolicited.
    window.open(url, "_blank", "noreferrer");
    // And the box closes: what it asked for has been asked, the rest happens on GitHub
    // and then in the list behind it. Refused, it stays open with its reason, which is
    // the only case where there is still something to do here.
    onClose();
  };

  return (
    // The shared box (portal, Escape, backdrop, focus), not a panel of its own: the
    // project says in as many words that a dialog rebuilt by hand ends up differing from
    // the others on exactly those four things. The primary action is the box's own, so
    // the form below holds the field alone.
    <ConfirmModal
      title={t("manage.new.title")}
      primaryLabel={t("manage.new.create")}
      onPrimary={create}
      onCancel={onClose}
      bodyTakesFocus
    >
      <p className="chooser-new-hint">{t("manage.new.hint")}</p>
      {/* A real `<form>` around the field, though the button lives in the box's action
          row: it is what makes Enter create the play, the natural gesture after typing a
          title and the only direct keyboard path to the action. One text field and no
          submit button is precisely the case where the browser submits on Enter. */}
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
            // The box only ever exists after a click on the tile, so the field is
            // mounted BY that click. `bodyTakesFocus` above is what keeps the box from
            // taking this focus back.
            autoFocus
            value={title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              // The message goes away as soon as the title is touched again: it
              // described the previous value, and keeping it would make one read a
              // refusal that no longer applies.
              setError(null);
            }}
          />
        </label>
      </form>
      {/* `role="alert"` because this message only appears AFTER a click, and a screen
          reader left on the button would never see it go by: it is the box's only
          refusal, and it carries the only thing to fix. */}
      {error && (
        <p className="chooser-new-error" id={ERROR_ID} role="alert">
          <WarnIcon />
          {error}
        </p>
      )}
    </ConfirmModal>
  );
}
