import React, { useEffect, useId, useMemo, useRef, useState } from "react";
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
import CountBadge from "./CountBadge.jsx";
import { FlagIcon } from "../shared/icons.jsx";
import { LOCALES } from "../shared/i18n.js";
import { fmt, t, translator } from "../shared/locale.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";

// Le plan de la pièce : son titre, ses actes, ses scènes. C'est à la fois la
// NAVIGATION de l'éditeur (une scène à la fois, comme avant) et le seul endroit
// où la structure se façonne (ajouter, supprimer, réordonner).
//
// Elle vivait dans le bandeau partagé, en deux `<select>` plus deux boutons
// « + Scène » / « + Acte », et c'est le déménagement des puces de personnage qui
// se rejoue ici, pour le même motif : sur la Répétition et l'Enregistrement on
// CHOISIT une scène dans un contenu figé, dans l'Édition on la FAÇONNE, et le
// bandeau est partagé par cinq pages. La structure était de surcroît éparpillée
// sur trois endroits (les selects et les deux boutons dans le bandeau, la
// suppression de l'acte dans la colonne, celle de la scène dans SceneEditor),
// alors qu'aucun d'eux ne montrait la forme de la pièce : deux listes déroulantes
// n'affichent qu'une ligne à la fois.
//
// **Only the PLAY has a name.** Acts and scenes are not renamed at all: their
// label is derived from their rank ("Acte I", "Scène 3", see structureLabels.js).
// So this panel holds one text field, the play's title, plus its language.
//
// Renaming acts and scenes did exist here, as plain always-visible fields, and
// dropping it is what dissolved a whole problem rather than solving it. A stored
// title is DATA in one language, and it travelled: to manifest.json, to the
// printed PDF, to the Progress column headers, to the Speaking share scope. None
// of those could translate it, and none of them should have had to, because the
// real play never used the freedom anyway (ten scenes, all of them "Scène N").
// Deriving the label makes it ordinary text again, and this panel composes it in
// the language of the PLAY, the one declared two rows above the plan: an act
// heading here is the document's, not the reader's navigation, and it is word for
// word what the printed PDF will carry (see structureLabels.js).
//
// What that costs, and it is the only thing: an act cannot be called "Prologue".
// If it ever needs to be, that is an optional field to add back, not a redesign.
//
// **A scene is still the one thing in the plan you NAVIGATE to, so it is a
// button.** It used to be a text field, and the keyboard path to opening a scene
// came along for free: tab reached the field, and focusing it opened the scene.
// With nothing left to type, a static label would have taken that path away, so
// the name is a real button instead, reachable by tab and activated by Enter or
// Space. An act name, by contrast, leads nowhere (its scenes are listed right
// below, and that is where one chooses), so it is plain text.
//
// The row around a scene stays clickable as a mouse convenience, and the ✕ still
// stops propagation: deleting a scene is not a way of going to it.
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

  // L'étiquette « Langue de la pièce » nomme le groupe de drapeaux, qui n'est pas
  // un `<label>` (un groupe de boutons radio ne s'associe pas à un champ mais à
  // plusieurs) : il faut donc un id, et `useId` évite d'en écrire un en dur dans
  // un composant que rien n'interdit de monter deux fois.
  const languageLabelId = useId();

  // Le traducteur des libellés du plan, lié à la langue de la PIÈCE et non à celle
  // du lecteur (cf. structureLabels.js). Il descend en prop dans les rangées :
  // deux composants ne peuvent pas lire la langue chacun de son côté sans que la
  // colonne de texte et le plan finissent par se désaccorder.
  // Il change à la seconde où l'on clique un drapeau juste au-dessus, ce qui est
  // aussi ce qui rend le réglage lisible : on voit le plan passer d'« Acte I » à
  // « Act I », donc on voit ce que la langue de la pièce commande.
  const tPlay = translator(script.language);

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

  // Le titre de la PIÈCE est le seul nom qui se saisisse encore : un acte et une
  // scène tirent leur libellé de leur rang (structureLabels.js), donc ils ne se
  // renomment pas. Le HISTORY_BREAK ferme la rafale de frappes à la sortie du
  // champ, `history.js` la fusionnant en une seule étape d'annulation.
  const breakHistory = () => dispatch({ type: "HISTORY_BREAK" });

  const askDeleteAct = (ai) => {
    if (actCounts[ai] === 0) onDeleteAct(ai);
    else setPending({ kind: "act", actIndex: ai, count: actCounts[ai], title: actLabel(tPlay, ai) });
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
        title: sceneLabel(tPlay, si),
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
          et les cinq bandeaux du site savent l'écrire (« Pièce sans titre »).
          Un acte ou une scène sans nom, lui, ne serait qu'une case blanche dans
          le plan, sans rien pour le désigner. */}
      <input
        type="text"
        className="structure-field play-title-input"
        aria-label={t("structure.playTitle")}
        placeholder={t("structure.playTitle")}
        value={script.title}
        onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
        onBlur={breakHistory}
      />

      {/* La langue de la PIÈCE, juste sous son titre : les deux décrivent le
          document, alors que tout ce qui suit décrit sa forme.
          Ce n'est PAS la langue de l'interface (celle-là se choisit sur l'accueil
          et n'appartient pas à la pièce) : c'est celle dans laquelle la troupe a
          écrit, et elle sert deux choses qu'on ne pouvait pas régler avant. Le
          PDF compose ses intertitres et sa césure avec elle, et la voix de
          synthèse qui remplace une réplique pas encore enregistrée parle enfin la
          langue du texte qu'elle lit, au lieu d'un français imposé à toute pièce.
          Une étiquette écrite plutôt qu'une simple infobulle : contrairement au
          titre, un drapeau ne dit pas de lui-même ce qu'il désigne, et deux
          drapeaux seuls dans une rangée pourraient aussi bien choisir la langue
          du site (celle-là se choisit sur l'accueil).
          **Des drapeaux et non plus un `<select>`**, comme au pied des accueils :
          un `<option>` ne porte pas d'image, donc les deux endroits où l'on
          choisit une langue ne pouvaient pas se ressembler tant que celui-ci
          était une liste déroulante. Ce sont de vrais boutons radio, masqués sous
          leur drapeau : la navigation aux flèches, le groupe et le « coché » sont
          alors ceux du navigateur, là où des `<button>` et un `role="radio"`
          posé à la main auraient demandé de réécrire le `tabIndex` mobile d'un
          groupe radio.
          Ça reste un CHAMP qui décrit le document, et pas le sélecteur de langue
          du site : on y déclare une donnée de la pièce, elle part dans
          `script.json`, et rien ici ne recharge la page (cf. LocaleSwitch.jsx,
          qui explique pourquoi les deux ne se confondent pas malgré les mêmes
          drapeaux). */}
      <div className="structure-language">
        <span className="structure-language-label" id={languageLabelId}>
          {t("structure.language")}
        </span>
        <div
          className="structure-language-flags"
          role="radiogroup"
          aria-labelledby={languageLabelId}
        >
          {LOCALES.map((locale) => {
            const name = t(`structure.language.${locale}`);
            const current = script.language === locale;
            return (
              <label
                key={locale}
                className={`structure-language-flag ${current ? "current" : ""}`}
                title={name}
              >
                {/* Le nom de la langue est porté par le champ (le drapeau est
                    `aria-hidden`), et il est TRADUIT : « Anglais » dans une
                    interface française, contrairement aux endonymes du
                    sélecteur du site. On énonce ici un fait sur un document,
                    dans la langue où on le lit. */}
                <input
                  type="radio"
                  name="play-language"
                  value={locale}
                  checked={current}
                  aria-label={name}
                  onChange={() => dispatch({ type: "SET_LANGUAGE", language: locale })}
                />
                <FlagIcon locale={locale} />
              </label>
            );
          })}
        </div>
      </div>

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
                tPlay={tPlay}
                lineCount={actCounts[ai]}
                currentScene={ai === actIndex ? sceneIndex : -1}
                currentRow={currentRow}
                deletable={script.acts.length > 1}
                onGo={onGo}
                onAddScene={onAddScene}
                onDeleteAct={askDeleteAct}
                onDeleteScene={askDeleteScene}
              />
            ))}
          </SortableContext>
        </ol>
      </DndContext>

      {/* Sous la liste et hors de son défilement, comme le formulaire d'ajout des
          personnages : sur une pièce à cinq actes il reste sous les yeux.
          Même classe `structure-add` que le « + Scène » de chaque acte, et plus
          `.btn` : les deux ajouts du plan sont la même chose à deux niveaux, donc
          ils se dessinent pareil (cf. editor.css). */}
      <button className="structure-add structure-add-act" onClick={onAddAct}>
        {t("structure.addAct")}
      </button>

      {pending && (
        <ConfirmModal
          title={t("common.deleteConfirm", { name: fmt.quote(pending.title) })}
          confirmLabel={t("common.delete")}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            if (pending.kind === "act") onDeleteAct(pending.actIndex);
            else onDeleteScene(pending.actIndex, pending.sceneIndex);
          }}
        >
          <p>{t("structure.deleteLines", { count: pending.count })}</p>
        </ConfirmModal>
      )}
    </>
  );
}

