import React, { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import PageState from "../shared/PageState.jsx";
import { fetchScript, downloadBlob, HttpError } from "../shared/data.js";
import { EMPTY_SCRIPT, allLines, newId } from "./reducer.js";
import { historyReducer, initHistory } from "./history.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageMark from "../shared/PageMark.jsx";
import { PAGES } from "../shared/pages.js";
import { DownloadIcon, UndoIcon, RedoIcon, WarnIcon } from "../shared/icons.jsx";
import CharacterChips from "./CharacterPanel.jsx";
import SceneEditor from "./SceneEditor.jsx";
import EditableTitle from "./EditableTitle.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import LeaveGuard from "../shared/LeaveGuard.jsx";
import useTouchPointer from "./useTouchPointer.js";
import "./editor.css";

export default function App() {
  // scriptReducer wrapped in an undo stack (see history.js): `script` is the
  // present state, `past` the previous ones, `saved` the one that matches the
  // last downloaded script.json.
  const [{ present: script, past, future, saved }, dispatch] = useReducer(
    historyReducer,
    EMPTY_SCRIPT,
    initHistory
  );
  const [loading, setLoading] = useState(true);
  const [loadInfo, setLoadInfo] = useState("");
  // Blocking error: the published script EXISTS but could not be read.
  // Starting empty here would let the respo overwrite the real play.
  const [loadError, setLoadError] = useState(null);
  // Line id whose textarea should grab focus (set right after ADD_LINE).
  const [focusLineId, setFocusLineId] = useState(null);
  // Pending character deletion needing a decision (has lines).
  const [deleteRequest, setDeleteRequest] = useState(null);
  // Pending act deletion awaiting confirmation.
  const [confirmDeleteAct, setConfirmDeleteAct] = useState(false);
  // Is there anything to download? A state comparison, not a flag raised by
  // the first edit: undoing back to the last downloaded state (or to the
  // loaded script, when nothing was downloaded yet) leaves nothing to save.
  // Identity is enough, the stack stores the very objects it restores.
  const dirty = script !== saved;

  // Page réservée à l'ordinateur (cf. useTouchPointer) : au doigt, elle rend un
  // écran d'explication à la place de l'éditeur.
  const touchOnly = useTouchPointer();

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  // Ctrl+Z / Ctrl+Y (and Cmd+Z / Cmd+Shift+Z on Mac) anywhere, including
  // inside a textarea: the browser's own undo would only rewind that one
  // field, out of sync with our stack. When there is nothing to undo or redo
  // we let the key through, so the native undo of a field still works.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.altKey) return;
      const key = e.key.toLowerCase();
      const wantsRedo = key === "y" || (key === "z" && e.shiftKey);
      const wantsUndo = key === "z" && !e.shiftKey;
      if (wantsRedo && canRedo) {
        e.preventDefault();
        redo();
      } else if (wantsUndo && canUndo) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // "Reprise" mode: load the published script.json to continue editing it.
  // Chargé même quand la page est murée (écran tactile), et pas pour rien : le
  // bandeau de cet écran nomme la pièce comme les quatre autres bandeaux du
  // site. Sauter le fetch était une économie de rien du tout (un JSON, sur une
  // page qui n'affiche ensuite qu'une phrase) payée par la seule rangée du haut
  // du site à écrire « Édition » au lieu du titre de la pièce.
  useEffect(() => {
    let cancelled = false;
    fetchScript()
      .then((raw) => {
        if (cancelled) return;
        dispatch({ type: "LOAD_SCRIPT", script: raw });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 404) {
          // Genuinely no published script yet: legitimate empty start.
          setLoadInfo("Aucun script publié trouvé : vous partez d'une pièce vide.");
        } else {
          setLoadError(
            "Le script publié existe mais n'a pas pu être lu (fichier abîmé ou problème réseau). " +
              "Pour ne pas risquer d'écraser votre pièce, l'éditeur est désactivé. " +
              "Rechargez la page pour réessayer ; si l'erreur persiste, le fichier data/script.json " +
              "du dépôt est probablement abîmé ; sur GitHub, ouvrez l'historique du fichier, choisissez une " +
              "version antérieure et affichez-la en version brute, puis redéposez-la avant de continuer."
          );
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(script, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "script.json");
    dispatch({ type: "MARK_SAVED" });
  }, [script, dispatch]);

  // Insert a new line and focus it: the UUID is minted here (not in the
  // reducer, which must stay pure) so we know which textarea to focus.
  // The default character (same speaker as the previous line) is computed
  // by the reducer.
  const addLine = useCallback(
    (actIndex, sceneIndex, afterLineId) => {
      const id = newId();
      dispatch({ type: "ADD_LINE", id, actIndex, sceneIndex, afterLineId });
      setFocusLineId(id);
    },
    [dispatch]
  );

  // Stable identity: LineRow uses it in an effect dependency list.
  const handleFocusHandled = useCallback(() => setFocusLineId(null), []);

  // One scene edited at a time, picked in the banner (same navigation as
  // the rehearsal page). Indices are clamped so a deletion can never leave
  // them dangling.
  const [actIndex, setActIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const safeActIndex = Math.max(0, Math.min(actIndex, script.acts.length - 1));
  const act = script.acts[safeActIndex] ?? null;
  const safeSceneIndex = Math.max(0, Math.min(sceneIndex, (act?.scenes.length ?? 1) - 1));
  const scene = act?.scenes[safeSceneIndex] ?? null;

  const goToScene = (ai, si) => {
    setActIndex(ai);
    setSceneIndex(si);
  };

  // ADD_ACT / ADD_SCENE append at the end: navigate straight to the new one.
  const addAct = () => {
    dispatch({ type: "ADD_ACT" });
    goToScene(script.acts.length, 0);
  };
  const addScene = () => {
    dispatch({ type: "ADD_SCENE", actIndex: safeActIndex });
    goToScene(safeActIndex, act.scenes.length);
  };
  const actLineCount = act ? act.scenes.reduce((n, s) => n + s.lines.length, 0) : 0;
  const doDeleteAct = () => {
    dispatch({ type: "DELETE_ACT", actIndex: safeActIndex });
    goToScene(Math.max(0, safeActIndex - 1), 0);
  };
  // An act that still holds lines is confirmed first (an empty one goes
  // silently).
  const deleteAct = () => (actLineCount === 0 ? doDeleteAct() : setConfirmDeleteAct(true));

  // One O(lines) pass instead of one full-script scan per character per render.
  const lineCounts = useMemo(() => {
    const counts = new Map();
    for (const line of allLines(script)) {
      if (line.characterId != null) {
        counts.set(line.characterId, (counts.get(line.characterId) ?? 0) + 1);
      }
    }
    return counts;
  }, [script]);

  const requestDeleteCharacter = useCallback(
    (character) => {
      const count = lineCounts.get(character.id) ?? 0;
      if (count === 0) {
        dispatch({ type: "DELETE_CHARACTER", id: character.id, mode: "deleteLines" });
      } else {
        setDeleteRequest({ character, count });
      }
    },
    [dispatch, lineCounts]
  );

  if (loading) {
    return <PageState page="editor" loading="Chargement du script…" />;
  }

  // Avant le reste des états chargés : sur un écran tactile la page ne montre
  // jamais l'éditeur, seulement pourquoi et où l'ouvrir. Elle nomme quand même
  // la pièce, comme les quatre bandeaux du site : c'est un écran définitif et
  // pas une attente. Il passe donc APRÈS le chargement (le titre n'arrive qu'avec
  // le script, et le bandeau ne dit rien tant qu'il ne le connaît pas) mais AVANT
  // l'erreur de lecture : un script illisible n'apprend rien à qui ne peut pas
  // éditer.
  if (touchOnly) {
    return (
      <PageState
        page="editor"
        title={script.title || "Pièce sans titre"}
        error={
          <>
            <WarnIcon />
            Pour des raisons de praticité, le mode Édition n'est disponible que depuis un
            ordinateur.
          </>
        }
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        page="editor"
        error={
          <>
            <WarnIcon />
            {loadError}
          </>
        }
        className="load-error"
      />
    );
  }

  return (
    <>
      <PlayHeader
        page="editor"
        title={script.title || "Pièce sans titre"}
        hint={
          <>
            {/* Impératif en tête, comme les quatre `desc` et l'autre `hint`
                (cf. pages.js). Et pas d'« appuyez sur le bouton » : c'est le
                verbe du doigt, et c'est la seule page qu'il n'ouvre pas
                (cf. useTouchPointer.js). */}
            Téléchargez le script avec le bouton en haut de la page quand vos modifications sont
            terminées, puis déposez le fichier obtenu sur la page{" "}
            {/* Le sceau vert de l'Avancement plutôt qu'un mot souligné : la
                destination est une page du site, que la troupe reconnaît à sa
                pastille (accueil, bandeaux, journal des dépôts), et un
                hyperlien classique au milieu d'une phrase de doc y faisait la
                seule chose soulignée de tout le bandeau. Le mot reste dans le
                lien : c'est lui qui nomme la page, le sceau est décoratif. */}
            <a className="hint-page-link page-dashboard" href={PAGES.dashboard.href}>
              <PageMark page="dashboard" className="hint-page-mark" label="" />
              {PAGES.dashboard.label}
            </a>{" "}
            comme pour les voix des acteurs. Dans une réplique, <strong>Entrée</strong> crée la
            suivante, <strong>Maj + Entrée</strong> un retour à la ligne.
          </>
        }
        actions={
          <>
            {dirty && <span className="dirty-hint">Modifications non téléchargées</span>}
            {/* Les trois boutons de cette rangée s'éteignent, et chacun explique
                pourquoi dans son infobulle. Elle est donc portée par une enveloppe
                et jamais par le bouton : un contrôle `disabled` ne reçoit aucun
                événement souris, donc son `title` ne s'affiche pas (Chrome,
                Safari), et l'explication n'arrivait jamais au moment où elle est
                utile. Le nom accessible, lui, reste sur le bouton : c'est
                l'`aria-label`, qui ne change pas d'un état à l'autre (le nom d'un
                bouton ne dépend pas de son état, seule l'infobulle dit pourquoi
                il dort). */}
            <span className="history-group">
              <span
                className="btn-tip"
                title={
                  canUndo
                    ? "Annuler la dernière modification (Ctrl+Z)"
                    : "Rien à annuler pour l'instant"
                }
              >
                <button
                  className="btn icon"
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label="Annuler"
                >
                  <UndoIcon />
                </button>
              </span>
              <span
                className="btn-tip"
                title={
                  canRedo
                    ? "Rétablir la modification annulée (Ctrl+Y)"
                    : "Rien à rétablir pour l'instant"
                }
              >
                <button
                  className="btn icon"
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label="Rétablir"
                >
                  <RedoIcon />
                </button>
              </span>
            </span>
            {/* Icône seule : le bouton vit à côté de la paire annuler/rétablir,
                déjà sans mots, et son libellé écrit était le seul texte de la
                rangée à concurrencer le titre de la pièce sur une fenêtre
                étroite. Le verbe est porté par l'infobulle et l'aria-label, et
                la phrase de doc du bandeau dit à quoi sert le geste.
                Éteint quand il n'y a rien à télécharger (`dirty` est un
                comparatif d'états, pas un drapeau : annuler jusqu'au dernier
                téléchargement l'éteint aussi), comme les deux boutons
                d'historique à côté : redéposer le script tel qu'il est déjà
                publié n'apprend rien à l'Action, et un bouton toujours vif fait
                douter qu'il reste quelque chose à envoyer. Infobulle sur
                l'enveloppe, comme les deux autres, pour la même raison. */}
            <span
              className="btn-tip"
              title={
                dirty ? "Télécharger le script" : "Aucune modification à télécharger pour l'instant"
              }
            >
              <button
                className="btn primary icon script-download-btn"
                onClick={download}
                disabled={!dirty}
                aria-label="Télécharger le script"
              >
                <DownloadIcon />
              </button>
            </span>
          </>
        }
      >
        <input
          type="text"
          className="play-title-input"
          placeholder="Titre de la pièce"
          value={script.title}
          onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
          onBlur={() => dispatch({ type: "HISTORY_BREAK" })}
        />

        <div className="selects-row">
          <select
            aria-label="Acte"
            value={safeActIndex}
            onChange={(e) => goToScene(Number(e.target.value), 0)}
          >
            {script.acts.map((a, i) => (
              <option key={i} value={i}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Scène"
            value={safeSceneIndex}
            onChange={(e) => setSceneIndex(Number(e.target.value))}
          >
            {(act?.scenes ?? []).map((s, i) => (
              <option key={i} value={i}>
                {s.title} ({s.lines.length} réplique{s.lines.length > 1 ? "s" : ""})
              </option>
            ))}
          </select>
          <button className="btn small" onClick={addScene}>
            + Scène
          </button>
          <button className="btn small" onClick={addAct}>
            + Acte
          </button>
        </div>

        {/* The character select of the other pages becomes, here, the
            character MANAGEMENT. */}
        <CharacterChips
          characters={script.characters}
          lineCounts={lineCounts}
          dispatch={dispatch}
          onRequestDelete={requestDeleteCharacter}
        />

      </PlayHeader>

      <main className="editor-main">
        {loadInfo && <p className="load-info">{loadInfo}</p>}

        {act && (
            <div className="act-header">
              <EditableTitle
                value={act.title}
                className="act-title"
                onChange={(title) => dispatch({ type: "RENAME_ACT", actIndex: safeActIndex, title })}
              />
              {script.acts.length > 1 && (
                <button
                  className="btn icon small"
                  title="Supprimer cet acte"
                  aria-label="Supprimer cet acte"
                  onClick={deleteAct}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              )}
            </div>
          )}

          {scene && (
            <SceneEditor
              scene={scene}
              actIndex={safeActIndex}
              sceneIndex={safeSceneIndex}
              sceneCount={act.scenes.length}
              characters={script.characters}
              dispatch={dispatch}
              addLine={addLine}
              focusLineId={focusLineId}
              onFocusHandled={handleFocusHandled}
            />
          )}
      </main>

      {confirmDeleteAct && act && (
        <ConfirmModal
          title={`Supprimer « ${act.title} » ?`}
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDeleteAct(false)}
          onConfirm={() => {
            setConfirmDeleteAct(false);
            doDeleteAct();
          }}
        >
          <p>
            {actLineCount > 1
              ? `${actLineCount} répliques seront supprimées.`
              : "1 réplique sera supprimée."}
          </p>
        </ConfirmModal>
      )}

      <LeaveGuard
        active={dirty}
        title="Vous n'avez pas téléchargé le script"
        saveLabel="Télécharger puis quitter"
        onSave={download}
      >
        <p>
          Vos modifications ne vivent que dans cet onglet : en quittant la page sans télécharger le
          fichier <code>script.json</code>, vous les perdez.
        </p>
      </LeaveGuard>

      {deleteRequest && (
        <DeleteCharacterModal
          request={deleteRequest}
          characters={script.characters}
          onCancel={() => setDeleteRequest(null)}
          onConfirm={(mode, reassignTo) => {
            dispatch({ type: "DELETE_CHARACTER", id: deleteRequest.character.id, mode, reassignTo });
            setDeleteRequest(null);
          }}
        />
      )}
    </>
  );
}

// Guard against ghost data: a character that still owns lines cannot be
// silently removed — the user chooses to reassign or delete those lines.
//
// Bâti sur le ConfirmModal partagé, comme les confirmations de réplique, de
// scène et d'acte : il réimplémentait la même boîte à la main, et se
// distinguait donc en silence sur tout ce que ce composant apporte (Escape,
// focus initial, rendu en portail, role="dialog"). La réassignation est la
// sortie sûre, donc le `primaryLabel` ; supprimer les répliques est le geste
// destructif. Sans autre personnage à qui les donner, il ne reste que lui.
function DeleteCharacterModal({ request, characters, onCancel, onConfirm }) {
  const others = characters.filter((c) => c.id !== request.character.id);
  const [reassignTo, setReassignTo] = useState(others[0]?.id ?? null);

  return (
    <ConfirmModal
      title={`Supprimer « ${request.character.name} » ?`}
      confirmLabel="Supprimer ses répliques"
      onConfirm={() => onConfirm("deleteLines")}
      primaryLabel={others.length > 0 ? "Réassigner" : undefined}
      onPrimary={() => onConfirm("reassign", reassignTo)}
      onCancel={onCancel}
    >
      <p>
        Ce personnage a encore <strong>{request.count} réplique{request.count > 1 ? "s" : ""}</strong>.
        Que faut-il en faire ?
      </p>
      {others.length > 0 && (
        <label className="reassign-row">
          Réassigner à&nbsp;:
          <select value={reassignTo ?? ""} onChange={(e) => setReassignTo(e.target.value)}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </ConfirmModal>
  );
}
