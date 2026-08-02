import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import PageState from "../shared/PageState.jsx";
import useScrollToActiveCard from "../shared/useScrollToActiveCard.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import ProgressBar from "../shared/ProgressBar.jsx";
import LeaveGuard from "../shared/LeaveGuard.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import {
  downloadBlob,
  slugify,
  myLineNumbers,
  myLineNumber,
  actChoices,
  sceneChoices,
  excerpt,
} from "../shared/data.js";
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

// Three states per line of mine (`recorder.status.*`): "todo", "fresh" (a take from THIS
// session, which STAYS fresh after the download, "done" meaning merged and republished) and
// "done" (an up-to-date published clip).

// useRecorder returns a CODE, running under `node --test`. The `_KEY` suffix is what the
// guard in test_contracts.py looks for.
const MIC_ERROR_KEY = { mic: "recorder.micError" };

// Both, because nothing left to record and nothing to record at all differ (`optionSuffix`).
function countLines(lines, characterId, isTodo) {
  const own = lines.filter((l) => l.characterId === characterId);
  return { own: own.length, todo: own.filter(isTodo).length };
}

// Three cases and not two: a tick on an act one never speaks in would claim work that never
// existed. Plain `<select>`s so a phone opens the system picker, which is why the mark can
// only be a character and carries no colour (an option honours no element of ours).
function optionSuffix(counts) {
  if (counts == null) return "";
  if (counts.own === 0) return t("common.optionNote", { note: t("recorder.noLines") });
  if (counts.todo === 0) return t("recorder.optionDone");
  return t("common.optionNote", { note: t("recorder.toRecord", { count: counts.todo }) });
}

