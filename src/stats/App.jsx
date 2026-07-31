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

// The scope put into words, for the `aria-label`s of the three drawings. `scopeOf`
// (stats.js) only returns ranks, which keeps it pure; it is here that they become
// a sentence, in the READER's language (act and scene labels are navigation, cf.
// structureLabels.js).
function scopeText(scope) {
  if (scope.kind === "all") return t("stats.scope.all");
  const act = actLabel(t, scope.actIndex);
  if (scope.kind === "act") return t("stats.scope.act", { act });
  // `common.actScene` and not an entry of this page's own: the Progress page names
  // the same pair, and a label that two places name exists only once.
  return t("common.actScene", { act, scene: sceneLabel(t, scope.sceneIndex) });
}

// The Speaking share page: who speaks, how much, and when.
//
// A port of the visualisation the troupe used to produce in Python
// (theatre_transport_de_femme repo, `viz/generate_viz.py` and `viz/main.tex`): two
// pie charts and a block where every square is a word. The labels of the three
// panels are the PDF's, word for word: it is the same document, served on screen
// and kept up to date.
//
// All of the computation is in `stats.js`, a pure and tested module. This file only
// draws, because the project tests no React component: what lives here is checked
// by eye, so there must be as little of it as possible.
export default function App() {
  const { manifest, error: loadError } = useManifest();
  if (loadError) return <PageState page="stats" error={loadError} />;
  if (!manifest) return <PageState page="stats" />;
  return <Stats manifest={manifest} />;
}

