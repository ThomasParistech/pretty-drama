import React, { useCallback, useRef, useState } from "react";
import { OutlineIcon, PersonIcon, SearchIcon } from "../shared/icons.jsx";
import { t } from "../shared/locale.js";

// The Editing side rail: a strip of three always-visible icons and ONE section
// open at a time, to the left of the text column.
//
// **The strip's icons are the panel's only switch**, like the activity bar of a
// code editor: clicking an icon opens its section, clicking the open section's icon
// again collapses the rail (Escape too). They therefore say both which section and
// whether it is open (`aria-expanded`), and they are the only furniture of the
// collapsed state: there the rail is exactly the width of the strip. The right edge
// now does only one thing, set the width.
//
// Two collapse tabs were tried then removed, and the second one cost a bug that
// must not be rebuilt: placed in the middle of the right edge, it shared its
// `pointerdown` with the width handle, which calls `setPointerCapture` (without
// which the drag drops the cursor). Now a captured pointer retargets the `click`
// onto the capturing element: the click arrived at the edge and not at the button,
// so the tab only collapsed one time out of two (those where the "default width"
// double-click fired before the capture). Working around it meant collapsing from
// the handle's `pointerdown`, that is to say guessing, inside a drag gesture,
// whether it was aiming at a button. The first tab tried a panel head, next to the
// title: one more button in a title row, and nothing there said which side the
// panel was going to tuck itself away to.
//
// **Not a `role="tablist"`**: a tablist promises a permanently selected tab and
// Home/End/left/right arrows, whereas the rail has a "nothing open" state. The role
// would lie and the arrows would have to be intercepted for nothing. These are
// three disclosure buttons with `aria-expanded`, exactly like the header's collapse
// button, and the CSS reads that attribute rather than one more class: the look
// cannot fall out of step with the accessible name.
//
// The panel is only mounted when a section is open: there is nothing to take out
// of the keyboard path, unlike the header, which has to keep its settings mounted
// in order to animate an unknown height. Here the open width is a chosen number,
// so the animation has nothing to measure.
//
// The order of the icons is the order of the keyboard path from the header, and
// Structure comes first because it carries the page's NAVIGATION (it replaced the
// header's act and scene selects, which were the page's first settings and
// therefore came before the character chips). It is also the section open on
// arrival, see App.jsx.
// Keys and not words: the section is named at render time, and `rail.<key>` is also
// the panel's title, so the two cannot diverge. `scene.js` cites `rail.characters`
// to point back to this icon, which only holds because that name lives in one single
// place.
const SECTIONS = [
  { key: "structure", Icon: OutlineIcon },
  { key: "characters", Icon: PersonIcon },
  { key: "search", Icon: SearchIcon },
];

// Bounds of the panel's width. At the bottom, 200 px: below that, a complete
// character chip (swatch, name, count, ✕) no longer fits on one line and a line
// excerpt is no longer recognisable. At the top, 560 px: beyond that, on an ordinary
// window the panel takes more room than the text column, and it is the play one came
// to write.
const MIN_PANEL = 200;
const MAX_PANEL = 560;
const DEFAULT_PANEL = 272;
// Keyboard step on the handle: big enough to get somewhere in a few keypresses,
// small enough to aim.
const KEY_STEP = 16;

const clampPanel = (px) => Math.max(MIN_PANEL, Math.min(MAX_PANEL, Math.round(px)));

