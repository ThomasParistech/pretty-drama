import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PageState from "../shared/PageState.jsx";
import useScrollToActiveCard from "../shared/useScrollToActiveCard.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import ProgressBar from "../shared/ProgressBar.jsx";
import { myLineNumbers, myLineNumber, sceneChoices } from "../shared/data.js";
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  SkipPrevIcon,
  SkipNextIcon,
  SparkleIcon,
} from "../shared/icons.jsx";
import useManifest from "../shared/useManifest.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import useTts from "./useTts.js";
import "./rehearsal.css";

// A small breath between two lines chained by the speech synthesiser: the real
// mp3s carry a slight silence at their head and tail, TTS does not, hence a
// transition that is too abrupt without this delay.
const TTS_GAP_MS = 80;

// Rehearsal player, a React port of the v1 UX:
//  - act / scene / character selectors, plus the four toggles of `.checks-row`
//    (mute my voice, hide my text, beep, start one line early); muting and text
//    hiding are two separate settings in v2, unlike v1 which conflated them
//  - dialogue cards, current line highlighted and auto-scrolled
//  - fixed bottom bar: line-indexed progress + prev/play/next + my-line jumps
//  - the actor's own lines are cued (beep + `rehearsal.yourTurn` overlay when
//    their voice is muted)
// v2 twist: real mp3 clips when status is "ok", browser TTS fallback otherwise.
export default function App() {
  const { manifest, error: loadError } = useManifest();

  const [actIndex, setActIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [characterId, setCharacterId] = useState(""); // "" = listening only
  const [isPlaying, setIsPlaying] = useState(false);
  const [muet, setMuet] = useState(false); // skip audio of MY lines: I say them
  const [hideText, setHideText] = useState(false); // blur MY lines' text
  const [bip, setBip] = useState(true);
  const [avant, setAvant] = useState(true);
  const [overlay, setOverlay] = useState(false);

  // The PLAY's language and not the interface's: this voice stands in for an actor
  // saying their line, so it must pronounce the text in the language it is written
  // in. `manifest` may be null while loading, and `useTts` then falls back on
  // French.
  const tts = useTts(manifest?.language);

  // Imperative playback machinery (kept out of React state to avoid stale
  // closures): generation token invalidates every pending callback on any
  // stop/jump.
  const tokenRef = useRef(0);
  const playingRef = useRef(false);
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const waitTimerRef = useRef(null);
  const listRef = useRef(null);

  const acts = manifest?.acts ?? [];
  const scenes = useMemo(() => acts[actIndex]?.scenes ?? [], [acts, actIndex]);
  const scene = scenes[sceneIndex] ?? null;
  const lines = useMemo(() => scene?.lines ?? [], [scene]);

  // The scenes the menu offers: once a character is chosen, only the ones where
  // they speak (`sceneChoices`, shared with the Recording header).
  const choices = useMemo(() => sceneChoices(scenes, characterId), [scenes, characterId]);

  // Refs mirroring the values the imperative engine needs.
  const engineRef = useRef({});
  engineRef.current = { lines, characterId, muet, bip };

  const isMine = useCallback(
    (line) => characterId !== "" && line.characterId === characterId,
    [characterId]
  );

  const setPlaying = (value) => {
    playingRef.current = value;
    setIsPlaying(value);
  };

  const clearPending = () => {
    tokenRef.current += 1;
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    tts.cancel();
    setOverlay(false);
  };

  const stopPlayback = useCallback(() => {
    clearPending();
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playBeep = () => {
    if (!engineRef.current.bip || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  };

  // Play line i, then advance until the end of the scene.
  const playAt = (i) => {
    clearPending();
    const token = tokenRef.current;
    const { lines, characterId, muet } = engineRef.current;
    const line = lines[i];
    if (!line) {
      setPlaying(false);
      return;
    }
    setIndex(i);

    const mine = characterId !== "" && line.characterId === characterId;
    const advance = () => {
      if (token !== tokenRef.current || !playingRef.current) return;
      if (i + 1 >= engineRef.current.lines.length) {
        setOverlay(false);
        setPlaying(false);
      } else {
        playAt(i + 1);
      }
    };
    // Advance after a short breath (speech synthesis: cf. TTS_GAP_MS).
    const advanceAfterGap = () => {
      if (token !== tokenRef.current || !playingRef.current) return;
      waitTimerRef.current = setTimeout(advance, TTS_GAP_MS);
    };

    if (mine && muet) {
      // The actor speaks this line: silence + beep + overlay, then a
      // time-based auto-advance (~80 ms per character, 3 s minimum) like v1.
      setOverlay(true);
      playBeep();
      const waitTime = Math.max(3000, line.text.length * 80);
      waitTimerRef.current = setTimeout(() => {
        setOverlay(false);
        advance();
      }, waitTime);
      return;
    }

    setOverlay(false);
    if (mine) playBeep();

    if (line.status === "ok" && line.clip) {
      const audio = audioRef.current;
      audio.src = line.clip;
      audio.onended = advance;
      audio.onerror = () => {
        // Missing/broken mp3: degrade gracefully to TTS.
        if (token === tokenRef.current) tts.speak(line.text, advanceAfterGap);
      };
      audio.play().catch(() => {
        if (token === tokenRef.current) tts.speak(line.text, advanceAfterGap);
      });
    } else {
      tts.speak(line.text, advanceAfterGap);
    }
  };

  const togglePlay = () => {
    if (playingRef.current) {
      stopPlayback();
    } else {
      // AudioContext must be created inside a user gesture (mobile autoplay).
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      // Same for the speech synthesiser: prime it inside the gesture so that the
      // TTS lines started later from a callback do not stay silent.
      tts.unlock();
      setPlaying(true);
      playAt(index);
    }
  };

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(i, lines.length - 1));
    if (playingRef.current) playAt(clamped);
    else {
      clearPending();
      setIndex(clamped);
    }
  };

  // Indices of my lines in the current scene (single scan, reused by the
  // jump targets and the (n/total) numbering).
  const myLineIndices = useMemo(() => {
    if (characterId === "") return [];
    return lines.map((l, i) => (l.characterId === characterId ? i : -1)).filter((i) => i !== -1);
  }, [lines, characterId]);

  // "Name (n/total)" on my cards: numbering shared with the Recording page.
  const myNumbers = useMemo(() => myLineNumbers(lines, characterId), [lines, characterId]);

  // "My lines" jump targets: with "Avant" checked, land on the cue line
  // just before each of my lines instead of on the line itself.
  const myTargets = useMemo(() => {
    if (!avant) return myLineIndices;
    return [...new Set(myLineIndices.map((i) => Math.max(0, i - 1)))].sort((a, b) => a - b);
  }, [myLineIndices, avant]);

  const goToPrevMy = () => {
    const target = [...myTargets].reverse().find((t) => t < index);
    if (target !== undefined) goTo(target);
  };
  const goToNextMy = () => {
    const target = myTargets.find((t) => t > index);
    if (target !== undefined) goTo(target);
  };

  // Selecting another act/scene stops playback and rewinds.
  const changeAct = (i) => {
    stopPlayback();
    setActIndex(i);
    setSceneIndex(0);
    setIndex(0);
  };
  const changeScene = (i) => {
    stopPlayback();
    setSceneIndex(i);
    setIndex(0);
  };

  // Choosing a character can hide the scene one is standing in. Left alone, the
  // `<select>` would carry a value no option holds, which a browser renders as a
  // blank field: we move to the first scene the menu still offers. Through
  // `changeScene`, so that playback stops and the position rewinds exactly as if
  // the reader had picked that scene themselves.
  useEffect(() => {
    if (choices.length > 0 && !choices.includes(sceneIndex)) changeScene(choices[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, sceneIndex]);

  useScrollToActiveCard(listRef, [index, actIndex, sceneIndex]);

  useEffect(() => () => clearPending(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return <PageState page="rehearsal" error={loadError} />;
  }
  if (!manifest) {
    return <PageState page="rehearsal" />;
  }
  // A final screen, the site's third one: one stays on it until the coordinator enters
  // the play, nothing more will load on this device. It comes after the manifest,
  // so it knows the title and says it, like the five headers. The two states above,
  // on the other hand, name nothing: the play is not known yet, and `PageHeader`
  // renders no title when there is no title (never a page label in its place, it
  // would get covered).
  if (lines.length === 0 && acts.every((a) => a.scenes.every((s) => s.lines.length === 0))) {
    return (
      <PageState
        page="rehearsal"
        title={manifest.title || t("common.untitledPlay")}
        error={t("rehearsal.emptyPlay", { page: t(pageLabelKey("editor")) })}
      />
    );
  }

  return (
    <div className="rehearsal-page">
      {/* No `hint` here: the four checkboxes just below carry explicit labels, and
          a sentence repeating them only served to push the settings further
          down. */}
      <PlayHeader page="rehearsal" title={manifest.title || t("common.untitledPlay")}>
        <div className="selects-row">
          <select
            aria-label={t("common.actSelect")}
            value={actIndex}
            onChange={(e) => changeAct(Number(e.target.value))}
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
            onChange={(e) => changeScene(Number(e.target.value))}
          >
            {choices.map((i) => {
              const count =
                characterId === ""
                  ? null
                  : scenes[i].lines.filter((l) => l.characterId === characterId).length;
              return (
                // The value is the scene's rank in the ACT, not its rank in this
                // list: the menu hides scenes, it never renumbers them.
                <option key={i} value={i}>
                  {sceneLabel(t, i)}
                  {/* The count is interpolated into `common.optionNote`, the
                      brackets shared with the Recording menus: the plural is
                      settled in one place only and the punctuation in another.
                      A count and NOT the Recording page's "aucune réplique": this
                      menu answers how many lines you have in a scene, so zero
                      belongs to the same series as three ("0 réplique", "3
                      répliques"), where over there the suffix reports work left
                      and has to tell "nothing to do" from "nothing to do it on".
                      Two questions, two wordings, deliberately. */}
                  {count != null
                    ? t("common.optionNote", { note: t("common.lineCount", { count }) })
                    : ""}
                </option>
              );
            })}
          </select>
        </div>
        <div className="character-row">
          <select
            className="character-select"
            aria-label={t("common.myCharacter")}
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            <option value="">{t("common.whoDoYouPlay")}</option>
            {manifest.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="checks-row">
            <label title={t("rehearsal.mute.tip")}>
              <input type="checkbox" checked={muet} onChange={(e) => setMuet(e.target.checked)} />
              {t("rehearsal.mute")}
            </label>
            <label title={t("rehearsal.hideText.tip")}>
              <input
                type="checkbox"
                checked={hideText}
                onChange={(e) => setHideText(e.target.checked)}
              />
              {t("rehearsal.hideText")}
            </label>
            <label title={t("rehearsal.beep.tip")}>
              <input type="checkbox" checked={bip} onChange={(e) => setBip(e.target.checked)} />
              {t("rehearsal.beep")}
            </label>
            <label title={t("rehearsal.cueEarly.tip")}>
              <input type="checkbox" checked={avant} onChange={(e) => setAvant(e.target.checked)} />
              {t("rehearsal.cueEarly")}
            </label>
          </div>
        </div>
      </PlayHeader>

      <main className="dialogue-container" ref={listRef}>
        {lines.map((line, i) => {
          const mine = isMine(line);
          return (
            <div
              key={line.id}
              className={[
                "dialogue-card",
                i === index ? "active" : "",
                mine ? "mine muted" : "",
                mine && hideText ? "hide-text" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => goTo(i)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goTo(i);
                }
              }}
            >
              <div className="dialogue-meta">
                <span className="dialogue-character">
                  {line.character}
                  {myLineNumber(t, myNumbers, line.id)}
                </span>
                {line.status !== "ok" && (
                  <span className="tts-hint" title={t("rehearsal.tts.tip")}>
                    <SparkleIcon /> {t("rehearsal.tts")}
                  </span>
                )}
              </div>
              <p className="dialogue-text">{line.text}</p>
            </div>
          );
        })}
      </main>

      {overlay && (
        <div className="wait-indicator" role="status">
          <span>{t("rehearsal.yourTurn")}</span>
        </div>
      )}

      <div className="controls">
        <ProgressBar value={index} count={lines.length} onSeek={goTo} />
        <div className="buttons-row">
          {characterId !== "" && (
            <button className="ctrl-btn my-jump" title={t("common.prevMyLine")} onClick={goToPrevMy}>
              <SkipPrevIcon />
            </button>
          )}
          <button
            className="ctrl-btn"
            title={t("rehearsal.prevLine")}
            onClick={() => goTo(index - 1)}
          >
            <PrevIcon />
          </button>
          <button
            className={`ctrl-btn play${isPlaying ? " is-playing" : ""}`}
            title={t("rehearsal.playPause")}
            onClick={togglePlay}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="ctrl-btn"
            title={t("rehearsal.nextLine")}
            onClick={() => goTo(index + 1)}
          >
            <NextIcon />
          </button>
          {characterId !== "" && (
            <button className="ctrl-btn my-jump" title={t("common.nextMyLine")} onClick={goToNextMy}>
              <SkipNextIcon />
            </button>
          )}
        </div>
      </div>

      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