function Stats({ manifest }) {
  // The scope: the header's two usual selects, and **all three levels fit inside
  // them**. Each select carries as its first choice the level above it, "The whole
  // play" in the act one just as "The whole act" in the scene one: the same gesture,
  // written twice in the same way, and two controls for three levels.
  //
  // A third control existed, a "The whole play" toggle button placed in the row, and
  // it is removed: pressed, it took the full accent of `.btn.primary` next to two
  // greyed-out selects, so it no longer read as the command it was but as the STATE
  // it had just produced, a "the whole play" label lit above two dead fields.
  // Nothing said any more that it could be released. A checkbox had been tried
  // before it and set aside for another reason: on this site a checkbox is a DISPLAY
  // setting (the Rehearsal page's four, the Search panel's two), whereas this
  // control changes what the page SHOWS.
  //
  // `actIndex` is therefore ALL when one looks at the whole play, and that is the
  // page's opening state: the Speaking share page is read whole first, one then goes
  // down into an act and then into a scene.
  const [actIndex, setActIndex] = useState(ALL);
  // The FIRST scene, and not "The whole act", right from the start: that is what
  // `changeAct` sets when arriving in an act (cf. below), and the initial state says
  // the same thing so that there is only one default to know. It cannot be seen on
  // load, the scope there being the whole play, which ignores the scene rank.
  const [sceneIndex, setSceneIndex] = useState(0);
  // The number of words per row of the block. **Constant across scopes** (that is
  // what makes two scenes comparable, cf. `DEFAULT_COLUMNS`) and adjustable, because
  // no constant goes from a play of 500 words to one of 30,000. In memory only, like
  // the width of the Editing page's rail: the project has no local persistence at
  // all, and opening one for a display preference would be the first.
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  // The highlighted character, the equivalent of the reference's
  // `all_image_<name>.svg`. `null` = everybody. It is carried by the PAGE and not by
  // a panel, and that is the whole point: the three drawings answer the same choice,
  // so a pie slice, a legend row and a block of the timeline designate the same
  // person and answer one another. The block was alone in being able to highlight
  // somebody, whereas the two pie charts had exactly the same thing to show.
  //
  // Two states and not one: `selected` is the SETTLED choice (a press, which stays),
  // `hovered` the hover, which only foreshadows it. The second wins when it exists,
  // so hovering another name shows that other one without losing the choice, and
  // leaving the name brings one back to it. Hovering does NOT touch `selected`: it
  // only exists with a mouse (cf. `hoverProps`), and a button's state must not depend
  // on where the cursor passes.
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const acts = Array.isArray(manifest.acts) ? manifest.acts : [];
  const characters = Array.isArray(manifest.characters) ? manifest.characters : [];

  // The manifest does not necessarily carry the colours (a script.json entered
  // before they existed has none): we fill them in with the SAME function as the
  // editor, so both pages show the same cast. Once per render only, and memoised:
  // `characters` only changes on load.
  const colors = useMemo(() => assignColors(characters), [characters]);

  // The selects' two ranks go to the computation as they are: ALL means "all of this
  // level" there (cf. `scopeLines`), so there is nothing to translate between the
  // control and the scope.
  const lines = useMemo(
    () => scopeLines(manifest, actIndex, sceneIndex),
    [manifest, actIndex, sceneIndex]
  );
  const { rows, totalWords, totalLines } = useMemo(
    () => speechStats(lines, characters),
    [lines, characters]
  );
  // The cast is passed to the block as it is to the counts: the two must agree on
  // what is "unknown", otherwise the legend highlights a bucket the runs do not carry
  // (cf. `bucketOf`).
  const block = useMemo(
    () => blockRects(lines, columns, characters),
    [lines, columns, characters]
  );

  const where = scopeText(scopeOf(manifest, actIndex, sceneIndex));
  // To tell "the play is empty" from "this scene is empty", cf. the emptiness below.
  // Computed on the WHOLE play, hence independent of the scope.
  const playIsEmpty = useMemo(() => scopeLines(manifest, ALL, ALL).length === 0, [manifest]);
  // A highlighted character who does not speak in the chosen scope would highlight
  // nothing: the drawings would become empty without one understanding why. We fall
  // back on "everybody" rather than displaying a dimmed drawing. The settled choice
  // is not erased for all that: coming back to a scope where they speak shows them
  // again.
  const speaking = (id) => (id !== null && rows.some((r) => r.id === id) ? id : null);
  // What the drawings DIM (hovering included) and what the buttons announce as
  // pressed (the settled choice alone) are therefore two things: an `aria-pressed`
  // that followed the cursor would say that a button is pressed because the mouse
  // passes over it.
  const highlight = speaking(hovered ?? selected);
  const pinned = speaking(selected);
  const toggle = (id) => setSelected((current) => (current === id ? null : id));

  // The "unknown" bucket has no character colour: it is the caller's neutral token,
  // here `--ink-soft`, like the block's grey.
  const colorOf = (id) => (id === UNKNOWN ? null : colors.get(id) ?? null);
  // Two fallback labels, and not one: the orphan bucket never has a name, but a
  // character of the cast may have none either (the Python sanitize only requires a
  // string, so a hand-edited `"name": ""` travels all the way to the manifest).
  // Without this fallback, their legend row was a colour pill followed by a blank,
  // and their highlight button announced itself as "Show only". They are not
  // conflated with the orphan lines: this one exists, has their colour and their
  // lines are properly attributed to them.
  const nameOf = (row) =>
    row.name?.trim()
      ? row.name
      : t(row.id === UNKNOWN ? "stats.unknownCharacter" : "stats.unnamedCharacter");

  // Changing act brings one back to the start of its list of scenes, as on the
  // Rehearsal and Recording pages, and "the start" is here the **first scene** and not
  // "The whole act": one goes down one notch at every gesture, the whole play then an
  // act then a scene, and stopping on the whole act required choosing again in the
  // second select what one had just chosen in the first. "The whole act" remains the
  // first choice of the list, one click away.
  // The fallback on ALL is not caution: an act without a scene (a hand-edited script)
  // has no rank 0, and a select controlled on a value no option answers loses its
  // value.
  const firstScene = (index) => ((acts[index]?.scenes?.length ?? 0) > 0 ? 0 : ALL);
  const changeAct = (value) => {
    setActIndex(value);
    setSceneIndex(firstScene(value));
  };

  return (
    // The page does not scroll as a whole: the shell is the height of the window,
    // the header and the characters bar stay at the top, and only the content
    // scrolls below. That is what keeps the legend in sight while one goes down a
    // timeline several screens tall, where one often sees ONLY the mosaic, without a
    // name to attach its colours to.
    //
    // It is the shared shell `.page-shell` / `.page-scroll` (theme.css), which the
    // Editing page uses too, and for the same reason: the only other way of getting a
    // bar stuck under the
    // header requires knowing the height of that header, which is an ANIMATED
    // unknown (a title on two lines, two doc paragraphs, folding over 0.26 s). It
    // would have to be measured in JS, re-measured at every fold, and the bar's `top`
    // would trail a quarter of a second behind the animation. Here nothing is
    // measured and `PlayHeader` is not touched: its `position: sticky` inside an
    // ancestor that does not scroll behaves like `relative`, it holds the top because
    // it IS at the top.
    //
    // One divergence from the Editing page: the height stays the theme's default
    // `100dvh` instead of the `100vh` the Editing page sets, because this page here is
    // opened with a finger (it is among the actors' cards) and an address bar that
    // retracts really does change the usable height there.
    <div className="page-shell">
      {/* Its compact sentence, its two selects, and no `hint`: the selects read on
          their own, and the bar's legend plus the timeline's sentence say how to read
          the drawings. The header says ONLY the play's title, never "Speaking share"
          (the seal says it, and the browser tab repeats it). */}
      <PlayHeader page="stats" title={manifest.title || t("common.untitledPlay")}>
        <div className="selects-row">
          {/* "The whole play" is this select's first choice, exactly as "The whole
              act" is the next one's: the level above lives at the head of the list
              of the level below, and the whole scope is set in the same two fields
              as on the other pages. */}
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
          {/* On "The whole play", there is no scene to choose: this select is
              therefore disabled, greyed out, and **empty**. Nothing to read inside
              it, and that is the point: "The whole act" would no longer be true
              there, and a fallback label ("All the scenes" was tried) only repeats
              what the field next to it has just announced, while giving a dead field
              the air of carrying a value. An empty, grey field reads at a glance as
              "no choice here", and the scope then reads in the only field that
              carries it. Disabled and not removed, so that the row does not change
              shape under the cursor.
              The empty option is there so that the select stays CONTROLLED on the
              same value `ALL`: without a matching option, the field would lose its
              value and coming back into an act would start again from an uncertain
              state.
              No tooltip on this select: a `disabled` control receives no mouse event,
              so its `title` would not be displayed (same lesson as the buttons of the
              Editing page's header, which had to go through a `.btn-tip`
              wrapper). */}
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
        {/* The page's only DISPLAY setting, under the row that chooses the scope: it
            does not change what one is looking at, only the block's shape. A slider
            and not a list of values, because the block recomposes itself while one
            drags it: it is by seeing it move that one finds the width that suits
            one's play, and a list would require trying blind. The value is written
            next to it, a slider without a number cannot be set the same way twice. */}
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

      {/* The page's legend, as a bar under the header and no longer under the mosaic.
          It is the ONLY surface that designates a character by keyboard (the pie
          slices and the runs live inside SVGs in `role="img"`), and on a whole play
          the mosaic is several screens tall: below it, the legend was only visible at
          the end of the run, so half of the time one read colours without being able
          to name them nor to highlight one of them. At the top, it is always there
          and always clickable.
          It is also the legend of BOTH pie charts, which each have their own right
          next to them: this one has no numbers, it only serves to highlight somebody
          in the three drawings.
          A named `role="group"` and not a plain `<ul>` dropped there: the bar has no
          text to say what it is, and each button's label ("Show only …") only says it
          once one is on it.
          Nothing when the scope is empty: there is nobody to highlight, and an empty
          bar between the header and the emptiness sentence would read as a display
          defect. */}
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

      {/* The scrolling area, and the `.container` stays INSIDE it: it is what centres
          the cards over 900 px, whereas the scrolling must happen at the window's
          edge, as on any page of the site. */}
      <div className="page-scroll">
        <div className="container">
          {totalLines === 0 ? (
            // Two kinds of emptiness not to be confused: an empty play is written in
            // the Editing page, an empty SCENE inside a written play is changed by
            // choosing another scope. Pointing to the Editing page in the second case
            // made one believe the play had not been entered, whereas a scene without
            // a line is ordinary while writing.
            // The scope is NOT taken up in the sentence: `scopeText` is written for a
            // drawing's `aria-label` ("Act I, in full"), and inserted into a sentence
            // it gave "No line in Act I, in full", whose continuation offered to
            // change scene whereas it is the whole act that is empty. (It is that
            // defect that made `scopeOf` return RANKS: putting things into a sentence
            // belongs to the caller, which alone knows what turn of phrase it inserts
            // it into.) The header's two selects
            // already say where one is; the sentence only says what to do, and the
            // three possible ways out, in the order of the controls.
            <div className="empty-state">
              {playIsEmpty
                ? t("common.emptyPlay", { page: t(pageLabelKey("editor")) })
                : /* The first choice of the scope select is INTERPOLATED and not
                     copied over: the two labels would fall out of agreement at the
                     first reshuffle of the row. */
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

              {/* The timeline no longer has a legend: it is a bar, at the top of the
                  page. This panel therefore no longer receives either `onSelect` or
                  `onHover`, the mosaic designating nobody by pointer. */}
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

// ------------------------------------------------- designating a character

// Hovering foreshadows the highlight: it is what makes it possible to walk through a
// cast without clicking ten times, and it makes the drawings visibly responsive to
// the pointer, which is the only thing that says they answer at all.
//
// **With a mouse only**, and the guard is not defensive: with a finger, the browser
// emits an emulated hover AFTER the press, which then stays stuck to the element
// touched. Without the filter, pressing a second time to show everything again left
// the character lit by that phantom hover, so the button never went dark.
// `onPointerLeave` is filtered for the same reason, out of symmetry.
const hoverProps = (id, onHover) => ({
  onPointerEnter: (e) => {
    if (e.pointerType === "mouse") onHover(id);
  },
  onPointerLeave: (e) => {
    if (e.pointerType === "mouse") onHover(null);
  },
});

// The page's THREE legends are this component, and that is what keeps them in
// agreement: the same button, the same label, the same pressed state, whether it
// carries numbers (the pie charts) or the name alone (the timeline). They used to be
// two different displays, an inert list next to the rings and buttons under the
// block, whereas both say the same thing about the same people.
//
// It is also the ONLY surface accessible to the keyboard and to screen readers: the
// pie slices and the timeline's blocks live inside SVGs in `role="img"`, whose
// descendants are not exposed (that is the page's stance: the drawing sums itself up,
// the numbers are in the list next to it). Putting buttons in there would make some
// thirty tab stops that would say nothing more than these legends do. What is done
// with a mouse on a drawing is therefore always done here with the keyboard.
//
// `value` absent = a legend without numbers, the one of the top bar.
function CharacterLegend({ rows, colorOf, nameOf, highlight, pinned, onSelect, onHover, value, total, flow }) {
  return (
    <ul className={flow ? "stats-legend stats-legend-flow" : "stats-legend"}>
      {rows.map((row) => {
        const color = colorOf(row.id);
        // The look follows the hover, the announced state follows the settled
        // choice (cf. `highlight` and `pinned` in `Stats`). The label too: on a
        // row that is merely hovered, a press highlights, it does not bring
        // everybody back.
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
              {/* The name stays in the theme's ink, in all three legends: it is the
                  pill just to its left that carries the colour, and the same class
                  rendered now in `--ink` now in a character colour gave two
                  treatments of the same element on a single screen. */}
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

// ------------------------------------------------------------------ pie chart

// The ring's radius and thickness, in the viewBox's frame (100 x 100). The
// circumference serves as the unit of the `stroke-dasharray`: a slice is worth its
// fraction of the circumference, so there is nothing to convert.
const R = 38;
const CIRCUMFERENCE = 2 * Math.PI * R;

// One ring, one slice per character, and the legend carries the numbers.
//
// The percentages are NOT placed on the slices, unlike in the matplotlib version
// (`autopct`): as soon as a slice is small, its label overlaps its neighbour, and on
// a scene with eight characters there is always one. They live in the legend, next to
// the name and the count, where they line up.
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
  // EACH pie chart sorts on ITS OWN quantity, like the reference's two `argsort`s.
  // Sorting both on the words left the column of the pie chart of lines out of order
  // (162, 200, 192, 119…), and a column of numbers that does not descend has to be
  // read digit by digit. The sort is here and not in `speechStats`: it is a DISPLAY
  // order, and it differs from one panel to the other on the same data.
  const ordered = [...rows].sort((a, b) => value(b) - value(a) || b.words - a.words);

  // The non-zero slices only: a slice of zero is not drawn, but it stays in the
  // legend (a character who has lines and zero words does exist, cf. an empty
  // line).
  let offset = 0;
  const slices = [];
  for (const row of ordered) {
    const fraction = total ? value(row) / total : 0;
    if (fraction > 0) {
      slices.push({ row, fraction, offset });
      offset += fraction;
    }
  }

  // The total as it is written, once only: it serves both to measure the size of the
  // centre's text and to write it. The `aria-label` just below receives the NUMBER
  // and not this string, `makeT` formatting every numeric parameter itself (hence the
  // same separator on both sides, without setting it twice).
  const writtenTotal = fmt.number(total);

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{title}</h2>

      <div className="stats-donut-row">
        {/* `role="img"` plus the `aria-label`: the drawing sums itself up, and the
            exact numbers are in the list next to it, so nothing rests on colour
            alone. */}
        <svg
          className="stats-donut"
          viewBox="0 0 100 100"
          role="img"
          aria-label={t("stats.donutLabel", { title, where, total, unit })}
        >
          {/* The ring's track: without it, a scope with a single character draws a
              complete circle and one cannot see that it is full. */}
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
                // A slice is designated by pointer, like its legend row: it is
                // the same gesture on the same character. Nothing to cut up for
                // that, the hit test of a dashed stroke only keeps what is
                // painted (verified: the arc answers, its gap does not), so the
                // arc IS the target.
                onClick={() => onSelect(row.id)}
                {...hoverProps(row.id, onHover)}
                // The `stroke` IS the slice: the ring is a circle without a fill
                // of which only an arc is painted, hence the palette's colour as
                // it is, like the legend pill right next to it (the darkened ink,
                // on the other hand, is reserved for text, cf. `characterInk`).
                // Unlike that pill, a slice has no hairline: two neighbouring
                // light tints (characters 11 to 20) therefore touch without a
                // separation.
                style={{
                  stroke: color ?? "var(--ink-soft)",
                  strokeDasharray: `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
                  strokeDashoffset: -start * CIRCUMFERENCE,
                }}
              />
            );
          })}
          {/* The total at the centre of the ring: it is the denominator of every
              percentage in the legend, it must be readable without any arithmetic.
              The two lines SHRINK if they do not fit inside the hole (cf.
              `centerFontSize`), otherwise the total of a play with six digits went
              out below the ring and the longest unit already touched the edges. The
              size comes down as an inline style and not as CSS because it is
              stats.js that computes it; the same figure written in both places would
              fall out of agreement at the first adjustment. */}
          {/* The SAME string is measured and written: `fmt.number` sets a thousands
              separator (a narrow no-break space in French, a comma in English), so
              measuring the bare number would return a size computed on a text that
              is not the one drawn. `centerFontSize` counts that separator for what it
              is, thinner than a digit. */}
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

// ------------------------------------------------------------------- the block

// The "dialogue timeline" block: one square per word, wrapped row by row, coloured by
// the character who speaks it.
//
// "Square" and not "pixel", even though it really is one pixel per word that the
// Python reference drew: the page is open to the whole troupe, and a pixel is only a
// known word to someone who already knows that a CONCEPTUAL pixel is rendered by
// several screen pixels (eight to a side at the default setting, four at the end of
// the range). "Square" can be seen on screen and asks nothing of anybody.
//
// In SVG and not in a `<canvas>`: the site has only one canvas, the mic's
// oscilloscope, and an SVG stays sharp at any scale (hence in print, and on a dense
// screen). One `<rect>` per RUN and not per word: the whole play is close to 10,000
// words for a few hundred runs.
//
// **The mosaic is not designated by pointer**: it FOLLOWS the choice (the other
// people's words go dark) but does not make it. A word is 8 px at the default setting
// and 4 px at the end of the range (cf. `DEFAULT_COLUMNS` and `MAX_COLUMNS`), so
// aiming at the right character in there is a roll of the dice, and a run of a single
// word is untouchable; hovering, for its part, would change character every two
// pixels and relight the three drawings continuously for a gesture that is not even a
// designation. The pie slices and the three legends are wide and named, that is where
// the choice is made, and the page's legend is at the top, always within reach. It is
// also what keeps a single way of designating somebody, by keyboard as by mouse.
function Timeline({ block, rows, where, colorOf, nameOf, highlight, pinned }) {
  const { rects, columns, rows: lineCount } = block;

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{t("stats.timeline.title")}</h2>

      {/* How to read the drawing is read BEFORE it, under the panel's title, and no
          longer at the foot of the card: the mosaic of a whole play is several
          screens tall, so an explanation placed below it only reached those who had
          already scrolled to the very end, that is to say those who no longer needed
          it.
          "Speaking turn" and not "line": the neighbouring lines of one and the same
          character are merged before the drawing (cf. `blockRects`), so a block is
          worth what they say in a row, which may amount to several lines of the
          script. The pie charts, for their part, really do count lines.
          "Press" and not "click": the page is open to the whole troupe, hence to the
          phone, and it is the verb of the rest of the site (cf. the Recording page;
          only the Editing page avoids it, as it opens with a mouse only).
          The last sentence is the page's only one to mention the highlight, and it is
          here because it is here that it is useful: the gesture holds for all three
          drawings, but the mosaic is the only one that says nothing of itself (a pie
          slice carries its name in the legend next to it). It names the two surfaces
          that answer, and above all not the mosaic, which stays inert to the pointer;
          it also says WHERE the names are, the top bar no longer being just below the
          drawing it explains. It does not speak of hovering: that is found on its
          own, it does not exist with a finger, and a sentence describing the pointer
          only serves those who do not need it. */}
      <p className="stats-caption">{t("stats.timeline.caption")}</p>

      {/* The viewBox is the whole geometry: the setting lives INSIDE it (columns of
          words and rows), and the rendered width is always that of the card (cf.
          stats.css). So moving the slider changes the grain of the drawing and
          nothing else, neither its width nor its place in the card. The
          `--stats-columns` variable that used to come down to the CSS with it is gone
          with the rounded width it served. */}
      <svg
        className="stats-block"
        viewBox={`0 0 ${columns} ${lineCount}`}
        role="img"
        // The summary follows the SETTLED choice and not the hover: a description
        // that rewrote itself as the cursor went by is not a description.
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

      {/* An impersonal turn of phrase, as on the troupe's two other pages ("the play
          must first be entered") and as in this one's emptiness sentence: this page is
          open to everybody, whereas the Editing page is not (it is not in
          `ACTOR_CARDS`, and it does not open with a finger), so an imperative here
          would command a gesture its reader cannot perform. The Progress page, for its
          part, does say "Open the Editing page": there it is the coordinator who is
          reading. */}
      {rows.some((row) => row.id === UNKNOWN) && (
        <p className="stats-warning">
          <WarnIcon />
          {t("stats.orphanWarning", { page: t(pageLabelKey("editor")) })}
        </p>
      )}
    </section>
  );
}
