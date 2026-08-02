import React, { useMemo, useState } from "react";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageState from "../shared/PageState.jsx";
import useManifest from "../shared/useManifest.js";
import { assignColors } from "../shared/characterColors.js";
import { WarnIcon } from "../shared/icons.jsx";
import {
  ALL,
  COLUMNS_STEP,
  DEFAULT_COLUMNS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  TOTAL_SIZE,
  UNIT_SIZE,
  UNKNOWN,
  blockRects,
  centerFontSize,
  clampColumns,
  scopeOf,
  scopeLines,
  speechStats,
} from "./stats.js";
import { formatShare } from "../shared/share.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import "./stats.css";

// The ranks `scopeOf` returns, in the READER's language, for the drawings' aria-labels.
function scopeText(scope) {
  if (scope.kind === "all") return t("stats.scope.all");
  const act = actLabel(t, scope.actIndex);
  if (scope.kind === "act") return t("stats.scope.act", { act });
  // `common.actScene`: the Progress page names the same pair, so it is written once.
  return t("common.actScene", { act, scene: sceneLabel(t, scope.sceneIndex) });
}

// All the maths is in stats.js, pure and tested; this file only draws, and is checked by eye.
export default function App() {
  const { manifest, error: loadError } = useManifest();
  if (loadError) return <PageState page="stats" error={loadError} />;
  if (!manifest) return <PageState page="stats" />;
  return <Stats manifest={manifest} />;
}

