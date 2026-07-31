import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import PageState from "../shared/PageState.jsx";
import useScrollToActiveCard from "../shared/useScrollToActiveCard.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import ProgressBar from "../shared/ProgressBar.jsx";
import LeaveGuard from "../shared/LeaveGuard.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { downloadBlob, slugify, myLineNumbers, myLineNumber, excerpt } from "../shared/data.js";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  SkipPrevIcon,
  SkipNextIcon,
  DownloadIcon,
  MicIcon,
  TrashIcon,
  WarnIcon,
} from "../shared/icons.jsx";
import useManifest from "../shared/useManifest.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import T from "../shared/T.jsx";
import useRecorder, { extensionForMimeType } from "./useRecorder.js";
import "./recorder.css";

// Recording page, structured like the rehearsal page: same header (act /
// scene / character selects), same dialogue cards, same fixed bottom bar.
// The play button becomes a mic button that records the SELECTED line (one
// of MY lines only). Takes are kept across character switches, so one
// session can record several characters and export them in a single ZIP.
//
// Each of my lines is in one of three states, labelled in the card corner from
// `recorder.status.*`:
//  - "todo"  : no take and no up-to-date published clip;
//  - "fresh" : take made THIS session, and it STAYS so after the ZIP download
//              ("already recorded" only becomes true once the coordinator has merged
//              the ZIP and the site was republished);
//  - "done"  : up-to-date published clip (manifest only).
// The error codes `useRecorder` can return, and their sentence. The hook is
// covered by `node --test`, so it cannot import `locale.js` (which reads the URL,
// the storage and the browser as soon as it is imported): it returns a code, the
// page puts it into words. The `_KEY` name is also what makes these keys get
// picked up by the guard in scripts/tests/test_contracts.py.
const MIC_ERROR_KEY = { mic: "recorder.micError" };

