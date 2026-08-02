import React from "react";
import PageHeader from "./PageHeader.jsx";
import { t } from "./locale.js";

// Full-page waiting or blocking screen, shared by every page. Both states take the
// card: they are two moments of one screen, and a card appearing only on error would
// read as a page change. `error` may be a string or JSX.
export default function PageState({
  page,
  title,
  error = null,
  // Default parameter: evaluated per call, so it picks up the locale instead of
  // freezing a string at module load.
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
