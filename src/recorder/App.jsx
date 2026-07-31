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
//              ("already recorded" only becomes true once the respo has merged
//              the ZIP and the site was republished);
//  - "done"  : up-to-date published clip (manifest only).
// Les codes d'erreur que `useRecorder` peut rendre, et leur phrase. Le hook est
// couvert par `node --test`, donc il ne peut pas importer `locale.js` (qui lit
// l'URL, le stockage et le navigateur dès son import) : il rend un code, la page
// le met en mots. Le nom en `_KEY` est aussi ce qui fait relever ces clés par le
// garde de scripts/tests/test_contracts.py.
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

  // Jeter une prise de la séance : la réplique reprend l'état qu'elle avait
  // avant (« Déjà enregistrée » si un clip publié est à jour, sinon « À
  // enregistrer »). Ne concerne QUE les prises en mémoire : un clip déjà
  // publié ne se supprime pas depuis le navigateur, il vit dans le dépôt.
  const deleteTake = (line) => {
    setTakes((prev) => {
      const take = prev[line.id];
      if (!take) return prev;
      if (take.url) URL.revokeObjectURL(take.url);
      const { [line.id]: _dropped, ...rest } = prev;
      return rest;
    });
    // Comme après avoir refait une prise : le ZIP déjà téléchargé ne décrit
    // plus la séance (il contient encore celle qu'on vient de jeter), donc il
    // est à refaire. Si c'était la dernière prise, il ne reste rien à
    // télécharger et l'avertissement ne s'affiche pas (takenCount === 0).
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
    // `play` nomme la pièce dont ces voix sortent. Il ne sert PAS à router le
    // dépôt : c'est le dossier `uploads/<id>/` où le respo pose le fichier qui le
    // fait, sans quoi un ZIP abîmé (illisible, donc sans identifiant lisible non
    // plus) n'aurait aucun journal où se dire. Il sert à le VÉRIFIER, et c'est ce
    // qui fait refuser un ZIP déposé dans la zone d'une autre pièce avec un motif
    // lisible, au lieu d'écrire les voix d'une pièce par-dessus une autre.
    // Vide sur une pièce dont le script n'a pas encore d'identifiant : l'Action
    // traite alors le ZIP sans rien vérifier, comme les ZIP d'avant ce champ.
    zip.file("manifest.json", JSON.stringify({ play: manifest.id, clips }, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    // One session may record several characters: name the file after all of
    // them (readability only, the pipeline works from line ids).
    const characterOfLine = new Map(manifest.lines.map((l) => [l.id, l.characterId]));
    const recordedIds = new Set(Object.keys(takes).map((id) => characterOfLine.get(id)));
    const names = manifest.characters
      .filter((c) => recordedIds.has(c.id))
      .map((c) => slugify(c.name, t("recorder.characterSlug")));
    // Le NOM du fichier suit la locale du lecteur, comme le reste : l'Action ne
    // le lit jamais (le type vient de l'extension, les clips de leur id), donc
    // le contrat du ZIP n'en dépend pas.
    const stem = t("recorder.zipName", { names: names.join("-") || t("recorder.zipFallback") });
    downloadBlob(blob, `${stem}.zip`);
    // Line statuses do NOT change: a take stays `recorder.status.fresh` until
    // the respo has merged the ZIP and the site was republished; only the
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

  // Écran définitif (le navigateur n'enregistrera pas), et pas une attente :
  // il nomme donc la pièce comme le bandeau de la page, ce qu'il peut faire
  // puisqu'il vient après le chargement du manifest. Les deux états au-dessus, eux,
  // ne nomment rien du tout : la pièce n'est pas encore connue, et `PageHeader` ne
  // rend pas de titre sans titre (jamais un libellé de page à la place, il se
  // ferait recouvrir par le titre une fraction de seconde plus tard).
  if (!supported) {
    return (
      <PageState
        page="recorder"
        title={manifest.title || t("common.untitledPlay")}
        error={t("recorder.unsupported")}
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
      {/* Le mode d'emploi n'est passé qu'une fois le personnage choisi : avant,
          il vit dans l'encart d'accueil, à la place des répliques (pas de
          doublon). La phrase compacte du bandeau, elle, reste toujours là. */}
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
        {/* Le hook rend un CODE (cf. useRecorder.js, couvert par `node --test`) :
            la phrase se compose ici, et elle se compose depuis le code REÇU. Le
            rendre tel quel plutôt que d'afficher l'unique message d'aujourd'hui
            est ce qui rend le seam réel : un second code afficherait sinon
            l'erreur de micro. Repli sur ce même message si le code est inconnu,
            une page sans phrase valant moins qu'une phrase approximative. */}
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
        {/* Ce message vit dans le bandeau (et pas dans la liste) parce que le
            bandeau est sticky : il reste sous les yeux pendant qu'on parcourt
            les répliques des autres personnages. Il prend la place de la
            légende des statuts, les deux étant exclusifs. */}
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
                  // Seule une prise de la séance se supprime (le lecteur sert
                  // aussi à réécouter un clip publié, qui n'est pas à nous).
                  onDelete={take ? () => deleteTake(line) : null}
                  deleteDisabled={isRecording}
                />
              )}
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
              <span className="rec-live-label">{t("recorder.recordingLabel")}</span>
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
          {/* Les QUATRE boutons de cette rangée portent leur infobulle sur une
              enveloppe `.btn-tip` (theme.css) et jamais sur eux-mêmes, pour la
              raison qui l'a fait naître dans l'Édition : un contrôle `disabled`
              ne reçoit aucun événement souris (Chrome, Safari), donc son propre
              `title` ne s'affiche pas, et l'explication n'arrive jamais au moment
              où elle sert. Ici les quatre s'éteignent (pendant une prise, en bout
              de course, sans réplique choisie, sans prise à exporter), et le
              bouton de téléchargement est en icône seule : sans cette enveloppe,
              un utilisateur souris n'avait aucun moyen d'apprendre ce qu'il fait.
              Le nom accessible, lui, reste sur le bouton : c'est l'`aria-label`,
              qui ne dépend pas de son état. */}
          <div className="buttons-row">
            <span className="controls-side">
              {myLines.length > 0 && (
                <span className="line-counter">
                  {t("recorder.lineCounter", { n: safeMyIndex + 1, total: myLines.length })}
                </span>
              )}
            </span>
            {/* Ces flèches ne parcourent QUE mes répliques : même design que
                les sauts « ma réplique » de la page Répétition (.my-jump). */}
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
        {/* Le nombre de prises a quitté la phrase : le pluriel ne règle plus que
            l'accord (cf. `recorder.leaveBody`). */}
        <p>{t("recorder.leaveBody", { count: takenCount })}</p>
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
      <h2 className="intro-title">{t("common.whoDoYouPlay")}</h2>
      {/* Le mot en gras est un PARAMÈTRE et pas un fragment de JSX : découper la
          phrase autour du <strong> y figerait l'ordre des mots français. */}
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
    // La couleur du tracé vient de la propriété `color` du canvas, que
    // recorder.css pose à `var(--accent)`. Lue sur l'ÉLÉMENT et pas comme variable
    // sur `:root` : `color` est une propriété héritée et toujours résolue, donc il
    // n'y a plus de repli à écrire, là où la lecture de `--accent` en demandait un
    // et remettait le bordeaux de la marque en dur dans le JS avec un « à garder
    // synchrone ». Un canvas n'hérite pas d'une couleur de tracé, mais il hérite
    // bien de `color`.
    const accent = getComputedStyle(canvas).color;
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

// « m:ss », le format universel d'un extrait court : il s'écrit pareil dans les
// deux langues du site, et `Intl` n'expose pas de formateur de durée partout
// (`Intl.DurationFormat` est trop récent pour les navigateurs d'une troupe). Ce
// qui est du texte d'interface ici, c'est ce qui JOINT l'écoulé et le total, et
// c'est passé au catalogue (`recorder.player.time`). Une prise ne dépassant pas
// quelques minutes, il n'y a pas non plus de séparateur de milliers à grouper.
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
        title={playing ? t("recorder.player.pause") : t("recorder.player.play")}
        onClick={() => {
          const audio = audioRef.current;
          if (audio.paused) audio.play();
          else audio.pause();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      {/* Les deux durées arrivent composées en « m:ss » (cf. formatTime) ; ce qui
          les JOINT vient du catalogue, ça n'a pas à être un « / » écrit ici. */}
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
          {/* Rien de plus que la citation, comme la suppression de réplique de
              l'éditeur : le titre dit le geste, la citation dit sur quoi. */}
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