export default function App() {
  const { manifest, error: loadError } = useManifest();

  const [actIndex, setActIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [characterId, setCharacterId] = useState(""); // "" = not chosen yet
  const [myIndex, setMyIndex] = useState(0);
  // In-memory takes of this one-shot session: lineId -> {blob, ext, text, url}
  const [takes, setTakes] = useState({});
  const [downloaded, setDownloaded] = useState(false);

  const { supported, recordingLineId, elapsed, analyser, error: micError, start, stop, release } =
    useRecorder();
  const isRecording = recordingLineId != null;

  const listRef = useRef(null);

  const acts = manifest?.acts ?? [];
  const scene = acts[actIndex]?.scenes?.[sceneIndex] ?? null;
  const lines = useMemo(() => scene?.lines ?? [], [scene]);
  const myLines = useMemo(
    () => (characterId === "" ? [] : lines.filter((l) => l.characterId === characterId)),
    [lines, characterId]
  );
  // "Name (n/total)" on my cards: numbering shared with the Rehearsal page.
  const myNumbers = useMemo(() => myLineNumbers(lines, characterId), [lines, characterId]);

  const lineState = useCallback(
    (line) => {
      if (takes[line.id]) return "fresh";
      return line.status === "ok" ? "done" : "todo";
    },
    [takes]
  );
  const isTodo = useCallback((line) => lineState(line) === "todo", [lineState]);

  const safeMyIndex = Math.max(0, Math.min(myIndex, myLines.length - 1));
  const currentLine = myLines[safeMyIndex] ?? null;

  // Entering a scene/character: land on the first line still to record.
  // (Deliberately NOT re-run when takes change: finishing a take must not
  // yank the position away.)
  useEffect(() => {
    const first = myLines.findIndex(isTodo);
    setMyIndex(first === -1 ? 0 : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actIndex, sceneIndex, characterId]);

  useScrollToActiveCard(listRef, [safeMyIndex, actIndex, sceneIndex, characterId]);

  // Takes only live in memory: leaving the page while some are not in a
  // downloaded ZIP loses them (see the LeaveGuard at the end of the render).
  const takenCount = Object.keys(takes).length;
  const hasUnexported = takenCount > 0 && !downloaded;

  const saveTake = (line, blob, mimeType) => {
    if (!blob || blob.size === 0) return;
    setTakes((prev) => {
      // A single take per line: replace (and free) the previous one.
      if (prev[line.id]?.url) URL.revokeObjectURL(prev[line.id].url);
      return {
        ...prev,
        [line.id]: {
          blob,
          ext: extensionForMimeType(mimeType),
          // RAW text captured at recording time: no normalization in the
          // browser (single implementation lives in the GitHub Action, which
          // normalizes both sides when comparing).
          text: line.text,
          url: URL.createObjectURL(blob),
        },
      };
    });
    setDownloaded(false);
  };

  // Discarding a take from this session: the line goes back to the state it had
  // before ("Already recorded" if a published clip is up to date, otherwise "To
  // record"). Concerns ONLY the in-memory takes: an already published clip is not
  // deleted from the browser, it lives in the repo.
  const deleteTake = (line) => {
    setTakes((prev) => {
      const take = prev[line.id];
      if (!take) return prev;
      if (take.url) URL.revokeObjectURL(take.url);
      const { [line.id]: _dropped, ...rest } = prev;
      return rest;
    });
    // As after redoing a take: the already downloaded ZIP no longer describes
    // the session (it still contains the one just discarded), so it has to be
    // redone. If that was the last take, there is nothing left to download and
    // the warning is not shown (takenCount === 0).
    setDownloaded(false);
  };

  const toggleRecord = async () => {
    if (!currentLine) return;
    if (isRecording) {
      const result = await stop();
      if (result) saveTake(currentLine, result.blob, result.mimeType);
    } else {
      try {
        await start(currentLine.id);
      } catch {
        /* mic denied: error is displayed in the header */
      }
    }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    // The clips of the manifest: a {lineId: raw text} mapping, the audio member
    // always being named {lineId}.{ext}, so the Action finds it from the id alone.
    // (It used to be the manifest ITSELF, a bare mapping with nothing around it. The
    // `play` field below wrapped it; `parse_manifest` still reads both forms, so the
    // ZIPs downloaded before that field keep working.)
    const clips = {};
    for (const [lineId, take] of Object.entries(takes)) {
      zip.file(`${lineId}.${take.ext}`, take.blob);
      clips[lineId] = take.text;
    }
    // `play` names the play these voices come from. It does NOT serve to route the
    // upload: it is the `uploads/<id>/` folder where the coordinator drops the file that
    // does that, otherwise a damaged ZIP (unreadable, hence without a readable id
    // either) would have no journal in which to say so. It serves to VERIFY it,
    // and that is what makes a ZIP dropped in another play's folder be refused
    // with a readable reason, instead of writing one play's voices over another's.
    // Empty on a play whose script has no id yet: the Action then processes the
    // ZIP without verifying anything, like the ZIPs from before this field.
    zip.file("manifest.json", JSON.stringify({ play: manifest.id, clips }, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    // One session may record several characters: name the file after all of
    // them (readability only, the pipeline works from line ids).
    const characterOfLine = new Map(manifest.lines.map((l) => [l.id, l.characterId]));
    const recordedIds = new Set(Object.keys(takes).map((id) => characterOfLine.get(id)));
    const names = manifest.characters
      .filter((c) => recordedIds.has(c.id))
      .map((c) => slugify(c.name, t("recorder.characterSlug")));
    // The file's NAME follows the reader's locale, like everything else: the
    // Action never reads it (the type comes from the extension, the clips from
    // their id), so the ZIP contract does not depend on it.
    const stem = t("recorder.zipName", { names: names.join("-") || t("recorder.zipFallback") });
    downloadBlob(blob, `${stem}.zip`);
    // Line statuses do NOT change: a take stays `recorder.status.fresh` until
    // the coordinator has merged the ZIP and the site was republished; only the
    // save-state note reacts here.
    setDownloaded(true);
    // Recording session is over: turn the mic-in-use indicator off.
    // (Recording again simply reopens the stream.)
    release();
  };

  if (loadError) {
    return <PageState page="recorder" error={loadError} />;
  }

  if (!manifest) {
    return <PageState page="recorder" />;
  }

  // A final screen (the browser will not record), and not a wait: it therefore
  // names the play like the page's header, which it can do since it comes after
  // the manifest has loaded. The two states above, on the other hand, name nothing
  // at all: the play is not known yet, and `PageHeader` renders no title when
  // there is no title (never a page label in its place, it would get covered by
  // the title a fraction of a second later).
  if (!supported) {
    return (
      <PageState
        page="recorder"
        title={manifest.title || t("common.untitledPlay")}
        error={t("recorder.unsupported")}
      />
    );
  }

  // With no character chosen, the list gives way to the intro card.
  const visibleLines = characterId === "" ? [] : lines;

  // Selects one of MY lines (never while recording).
  const selectLine = (line) => {
    if (!isRecording) setMyIndex(myLines.findIndex((l) => l.id === line.id));
  };

  return (
    <div className="recorder-page">
      {/* The instructions are only passed once the character is chosen: before
          that, they live in the intro card, in place of the lines (no
          duplication). The header's compact sentence, on the other hand, is
          always there. */}
      <PlayHeader
        page="recorder"
        title={manifest.title || t("common.untitledPlay")}
        hint={characterId === "" ? null : t("recorder.hint")}
      >
        <div className="selects-row">
          <select
            aria-label={t("common.actSelect")}
            value={actIndex}
            disabled={isRecording}
            onChange={(e) => {
              setActIndex(Number(e.target.value));
              setSceneIndex(0);
            }}
          >
            {acts.map((_, i) => (
              <option key={i} value={i}>
                {actLabel(t, i)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("common.sceneSelect")}
            value={sceneIndex}
            disabled={isRecording}
            onChange={(e) => setSceneIndex(Number(e.target.value))}
          >
            {(acts[actIndex]?.scenes ?? []).map((s, i) => {
              const remaining =
                characterId === ""
                  ? null
                  : s.lines.filter((l) => l.characterId === characterId && isTodo(l)).length;
              return (
                <option key={i} value={i}>
                  {sceneLabel(t, i)}
                  {remaining != null ? t("recorder.sceneTodo", { count: remaining }) : ""}
                </option>
              );
            })}
          </select>
        </div>
        <div className="character-row">
          <select
            className={`character-select ${characterId === "" ? "unset" : ""}`}
            aria-label={t("common.myCharacter")}
            value={characterId}
            disabled={isRecording}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            <option value="">{t("common.whoDoYouPlay")}</option>
            {manifest.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {/* The hook returns a CODE (cf. useRecorder.js, covered by `node --test`):
            the sentence is composed here, and it is composed from the code
            RECEIVED. Rendering it as such rather than displaying today's single
            message is what makes the seam real: a second code would otherwise
            display the mic error. Fallback on that same message if the code is
            unknown, a page without a sentence being worth less than an
            approximate sentence. */}
        {micError && (
          <p className="mic-error">{t(MIC_ERROR_KEY[micError] ?? MIC_ERROR_KEY.mic)}</p>
        )}
        {hasUnexported && (
          <p className="zip-note warn">
            <WarnIcon />
            {t("recorder.notSaved")}
          </p>
        )}
        {downloaded && takenCount > 0 && (
          <p className="zip-note done">✓ {t("recorder.downloadedNote")}</p>
        )}
        {/* This message lives in the header (and not in the list) because the
            header is sticky: it stays in sight while one walks through the other
            characters' lines. It takes the place of the status legend, the two
            being mutually exclusive. */}
        {characterId !== "" && myLines.length === 0 && (
          <p className="no-lines-note">{t("recorder.noLinesInScene")}</p>
        )}
        {characterId !== "" && myLines.length > 0 && (
          <div className="status-legend">
            <span>
              <span className="st-dot" /> {t("recorder.status.todo")}
            </span>
            <span>
              <span className="st-pill done">✓</span> {t("recorder.status.done")}
            </span>
            <span>
              <span className="st-pill fresh">↓</span> {t("recorder.status.fresh")}
            </span>
          </div>
        )}
      </PlayHeader>

      <main className="dialogue-container" ref={listRef}>
        {/* With no character, the page is of no use (no line is "mine", the mic
            stays disabled): we replace the list with a card that says what to do,
            and that gets it done. */}
        {characterId === "" && (
          <IntroCard
            characters={manifest.characters}
            lines={manifest.lines}
            isTodo={isTodo}
            onPick={setCharacterId}
          />
        )}
        {visibleLines.map((line) => {
          const mine = line.characterId === characterId;
          const active = mine && currentLine?.id === line.id;
          const state = mine ? lineState(line) : null;
          const take = takes[line.id];
          const playerSrc = !mine || state === "todo" ? null : (take?.url ?? line.clip);
          return (
            <div
              key={line.id}
              className={[
                "dialogue-card",
                mine ? "mine own" : "",
                state === "fresh" ? "fresh" : "",
                active ? "active" : "",
                active && isRecording ? "recording" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              // Pointer shortcut only: no role="button" and no tabIndex here.
              // The card already contains a real button (the take player), and a
              // control inside a control is not exposed correctly to assistive
              // technologies. The keyboard has better anyway: the "my line"
              // arrows of the bottom bar and the slider walk through ALL my
              // lines, where tabbing from card to card forced one to cross the
              // whole scene to reach the controls.
              onClick={mine ? () => selectLine(line) : undefined}
            >
              <div className="dialogue-meta">
                <span className="dialogue-character">
                  {line.character}
                  {myLineNumber(t, myNumbers, line.id)}
                </span>
                {active && isRecording ? (
                  <span className="rec-status live">
                    <span className="rec-live-dot" />
                    {t("recorder.recording")}
                  </span>
                ) : (
                  state && (
                    <span className={`rec-status ${state}`}>
                      {state === "todo" ? (
                        <span className="st-dot" />
                      ) : (
                        <span className={`st-pill ${state}`}>{state === "fresh" ? "↓" : "✓"}</span>
                      )}
                      {t(`recorder.status.${state}`)}
                    </span>
                  )
                )}
              </div>
              <p className="dialogue-text">{line.text}</p>
              {playerSrc && (
                <TakePlayer
                  src={playerSrc}
                  seed={line.id}
                  fresh={state === "fresh"}
                  lineText={line.text}
                  // Only a take from this session can be deleted (the player also
                  // serves to replay a published clip, which is not ours).
                  onDelete={take ? () => deleteTake(line) : null}
                  deleteDisabled={isRecording}
                />
              )}
            </div>
          );
        })}
      </main>

      {/* Control bar hidden as long as no character is chosen: it would only
          offer a disabled mic and a disabled download. */}
      {characterId !== "" && (
        <div className="controls">
          {isRecording && (
            <div className="rec-live-panel" role="status">
              <span className="rec-live-dot" />
              <span className="rec-live-label">{t("recorder.recordingLabel")}</span>
              <LiveWaveform analyser={analyser} />
              {/* aria-hidden: role="status" announces "Recording" once; the
                  running timer must not be read out again every second. */}
              <span className="rec-live-time" aria-hidden="true">{formatTime(elapsed)}</span>
            </div>
          )}
          <ProgressBar
            value={safeMyIndex}
            count={myLines.length}
            disabled={isRecording}
            onSeek={setMyIndex}
          />
          {/* The FOUR buttons of this row carry their tooltip on a `.btn-tip`
              wrapper (theme.css) and never on themselves, for the reason that gave
              birth to it in the Editing page: a `disabled` control receives no
              mouse event (Chrome, Safari), so its own `title` is not displayed, and
              the explanation never arrives at the moment when it is useful. Here
              all four go dark (during a take, at the end of the run, with no line
              chosen, with no take to export), and the download button is icon
              only: without this wrapper, a mouse user had no way of learning what
              it does. The accessible name, on the other hand, stays on the button:
              it is the `aria-label`, which does not depend on its state. */}
          <div className="buttons-row">
            <span className="controls-side">
              {myLines.length > 0 && (
                <span className="line-counter">
                  {t("recorder.lineCounter", { n: safeMyIndex + 1, total: myLines.length })}
                </span>
              )}
            </span>
            {/* These arrows walk through MY lines only: same design as the "my
                line" jumps of the Rehearsal page (.my-jump). */}
            <span className="btn-tip" title={t("common.prevMyLine")}>
              <button
                className="ctrl-btn my-jump"
                aria-label={t("common.prevMyLine")}
                disabled={isRecording || safeMyIndex <= 0}
                onClick={() => setMyIndex(safeMyIndex - 1)}
              >
                <SkipPrevIcon />
              </button>
            </span>
            <span className="btn-tip" title={isRecording ? t("recorder.stop") : t("recorder.record")}>
              <button
                className={`ctrl-btn play mic ${isRecording ? "stop" : ""}`}
                aria-label={isRecording ? t("recorder.stop") : t("recorder.record")}
                disabled={!currentLine}
                onClick={toggleRecord}
              >
                {isRecording ? <StopIcon /> : <MicIcon />}
              </button>
            </span>
            <span className="btn-tip" title={t("common.nextMyLine")}>
              <button
                className="ctrl-btn my-jump"
                aria-label={t("common.nextMyLine")}
                disabled={isRecording || safeMyIndex >= myLines.length - 1}
                onClick={() => setMyIndex(safeMyIndex + 1)}
              >
                <SkipNextIcon />
              </button>
            </span>
            <span className="controls-side right">
              <span className="btn-tip" title={t("recorder.downloadZip")}>
                <button
                  className="btn primary zip-download-btn"
                  aria-label={t("recorder.downloadZipCount", { count: takenCount })}
                  disabled={takenCount === 0}
                  onClick={downloadZip}
                >
                  <DownloadIcon /> {t("recorder.downloadCount", { count: takenCount })}
                </button>
              </span>
            </span>
          </div>
        </div>
      )}

      <LeaveGuard
        active={hasUnexported}
        title={t("recorder.leaveTitle")}
        saveLabel={t("recorder.leaveSave")}
        onSave={downloadZip}
      >
        {/* The number of takes has left the sentence: the plural now only settles
            the agreement (cf. `recorder.leaveBody`). */}
        <p>{t("recorder.leaveBody", { count: takenCount })}</p>
      </LeaveGuard>
    </div>
  );
}

// Intro card, in place of the lines as long as no character is chosen: the page's
// instructions, then the characters as buttons (the header's select alone read as
// a blocked page). The "to record" counter helps everyone recognise themselves and
// shows the work left.
function IntroCard({ characters, lines, isTodo, onPick }) {
  const stats = characters.map((c) => {
    const own = lines.filter((l) => l.characterId === c.id);
    return { character: c, total: own.length, todo: own.filter(isTodo).length };
  });
  return (
    <div className="intro-card card">
      <h2 className="intro-title">{t("common.whoDoYouPlay")}</h2>
      {/* The bold word is a PARAMETER and not a JSX fragment: cutting the sentence
          around the <strong> would freeze the French word order in it. */}
      <p className="intro-lead">
        <T
          k="recorder.intro.lead"
          p={{ your: <strong>{t("recorder.intro.leadEmphasis")}</strong> }}
        />
      </p>
      <ol className="intro-steps">
        <li>{t("recorder.intro.step1")}</li>
        <li>{t("recorder.intro.step2")}</li>
      </ol>
      <p className="intro-outro">
        <T
          k="recorder.intro.outro"
          p={{
            icon: (
              <span className="intro-dl">
                <DownloadIcon />
              </span>
            ),
          }}
        />
      </p>
      {stats.length === 0 ? (
        <p className="intro-empty">{t("common.noCharacters", { page: t(pageLabelKey("editor")) })}</p>
      ) : (
        <div className="intro-characters">
          {stats.map(({ character, total, todo }) => (
            <button
              key={character.id}
              className="intro-character"
              disabled={total === 0}
              onClick={() => onPick(character.id)}
            >
              <span className="intro-character-name">{character.name}</span>
              {total === 0 ? (
                <span className="intro-character-count">{t("recorder.intro.noLines")}</span>
              ) : todo === 0 ? (
                <span className="intro-character-count done">
                  <span className="st-pill done">✓</span> {t("recorder.intro.allDone")}
                </span>
              ) : (
                <span className="intro-character-count todo">
                  <span className="st-dot" /> {t("recorder.intro.todo", { count: todo })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Live recording waveform: instead of a jittery oscilloscope, it accumulates
// one amplitude bar at a regular cadence so the signal *builds up* left to
// right (like a voice-memo), then scrolls once the canvas is full. Reads the
// recorder's AnalyserNode only, never the stream. Colour = theme accent.
const BAR_W = 3; // width of a bar (CSS px)
const BAR_GAP = 2; // space between bars (CSS px)
const SAMPLE_MS = 55; // cadence at which a bar is added, hence "build-up" speed

function LiveWaveform({ analyser }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // Physical resolution = CSS size × density (sharp on HiDPI screens).
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 26;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // The stroke colour comes from the canvas's `color` property, which
    // recorder.css sets to `var(--accent)`. Read on the ELEMENT and not as a
    // variable on `:root`: `color` is an inherited property and always resolved, so
    // there is no fallback left to write, where reading `--accent` required one and
    // hardcoded the brand's burgundy back into the JS with a "keep in sync". A
    // canvas does not inherit a stroke colour, but it does inherit `color`.
    const accent = getComputedStyle(canvas).color;
    const slot = (BAR_W + BAR_GAP) * dpr;
    const barW = BAR_W * dpr;
    const capacity = Math.floor(canvas.width / slot);

    // History of the levels (0..1), the most recent at the end of the array.
    const levels = [];

    const drawBars = () => {
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = accent;
      // Bars aligned to the left: it fills up progressively, then scrolls.
      for (let i = 0; i < levels.length; i++) {
        const bh = Math.max(barW, levels[i] * (h * 0.9));
        const x = i * slot;
        // Bar centred vertically (mirrored), rounded corners.
        ctx.beginPath();
        const r = barW / 2;
        ctx.roundRect(x, mid - bh / 2, barW, bh, r);
        ctx.fill();
      }
    };

    // No analyser (Web Audio missing): a discreet, frozen rest line.
    if (!analyser) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, canvas.height / 2 - dpr, canvas.width, 2 * dpr);
      return;
    }

    const buf = new Uint8Array(analyser.fftSize);
    let raf;
    let last = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < SAMPLE_MS) return;
      last = now;
      // RMS level of the current window (128 = silence).
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Gain + ceiling: a normal voice fills the height nicely.
      levels.push(Math.min(1, rms * 5));
      if (levels.length > capacity) levels.shift();
      drawBars();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <canvas ref={canvasRef} className="rec-wave" aria-hidden="true" />;
}

const WAVE_BARS = 26;

// Fallback waveform: deterministic bar heights derived from the line id (no
// randomness, so re-renders are stable). Shown only while the real peaks are
// being decoded, or if decoding fails (e.g. unsupported codec).
function waveHeights(seed, count = WAVE_BARS) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const heights = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) | 0;
    heights.push(30 + (Math.abs(h) % 65)); // 30%..94%
  }
  return heights;
}

// Shared AudioContext for decoding: browsers cap the number of live contexts,
// so one lazily-created instance decodes every clip. Created on first use
// (needs a user gesture on some browsers, which a recording session always has).
let sharedAudioCtx = null;
function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  return sharedAudioCtx;
}

// Real waveform: fetch the audio at `src`, decode it, and reduce channel 0 to
// `count` peak amplitudes normalised to the loudest bar. Returns percentages
// (6%..100%) so silence still shows a sliver. Throws if fetch/decode fails.
async function decodePeaks(src, count = WAVE_BARS) {
  const ctx = getAudioContext();
  if (!ctx) throw new Error("Web Audio unavailable");
  const buf = await (await fetch(src)).arrayBuffer();
  // decodeAudioData detaches the buffer; slice() keeps a copy the caller owns.
  const audio = await ctx.decodeAudioData(buf.slice(0));
  const data = audio.getChannelData(0);
  const size = Math.floor(data.length / count) || 1;
  const peaks = [];
  let max = 0;
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const start = i * size;
    const end = Math.min(start + size, data.length);
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  const floor = 6;
  return peaks.map((p) => (max > 0 ? floor + (100 - floor) * (p / max) : floor));
}

// "m:ss", the universal format of a short excerpt: it is written the same way in
// both languages of the site, and `Intl` does not expose a duration formatter
// everywhere (`Intl.DurationFormat` is too recent for a troupe's browsers). What is
// interface text here is what JOINS the elapsed time and the total, and that has
// been handed to the catalogue (`recorder.player.time`). Since a take never goes
// beyond a few minutes, there is no thousands separator to group either.
function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// In-card audio player: round play button + elapsed/total + waveform, plus a
// discreet delete button at the far end when the clip is a take of THIS
// session (`onDelete`).
// `fresh` switches the vivid-green palette (`recorder.status.fresh`) vs the
// greyed green of already-recorded lines.
function TakePlayer({ src, seed, fresh, lineText, onDelete, deleteDisabled }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const fallback = useMemo(() => waveHeights(seed), [seed]);
  // Real peaks decoded from the audio; falls back to the decorative bars while
  // decoding or if decode fails.
  const [peaks, setPeaks] = useState(null);
  const bars = peaks ?? fallback;
  // Fraction played (0..1): colours the waveform up to the playhead.
  const progress = duration > 0 ? Math.min(1, time / duration) : 0;

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    decodePeaks(src)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        // Keep the decorative fallback; not worth surfacing to the actor.
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className={`card-player ${fresh ? "fresh" : "done"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="player-play"
        title={playing ? t("recorder.player.pause") : t("recorder.player.play")}
        onClick={() => {
          const audio = audioRef.current;
          if (audio.paused) audio.play();
          else audio.pause();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      {/* The two durations arrive already composed as "m:ss" (cf. formatTime); what
          JOINS them comes from the catalogue, it has no business being a "/"
          written here. */}
      <span className="player-time">
        {t("recorder.player.time", { elapsed: formatTime(time), total: formatTime(duration) })}
      </span>
      <span className="player-wave">
        {bars.map((h, i) => (
          <span
            key={i}
            className={(i + 0.5) / bars.length <= progress ? "played" : ""}
            style={{ height: `${h}%` }}
          />
        ))}
      </span>
      {onDelete && (
        <button
          className="player-delete"
          title={t("recorder.player.delete")}
          aria-label={t("recorder.player.delete")}
          disabled={deleteDisabled}
          onClick={() => setConfirming(true)}
        >
          <TrashIcon />
        </button>
      )}
      {confirming && (
        <ConfirmModal
          title={t("recorder.player.deleteConfirm")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          {/* Nothing more than the quotation, like the editor's line deletion: the
              title says the gesture, the quotation says on what. */}
          <p className="confirm-quote">{fmt.quote(excerpt(lineText))}</p>
        </ConfirmModal>
      )}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setTime(0)}
        // Take replaced (src swapped): reset the stale elapsed time and the
        // play state; no pause event is guaranteed on a source change.
        onEmptied={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          // Chrome quirk: MediaRecorder blobs report an Infinity duration
          // until seeked past the end: force it, then rewind.
          if (!Number.isFinite(e.target.duration)) e.target.currentTime = 1e7;
        }}
        onDurationChange={(e) => {
          const d = e.target.duration;
          if (Number.isFinite(d)) {
            setDuration(d);
            if (e.target.currentTime > d) e.target.currentTime = 0;
          }
        }}
      />
    </div>
  );
}