export default function App() {
  const { manifest, error: loadError } = useManifest();

  const [actIndex, setActIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [characterId, setCharacterId] = useState(""); // "" = not chosen yet
  const [myIndex, setMyIndex] = useState(0);
  // In-memory only, lineId -> {blob, ext, text, url}. Never persisted.
  const [takes, setTakes] = useState({});
  const [downloaded, setDownloaded] = useState(false);

  const { supported, recordingLineId, elapsed, analyser, error: micError, start, stop, release } =
    useRecorder();
  const isRecording = recordingLineId != null;

  const listRef = useRef(null);

  const acts = manifest?.acts ?? [];
  const scenes = useMemo(() => acts[actIndex]?.scenes ?? [], [acts, actIndex]);
  const scene = scenes[sceneIndex] ?? null;
  const lines = useMemo(() => scene?.lines ?? [], [scene]);
  const myLines = useMemo(
    () => (characterId === "" ? [] : lines.filter((l) => l.characterId === characterId)),
    [lines, characterId]
  );
  // Numbering shared with the Rehearsal page.
  const myNumbers = useMemo(() => myLineNumbers(lines, characterId), [lines, characterId]);

  const lineState = useCallback(
    (line) => {
      if (takes[line.id]) return "fresh";
      return line.status === "ok" ? "done" : "todo";
    },
    [takes]
  );
  const isTodo = useCallback((line) => lineState(line) === "todo", [lineState]);

  // `actChoices`/`sceneChoices` (shared with Rehearsal) return INDEXES, never renumbered.
  const actOptions = useMemo(() => actChoices(acts, characterId), [acts, characterId]);
  const choices = useMemo(() => sceneChoices(scenes, characterId), [scenes, characterId]);

  // Choosing a character can hide the current act or scene, blanking a `<select>` on a dead
  // value. The act first: it renews `scenes`, and the scene effect then runs on the act one
  // really is in.
  useEffect(() => {
    if (actOptions.length > 0 && !actOptions.includes(actIndex)) {
      setActIndex(actOptions[0]);
      setSceneIndex(0);
    }
  }, [actOptions, actIndex]);

  useEffect(() => {
    if (choices.length > 0 && !choices.includes(sceneIndex)) setSceneIndex(choices[0]);
  }, [choices, sceneIndex]);

  const safeMyIndex = Math.max(0, Math.min(myIndex, myLines.length - 1));
  const currentLine = myLines[safeMyIndex] ?? null;

  // NOT re-run on takes: finishing one must not yank the position away.
  useEffect(() => {
    const first = myLines.findIndex(isTodo);
    setMyIndex(first === -1 ? 0 : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actIndex, sceneIndex, characterId]);

  useScrollToActiveCard(listRef, [safeMyIndex, actIndex, sceneIndex, characterId]);

  // Takes live in memory only, so leaving before the ZIP loses them (cf. LeaveGuard below).
  const takenCount = Object.keys(takes).length;
  const hasUnexported = takenCount > 0 && !downloaded;

  const saveTake = (line, blob, mimeType) => {
    if (!blob || blob.size === 0) return;
    setTakes((prev) => {
      // One take per line: revoke the replaced object URL.
      if (prev[line.id]?.url) URL.revokeObjectURL(prev[line.id].url);
      return {
        ...prev,
        [line.id]: {
          blob,
          ext: extensionForMimeType(mimeType),
          // RAW text: normalization has one implementation, in the Action.
          text: line.text,
          url: URL.createObjectURL(blob),
        },
      };
    });
    setDownloaded(false);
  };

  // Only the in-memory take: a published clip lives in the repo and is never touched here.
  const deleteTake = (line) => {
    setTakes((prev) => {
      const take = prev[line.id];
      if (!take) return prev;
      if (take.url) URL.revokeObjectURL(take.url);
      const { [line.id]: _dropped, ...rest } = prev;
      return rest;
    });
    // The downloaded ZIP still holds the discarded take, so it no longer describes the
    // session and has to be redone.
    setDownloaded(false);
  };

  const toggleRecord = async () => {
    if (!currentLine) return;
    if (isRecording) {
      const result = await stop();
      if (result) saveTake(currentLine, result.blob, result.mimeType);
    } else {
      // A take still playing would be captured by the mic.
      pauseOtherAudio();
      try {
        await start(currentLine.id);
      } catch {
        /* mic denied: error is displayed in the header */
      }
    }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    // ZIP contract with `parse_manifest` (process_uploads.py): {lineId: raw text} plus one
    // {lineId}.{ext} per line.
    const clips = {};
    for (const [lineId, take] of Object.entries(takes)) {
      zip.file(`${lineId}.${take.ext}`, take.blob);
      clips[lineId] = take.text;
    }
    // `play` VERIFIES, never routes: the folder routes, so a corrupt ZIP still gets a journal.
    zip.file("manifest.json", JSON.stringify({ play: manifest.id, clips }, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    // Several characters can be recorded in one session; the name is readability only.
    const characterOfLine = new Map(manifest.lines.map((l) => [l.id, l.characterId]));
    const recordedIds = new Set(Object.keys(takes).map((id) => characterOfLine.get(id)));
    const names = manifest.characters
      .filter((c) => recordedIds.has(c.id))
      .map((c) => slugify(c.name, t("recorder.characterSlug")));
    // The name follows the reader's locale: the Action never reads it.
    const stem = t("recorder.zipName", { names: names.join("-") || t("recorder.zipFallback") });
    downloadBlob(blob, `${stem}.zip`);
    // Statuses do not change: a take stays "fresh" until merged and republished.
    setDownloaded(true);
    // Turns the mic-in-use indicator off; recording again reopens the stream.
    release();
  };

  if (loadError) {
    return <PageState page="recorder" error={loadError} />;
  }

  if (!manifest) {
    return <PageState page="recorder" />;
  }

  // A final screen and not a wait, so it can name the play, unlike the two states above.
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

  const selectLine = (line) => {
    if (!isRecording) setMyIndex(myLines.findIndex((l) => l.id === line.id));
  };

  return (
    <div className="recorder-page">
      {/* The hint waits for a character: the intro card carries it until then. */}
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
            {actOptions.map((i) => {
              // An act totals its scenes, so one goes straight to where the work is.
              const counts =
                characterId === ""
                  ? null
                  : countLines(
                      acts[i].scenes.flatMap((s) => s.lines),
                      characterId,
                      isTodo
                    );
              return (
                // The value is the act's rank in the PLAY: hiding never renumbers.
                <option key={i} value={i}>
                  {actLabel(t, i)}
                  {optionSuffix(counts)}
                </option>
              );
            })}
          </select>
          <select
            aria-label={t("common.sceneSelect")}
            value={sceneIndex}
            disabled={isRecording}
            onChange={(e) => setSceneIndex(Number(e.target.value))}
          >
            {choices.map((i) => {
              // "no lines" only surfaces in `sceneChoices`' whole-act fallback.
              const counts =
                characterId === "" ? null : countLines(scenes[i].lines, characterId, isTodo);
              return (
                // The value is the scene's rank in the ACT: hiding never renumbers.
                <option key={i} value={i}>
                  {sceneLabel(t, i)}
                  {optionSuffix(counts)}
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
              // Over the whole play: same figure as the intro card, on screen at once.
              <option key={c.id} value={c.id}>
                {c.name}
                {optionSuffix(countLines(manifest.lines, c.id, isTodo))}
              </option>
            ))}
          </select>
        </div>
        {/* From the code RECEIVED, so a second code cannot silently show the mic error. */}
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
        {/* In the sticky header, and mutually exclusive with the status legend. */}
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
              // Pointer only, no role/tabIndex: the card holds a real button, and the
              // keyboard walks my lines from the bottom bar.
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
                  // Only a session take is deletable; the player also replays published clips.
                  onDelete={take ? () => deleteTake(line) : null}
                  recording={isRecording}
                />
              )}
            </div>
          );
        })}
      </main>

      {/* Hidden without a character: it would offer a disabled mic and download only. */}
      {characterId !== "" && (
        <div className="controls">
          {isRecording && (
            <div className="rec-live-panel" role="status">
              <span className="rec-live-dot" />
              <span className="rec-live-label">{t("recorder.recordingLabel")}</span>
              <LiveWaveform analyser={analyser} />
              {/* aria-hidden: role="status" announces once, the timer must not repeat it
                  every second. */}
              <span className="rec-live-time" aria-hidden="true">{formatTime(elapsed)}</span>
            </div>
          )}
          <ProgressBar
            value={safeMyIndex}
            count={myLines.length}
            disabled={isRecording}
            onSeek={setMyIndex}
          />
          {/* Tooltips on a `.btn-tip` wrapper: a disabled control receives no mouse event
              (Chrome, Safari), so its own `title` never shows, and all four disable. */}
          <div className="buttons-row">
            <span className="controls-side">
              {myLines.length > 0 && (
                <span className="line-counter">
                  {t("recorder.lineCounter", { n: safeMyIndex + 1, total: myLines.length })}
                </span>
              )}
            </span>
            {/* My lines only, like the Rehearsal page's .my-jump. */}
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
        {/* The count is not in the sentence; the plural only settles the agreement. */}
        <p>{t("recorder.leaveBody", { count: takenCount })}</p>
      </LeaveGuard>
    </div>
  );
}

// In place of the lines until a character is chosen: the header's select alone read as a
// blocked page.
function IntroCard({ characters, lines, isTodo, onPick }) {
  const stats = characters.map((c) => {
    const own = lines.filter((l) => l.characterId === c.id);
    return { character: c, total: own.length, todo: own.filter(isTodo).length };
  });
  return (
    <div className="intro-card card">
      <h2 className="intro-title">{t("common.whoDoYouPlay")}</h2>
      {/* The bold word is a PARAMETER: splitting the sentence freezes French word order. */}
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
                <span className="intro-character-count">{t("recorder.noLines")}</span>
              ) : todo === 0 ? (
                <span className="intro-character-count done">
                  <span className="st-pill done">✓</span> {t("recorder.intro.allDone")}
                </span>
              ) : (
                <span className="intro-character-count todo">
                  <span className="st-dot" /> {t("recorder.toRecord", { count: todo })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One amplitude bar per tick, building left to right. Reads the AnalyserNode, not the stream.
const BAR_W = 3; // CSS px
const BAR_GAP = 2; // CSS px
const SAMPLE_MS = 55; // one bar per tick, hence the build-up speed

function LiveWaveform({ analyser }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // Physical resolution = CSS size x density, for HiDPI.
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 26;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // `color` on the ELEMENT (recorder.css): inherited and always resolved, so no hardcoded
    // fallback. A canvas inherits no stroke colour, but it does inherit `color`.
    const accent = getComputedStyle(canvas).color;
    const slot = (BAR_W + BAR_GAP) * dpr;
    const barW = BAR_W * dpr;
    const capacity = Math.floor(canvas.width / slot);

    // Levels 0..1, most recent last.
    const levels = [];

    const drawBars = () => {
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = accent;
      for (let i = 0; i < levels.length; i++) {
        const bh = Math.max(barW, levels[i] * (h * 0.9));
        const x = i * slot;
        ctx.beginPath();
        const r = barW / 2;
        ctx.roundRect(x, mid - bh / 2, barW, bh, r);
        ctx.fill();
      }
    };

    // Web Audio missing: a frozen rest line.
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
      // RMS of the current window (128 = silence).
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Gain and ceiling tuned so a normal voice fills the height.
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

// Derived from the line id so re-renders are stable. Shown while the real peaks decode.
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

// One shared context: browsers cap the live ones. Lazy, some needing a user gesture.
let sharedAudioCtx = null;
function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  return sharedAudioCtx;
}

// Channel 0 as `count` peaks normalised to the loudest, floored at 6 % so silence shows.
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

// "m:ss" is written the same way in both languages, and Intl.DurationFormat is too recent
// for a troupe's browsers. What JOINS elapsed and total is catalogue text.
function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// One voice at a time: the page holds one <audio> per recorded line, so playing a take has
// to silence the others. Called with no argument to silence them all.
function pauseOtherAudio(except) {
  document.querySelectorAll("audio").forEach((a) => {
    if (a !== except) a.pause();
  });
}

// In-card player. `onDelete` only for a take of THIS session; `fresh` switches the palette.
// `recording` locks it: nothing plays while the mic is open.
function TakePlayer({ src, seed, fresh, lineText, onDelete, recording }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const fallback = useMemo(() => waveHeights(seed), [seed]);
  const [peaks, setPeaks] = useState(null);
  const bars = peaks ?? fallback;
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
      {/* Tooltip on the `.btn-tip` wrapper, as the bottom bar: both these buttons disable
          while recording, and a disabled control receives no mouse event, so a `title`
          worn by the button is absent in the very state it explains. The accessible name
          stays on the button, `aria-label` doing what the `title` used to. */}
      <span
        className="btn-tip"
        title={playing ? t("recorder.player.pause") : t("recorder.player.play")}
      >
        <button
          className="player-play"
          aria-label={playing ? t("recorder.player.pause") : t("recorder.player.play")}
          disabled={recording}
          onClick={() => {
            const audio = audioRef.current;
            if (audio.paused) audio.play();
            else audio.pause();
          }}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </span>
      {/* What joins the two durations comes from the catalogue, never a "/" written here. */}
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
        <span className="btn-tip player-delete-tip" title={t("recorder.player.delete")}>
          <button
            className="player-delete"
            aria-label={t("recorder.player.delete")}
            disabled={recording}
            onClick={() => setConfirming(true)}
          >
            <TrashIcon />
          </button>
        </span>
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
          {/* The title says the gesture, the quotation says on what. */}
          <p className="confirm-quote">{fmt.quote(excerpt(lineText))}</p>
        </ConfirmModal>
      )}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={(e) => {
          pauseOtherAudio(e.target);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setTime(0)}
        // No pause event is guaranteed on a source change, so reset here.
        onEmptied={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          // Chrome: MediaRecorder blobs report Infinity until seeked past the end.
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