function Stats({ manifest }) {
  // Two selects for three levels: each opens on the level above it.
  const [actIndex, setActIndex] = useState(ALL);
  // The FIRST scene, the same thing `changeAct` sets, so there is one default to know.
  const [sceneIndex, setSceneIndex] = useState(0);
  // In memory only: the project has no local persistence.
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  // Carried by the PAGE, so the three drawings answer one choice. Two states: `hovered` wins
  // while it lasts but never touches `selected`, a button's state must not follow the cursor.
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const acts = Array.isArray(manifest.acts) ? manifest.acts : [];
  const characters = Array.isArray(manifest.characters) ? manifest.characters : [];

  // The manifest may carry no colours; filled by the SAME function as the editor.
  const colors = useMemo(() => assignColors(characters), [characters]);

  const lines = useMemo(
    () => scopeLines(manifest, actIndex, sceneIndex),
    [manifest, actIndex, sceneIndex]
  );
  const { rows, totalWords, totalLines } = useMemo(
    () => speechStats(lines, characters),
    [lines, characters]
  );
  // Same cast as the counts, or the legend highlights a bucket the runs lack (`bucketOf`).
  const block = useMemo(
    () => blockRects(lines, columns, characters),
    [lines, columns, characters]
  );

  const where = scopeText(scopeOf(manifest, actIndex, sceneIndex));
  // To tell "the play is empty" from "this scene is empty", cf. the emptiness below.
  const playIsEmpty = useMemo(() => scopeLines(manifest, ALL, ALL).length === 0, [manifest]);
  // Someone silent in the scope would highlight nothing; the settled choice survives.
  const speaking = (id) => (id !== null && rows.some((r) => r.id === id) ? id : null);
  // Dimming follows the hover, aria-pressed the settled choice: the latter must not lie.
  const highlight = speaking(hovered ?? selected);
  const pinned = speaking(selected);
  const toggle = (id) => setSelected((current) => (current === id ? null : id));

  // The "unknown" bucket has no character colour; the caller supplies the neutral.
  const colorOf = (id) => (id === UNKNOWN ? null : colors.get(id) ?? null);
  // Two fallbacks: a cast member may also have no name, which is not an orphan line.
  const nameOf = (row) =>
    row.name?.trim()
      ? row.name
      : t(row.id === UNKNOWN ? "stats.unknownCharacter" : "stats.unnamedCharacter");

  // Lands on the act's FIRST scene, a notch down per gesture. The ALL fallback is not
  // caution: an act with no scene has no rank 0, and a select on a valueless option loses it.
  const firstScene = (index) => ((acts[index]?.scenes?.length ?? 0) > 0 ? 0 : ALL);
  const changeAct = (value) => {
    setActIndex(value);
    setSceneIndex(firstScene(value));
  };

  return (
    // The shared shell (theme.css): only the content scrolls, so the legend stays in sight.
    // Sticking a bar under the header any other way needs its height, an ANIMATED unknown.
    // `100dvh` and not the Editing page's `100vh`: this one opens with a finger.
    <div className="page-shell">
      <PlayHeader page="stats" title={manifest.title || t("common.untitledPlay")}>
        <div className="selects-row">
          <select
            aria-label={t("common.actSelect")}
            value={actIndex}
            disabled={acts.length === 0}
            onChange={(e) => changeAct(Number(e.target.value))}
          >
            <option value={ALL}>{t("stats.scopeAllOption")}</option>
            {acts.map((_, i) => (
              <option key={i} value={i}>
                {actLabel(t, i)}
              </option>
            ))}
          </select>
          {/* Disabled and EMPTY on "the whole play", not removed, so the row keeps its
              shape. The empty option keeps the select CONTROLLED on ALL: without a matching
              option the field loses its value. No tooltip either, a disabled control
              receives no mouse event. */}
          <select
            aria-label={t("common.sceneSelect")}
            value={sceneIndex}
            disabled={actIndex === ALL}
            onChange={(e) => setSceneIndex(Number(e.target.value))}
          >
            {actIndex === ALL ? (
              <option value={ALL} />
            ) : (
              <>
                <option value={ALL}>{t("stats.scopeActOption")}</option>
                {(acts[actIndex]?.scenes ?? []).map((_, i) => (
                  <option key={i} value={i}>
                    {sceneLabel(t, i)}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        {/* A slider because the block recomposes while dragging. The value is written next
            to it, or it cannot be set the same way twice. */}
        <div className="stats-scale">
          <label htmlFor="stats-columns">{t("stats.columns")}</label>
          <input
            id="stats-columns"
            type="range"
            min={MIN_COLUMNS}
            max={MAX_COLUMNS}
            step={COLUMNS_STEP}
            value={columns}
            title={t("stats.columns.tip")}
            onChange={(e) => setColumns(clampColumns(e.target.value))}
          />
          <span className="stats-scale-value">{fmt.number(columns)}</span>
        </div>
      </PlayHeader>

      {/* Under the header, not under a mosaic several screens tall. The only surface that
          designates a character by keyboard, hence a named `role="group"`. */}
      {totalLines > 0 && (
        <div
          className="stats-legend-bar"
          role="group"
          aria-label={t("stats.highlight")}
        >
          <div className="stats-legend-bar-inner">
            <CharacterLegend
              rows={rows}
              colorOf={colorOf}
              nameOf={nameOf}
              highlight={highlight}
              pinned={pinned}
              onSelect={toggle}
              onHover={setHovered}
              flow
            />
          </div>
        </div>
      )}

      {/* `.container` stays INSIDE the scroller: scrolling happens at the window's edge. */}
      <div className="page-scroll">
        <div className="container">
          {totalLines === 0 ? (
            // An empty PLAY is written in the Editing page, an empty SCENE only needs another
            // scope. `scopeText` is not reused: it is written for an aria-label.
            <div className="empty-state">
              {playIsEmpty
                ? t("common.emptyPlay", { page: t(pageLabelKey("editor")) })
                : /* The option's label is INTERPOLATED, never copied. */
                  t("stats.emptyScope", { all: fmt.quote(t("stats.scopeAllOption")) })}
            </div>
          ) : (
            <>
              <div className="stats-pies">
                <Donut
                  title={t("stats.words.title")}
                  unit={t("stats.words.unit")}
                  rows={rows}
                  total={totalWords}
                  value={(row) => row.words}
                  where={where}
                  colorOf={colorOf}
                  nameOf={nameOf}
                  highlight={highlight}
                  pinned={pinned}
                  onSelect={toggle}
                  onHover={setHovered}
                />
                <Donut
                  title={t("stats.lines.title")}
                  unit={t("stats.lines.unit")}
                  rows={rows}
                  total={totalLines}
                  value={(row) => row.lines}
                  where={where}
                  colorOf={colorOf}
                  nameOf={nameOf}
                  highlight={highlight}
                  pinned={pinned}
                  onSelect={toggle}
                  onHover={setHovered}
                />
              </div>

              {/* No `onSelect` or `onHover`: the mosaic designates nobody by pointer. */}
              <Timeline
                block={block}
                rows={rows}
                where={where}
                colorOf={colorOf}
                nameOf={nameOf}
                highlight={highlight}
                pinned={pinned}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Mouse only: a finger emits a hover AFTER the press, which sticks and never goes dark.
const hoverProps = (id, onHover) => ({
  onPointerEnter: (e) => {
    if (e.pointerType === "mouse") onHover(id);
  },
  onPointerLeave: (e) => {
    if (e.pointerType === "mouse") onHover(null);
  },
});

// All three legends, hence in agreement. The ONLY surface reachable by keyboard: slices and
// runs sit in `role="img"` SVGs, whose descendants are not exposed. No `value` = no numbers.
function CharacterLegend({ rows, colorOf, nameOf, highlight, pinned, onSelect, onHover, value, total, flow }) {
  return (
    <ul className={flow ? "stats-legend stats-legend-flow" : "stats-legend"}>
      {rows.map((row) => {
        const color = colorOf(row.id);
        // Look follows the hover, announced state follows the settled choice.
        const lit = highlight === row.id;
        const active = pinned === row.id;
        return (
          <li key={row.id}>
            <button
              type="button"
              className={lit ? "stats-legend-row lit" : "stats-legend-row"}
              aria-pressed={active}
              title={
                active ? t("stats.showEveryone") : t("stats.showOnly", { name: nameOf(row) })
              }
              onClick={() => onSelect(row.id)}
              {...hoverProps(row.id, onHover)}
            >
              <span
                className="stats-legend-dot"
                style={{ background: color ?? "var(--ink-soft)" }}
                aria-hidden="true"
              />
              {/* The name stays in the theme's ink; the pill carries the colour. */}
              <span className="stats-legend-name truncate">{nameOf(row)}</span>
              {value && (
                <>
                  <span className="stats-legend-count">{fmt.number(value(row))}</span>
                  <span className="stats-legend-share">{formatShare(value(row), total, t, fmt)}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// The circumference is the `stroke-dasharray` unit, so a slice is its fraction of it.
const R = 38;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Percentages live in the legend: on the slices, a small one's label overlaps its neighbour.
function Donut({
  title,
  unit,
  rows,
  total,
  value,
  where,
  colorOf,
  nameOf,
  highlight,
  pinned,
  onSelect,
  onHover,
}) {
  // Each chart sorts on ITS OWN quantity, or a legend's numbers stop descending. Here and
  // not in `speechStats`: it is a DISPLAY order, differing per panel.
  const ordered = [...rows].sort((a, b) => value(b) - value(a) || b.words - a.words);

  // A zero slice is not drawn but stays in the legend: lines without words exist.
  let offset = 0;
  const slices = [];
  for (const row of ordered) {
    const fraction = total ? value(row) / total : 0;
    if (fraction > 0) {
      slices.push({ row, fraction, offset });
      offset += fraction;
    }
  }

  // The same string is measured and drawn. The aria-label gets the NUMBER instead.
  const writtenTotal = fmt.number(total);

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{title}</h2>

      <div className="stats-donut-row">
        {/* role="img": the numbers are in the legend, so nothing rests on colour alone. */}
        <svg
          className="stats-donut"
          viewBox="0 0 100 100"
          role="img"
          aria-label={t("stats.donutLabel", { title, where, total, unit })}
        >
          {/* Without the track, a one-character scope draws a circle that cannot read full. */}
          <circle className="stats-donut-track" cx="50" cy="50" r={R} />
          {slices.map(({ row, fraction, offset: start }) => {
            const color = colorOf(row.id);
            const dimmed = highlight !== null && row.id !== highlight;
            return (
              <circle
                key={row.id}
                cx="50"
                cy="50"
                r={R}
                className={dimmed ? "stats-slice dimmed" : "stats-slice"}
                // The arc IS the target: a dashed stroke's hit test skips the gap (measured).
                onClick={() => onSelect(row.id)}
                {...hoverProps(row.id, onHover)}
                // The stroke IS the slice, so it takes the raw palette colour, like the pill.
                style={{
                  stroke: color ?? "var(--ink-soft)",
                  strokeDasharray: `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
                  strokeDashoffset: -start * CIRCUMFERENCE,
                }}
              />
            );
          })}
          {/* Both lines SHRINK to fit the hole (`centerFontSize`), which computes the size. */}
          <text
            className="stats-donut-total"
            x="50"
            y="47"
            style={{ fontSize: `${centerFontSize(writtenTotal, TOTAL_SIZE)}px` }}
          >
            {writtenTotal}
          </text>
          <text
            className="stats-donut-unit"
            x="50"
            y="59"
            style={{ fontSize: `${centerFontSize(unit, UNIT_SIZE)}px` }}
          >
            {unit}
          </text>
        </svg>

        <CharacterLegend
          rows={ordered}
          colorOf={colorOf}
          nameOf={nameOf}
          highlight={highlight}
          pinned={pinned}
          onSelect={onSelect}
          onHover={onHover}
          value={value}
          total={total}
        />
      </div>
    </section>
  );
}

// One square per word, in SVG so it stays sharp, one <rect> per RUN. The mosaic FOLLOWS the
// choice but never makes it: a word is 4 to 8 px, so aiming at one is a roll of the dice.
function Timeline({ block, rows, where, colorOf, nameOf, highlight, pinned }) {
  const { rects, columns, rows: lineCount } = block;

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{t("stats.timeline.title")}</h2>

      {/* Before the drawing, the mosaic being several screens tall. It says "speaking turn"
          and not "line" because neighbours are merged (`blockRects`). */}
      <p className="stats-caption">{t("stats.timeline.caption")}</p>

      {/* The viewBox is the whole geometry and the width is always the card's, so the slider
          changes the GRAIN alone. `crispEdges` then snaps cells to whole pixels. */}
      <svg
        className="stats-block"
        viewBox={`0 0 ${columns} ${lineCount}`}
        role="img"
        // The SETTLED choice: a description rewriting itself under the cursor is not one.
        aria-label={
          pinned === null
            ? t("stats.timeline.label", { where })
            : t("stats.timeline.labelOnly", {
                where,
                name: nameOf(rows.find((r) => r.id === pinned) ?? {}),
              })
        }
      >
        {rects.map((rect, i) => {
          const color = colorOf(rect.characterId);
          const dimmed = highlight !== null && rect.characterId !== highlight;
          return (
            <rect
              key={i}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={1}
              className={dimmed ? "stats-block-rect dimmed" : "stats-block-rect"}
              fill={color ?? "var(--ink-soft)"}
            />
          );
        })}
      </svg>

      {/* Impersonal: the Editing page is not open to everybody, unlike this one. */}
      {rows.some((row) => row.id === UNKNOWN) && (
        <p className="stats-warning">
          <WarnIcon />
          {t("stats.orphanWarning", { page: t(pageLabelKey("editor")) })}
        </p>
      )}
    </section>
  );
}