export default function EditorRail({ section, onSection, structure, characters, search }) {
  const tabRefs = useRef({});
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  // During the drag, the width transition is cut off: otherwise the panel chases
  // the cursor a quarter of a second behind, which reads as latency and not as an
  // animation.
  const [resizing, setResizing] = useState(false);
  const drag = useRef(null);
  // Timestamp of the last press on the edge, in order to recognise a double-click
  // by hand. Why by hand: `onPointerDown` calls `preventDefault` (without which the
  // drag selects the text under the cursor), and that suppresses the compatibility
  // mouse events, so `onDoubleClick` never fires. Rejected alternative: let the
  // default through and prevent the selection by setting `user-select: none` on the
  // `body` for the duration of the drag, that is a global side effect for a local
  // convenience.
  const lastDown = useRef(0);

  const open = section !== null;
  const current = SECTIONS.find((s) => s.key === section) ?? null;

  const close = useCallback(() => {
    // Give the focus back to the icon of the section being closed: otherwise a
    // keyboard close leaves it on the `body`, and tabbing restarts from the header.
    const tab = tabRefs.current[section];
    onSection(null);
    tab?.focus();
  }, [section, onSection]);

  // The width only lives in memory, for the lifetime of the tab. Nothing is written
  // to the browser: the project has no local persistence at all, and opening one for
  // a display preference would be the first (see the product decision about the
  // editor's drafts).
  const onEdgeDown = (e) => {
    // Prevents a text selection from starting under the cursor during the drag
    // (`setPointerCapture` alone does not take care of it).
    e.preventDefault();
    // Second press close behind: we go back to the starting width instead of
    // beginning a drag. It is the only way to get the default value back without
    // aiming at it to the pixel.
    if (e.timeStamp - lastDown.current < 350) {
      lastDown.current = 0;
      setPanelWidth(DEFAULT_PANEL);
      return;
    }
    lastDown.current = e.timeStamp;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: panelWidth };
    setResizing(true);
  };

  const onEdgeMove = (e) => {
    if (!drag.current) return;
    setPanelWidth(clampPanel(drag.current.startWidth + (e.clientX - drag.current.startX)));
  };

  const onEdgeUp = (e) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setResizing(false);
  };

  return (
    // `complementary` landmark: the rail complements the play's text, which stays
    // the main landmark. The label names what is inside it, and not "side panel",
    // which would describe a piece of furniture.
    <aside
      className={`editor-rail ${open ? "open" : ""} ${resizing ? "resizing" : ""}`}
      aria-label={t("rail.label")}
      style={{ "--ed-rail-panel": `${panelWidth}px` }}
    >
      <div className="editor-rail-strip">
        {SECTIONS.map(({ key, Icon }) => (
          <button
            key={key}
            ref={(el) => (tabRefs.current[key] = el)}
            className="editor-rail-tab"
            // The accessible name does not depend on the state (`aria-expanded`
            // carries that), hence one single tooltip per button, saying what the
            // section contains: the spirit of the single tooltip on the header's
            // collapse button.
            aria-label={t(`rail.${key}`)}
            title={t(`rail.${key}.tip`)}
            aria-expanded={section === key}
            aria-controls="editor-rail-panel"
            onClick={() => onSection(section === key ? null : key)}
          >
            <Icon />
          </button>
        ))}
      </div>

      {current && (
        <>
        <div
          className="editor-rail-panel"
          id="editor-rail-panel"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Mandatory guard, not a defensive one, and it is the same as the one
            // in `useSearch.js`: a `ConfirmModal` opened FROM the rail ("Replace
            // all", deleting an act or a scene) listens for Escape in the CAPTURE
            // phase on `window` and calls `preventDefault` without
            // `stopPropagation`. It is rendered in a portal, but React bubbles its
            // events up the REACT tree and not the DOM one, so the Escape that
            // closes the modal reached this point and collapsed the rail behind it,
            // search panel included.
            if (e.defaultPrevented) return;
            // Listened for here and not in the sections: the rail is the only one
            // that knows which icon to give the focus back to. `stopPropagation` so
            // that the page's global shortcut does not close it twice.
            e.stopPropagation();
            close();
          }}
        >
          {/* The head does not scroll: it is what names the section, and on Search
              it also carries the query and its options (see `.editor-rail-body`,
              where only the useful content scrolls).
              One title per section, plus one `<h3>` per group of results: the rail
              is thus a browsable outline of headings, which replaces an aria-label
              on every block. */}
          <div className="editor-rail-head">
            <h2 className="editor-rail-title">{t(`rail.${current.key}`)}</h2>
          </div>

          <div className="editor-rail-body">
            {section === "structure" ? structure : section === "characters" ? characters : search}
          </div>
        </div>

        {/* The right edge: the width handle, and nothing else. It exists ONLY when
            the panel is open (collapsed, the rail is no more than its strip of
            icons, and there is no width left to set).
            A focusable `role="separator"`: that is the resizable separator pattern,
            and it comes with its arrow keys, without which the width would only be
            adjustable with the mouse. The announced values are the panel's, not
            those of the whole rail: it is the panel one resizes. */}
        <div
          className="editor-rail-edge"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("rail.width")}
          aria-valuenow={panelWidth}
          aria-valuemin={MIN_PANEL}
          aria-valuemax={MAX_PANEL}
          tabIndex={0}
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPanelWidth((w) => clampPanel(w - KEY_STEP));
            else if (e.key === "ArrowRight") setPanelWidth((w) => clampPanel(w + KEY_STEP));
            else if (e.key === "Home") setPanelWidth(MIN_PANEL);
            else if (e.key === "End") setPanelWidth(MAX_PANEL);
            else return;
            e.preventDefault();
          }}
        />
        </>
      )}
    </aside>
  );
}
