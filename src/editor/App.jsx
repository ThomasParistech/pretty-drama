import React, { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import PageState from "../shared/PageState.jsx";
import { fetchScript, downloadBlob, HttpError } from "../shared/data.js";
import { EMPTY_SCRIPT, allLines, newId, indexAfterMove, indexAfterRemoval } from "./reducer.js";
import { historyReducer, initHistory } from "./history.js";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageMark from "../shared/PageMark.jsx";
import { PAGES } from "../shared/pages.js";
import { DownloadIcon, UndoIcon, RedoIcon, WarnIcon } from "../shared/icons.jsx";
import CharacterPanel from "./CharacterPanel.jsx";
import EditorRail from "./EditorRail.jsx";
import SearchPanel from "./SearchPanel.jsx";
import useSearch from "./useSearch.js";
import StructurePanel from "./StructurePanel.jsx";
import SceneEditor from "./SceneEditor.jsx";
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
  // Demande de focus et/ou de sélection adressée à UNE réplique, effacée dès
  // qu'elle est honorée : `{ lineId, selection: [start, end] | null, focus }`.
  // Généralise le `focusLineId` d'origine (la réplique qu'on vient de créer
  // prend le curseur) : la recherche a besoin de sélectionner en plus, et parfois
  // SANS voler le focus. L'objet s'auto-effaçant, son identité suffit à
  // distinguer deux demandes successives sur la même réplique, donc pas de
  // numéro de série ici (contrairement au champ de recherche, cf. useSearch.js).
  const [focusRequest, setFocusRequest] = useState(null);
  // Pending character deletion needing a decision (has lines).
  const [deleteRequest, setDeleteRequest] = useState(null);
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
  // bandeau de cet écran nomme la pièce comme les cinq autres bandeaux du
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
      setFocusRequest({ lineId: id, selection: null, focus: true });
    },
    [dispatch]
  );

  // Stable identity: LineRow uses it in an effect dependency list.
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  // Une scène à la fois, désignée dans la section « Structure » du rail (elle
  // portait les deux selects du bandeau, cf. StructurePanel.jsx). Les indices
  // sont bornés au rendu, donc une suppression ne peut jamais en laisser un
  // pendre ; les gestes ci-dessous les remettent en plus là où il faut, pour que
  // la colonne de texte continue de montrer LA MÊME scène après un remaniement du
  // plan.
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
  // Un acte donné, et plus « l'acte courant » : le plan du rail ajoute la scène
  // là où on la lui demande.
  const addScene = (ai) => {
    dispatch({ type: "ADD_SCENE", actIndex: ai });
    goToScene(ai, script.acts[ai].scenes.length);
  };

  // Suppressions : la question a déjà été posée (le plan confirme quand l'objet
  // n'est pas vide, cf. StructurePanel), il ne reste que le déplacement du regard.
  const deleteAct = (ai) => {
    dispatch({ type: "DELETE_ACT", actIndex: ai });
    const nextAct = indexAfterRemoval(safeActIndex, ai);
    goToScene(nextAct, nextAct === safeActIndex ? safeSceneIndex : 0);
  };
  const deleteScene = (ai, si) => {
    dispatch({ type: "DELETE_SCENE", actIndex: ai, sceneIndex: si });
    if (ai === safeActIndex) setSceneIndex(indexAfterRemoval(safeSceneIndex, si));
  };

  // Réordonner : le regard suit l'objet déplacé, et se décale quand c'est un
  // voisin qui l'a traversé (indexAfterMove, testé à côté de MOVE_*).
  const moveAct = (from, to) => {
    dispatch({ type: "MOVE_ACT", from, to });
    setActIndex(indexAfterMove(safeActIndex, from, to));
  };
  const moveScene = (ai, from, to) => {
    dispatch({ type: "MOVE_SCENE", actIndex: ai, from, to });
    if (ai === safeActIndex) setSceneIndex(indexAfterMove(safeSceneIndex, from, to));
  };

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

  // Section ouverte du rail, ou null (replié). « Structure » à l'arrivée, et plus
  // « Personnages » : c'est elle qui porte maintenant la navigation de la page,
  // donc la refermer serait cacher le choix de la scène, que les deux selects du
  // bandeau affichaient d'office. Elle montre au passage le champ de titre de la
  // pièce, qui vivait aussi dans le bandeau. Une constante suffit, là où « ouvrir
  // sur Personnages seulement si la pièce n'en a aucun » demanderait un effet de
  // semis après le fetch.
  const [railSection, setRailSection] = useState("structure");
  const openSearch = useCallback(() => setRailSection("search"), []);
  const closeRail = useCallback(() => setRailSection(null), []);

  // Aller à une correspondance. Les quatre changements d'état vivent dans le
  // MÊME gestionnaire, donc React les regroupe en un seul rendu : la scène cible
  // y est déjà désignée, la rangée visée se monte avec sa demande de focus dans
  // le même commit, et l'effet tourne après, sur un textarea posé et mesuré. Ni
  // setTimeout ni requestAnimationFrame.
  const goToMatch = useCallback((match, focus) => {
    setActIndex(match.actIndex);
    setSceneIndex(match.sceneIndex);
    setFocusRequest({
      lineId: match.lineId,
      selection: [match.start, match.end],
      focus: Boolean(focus),
    });
  }, []);

  const search = useSearch({
    script,
    dispatch,
    goToMatch,
    isOpen: railSection !== null,
    onOpen: openSearch,
    onClose: closeRail,
    // Sur l'écran du mur tactile, Ctrl+F serait confisqué au navigateur pour une
    // page qui n'affiche qu'une phrase.
    enabled: !touchOnly && !loadError,
  });

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
  // la pièce, comme les cinq bandeaux du site : c'est un écran définitif et
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
    // Coquille de la hauteur de la fenêtre : le bandeau en haut dans le flux,
    // puis le rail et la colonne de texte, qui défilent chacun pour son compte
    // (cf. `.editor-shell` dans editor.css). Elle est posée ici et pas sur
    // `body` : les écrans pleine page rendus plus haut gardent le défilement
    // normal.
    <div className="editor-shell">
      {/* Un bandeau SANS réglages, comme celui de l'Avancement : le titre de la
          pièce et le choix de la scène sont partis dans la section « Structure »
          du rail (cf. StructurePanel.jsx), donc il ne reste ici que ce que les
          cinq pages du site ont en commun, le titre de la pièce en serif, la
          doc et le retour à l'accueil. Il se replie quand même, comme les quatre
          autres. */}
      <PlayHeader
        page="editor"
        title={script.title || "Pièce sans titre"}
        hint={
          <>
            {/* Les deux phrases sont dans l'ordre où on les vit : ce qui sert
                pendant la saisie d'abord, ce qui sert une fois qu'on a fini
                ensuite (taper, télécharger, déposer). L'inverse annonçait la
                sortie de la page avant d'y entrer, et coupait en deux le
                parcours du fichier. Prix assumé : le `hint` de cette page est
                le seul à ne pas ouvrir sur un impératif (cf. pages.js), il
                arrive une phrase plus tard. Et pas d'« appuyez sur le
                bouton » : c'est le verbe du doigt, et c'est la seule page
                qu'il n'ouvre pas (cf. useTouchPointer.js). */}
            Dans une réplique, <strong>Entrée</strong> crée la suivante,{" "}
            <strong>Maj + Entrée</strong> un retour à la ligne.
            {/* Un `<br />` et surtout pas un troisième paragraphe : le bandeau
                n'en porte que deux (cf. PlayHeader.jsx), et les deux phrases
                sont bien la même voix, à un moment du travail près. La ligne
                coupe donc à l'endroit où le travail change de nature, pendant
                la saisie puis une fois qu'elle est finie, plutôt qu'à la
                largeur de la fenêtre. */}
            <br />
            Une fois vos modifications terminées, téléchargez le script avec le bouton en haut de la
            page, puis déposez le fichier obtenu sur la page{" "}
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
            comme pour les voix des acteurs.
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
      />

      {/* Le rail AVANT le contenu, dans le DOM comme à l'écran : la tabulation
          part du bandeau, passe par le rail, arrive aux répliques, ce qui est
          aussi l'ordre qu'avaient les puces de personnage du temps où elles
          suivaient les selects d'acte et de scène. */}
      <div className="editor-layout">
        <EditorRail
          section={railSection}
          onSection={setRailSection}
          structure={
            <StructurePanel
              script={script}
              actIndex={safeActIndex}
              sceneIndex={safeSceneIndex}
              dispatch={dispatch}
              onGo={goToScene}
              onAddAct={addAct}
              onAddScene={addScene}
              onDeleteAct={deleteAct}
              onDeleteScene={deleteScene}
              onMoveAct={moveAct}
              onMoveScene={moveScene}
            />
          }
          characters={
            <CharacterPanel
              characters={script.characters}
              lineCounts={lineCounts}
              dispatch={dispatch}
              onRequestDelete={requestDeleteCharacter}
            />
          }
          search={
            <SearchPanel
              characters={script.characters}
              query={search.query}
              setQuery={search.setQuery}
              shownQuery={search.shownQuery}
              replacement={search.replacement}
              setReplacement={search.setReplacement}
              caseSensitive={search.caseSensitive}
              setCaseSensitive={search.setCaseSensitive}
              wholeWord={search.wholeWord}
              setWholeWord={search.setWholeWord}
              replaceOpen={search.replaceOpen}
              setReplaceOpen={search.setReplaceOpen}
              total={search.total}
              groups={search.groups}
              searching={search.searching}
              currentMatch={search.currentIndex >= 0 ? search.matches[search.currentIndex] : null}
              next={search.next}
              prev={search.prev}
              onSelect={search.select}
              replaceCurrent={search.replaceCurrent}
              replaceAll={search.replaceAll}
              focusSeq={search.focusSeq}
            />
          }
        />

        <main className="editor-column">
          <div className="editor-main">
            {loadInfo && <p className="load-info">{loadInfo}</p>}

            {/* Le titre de l'acte, en clair : la colonne DIT où l'on écrit, le
                rail fait tout le reste (créer, renommer, supprimer, réordonner,
                naviguer). Il a porté le renommage de l'acte et le ✕ qui le
                supprimait ; il ne reste rien qui apparaisse, disparaisse ou
                s'ouvre au-dessus du texte qu'on est en train de saisir. */}
            {act && <h2 className="act-title">{act.title}</h2>}

            {scene && (
              <SceneEditor
                scene={scene}
                actIndex={safeActIndex}
                sceneIndex={safeSceneIndex}
                characters={script.characters}
                dispatch={dispatch}
                addLine={addLine}
                focusRequest={focusRequest}
                onFocusHandled={handleFocusHandled}
              />
            )}
          </div>
        </main>
      </div>

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
    </div>
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