function ActItem({
  act,
  actIndex,
  tPlay,
  lineCount,
  currentScene,
  currentRow,
  deletable,
  onGo,
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
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={t("structure.moveAct", { act: actLabel(tPlay, actIndex) })}
        />
        {/* Un libellé, plus un champ : le nom d'un acte est dérivé de son rang et
            ne se saisit pas. Il ne mène nulle part non plus (l'acte n'est pas une
            page de l'éditeur, la scène l'est), donc ce n'est ni un champ ni un
            bouton, juste du texte. Rien ne se perd au clavier : la tabulation
            atteignait ce champ pour le renommer, or il n'y a plus rien à y
            renommer, et les scènes juste dessous ont chacune son bouton. */}
        {/* Le libellé est dans la langue de la pièce, la phrase qui le CITE
            (l'`aria-label` du ✕) dans celle du lecteur : un paramètre chaîne
            traverse intact, comme le chiffre romain d'un acte l'a toujours fait
            (cf. i18n.js). */}
        <span className="structure-name structure-name-static truncate">
          {actLabel(tPlay, actIndex)}
        </span>
        <CountBadge count={lineCount} className="structure-count" />
        {deletable && (
          <button
            className="chip-delete"
            title={t("structure.deleteAct")}
            aria-label={t("structure.deleteAct.named", { act: actLabel(tPlay, actIndex) })}
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
              tPlay={tPlay}
              current={si === currentScene}
              rowRef={si === currentScene ? currentRow : null}
              deletable={act.scenes.length > 1}
              onGo={onGo}
              onDelete={onDeleteScene}
            />
          ))}
        </SortableContext>
      </ol>

      {/* Un « + Scène » par acte, et non plus un seul bouton qui ajoutait à
          l'acte courant : dans un plan, l'endroit où la scène atterrit doit se
          désigner du doigt. */}
      <button
        className="structure-add structure-add-scene"
        onClick={() => onAddScene(actIndex)}
      >
        {t("structure.addScene")}
      </button>
    </li>
  );
}

