import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import PageState from "../shared/PageState.jsx";
import useScrollToActiveCard from "../shared/useScrollToActiveCard.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import ProgressBar from "../shared/ProgressBar.jsx";
import LeaveGuard from "../shared/LeaveGuard.jsx";
import { downloadBlob, slugify, myLineNumbers } from "../shared/data.js";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  SkipPrevIcon,
  SkipNextIcon,
  DownloadIcon,
  MicIcon,
  WarnIcon,
} from "../shared/icons.jsx";
import useManifest from "../shared/useManifest.js";
import useRecorder, { extensionForMimeType } from "./useRecorder.js";
import "./recorder.css";

// Recording page, structured like the rehearsal page: same header (act /
// scene / character selects), same dialogue cards, same fixed bottom bar.
// The play button becomes a mic button that records the SELECTED line (one
// of MY lines only). Takes are kept across character switches, so one
// session can record several characters and export them in a single ZIP.
//
// Each of my lines is in one of three states (label in the card corner):
//  - "todo"  À enregistrer   : no take and no up-to-date published clip;
//  - "fresh" À télécharger   : take made THIS session — and it STAYS so
//                              after the ZIP download: "Déjà enregistrée"
//                              only becomes true once the respo has merged
//                              the ZIP and the site was republished;
//  - "done"  Déjà enregistrée: up-to-date published clip (manifest only).
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
  // « Nom (n/total) » sur mes cartes — numérotation partagée avec la page
  // Répétition.
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
          // RAW text captured at recording time — no normalization in the
          // browser (single implementation lives in the GitHub Action, which
          // normalizes both sides when comparing).
          text: line.text,
          url: URL.createObjectURL(blob),
        },
      };
    });
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
    // manifest.json is a bare {lineId: raw text} mapping — the audio member
    // is always named {lineId}.{ext}, so the Action finds it from the id.
    const clips = {};
    for (const [lineId, take] of Object.entries(takes)) {
      zip.file(`${lineId}.${take.ext}`, take.blob);
      clips[lineId] = take.text;
    }
    zip.file("manifest.json", JSON.stringify(clips, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    // One session may record several characters: name the file after all of
    // them (readability only, the pipeline works from line ids).
    const characterOfLine = new Map(manifest.lines.map((l) => [l.id, l.characterId]));
    const recordedIds = new Set(Object.keys(takes).map((id) => characterOfLine.get(id)));
    const names = manifest.characters.filter((c) => recordedIds.has(c.id)).map((c) => slugify(c.name));
    downloadBlob(blob, `voix-${names.join("-") || "prises"}.zip`);
    // Line statuses do NOT change: a take stays "À télécharger" until the
    // respo has merged the ZIP and the site was republished — only the
    // save-state note reacts here.
    setDownloaded(true);
    // Recording session is over: turn the mic-in-use indicator off.
    // (Recording again simply reopens the stream.)
    release();
  };

  if (loadError) {
    return <PageState page="recorder" title="Enregistrement" error={loadError} />;
  }

  if (!manifest) {
    return <PageState page="recorder" title="Enregistrement" />;
  }

  if (!supported) {
    return (
      <PageState
        page="recorder"
        title="Enregistrement"
        error="Votre navigateur ne permet pas d'enregistrer du son. Essayez avec une version récente de Chrome, Firefox ou Safari."
      />
    );
  }

  // Sans personnage choisi, la liste laisse la place à l'encart d'accueil.
  const visibleLines = characterId === "" ? [] : lines;

  // Sélectionne une de MES répliques (jamais en cours d'enregistrement).
  const selectLine = (line) => {
    if (!isRecording) setMyIndex(myLines.findIndex((l) => l.id === line.id));
  };

  return (
    <div className="recorder-page">
      <PlayHeader page="recorder" title={manifest.title || "Enregistrement"}>
        <div className="selects-row">
          <select
            aria-label="Acte"
            value={actIndex}
            disabled={isRecording}
            onChange={(e) => {
              setActIndex(Number(e.target.value));
              setSceneIndex(0);
            }}
          >
            {acts.map((a, i) => (
              <option key={i} value={i}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Scène"
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
                  {s.title}
                  {remaining != null ? ` (${remaining} à enregistrer)` : ""}
                </option>
              );
            })}
          </select>
        </div>
        <div className="character-row">
          <select
            className={`character-select ${characterId === "" ? "unset" : ""}`}
            aria-label="Mon personnage"
            value={characterId}
            disabled={isRecording}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            <option value="">Qui jouez-vous ?</option>
            {manifest.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {/* Tant qu'aucun personnage n'est choisi, le mode d'emploi vit dans
            l'encart d'accueil (à la place des répliques) : pas de doublon. */}
        {characterId !== "" && (
          <p className="header-hint">
            Placez-vous sur une de vos répliques, puis appuyez sur le micro en bas : il démarre
            aussitôt. Une réplique déjà faite peut être réécoutée et refaite. Vous pouvez changer de
            personnage pour enregistrer plusieurs voix dans le même fichier, à envoyer ensuite à
            votre responsable.
          </p>
        )}
        {micError && <p className="mic-error">{micError}</p>}
        {hasUnexported && (
          <p className="zip-note warn">
            <WarnIcon />
            Vos enregistrements ne sont PAS sauvegardés tant que vous n'avez pas téléchargé le
            fichier.
          </p>
        )}
        {downloaded && takenCount > 0 && (
          <p className="zip-note done">✓ Fichier téléchargé. Envoyez-le à votre responsable.</p>
        )}
        {/* Ce message vit dans le bandeau (et pas dans la liste) parce que le
            bandeau est sticky : il reste sous les yeux pendant qu'on parcourt
            les répliques des autres personnages. Il prend la place de la
            légende des statuts, les deux étant exclusifs. */}
        {characterId !== "" && myLines.length === 0 && (
          <p className="no-lines-note">Vous n'avez aucune réplique dans cette scène.</p>
        )}
        {characterId !== "" && myLines.length > 0 && (
          <div className="status-legend">
            <span>
              <span className="st-dot" /> À enregistrer
            </span>
            <span>
              <span className="st-pill done">✓</span> Déjà enregistrée
            </span>
            <span>
              <span className="st-pill fresh">↓</span> À télécharger
            </span>
          </div>
        )}
      </PlayHeader>

      <main className="dialogue-container" ref={listRef}>
        {/* Sans personnage, la page ne sert à rien (aucune réplique n'est
            « mienne », le micro reste désactivé) : on remplace la liste par
            un encart qui dit quoi faire, et qui fait faire. */}
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
              // Raccourci au pointeur seulement : pas de role="button" ni de
              // tabIndex ici. La carte contient déjà un vrai bouton (le lecteur
              // de prise), et un contrôle dans un contrôle n'est pas exposé
              // correctement aux technologies d'assistance. Le clavier a mieux
              // de toute façon : les flèches « ma réplique » de la barre basse
              // et le slider parcourent TOUTES mes répliques, là où tabuler de
              // carte en carte obligeait à traverser toute la scène pour
              // atteindre les commandes.
              onClick={mine ? () => selectLine(line) : undefined}
            >
              <div className="dialogue-meta">
                <span className="dialogue-character">
                  {line.character}
                  {mine ? ` (${myNumbers.get(line.id)}/${myNumbers.size})` : ""}
                </span>
                {active && isRecording ? (
                  <span className="rec-status live">
                    <span className="rec-live-dot" />
                    Enregistrement…
                  </span>
                ) : (
                  state && (
                    <span className={`rec-status ${state}`}>
                      {state === "todo" ? (
                        <span className="st-dot" />
                      ) : (
                        <span className={`st-pill ${state}`}>{state === "fresh" ? "↓" : "✓"}</span>
                      )}
                      {state === "todo"
                        ? "À enregistrer"
                        : state === "fresh"
                          ? "À télécharger"
                          : "Déjà enregistrée"}
                    </span>
                  )
                )}
              </div>
              <p className="dialogue-text">{line.text}</p>
              {playerSrc && <TakePlayer src={playerSrc} seed={line.id} fresh={state === "fresh"} />}
            </div>
          );
        })}
      </main>

      {/* Barre de contrôle masquée tant qu'aucun personnage n'est choisi :
          elle n'offrirait qu'un micro et un téléchargement désactivés. */}
      {characterId !== "" && (
        <div className="controls">
          {isRecording && (
            <div className="rec-live-panel" role="status">
              <span className="rec-live-dot" />
              <span className="rec-live-label">Enregistrement</span>
              <LiveWaveform analyser={analyser} />
              {/* aria-hidden : role="status" annonce « Enregistrement » une fois ;
                  le chrono qui tourne ne doit pas être ré-énoncé chaque seconde. */}
              <span className="rec-live-time" aria-hidden="true">{formatTime(elapsed)}</span>
            </div>
          )}
          <ProgressBar
            value={safeMyIndex}
            count={myLines.length}
            disabled={isRecording}
            onSeek={setMyIndex}
          />
          <div className="buttons-row">
            <span className="controls-side">
              {myLines.length > 0 && (
                <span className="line-counter">
                  {safeMyIndex + 1}/{myLines.length}
                </span>
              )}
            </span>
            {/* Ces flèches ne parcourent QUE mes répliques : même design que
                les sauts « ma réplique » de la page Répétition (.my-jump). */}
            <button
              className="ctrl-btn my-jump"
              title="Ma réplique précédente"
              disabled={isRecording || safeMyIndex <= 0}
              onClick={() => setMyIndex(safeMyIndex - 1)}
            >
              <SkipPrevIcon />
            </button>
            <button
              className={`ctrl-btn play mic ${isRecording ? "stop" : ""}`}
              title={
                isRecording
                  ? "Terminer l'enregistrement"
                  : "Enregistrer cette réplique (le micro démarre aussitôt)"
              }
              disabled={!currentLine}
              onClick={toggleRecord}
            >
              {isRecording ? <StopIcon /> : <MicIcon />}
            </button>
            <button
              className="ctrl-btn my-jump"
              title="Ma réplique suivante"
              disabled={isRecording || safeMyIndex >= myLines.length - 1}
              onClick={() => setMyIndex(safeMyIndex + 1)}
            >
              <SkipNextIcon />
            </button>
            <span className="controls-side right">
              <button
                className="btn primary download-btn"
                title="Télécharger le ZIP des prises"
                aria-label={`Télécharger le ZIP des prises (${takenCount})`}
                disabled={takenCount === 0}
                onClick={downloadZip}
              >
                <DownloadIcon /> ({takenCount})
              </button>
            </span>
          </div>
        </div>
      )}

      <LeaveGuard
        active={hasUnexported}
        title="Vos prises ne sont pas téléchargées"
        saveLabel="Télécharger le ZIP puis quitter"
        onSave={downloadZip}
      >
        <p>
          {takenCount > 1
            ? `Vos ${takenCount} prises ne vivent que dans cet onglet`
            : "Votre prise ne vit que dans cet onglet"}{" "}
          : en quittant la page sans télécharger le ZIP, vous devrez tout réenregistrer.
        </p>
      </LeaveGuard>
    </div>
  );
}

