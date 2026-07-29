import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import ConfirmModal from "../shared/ConfirmModal.jsx";

// Le plan de la pièce : son titre, ses actes, ses scènes. C'est à la fois la
// NAVIGATION de l'éditeur (une scène à la fois, comme avant) et le seul endroit
// où la structure se façonne (ajouter, supprimer, réordonner).
//
// Elle vivait dans le bandeau partagé, en deux `<select>` plus deux boutons
// « + Scène » / « + Acte », et c'est le déménagement des puces de personnage qui
// se rejoue ici, pour le même motif : sur la Répétition et l'Enregistrement on
// CHOISIT une scène dans un contenu figé, dans l'Édition on la FAÇONNE, et le
// bandeau est partagé par quatre pages. La structure était de surcroît éparpillée
// sur trois endroits (les selects et les deux boutons dans le bandeau, la
// suppression de l'acte dans la colonne, celle de la scène dans SceneEditor),
// alors qu'aucun d'eux ne montrait la forme de la pièce : deux listes déroulantes
// n'affichent qu'une ligne à la fois.
//
// **Tout ce qui nomme la pièce est ici**, avec ce qui la façonne : son titre, le
// titre de ses actes, celui de ses scènes. La colonne de texte ne fait plus que
// les AFFICHER, en tête de la scène qu'on écrit. Le renommage y a vécu un temps
// (un titre de la colonne se cliquait pour le changer en champ), et il se lisait
// mal : le titre de la pièce se modifiait dans le rail, ceux des actes et des
// scènes dans le texte, donc nommer la pièce demandait de savoir de quel niveau
// on parlait pour savoir où cliquer. Un seul endroit, et il porte déjà les trois
// objets, l'un sous l'autre.
//
// **Les trois noms sont des champs blancs, en clair et en permanence.** Ce qui se
// modifie doit se reconnaître sans qu'on l'ait appris : le plan est la seule
// partie de la page dont le contenu ne se lit pas déjà comme un formulaire (une
// réplique est un textarea, un personnage a son champ), donc ses noms portent le
// même cadre blanc que les autres champs du rail. Le titre de la pièce l'avait
// déjà, à ce détail près qu'il était alors le seul.
//
// Le geste essayé avant, et retiré : un mot qu'on clique pour ouvrir la scène et
// qu'on reclique, là où on est déjà, pour le changer en champ. Il n'ajoutait
// aucun mobilier à une rangée qui porte déjà trois contrôles dans 248 px, mais il
// demandait de connaître une convention (celle des gestionnaires de fichiers)
// pour découvrir qu'un titre d'acte se renomme, et il rendait le plan
// dissymétrique : le titre de la pièce était un champ, les deux autres niveaux
// des mots.
//
// **Conséquence : c'est le FOCUS du champ d'une scène qui l'ouvre.** Cliquer son
// nom l'ouvre et y pose le curseur du même geste, donc on renomme toujours la
// scène qu'on a sous les yeux dans la colonne. Un nom d'acte, lui, ne mène plus
// nulle part : ses scènes sont listées juste dessous, et c'est là qu'on choisit.
// Prix assumé : parcourir le plan à la tabulation promène la colonne de scène en
// scène. Rien ne s'y perd (aucune saisie n'est en cours) et ça reste la même
// règle, le champ où l'on est est la scène qu'on regarde.
//
// **Un nom vide ne s'écrit jamais dans la pièce.** Le champ, lui, se laisse vider
// (sinon on ne pourrait pas retaper un titre par-dessus l'autre) : tant qu'il
// n'a que des blancs, il garde sa frappe pour lui et la pièce garde le nom
// d'avant, qui revient à l'écran dès qu'on sort du champ. C'est ce qui évite
// qu'un aller-retour dans un titre allume « Modifications non téléchargées » et
// laisse une étape vide à annuler.
export default function StructurePanel({
  script,
  actIndex,
  sceneIndex,
  dispatch,
  onGo,
  onAddAct,
  onAddScene,
  onDeleteAct,
  onDeleteScene,
  onMoveAct,
  onMoveScene,
}) {
  // Suppression en attente de confirmation, actes et scènes confondus : un seul
  // état et un seul modal, la question étant la même à l'objet près. Rien à
  // demander quand l'objet est vide, comme partout ailleurs dans l'éditeur.
  const [pending, setPending] = useState(null);

  // Amener la scène ouverte à l'écran À L'OUVERTURE de la section, et seulement
  // là : le plan d'une pièce à cinq actes dépasse la hauteur du panneau, donc
  // rouvrir « Structure » depuis une scène tardive montrait le début de la pièce
  // et demandait de descendre chercher où l'on est. `nearest` ne fait rien quand
  // la rangée est déjà visible, et le panneau n'étant monté que pendant que la
  // section est ouverte, un effet de montage suffit (pas de dépendances : une
  // navigation faite d'ici n'a pas à faire bouger la liste sous le curseur).
  const currentRow = useRef(null);
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const sensors = useSensors(
    // Même distance d'activation que les répliques : un clic simple sur une
    // scène doit y aller, pas commencer un glissement.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Une passe sur la pièce plutôt qu'une somme par acte à chaque rendu de rangée.
  const actCounts = useMemo(
    () => script.acts.map((a) => a.scenes.reduce((n, s) => n + s.lines.length, 0)),
    [script.acts]
  );

  // Les actes et les scènes n'ont pas d'id : l'identité dnd-kit est le rang,
  // préfixé par le type (`act:2`, `scene:2:0`). Stable le temps d'un glissement,
  // qui ne modifie rien avant son terme, et c'est aussi ce que MOVE_ACT /
  // MOVE_SCENE attendent. Les clés React sont des rangs pour la même raison, donc
  // rien ne se réanime après un déplacement.
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = String(active.id).split(":");
    const to = String(over.id).split(":");
    if (from[0] === "act" && to[0] === "act") {
      onMoveAct(Number(from[1]), Number(to[1]));
    } else if (from[0] === "scene" && to[0] === "scene" && from[1] === to[1]) {
      onMoveScene(Number(from[1]), Number(from[2]), Number(to[2]));
    }
  };

  // Un acte ne se dépose pas sur une scène, et une scène ne quitte pas son acte
  // (cf. MOVE_SCENE dans reducer.js). Le filtrage est fait ICI, à la détection de
  // collision, et pas seulement en garde à l'arrivée : les deux `SortableContext`
  // imbriqués vivent dans un seul `DndContext`, donc sans lui `closestCenter`
  // désignait volontiers la scène d'un autre acte, et le glissement se figeait
  // sans que rien n'explique pourquoi (le geste était refusé, mais seulement à la
  // fin). Filtré, la liste s'écarte exactement là où le dépôt aura lieu.
  const collision = (args) => {
    const [kind, ai] = String(args.active.id).split(":");
    const prefix = kind === "act" ? "act:" : `scene:${ai}:`;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith(prefix)
      ),
    });
  };

  // Renommer : une action par niveau, dispatchée d'ici comme le titre de la
  // pièce, et à la frappe comme lui. La rafale est fusionnée en une seule étape
  // d'annulation par `history.js` (une par nom, cf. sa clé de fusion) et close
  // par la sortie du champ, d'où le HISTORY_BREAK que les trois partagent.
  const renameAct = (ai, title) => dispatch({ type: "RENAME_ACT", actIndex: ai, title });
  const renameScene = (ai, si, title) =>
    dispatch({ type: "RENAME_SCENE", actIndex: ai, sceneIndex: si, title });
  const breakHistory = () => dispatch({ type: "HISTORY_BREAK" });

  const askDeleteAct = (ai) => {
    if (actCounts[ai] === 0) onDeleteAct(ai);
    else setPending({ kind: "act", actIndex: ai, count: actCounts[ai], title: script.acts[ai].title });
  };

  const askDeleteScene = (ai, si) => {
    const scene = script.acts[ai].scenes[si];
    if (scene.lines.length === 0) onDeleteScene(ai, si);
    else
      setPending({
        kind: "scene",
        actIndex: ai,
        sceneIndex: si,
        count: scene.lines.length,
        title: scene.title,
      });
  };

  return (
    <>
      {/* La racine du plan. Pas d'étiquette écrite au-dessus : la tête du panneau
          dit déjà « Structure », deux libellés empilés se disputeraient, et le
          champ est en serif comme le titre que la rangée du haut affiche au même
          instant. C'est l'`aria-label` qui le nomme, le repère visuel est cet
          écho.
          C'est le seul des trois qui accepte de rester vide, et il l'a toujours
          fait : une pièce en cours d'écriture peut n'avoir pas encore de titre,
          et les quatre bandeaux du site savent l'écrire (« Pièce sans titre »).
          Un acte ou une scène sans nom, lui, ne serait qu'une case blanche dans
          le plan, sans rien pour le désigner. */}
      <input
        type="text"
        className="structure-field play-title-input"
        aria-label="Titre de la pièce"
        placeholder="Titre de la pièce"
        value={script.title}
        onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
        onBlur={breakHistory}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        {/* Une `<ol>` d'actes, chacun portant une `<ol>` de scènes : un lecteur
            d'écran annonce le plan comme un plan, et le rang qu'il énonce est
            celui qui nomme l'acte (« Acte II »). */}
        <ol className="structure-acts">
          <SortableContext
            items={script.acts.map((_, ai) => `act:${ai}`)}
            strategy={verticalListSortingStrategy}
          >
            {script.acts.map((act, ai) => (
              <ActItem
                key={ai}
                act={act}
                actIndex={ai}
                lineCount={actCounts[ai]}
                currentScene={ai === actIndex ? sceneIndex : -1}
                currentRow={currentRow}
                deletable={script.acts.length > 1}
                onGo={onGo}
                onRename={renameAct}
                onRenameScene={renameScene}
                onBreak={breakHistory}
                onAddScene={onAddScene}
                onDeleteAct={askDeleteAct}
                onDeleteScene={askDeleteScene}
              />
            ))}
          </SortableContext>
        </ol>
      </DndContext>

      {/* Sous la liste et hors de son défilement, comme le formulaire d'ajout des
          personnages : sur une pièce à cinq actes il reste sous les yeux. */}
      <button className="btn small structure-add-act" onClick={onAddAct}>
        + Acte
      </button>

      {pending && (
        <ConfirmModal
          title={`Supprimer « ${pending.title} » ?`}
          confirmLabel="Supprimer"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            if (pending.kind === "act") onDeleteAct(pending.actIndex);
            else onDeleteScene(pending.actIndex, pending.sceneIndex);
          }}
        >
          <p>
            {pending.count > 1
              ? `${pending.count} répliques seront supprimées.`
              : "1 réplique sera supprimée."}
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

function ActItem({
  act,
  actIndex,
  lineCount,
  currentScene,
  currentRow,
  deletable,
  onGo,
  onRename,
  onRenameScene,
  onBreak,
  onAddScene,
  onDeleteAct,
  onDeleteScene,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `act:${actIndex}`,
  });

  // L'acte où l'on est : celui dont une scène est ouverte.
  const current = currentScene >= 0;

  return (
    <li
      ref={setNodeRef}
      className="structure-act"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className={`structure-row act ${current ? "current" : ""}`}>
        <DragHandle attributes={attributes} listeners={listeners} label={`Déplacer ${act.title}`} />
        {/* Le nom d'un acte ne mène nulle part, il se renomme : l'acte n'est pas
            une page de l'éditeur, la scène l'est, et ses scènes sont listées
            juste dessous. */}
        <NameField
          value={act.title}
          label="Titre de l'acte"
          tooltip="Renommer cet acte"
          onRename={(title) => onRename(actIndex, title)}
          onBreak={onBreak}
        />
        <CountBadge count={lineCount} />
        {deletable && (
          <button
            className="chip-delete"
            title="Supprimer cet acte"
            aria-label={`Supprimer ${act.title}`}
            onClick={() => onDeleteAct(actIndex)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      <ol className="structure-scenes">
        <SortableContext
          items={act.scenes.map((_, si) => `scene:${actIndex}:${si}`)}
          strategy={verticalListSortingStrategy}
        >
          {act.scenes.map((scene, si) => (
            <SceneItem
              key={si}
              scene={scene}
              actIndex={actIndex}
              sceneIndex={si}
              current={si === currentScene}
              rowRef={si === currentScene ? currentRow : null}
              deletable={act.scenes.length > 1}
              onGo={onGo}
              onRename={onRenameScene}
              onBreak={onBreak}
              onDelete={onDeleteScene}
            />
          ))}
        </SortableContext>
      </ol>

      {/* Un « + Scène » par acte, et non plus un seul bouton qui ajoutait à
          l'acte courant : dans un plan, l'endroit où la scène atterrit doit se
          désigner du doigt. */}
      <button className="structure-add-scene" onClick={() => onAddScene(actIndex)}>
        + Scène
      </button>
    </li>
  );
}

function SceneItem({
  scene,
  actIndex,
  sceneIndex,
  current,
  rowRef,
  deletable,
  onGo,
  onRename,
  onBreak,
  onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `scene:${actIndex}:${sceneIndex}`,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {/* Le ref d'amenée à l'écran est posé sur la rangée et non sur le `<li>`,
          qui porte déjà celui de dnd-kit.
          **La rangée ENTIÈRE ouvre la scène**, et pas seulement son champ : dans
          une liste de scènes, la ligne est l'objet, et viser un champ de 130 px
          pour changer de scène demandait de savoir que le nom était la cible.
          Le champ garde son focus (donc son curseur) au passage, puisqu'un clic
          dessus le focalise et que ce focus ouvre déjà la scène : les deux
          chemins font la même chose, la rangée n'ajoute que la surface.
          Pas de `role="button"` ni de `tabIndex` sur cette `<div>` : elle
          contient un champ et deux boutons, et le chemin clavier existe déjà (la
          tabulation atteint le champ, et le focaliser ouvre la scène). Ce
          gestionnaire n'ajoute donc qu'une commodité à la souris, il n'est le
          seul accès à rien. */}
      <div
        ref={rowRef}
        className={`structure-row scene ${current ? "current" : ""}`}
        onClick={() => onGo(actIndex, sceneIndex)}
      >
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={`Déplacer ${scene.title}`}
        />
        {/* La scène ouverte n'est pas signalée par la seule couleur : son champ
            porte `aria-current`, comme la correspondance courante de la
            recherche. Et c'est le focus de ce champ qui ouvre la scène : un clic
            l'ouvre et y pose le curseur du même geste. */}
        <NameField
          value={scene.title}
          label="Titre de la scène"
          tooltip="Ouvrir cette scène, ou la renommer"
          aria-current={current ? "true" : undefined}
          onFocus={() => onGo(actIndex, sceneIndex)}
          onRename={(title) => onRename(actIndex, sceneIndex, title)}
          onBreak={onBreak}
        />
        <CountBadge count={scene.lines.length} />
        {deletable && (
          <button
            className="chip-delete"
            title="Supprimer cette scène"
            aria-label={`Supprimer ${scene.title}`}
            /* Le ✕ ne traverse pas la rangée : supprimer une scène n'est pas une
               façon d'y aller, et la confirmation s'ouvrirait sur une colonne
               qui vient de changer de scène. */
            onClick={(e) => {
              e.stopPropagation();
              onDelete(actIndex, sceneIndex);
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
    </li>
  );
}

// Le nom d'un acte ou d'une scène : un champ, comme le titre de la pièce
// au-dessus, qui renomme à la frappe.
//
// Il ne garde d'état local que le cas du champ VIDE, et c'est tout son propos :
// on doit pouvoir effacer un titre pour en taper un autre, mais un acte sans nom
// n'a plus rien pour se désigner dans le plan. Tant que la saisie n'a que des
// blancs, elle reste donc ici et la pièce garde son nom d'avant, qui revient à
// l'écran à la sortie du champ. Rien n'est dispatché, donc rien n'entre dans la
// pile d'annulation et l'étiquette « Modifications non téléchargées » ne
// s'allume pas pour un aller-retour.
//
// Piste écartée : dispatcher le vide puis restaurer l'ancien nom au blur. Le
// retour à l'identique ne rendrait pas l'état d'AVANT mais un état neuf de même
// valeur, et `dirty` (une comparaison d'identité) resterait allumé sur une pièce
// inchangée.
function NameField({ value, label, tooltip, onRename, onBreak, onFocus, ...rest }) {
  const [emptied, setEmptied] = useState(null);

  return (
    <input
      type="text"
      className="structure-field structure-name"
      aria-label={label}
      title={tooltip}
      value={emptied ?? value}
      onFocus={onFocus}
      onChange={(e) => {
        const next = e.target.value;
        if (next.trim()) {
          setEmptied(null);
          onRename(next);
        } else {
          setEmptied(next);
        }
      }}
      onBlur={() => {
        setEmptied(null);
        onBreak();
      }}
      {...rest}
    />
  );
}

// Le compte de répliques d'un acte ou d'une scène. Un nombre nu ne dit pas ce
// qu'il compte : « Acte I, 12 » à la voix, et rien du tout à la souris. Le
// `role="img"` plus l'`aria-label` sont le motif du sceau (`PageMark`), le seul
// qui rende un `aria-label` valable sur un `<span>` ; le chiffre reste seul à
// l'écran, la colonne des comptes devant s'aligner d'une rangée à l'autre.
function CountBadge({ count }) {
  const label = `${count} réplique${count > 1 ? "s" : ""}`;
  return (
    <span className="structure-count" role="img" aria-label={label} title={label}>
      {count}
    </span>
  );
}

// La poignée des répliques, au même caractère et au même verbe : c'est le même
// geste, sur un autre objet de la pièce, donc elle garde la classe `drag-handle`
// (avec son curseur et son `touch-action`) et n'ajoute que le resserrement de sa
// boîte, taillée là-bas pour une rangée de 40 px.
function DragHandle({ attributes, listeners, label }) {
  return (
    <button
      className="drag-handle structure-handle"
      title="Glisser pour déplacer"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}