function SceneItem({
  scene,
  actIndex,
  sceneIndex,
  tPlay,
  current,
  rowRef,
  deletable,
  onGo,
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
          **La rangée ENTIÈRE ouvre la scène**, et pas seulement son nom : dans
          une liste de scènes, la ligne est l'objet, et viser un mot de 60 px pour
          changer de scène demandait de savoir que le nom était la cible. C'est
          aussi pour ça que le nom ne porte plus aucun dessin à lui (ni cadre ni
          fond, cf. editor.css) : ce qui répond au survol est la rangée.
          Pas de `role="button"` ni de `tabIndex` sur cette `<div>` : elle
          contient déjà trois boutons, dont celui du nom, et le chemin clavier
          passe par lui. Ce gestionnaire n'ajoute donc qu'une commodité à la
          souris, il n'est le seul accès à rien. */}
      <div
        ref={rowRef}
        className={`structure-row scene ${current ? "current" : ""}`}
        onClick={() => onGo(actIndex, sceneIndex)}
      >
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={t("structure.moveScene", { scene: sceneLabel(tPlay, sceneIndex) })}
        />
        {/* Un BOUTON et non plus un champ de saisie : une scène ne se renomme
            plus (son libellé vient de son rang), mais elle reste la seule chose
            du plan où l'on NAVIGUE, donc elle doit rester atteignable au clavier.
            Le champ portait ce chemin par accident (la tabulation l'atteignait
            pour renommer, et le focus ouvrait la scène au passage) ; un bouton le
            porte pour de bon, et Entrée comme Espace l'activent. Un bouton qui
            ne ressemble PAS à un champ, en revanche : il en avait gardé le cadre
            blanc, ce qui laissait le plan promettre une saisie qui n'existe plus
            (cf. editor.css).
            La scène ouverte n'est pas signalée par la seule couleur : le bouton
            porte `aria-current`, comme la correspondance courante de la
            recherche. */}
        <button
          type="button"
          className="structure-name structure-scene-name truncate"
          aria-current={current ? "true" : undefined}
          title={t("structure.openScene")}
          onClick={() => onGo(actIndex, sceneIndex)}
        >
          {sceneLabel(tPlay, sceneIndex)}
        </button>
        <CountBadge count={scene.lines.length} className="structure-count" />
        {deletable && (
          <button
            className="chip-delete"
            title={t("structure.deleteScene")}
            aria-label={t("structure.deleteScene.named", { scene: sceneLabel(tPlay, sceneIndex) })}
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

// La poignée des répliques, au même caractère et au même verbe : c'est le même
// geste, sur un autre objet de la pièce, donc elle garde la classe `drag-handle`
// (avec son curseur et son `touch-action`) et n'ajoute que le resserrement de sa
// boîte, taillée là-bas pour une rangée de 40 px.
function DragHandle({ attributes, listeners, label }) {
  return (
    <button
      className="drag-handle structure-handle"
      title={t("common.dragHandle")}
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}