// Encart d'accueil, à la place des répliques tant qu'aucun personnage n'est
// choisi : le mode d'emploi de la page, puis les personnages en boutons (le
// select du bandeau seul se lisait comme une page bloquée). Le compteur « à
// enregistrer » aide chacun à se reconnaître et montre le travail restant.
function IntroCard({ characters, lines, isTodo, onPick }) {
  const stats = characters.map((c) => {
    const own = lines.filter((l) => l.characterId === c.id);
    return { character: c, total: own.length, todo: own.filter(isTodo).length };
  });
  return (
    <div className="intro-card card">
      <h2 className="intro-title">Qui jouez-vous&nbsp;?</h2>
      <p className="intro-lead">
        Choisissez votre personnage : la page mettra alors <strong>vos</strong> répliques en avant.
      </p>
      <ol className="intro-steps">
        <li>Placez-vous sur une de vos répliques et appuyez sur le micro : il démarre aussitôt.</li>
        <li>Réécoutez, refaites la prise si besoin, puis passez à la suivante.</li>
      </ol>
      <p className="intro-outro">
        Quand vous avez terminé (un ou plusieurs personnages, ou même seulement une partie de vos
        répliques), appuyez sur le bouton{" "}
        <span className="intro-dl">
          <DownloadIcon />
        </span>{" "}
        pour sauvegarder vos prises et les
        transmettre à la personne qui suit les enregistrements dans la troupe.
      </p>
      {stats.length === 0 ? (
        <p className="intro-empty">
          Aucun personnage pour l'instant : la pièce doit d'abord être saisie dans la page Édition.
        </p>
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
                <span className="intro-character-count">aucune réplique</span>
              ) : todo === 0 ? (
                <span className="intro-character-count done">
                  <span className="st-pill done">✓</span> tout est enregistré
                </span>
              ) : (
                <span className="intro-character-count todo">
                  <span className="st-dot" /> {todo} à enregistrer
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
// recorder's AnalyserNode only — never the stream. Colour = theme accent.
const BAR_W = 3; // largeur d'une barre (px CSS)
const BAR_GAP = 2; // espace entre barres (px CSS)
const SAMPLE_MS = 55; // cadence d'ajout d'une barre → vitesse de « construction »

function LiveWaveform({ analyser }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // Résolution physique = taille CSS × densité (net sur écrans HiDPI).
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 26;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // Repli si --accent ne résout pas (jamais en pratique) : miroir du token
    // --accent de theme.css, à garder synchrone.
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8b2635";
    const slot = (BAR_W + BAR_GAP) * dpr;
    const barW = BAR_W * dpr;
    const capacity = Math.floor(canvas.width / slot);

    // Historique des niveaux (0..1), le plus récent en fin de tableau.
    const levels = [];

    const drawBars = () => {
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = accent;
      // Barres alignées à gauche : ça se remplit progressivement, puis défile.
      for (let i = 0; i < levels.length; i++) {
        const bh = Math.max(barW, levels[i] * (h * 0.9));
        const x = i * slot;
        // Barre centrée verticalement (miroir), coins arrondis.
        ctx.beginPath();
        const r = barW / 2;
        ctx.roundRect(x, mid - bh / 2, barW, bh, r);
        ctx.fill();
      }
    };

    // Pas d'analyseur (Web Audio absent) : ligne de repos discrète, figée.
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
      // Niveau RMS de la fenêtre courante (128 = silence).
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Gain + plafond : une voix normale remplit bien la hauteur.
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
  if (!ctx) throw new Error("Web Audio indisponible");
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

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// In-card audio player: round play button + elapsed/total + waveform.
// `fresh` switches the vivid-green palette ("À télécharger") vs the greyed
// green of already-recorded lines.
function TakePlayer({ src, seed, fresh }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fallback = useMemo(() => waveHeights(seed), [seed]);
  // Real peaks decoded from the audio; falls back to the decorative bars while
  // decoding or if decode fails.
  const [peaks, setPeaks] = useState(null);
  const bars = peaks ?? fallback;
  // Fraction lue (0..1) : colore l'onde jusqu'à la tête de lecture.
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
        title={playing ? "Pause" : "Écouter"}
        onClick={() => {
          const audio = audioRef.current;
          if (audio.paused) audio.play();
          else audio.pause();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="player-time">
        {formatTime(time)} / {formatTime(duration)}
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
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setTime(0)}
        // Take replaced (src swapped): reset the stale elapsed time and the
        // play state — no pause event is guaranteed on a source change.
        onEmptied={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          // Chrome quirk: MediaRecorder blobs report an Infinity duration
          // until seeked past the end — force it, then rewind.
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
