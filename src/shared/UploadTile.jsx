import React from "react";
import PageMark from "./PageMark.jsx";

// The ONE shape the site gives to "this file leaves for GitHub": link (Progress, the
// file is already on disk) or button (Editing, downloaded first), decided by `href`.
// Two shapes for one gesture would read as two destinations.
// `page` is optional: a tile already under its own page's seal omits it.
// `.lift-hover` is dropped when disabled: `:hover` still fires on a disabled button.
// `tone` goes to `PageMark`: DRAWING says which page produced the file, COLOUR which
// page you are reading.
export default function UploadTile({ page, tone = page, href, onClick, disabled, className = "", children }) {
  const classes = `upload-tile card ${disabled ? "" : "lift-hover"} ${className}`
    .replace(/\s+/g, " ")
    .trim();
  // Seal decorative: the label next to it already names the file.
  const body = (
    <>
      {page && <PageMark page={page} tone={tone} className="upload-tile-mark" label="" />}
      <span className="upload-tile-text">{children}</span>
    </>
  );
  if (href) {
    // New tab always: the page left behind holds work that lives in the tab only.
    return (
      <a className={classes} href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}
