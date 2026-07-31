import React from "react";
import PageMark from "./PageMark.jsx";

// The upload tile: the ONE shape the site gives to "this file leaves for GitHub".
// A white card, the seal of the page that PRODUCES the file, then a label whose
// coloured group of words names the file and its extension.
//
// The seal follows `page` and is therefore OPTIONAL: a tile that already sits
// under the seal of the page it belongs to omits it, since the same drawing twice
// in one row says nothing the first one has not. The Editing tile does exactly
// that (it lives in the header row, three centimetres from the quill of
// `PlayHeader`); the Progress tile keeps its mic, which is the seal of another
// page than the one showing it, so it does name something.
//
// Two pages carry one, and they carry the same object on purpose: the Progress
// page for the voices the coordinator receives (a link, the file is already on
// their disk) and the Editing page for the script they have just written (a
// button: the file has to be downloaded first, see `upload` in editor/App.jsx).
// Two surfaces of different shapes for one gesture would read as two different
// destinations.
//
// Hence a link OR a button from a single component, decided by the presence of
// `href`: everything visual (theme.css, `.upload-tile`) is shared, and the
// difference stays where it belongs, in what the click does.
//
// `.lift-hover` is dropped when the tile is disabled: `:hover` still fires on a
// disabled button, so the tile would lift under a mouse that cannot click it.
//
// `tone` is passed straight to `PageMark`: the DRAWING says which page produced the
// file, the COLOUR says which page one is reading. They coincide on the Editing tile
// (which has no seal anyway) and part company on the Progress one, whose mic is the
// Recording page's but whose navy is Progress's, like the coloured word beside it.
// Omitted, it falls back to `page` there, as everywhere else on the site.
export default function UploadTile({ page, tone = page, href, onClick, disabled, className = "", children }) {
  const classes = `upload-tile card ${disabled ? "" : "lift-hover"} ${className}`
    .replace(/\s+/g, " ")
    .trim();
  // The seal is DECORATIVE (`label=""`): the label right next to it already names
  // the file, and a screen reader announcing the page it comes from first would
  // double the length of the only gesture of the page. Dropping it therefore
  // costs nothing to a screen reader, which never heard it.
  const body = (
    <>
      {page && <PageMark page={page} tone={tone} className="upload-tile-mark" label="" />}
      <span className="upload-tile-text">{children}</span>
    </>
  );
  if (href) {
    // A new tab, always: one leaves for GitHub, and the page one leaves is the
    // work in progress (a script being edited lives in the tab and nowhere else).
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
