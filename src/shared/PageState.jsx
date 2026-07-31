import React from "react";
import PageHeader from "./PageHeader.jsx";
import { t } from "./locale.js";

// Full-page waiting or blocking screen (manifest/script not loaded yet, error,
// incompatible browser…), shared by every page: brand header + a word in a card
// (`.page-notice`, theme.css).
// BOTH STATES take the card, the waiting one as much as the message: they are
// two moments of the same screen, and the second almost always follows the
// first, so a card that only arrived afterwards would read as a page change.
// `.loading-state` now only softens the ink on top of it.
// `error` may be a string or JSX; `className` adds to the card (e.g.
// "load-error" on the editor side, which widens it for its paragraphs).
export default function PageState({
  page,
  title,
  error = null,
  // A default parameter, so it is evaluated per call and picks up the locale
  // rather than freezing a string at module load.
  loading = t("common.loadingPlay"),
  className = "",
}) {
  return (
    <>
      <PageHeader page={page} title={title} />
      {error != null ? (
        <div className={`page-notice ${className}`.trim()}>{error}</div>
      ) : (
        <div className="page-notice loading-state">{loading}</div>
      )}
    </>
  );
}
