import React, { useState } from "react";
import { DownloadIcon, WarnIcon } from "../shared/icons.jsx";
import { downloadBlob, githubUploadUrl } from "../shared/data.js";
import { LOCALE, t } from "../shared/locale.js";
import { mintPlayId, newPlayScript } from "../shared/plays.js";

// Creating a play, from the site and without writing a line of JSON.
//
// The site is static: it can commit nothing, so a play can only be born from an
// UPLOAD, like everything that enters this repo. The gesture therefore has two
// stages, and the doc sentence announces both of them: one downloads the starting
// script, one uploads it. The play appears once the Action has run.
//
// The file goes to the ROOT of `uploads/` and not to `uploads/<id>/`, because this is
// the only case where the folder cannot route yet: it does not exist. It is the id
// written inside the file that decides, and it is the only place in the project where
// the content routes an upload (cf. `claimed_play_id` in
// scripts/process_uploads.py). Once the play is born, the Action creates its own
// upload folder for it, and all its later uploads go through that one.
//
// The id is minted HERE, once, and will never change: it names the play's folder and
// its address on the site. Renaming the play later will change its title, not its
// address.

// The `id` the field cites in `aria-describedby` when it is refused. A module
// constant: there is only ever one creation form per document.
const ERROR_ID = "new-play-error";

export default function NewPlay({ taken }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);
  const [downloaded, setDownloaded] = useState(false);
  const url = githubUploadUrl();

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
    setError(null);
    // The READER's language as the play's language: it is the best bet (a
    // French-speaking troupe writes in French), and the rail's outline corrects it in
    // one click if need be. What is set here is indeed the DOCUMENT's language, not
    // the interface's, the two axes never being conflated elsewhere on the site.
    const script = newPlayScript(id, trimmed, LOCALE);
    const blob = new Blob([JSON.stringify(script, null, 2)], { type: "application/json" });
    // The file name carries the id, which is not a word to translate: it can be read
    // back in a downloads folder, and the Action never reads it (an upload's type
    // comes from its extension alone).
    downloadBlob(blob, `${id}.json`);
    setDownloaded(true);
  };

  return (
    <section className="chooser-new card">
      <h2>{t("manage.new.title")}</h2>
      <p className="chooser-new-hint">{t("manage.new.hint")}</p>
      {/* A real `<form>` and not a row of `div`s: Enter in the field submits, which is
          the natural gesture after typing a title and the only direct keyboard path to
          the action. Same shape as the character-adding form in the Editing page's
          rail, which is the site's precedent. */}
      <form
        className="chooser-new-row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label>
          {t("manage.new.label")}
          <input
            type="text"
            value={title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              // The message goes away as soon as the title is touched again: it
              // described the previous value, and keeping it would make one read a
              // refusal that no longer applies.
              setError(null);
              setDownloaded(false);
            }}
          />
        </label>
        <button type="submit" className="btn primary">
          <DownloadIcon /> {t("manage.new.download")}
        </button>
      </form>
      {/* `role="alert"` because this message only appears AFTER a click, and a screen
          reader left on the button would never see it go by: it is the page's only
          refusal, and it carries the only thing to fix. */}
      {error && (
        <p className="chooser-new-error" id={ERROR_ID} role="alert">
          <WarnIcon />
          {error}
        </p>
      )}
      {/* The second stage of the gesture only appears once the first is done: offering
          to upload a file one has not downloaded yet leads nowhere.
          The link is hidden outside github.io, where the upload address cannot be
          guessed. */}
      {downloaded && !error && (
        <p className="chooser-new-done">
          {t("manage.new.done")}{" "}
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              {t("manage.new.deposit")}
            </a>
          )}
        </p>
      )}
    </section>
  );
}
