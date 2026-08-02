import React, { useCallback, useRef, useState } from "react";
import { OutlineIcon, PersonIcon, SearchIcon } from "../shared/icons.jsx";
import { t } from "../shared/locale.js";

// The Editing side rail: a strip of three icons, ONE section open at a time.
// The icons are the panel's only switch; the right edge only sets the width. Do NOT
// put a collapse tab on that edge: the handle calls `setPointerCapture`, which
// retargets the `click` onto the capturing element, so the tab fires one time in two.
// NOT a `role="tablist"`: a tablist promises a permanently selected tab and arrow
// keys, and the rail has a "nothing open" state. Three disclosure buttons with
// `aria-expanded`, which the CSS reads instead of a class.
// The panel mounts only when open: nothing to take out of the keyboard path, and the
// open width is a chosen number, so the animation has nothing to measure.
const SECTIONS = [
  { key: "structure", Icon: OutlineIcon },
  { key: "characters", Icon: PersonIcon },
  { key: "search", Icon: SearchIcon },
];

// 200 px: below that a full character chip no longer fits on one line. 560 px: beyond
// that the panel outgrows the text column.
const MIN_PANEL = 200;
const MAX_PANEL = 560;
const DEFAULT_PANEL = 272;
const KEY_STEP = 16;

const clampPanel = (px) => Math.max(MIN_PANEL, Math.min(MAX_PANEL, Math.round(px)));

export default function EditorRail({ section, onSection, structure, characters, search }) {
  const tabRefs = useRef({});
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL);
  // The width transition is cut off mid-drag, or the panel chases the cursor a
  // quarter of a second behind and reads as latency.
  const [resizing, setResizing] = useState(false);
  const drag = useRef(null);
  // Double-click recognised BY HAND: `onPointerDown` calls `preventDefault` (or the
  // drag selects text), which suppresses the compatibility mouse events, so
  // `onDoubleClick` never fires.
  const lastDown = useRef(0);

  const open = section !== null;
  const current = SECTIONS.find((s) => s.key === section) ?? null;

  const close = useCallback(() => {
    // Focus back to the closing section's icon, or a keyboard close leaves it on the
    // `body` and tabbing restarts from the header.
    const tab = tabRefs.current[section];
    onSection(null);
    tab?.focus();
  }, [section, onSection]);

  // The width lives in memory only: the project persists nothing locally.
  const onEdgeDown = (e) => {
    // Stops a text selection starting under the cursor; `setPointerCapture` does not.
    e.preventDefault();
    // Second press close behind: back to the default width, the only way to reach it
    // without aiming to the pixel.
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
            // The accessible name never depends on the state; `aria-expanded` carries
            // that. Hence one tooltip per button.
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
            // MANDATORY, same guard as useSearch.js: a `ConfirmModal` opened from the
            // rail listens for Escape in the capture phase and calls preventDefault
            // without stopPropagation, and React bubbles portal events up the REACT
            // tree, so that Escape reached here and collapsed the rail behind it.
            if (e.defaultPrevented) return;
            // Here and not in the sections: only the rail knows which icon to refocus.
            // `stopPropagation` so the page's global shortcut does not close it twice.
            e.stopPropagation();
            close();
          }}
        >
          {/* The head does not scroll; only `.editor-rail-body` does. */}
          <div className="editor-rail-head">
            <h2 className="editor-rail-title">{t(`rail.${current.key}`)}</h2>
          </div>

          <div className="editor-rail-body">
            {section === "structure" ? structure : section === "characters" ? characters : search}
          </div>
        </div>

        {/* The width handle, and nothing else on this edge. Focusable
            `role="separator"`, the resizable separator pattern, hence the arrow keys:
            without them the width is mouse-only. */}
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
