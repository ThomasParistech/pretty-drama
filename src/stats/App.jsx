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
  formatShare,
  scopeOf,
  scopeLines,
  speechStats,
} from "./stats.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import "./stats.css";

// La portée mise en mots, pour les `aria-label` des trois dessins. `scopeOf`
// (stats.js) ne rend que des rangs, ce qui le garde pur ; c'est ici qu'ils
// deviennent une phrase, dans la langue du LECTEUR (les libellés d'acte et de
// scène sont de la navigation, cf. structureLabels.js).
function scopeText(scope) {
  if (scope.kind === "all") return t("stats.scope.all");
  const act = actLabel(t, scope.actIndex);
  if (scope.kind === "act") return t("stats.scope.act", { act });
  return t("stats.scope.scene", { act, scene: sceneLabel(t, scope.sceneIndex) });
}

// Page Répartition : qui parle, combien, et quand.
//
// Portage de la visualisation que la troupe produisait en Python (dépôt
// theatre_transport_de_femme, `viz/generate_viz.py` et `viz/main.tex`) : deux
// camemberts et un bloc où chaque carré est un mot. Les libellés des trois
// panneaux sont ceux du PDF, mot pour mot : c'est le même document, servi à
// l'écran et tenu à jour.
//
// Tout le calcul est dans `stats.js`, module pur et testé. Ce fichier ne fait
// que dessiner, parce que le projet ne teste aucun composant React : ce qui vit
// ici se vérifie à l'œil, donc il doit y en avoir le moins possible.
export default function App() {
  const { manifest, error: loadError } = useManifest();
  if (loadError) return <PageState page="stats" error={loadError} />;
  if (!manifest) return <PageState page="stats" />;
  return <Stats manifest={manifest} />;
}

function Stats({ manifest }) {
  // La portée : les deux selects habituels du bandeau, et **les trois niveaux
  // tiennent dedans**. Chaque select porte en premier choix le niveau au-dessus
  // de lui, « Toute la pièce » dans celui d'acte comme « Tout l'acte » dans celui
  // de scène : le même geste, écrit deux fois de la même façon, et deux contrôles
  // pour trois niveaux.
  //
  // Un troisième contrôle a existé, un bouton bascule « Toute la pièce » posé
  // dans la rangée, et il est retiré : enfoncé, il prenait l'accent plein du
  // `.btn.primary` à côté de deux selects grisés, donc il ne se lisait plus comme
  // la commande qu'il était mais comme l'ÉTAT qu'il venait de produire, une
  // étiquette « toute la pièce » allumée au-dessus de deux champs éteints. Rien
  // ne disait plus qu'on pouvait le relâcher. Une case à cocher avait été
  // essayée avant lui et écartée pour une autre raison : sur ce site une case est
  // un réglage d'AFFICHAGE (les quatre de la Répétition, les deux de la
  // Recherche), or ce contrôle change ce que la page MONTRE.
  //
  // `actIndex` vaut donc ALL quand on regarde la pièce entière, et c'est l'état
  // d'ouverture de la page : la Répartition se lit d'abord en entier, on descend
  // ensuite dans un acte puis dans une scène.
  const [actIndex, setActIndex] = useState(ALL);
  // La PREMIÈRE scène, et pas « Tout l'acte », dès le départ : c'est ce que
  // `changeAct` pose en arrivant dans un acte (cf. plus bas), et l'état de départ
  // dit la même chose pour n'avoir qu'un défaut à connaître. Il ne se voit pas au
  // chargement, la portée y étant la pièce entière, qui ignore le rang de scène.
  const [sceneIndex, setSceneIndex] = useState(0);
  // Le nombre de mots par rangée du bloc. **Constant par portée** (c'est ce qui
  // rend deux scènes comparables, cf. `DEFAULT_COLUMNS`) et réglable, parce
  // qu'aucune constante ne va d'une pièce de 500 mots à une de 30 000. En mémoire
  // seulement, comme la largeur du rail de l'Édition : le projet n'a aucune
  // persistance locale, et en ouvrir une pour une préférence d'affichage serait la
  // première.
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  // Le personnage mis en évidence, l'équivalent des `all_image_<nom>.svg` de la
  // référence. `null` = tout le monde. Il est porté par la PAGE et pas par un
  // panneau, et c'est tout l'intérêt : les trois dessins répondent au même
  // choix, donc une part de camembert, une ligne de légende et un bloc de la
  // chronologie désignent la même personne et se répondent. Le bloc était seul à
  // pouvoir isoler quelqu'un, alors que les deux camemberts avaient exactement la
  // même chose à montrer.
  //
  // Deux états et pas un : `selected` est le choix ARRÊTÉ (un appui, qui reste),
  // `hovered` le survol, qui ne fait que le préfigurer. Le second gagne quand il
  // existe, donc survoler un autre nom montre l'autre sans perdre le choix, et
  // sortir du nom y ramène. Le survol ne touche PAS `selected` : il n'existe qu'à
  // la souris (cf. `hoverProps`), et l'état d'un bouton ne doit pas dépendre de
  // là où le curseur passe.
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const acts = Array.isArray(manifest.acts) ? manifest.acts : [];
  const characters = Array.isArray(manifest.characters) ? manifest.characters : [];

  // Le manifest ne porte pas forcément les couleurs (un script.json saisi avant
  // qu'elles existent n'en a aucune) : on les comble avec la MÊME fonction que
  // l'éditeur, donc les deux pages montrent la même distribution. Une seule fois
  // par rendu, et mémorisé : `characters` ne change qu'au chargement.
  const colors = useMemo(() => assignColors(characters), [characters]);

  // Les deux rangs des selects vont au calcul tels quels : ALL y vaut « tout ce
  // niveau » (cf. `scopeLines`), donc il n'y a rien à traduire entre le contrôle
  // et la portée.
  const lines = useMemo(
    () => scopeLines(manifest, actIndex, sceneIndex),
    [manifest, actIndex, sceneIndex]
  );
  const { rows, totalWords, totalLines } = useMemo(
    () => speechStats(lines, characters),
    [lines, characters]
  );
  // La distribution est passée au bloc comme aux décomptes : les deux doivent
  // s'accorder sur ce qui est « inconnu », sinon la légende isole un seau que les
  // tronçons ne portent pas (cf. `bucketOf`).
  const block = useMemo(
    () => blockRects(lines, columns, characters),
    [lines, columns, characters]
  );

  const where = scopeText(scopeOf(manifest, actIndex, sceneIndex));
  // Pour distinguer « la pièce est vide » de « cette scène est vide », cf. le
  // vide plus bas. Calculé sur la pièce ENTIÈRE, donc indépendant de la portée.
  const playIsEmpty = useMemo(() => scopeLines(manifest, ALL, ALL).length === 0, [manifest]);
  // Un personnage mis en évidence qui ne parle pas dans la portée choisie
  // n'isolerait rien : les dessins deviendraient vides sans qu'on comprenne
  // pourquoi. On retombe sur « tout le monde » plutôt que d'afficher un dessin
  // éteint. Le choix arrêté n'est pas effacé pour autant : revenir à une portée
  // où il parle le remontre.
  const speaking = (id) => (id !== null && rows.some((r) => r.id === id) ? id : null);
  // Ce que les dessins ÉTEIGNENT (survol compris) et ce que les boutons
  // annoncent comme enfoncé (le choix arrêté seul) sont donc deux choses : un
  // `aria-pressed` qui suivrait le curseur dirait qu'un bouton est enfoncé parce
  // que la souris passe dessus.
  const highlight = speaking(hovered ?? selected);
  const pinned = speaking(selected);
  const toggle = (id) => setSelected((current) => (current === id ? null : id));

  // Le seau « inconnu » n'a pas de couleur de personnage : c'est le token neutre
  // de l'appelant, ici `--ink-soft`, comme le gris du bloc.
  const colorOf = (id) => (id === UNKNOWN ? null : colors.get(id) ?? null);
  // Deux libellés de repli, et pas un seul : le seau des orphelines n'a jamais de
  // nom, mais un personnage de la distribution peut n'en pas avoir non plus (le
  // sanitize Python n'exige qu'une chaîne, donc un `"name": ""` hand-édité
  // traverse jusqu'au manifest). Sans ce repli, sa ligne de légende était une
  // pastille de couleur suivie d'un blanc, et son bouton d'isolement s'annonçait
  // « Ne montrer que ». Il ne se confond pas avec les orphelines : lui existe,
  // il a sa couleur et ses répliques lui sont bien attribuées.
  const nameOf = (row) =>
    row.name?.trim()
      ? row.name
      : t(row.id === UNKNOWN ? "stats.unknownCharacter" : "stats.unnamedCharacter");

  // Changer d'acte ramène au début de sa liste de scènes, comme sur la Répétition
  // et l'Enregistrement, et « le début » est ici la **première scène** et pas
  // « Tout l'acte » : on descend d'un cran à chaque geste, la pièce entière puis
  // un acte puis une scène, et s'arrêter sur l'acte entier demandait de rechoisir
  // dans le second select ce qu'on venait de choisir dans le premier. « Tout
  // l'acte » reste le premier choix de la liste, à un clic de là.
  // Le repli sur ALL n'est pas de la prudence : un acte sans scène (script
  // hand-édité) n'a pas de rang 0, et un select contrôlé sur une valeur dont
  // aucune option ne répond perd sa valeur.
  const firstScene = (index) => ((acts[index]?.scenes?.length ?? 0) > 0 ? 0 : ALL);
  const changeAct = (value) => {
    setActIndex(value);
    setSceneIndex(firstScene(value));
  };

  return (
    // La page ne défile pas en entier : la coquille fait la hauteur de la
    // fenêtre, le bandeau et la barre des personnages restent en haut, et seul
    // le contenu défile au-dessous. C'est ce qui garde la légende sous les yeux
    // pendant qu'on descend une chronologie de plusieurs écrans, où l'on ne voit
    // souvent QUE la mosaïque, sans un nom à quoi rattacher ses couleurs.
    //
    // Même géométrie que la coquille de l'Édition (`.editor-shell`), et pour la
    // même raison : la seule autre façon d'obtenir une barre collée sous le
    // bandeau demande de connaître la hauteur de celui-ci, qui est un inconnu
    // ANIMÉ (titre sur deux lignes, deux paragraphes de doc, repli sur 0,26 s).
    // Il faudrait la mesurer en JS, la remesurer à chaque repli, et le `top` de
    // la barre traînerait un quart de seconde derrière l'animation. Ici rien
    // n'est mesuré et `PlayHeader` n'est pas touché : son `position: sticky`
    // dans un ancêtre qui ne défile pas se comporte comme `relative`, il tient
    // le haut parce qu'il EST en haut.
    //
    // Un écart avec l'Édition : `dvh` et pas `vh`, parce que cette page-ci
    // s'ouvre au doigt (elle est dans les cartes des acteurs) et qu'une barre
    // d'adresse qui se rétracte y change vraiment la hauteur utile.
    <div className="stats-shell">
      {/* Sa phrase compacte, ses deux selects, et pas de `hint` : les selects se
          lisent seuls, et la légende de la barre plus la phrase de la
          chronologie disent comment lire les dessins. Le bandeau ne dit QUE le
          titre de la pièce, jamais « Répartition » (le sceau le dit, et l'onglet
          le répète). */}
      <PlayHeader page="stats" title={manifest.title || t("common.untitledPlay")}>
        <div className="selects-row">
          {/* « Toute la pièce » est le premier choix de ce select, exactement
              comme « Tout l'acte » est celui du suivant : le niveau au-dessus
              vit en tête de la liste du niveau au-dessous, et la portée entière
              se règle dans les deux mêmes champs que les autres pages. */}
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
          {/* Sur « Toute la pièce », il n'y a pas de scène à choisir : ce select
              est donc désactivé, grisé, et **vide**. Rien à lire dedans, et c'est
              le but : « Tout l'acte » n'y serait plus vrai, et un libellé de repli
              (« Toutes les scènes » a été essayé) ne fait que redire ce que le
              champ d'à côté vient d'annoncer, en donnant à un champ éteint l'air
              de porter une valeur. Un champ vide et gris se lit d'un coup d'œil
              comme « pas de choix ici », et la portée se lit alors dans le seul
              champ qui la porte. Désactivé et pas retiré, pour que la rangée ne
              change pas de forme sous le curseur.
              L'option vide est là pour que le select reste CONTRÔLÉ sur la même
              valeur `ALL` : sans option correspondante, le champ perdrait sa
              valeur et le retour dans un acte repartirait d'un état incertain.
              Pas d'infobulle sur ce select : un contrôle `disabled` ne reçoit
              aucun événement souris, donc son `title` ne s'afficherait pas (même
              leçon que les boutons du bandeau de l'Édition, qui ont dû passer par
              une enveloppe `.btn-tip`). */}
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
        {/* Le seul réglage d'AFFICHAGE de la page, sous la rangée qui choisit la
            portée : il ne change pas ce qu'on regarde, seulement la forme du bloc.
            Un curseur et pas une liste de valeurs, parce que le bloc se recompose
            pendant qu'on le tire : c'est en le voyant bouger qu'on trouve la
            largeur qui va à sa pièce, et une liste demanderait d'essayer à
            l'aveugle. La valeur est écrite à côté, un curseur sans nombre ne se
            règle pas deux fois pareil. */}
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
          <span className="stats-scale-value">{columns}</span>
        </div>
      </PlayHeader>

      {/* La légende de la page, en barre sous le bandeau et non plus sous la
          mosaïque. C'est la SEULE surface qui désigne un personnage au clavier
          (les parts de camembert et les tronçons vivent dans des SVG en
          `role="img"`), et sur une pièce entière la mosaïque fait plusieurs
          écrans : sous elle, la légende n'était visible qu'en bout de course,
          donc la moitié du temps on lisait des couleurs sans pouvoir les nommer
          ni en isoler une. En haut, elle est toujours là et toujours cliquable.
          C'est aussi la légende des DEUX camemberts, qui ont chacun la sienne
          juste à côté d'eux : celle-ci n'a pas de nombres, elle ne sert qu'à
          mettre quelqu'un en évidence dans les trois dessins.
          Un `role="group"` nommé et pas une simple `<ul>` posée là : la barre
          n'a aucun texte pour dire ce qu'elle est, et l'intitulé de chaque
          bouton (« Ne montrer que … ») ne le dit qu'une fois qu'on y est.
          Rien quand la portée est vide : il n'y a personne à mettre en
          évidence, et une barre vide entre le bandeau et la phrase du vide se
          lirait comme un défaut d'affichage. */}
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

      {/* La zone défilante, et le `.container` reste DEDANS : c'est lui qui
          centre les cartes sur 900 px, alors que le défilement doit se faire au
          bord de la fenêtre, comme sur n'importe quelle page du site. */}
      <div className="stats-scroll">
        <div className="container">
          {totalLines === 0 ? (
            // Deux vides à ne pas confondre : une pièce vide s'écrit dans
            // l'Édition, une SCÈNE vide dans une pièce écrite se change en
            // choisissant une autre portée. Renvoyer à l'Édition dans le second
            // cas laissait croire que la pièce n'était pas saisie, alors qu'une
            // scène sans réplique est ordinaire pendant l'écriture.
            // La portée n'est PAS reprise dans la phrase : `scopeText` est
            // écrit pour l'`aria-label` d'un dessin (« Acte I, en entier »), et
            // inséré dans une phrase il donnait « Aucune réplique dans Acte I,
            // en entier », dont la suite proposait de changer de scène alors que
            // c'est l'acte entier qui est vide. (C'est ce défaut qui a fait
            // rendre des RANGS à `scopeOf` : la mise en phrase appartient à
            // l'appelant, qui seul sait dans quelle tournure il l'insère.) Les deux selects du bandeau
            // disent déjà où l'on est ; la phrase dit seulement quoi faire, et
            // les trois sorties possibles, dans l'ordre des contrôles.
            <div className="empty-state">
              {playIsEmpty
                ? t("stats.emptyPlay", { page: t(pageLabelKey("editor")) })
                : /* Le premier choix du select de portée est INTERPOLÉ et pas
                     recopié : les deux libellés se désaccorderaient au premier
                     remaniement de la rangée. */
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

              {/* La chronologie n'a plus de légende : elle est en barre, en haut
                  de la page. Ce panneau ne reçoit donc plus ni `onSelect` ni
                  `onHover`, la mosaïque ne désignant personne au pointeur. */}
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

// ------------------------------------------------- désigner un personnage

// Le survol préfigure la mise en évidence : c'est ce qui permet de parcourir une
// distribution sans cliquer dix fois, et il rend les dessins visiblement
// sensibles au pointeur, ce qui est la seule chose qui dise qu'ils répondent.
//
// **À la souris uniquement**, et le garde n'est pas défensif : au doigt, le
// navigateur émet un survol émulé APRÈS l'appui, qui reste ensuite accroché à
// l'élément touché. Sans le filtre, appuyer une seconde fois pour tout remontrer
// laissait le personnage allumé par ce survol fantôme, donc le bouton ne
// s'éteignait jamais. `onPointerLeave` est filtré pour la même raison, par
// symétrie.
const hoverProps = (id, onHover) => ({
  onPointerEnter: (e) => {
    if (e.pointerType === "mouse") onHover(id);
  },
  onPointerLeave: (e) => {
    if (e.pointerType === "mouse") onHover(null);
  },
});

// Les TROIS légendes de la page sont ce composant, et c'est ce qui les tient
// d'accord : le même bouton, le même intitulé, le même état enfoncé, qu'il porte
// des nombres (les camemberts) ou le seul nom (la chronologie). Elles étaient
// deux affichages différents, une liste inerte à côté des anneaux et des boutons
// sous le bloc, alors que les deux disent la même chose des mêmes gens.
//
// C'est aussi la SEULE surface accessible au clavier et aux lecteurs d'écran :
// les parts de camembert et les blocs de la chronologie vivent dans des SVG en
// `role="img"`, dont les descendants ne sont pas exposés (c'est le parti de la
// page : le dessin se résume, les nombres sont dans la liste à côté). Y poser des
// boutons ferait une trentaine d'arrêts de tabulation qui ne diraient rien de
// plus que ces légendes. Ce qui se fait à la souris sur un dessin se fait donc
// toujours ici au clavier.
//
// `value` absent = légende sans nombres, celle de la barre du haut.
function CharacterLegend({ rows, colorOf, nameOf, highlight, pinned, onSelect, onHover, value, total, flow }) {
  return (
    <ul className={flow ? "stats-legend stats-legend-flow" : "stats-legend"}>
      {rows.map((row) => {
        const color = colorOf(row.id);
        // L'aspect suit le survol, l'état annoncé suit le choix arrêté (cf.
        // `highlight` et `pinned` dans `Stats`). L'intitulé aussi : sur une
        // rangée seulement survolée, un appui met en évidence, il ne remet pas
        // tout le monde.
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
              {/* Le nom reste à l'encre du thème, dans les trois légendes : c'est
                  la pastille juste à sa gauche qui porte la couleur, et la même
                  classe rendue tantôt en `--ink` tantôt en couleur de personnage
                  donnait deux traitements du même élément sur un seul écran. */}
              <span className="stats-legend-name">{nameOf(row)}</span>
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

// ------------------------------------------------------------------ camembert

// Rayon et épaisseur de l'anneau, dans le repère du viewBox (100 x 100). La
// circonférence sert d'unité aux `stroke-dasharray` : une part vaut sa fraction
// de circonférence, donc rien à convertir.
const R = 38;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Un anneau, une part par personnage, et la légende porte les nombres.
//
// Les pourcentages ne sont PAS posés sur les parts, contrairement à la version
// matplotlib (`autopct`) : dès qu'une part est petite, son étiquette chevauche
// sa voisine, et sur une scène à huit personnages il y en a toujours une. Ils
// vivent dans la légende, à côté du nom et du décompte, où ils s'alignent.
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
  // CHAQUE camembert se trie sur SA grandeur, comme les deux `argsort` de la
  // référence. Trier les deux sur les mots laissait la colonne du camembert des
  // répliques dans le désordre (162, 200, 192, 119…), et une colonne de nombres
  // qui ne descend pas se relit chiffre par chiffre. Le tri est ici et pas dans
  // `speechStats` : c'est un ordre d'AFFICHAGE, et il diffère d'un panneau à
  // l'autre sur les mêmes données.
  const ordered = [...rows].sort((a, b) => value(b) - value(a) || b.words - a.words);

  // Les parts non nulles seulement : une part de zéro ne se dessine pas, mais
  // elle reste dans la légende (un personnage qui a des répliques et zéro mot
  // existe, cf. une réplique vide).
  let offset = 0;
  const slices = [];
  for (const row of ordered) {
    const fraction = total ? value(row) / total : 0;
    if (fraction > 0) {
      slices.push({ row, fraction, offset });
      offset += fraction;
    }
  }

  // Le total tel qu'il s'écrit, une seule fois : il sert à mesurer la taille du
  // texte du centre et à l'écrire. L'`aria-label` juste en dessous reçoit le
  // NOMBRE et pas cette chaîne, `makeT` formatant lui-même tout paramètre
  // numérique (donc le même séparateur des deux côtés, sans le poser deux fois).
  const writtenTotal = fmt.number(total);

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{title}</h2>

      <div className="stats-donut-row">
        {/* `role="img"` plus l'`aria-label` : le dessin se résume, et les
            nombres exacts sont dans la liste à côté, donc rien ne repose sur la
            seule couleur. */}
        <svg
          className="stats-donut"
          viewBox="0 0 100 100"
          role="img"
          aria-label={t("stats.donutLabel", { title, where, total, unit })}
        >
          {/* Le fond de l'anneau : sans lui, une portée d'un seul personnage
              dessine un cercle complet et on ne voit pas qu'il est plein. */}
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
                // Une part se désigne au pointeur, comme sa ligne de légende :
                // c'est le même geste sur le même personnage. Rien à découper
                // pour ça, le test de survol d'un trait pointillé ne retient que
                // le peint (vérifié : l'arc répond, son intervalle non), donc
                // l'arc EST la cible.
                onClick={() => onSelect(row.id)}
                {...hoverProps(row.id, onHover)}
                // Le `stroke` EST la part : l'anneau est un cercle sans
                // remplissage dont on ne peint qu'un arc, donc la couleur de la
                // palette telle quelle, comme la pastille de la légende juste à
                // côté (l'encre foncée, elle, est réservée au texte, cf.
                // `characterInk`). Contrairement à cette pastille, une part n'a
                // pas de filet : deux teintes claires voisines (personnages 11 à
                // 20) se touchent donc sans séparation.
                style={{
                  stroke: color ?? "var(--ink-soft)",
                  strokeDasharray: `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
                  strokeDashoffset: -start * CIRCUMFERENCE,
                }}
              />
            );
          })}
          {/* Le total au centre de l'anneau : c'est le denominateur de tous les
              pourcentages de la légende, il doit être lisible sans calcul.
              Les deux lignes RÉTRÉCISSENT si elles ne tiennent pas dans le trou
              (cf. `centerFontSize`), sinon le total d'une pièce à six chiffres
              sortait sous l'anneau et l'unité la plus longue touchait déjà les
              bords. La taille descend en style et pas en CSS parce que c'est
              stats.js qui la calcule ; le même chiffre écrit aux deux endroits se
              désaccorderait au premier réglage. */}
          {/* La MÊME chaîne mesure et s'écrit : `fmt.number` pose un séparateur
              de milliers (insécable étroite en français, virgule en anglais),
              donc mesurer le nombre nu rendrait une taille calculée sur un texte
              qui n'est pas celui dessiné. `centerFontSize` compte ce séparateur
              pour ce qu'il est, plus fin qu'un chiffre. */}
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

// ------------------------------------------------------------------- le bloc

// Le bloc « chronologie du dialogue » : un carré par mot, replié rangée par
// rangée, coloré par le personnage qui le prononce.
//
// « Carré » et pas « pixel », alors que c'est bien un pixel par mot que la
// référence Python dessinait : la page est ouverte à toute la troupe, et un
// pixel n'est un mot connu que de qui sait déjà qu'un pixel CONCEPTUEL est rendu
// par plusieurs pixels d'écran (huit de côté au réglage par défaut, quatre au
// bout de la course). « Carré » se voit à l'écran et ne demande rien à personne.
//
// En SVG et pas en `<canvas>` : le site n'a qu'un canvas, l'oscilloscope du
// micro, et un SVG reste net à toute échelle (donc à l'impression, et sur un
// écran dense). Un `<rect>` par TRONÇON et pas par mot : la pièce entière fait
// près de 10 000 mots pour quelques centaines de tronçons.
//
// **La mosaïque ne se désigne pas au pointeur** : elle SUIT le choix (les mots
// des autres s'éteignent) mais ne le prend pas. Un mot fait 8 px au réglage par
// défaut et 4 px au bout de la course (cf. `DEFAULT_COLUMNS` et `MAX_COLUMNS`),
// donc viser le bon personnage y est un coup de dés, et un tronçon d'un seul mot est
// intouchable ; le survol, lui, changerait de personnage tous les deux pixels et
// rallumerait les trois dessins en continu pour un geste qui n'est même pas une
// désignation. Les parts de camembert et les trois légendes sont larges et
// nommées, c'est là que le choix se fait, et la légende de la page est en haut,
// toujours à portée. C'est aussi ce qui garde une seule façon de désigner
// quelqu'un au clavier comme à la souris.
function Timeline({ block, rows, where, colorOf, nameOf, highlight, pinned }) {
  const { rects, columns, rows: lineCount } = block;

  return (
    <section className="card stats-panel">
      <h2 className="stats-panel-title">{t("stats.timeline.title")}</h2>

      {/* Comment lire le dessin se lit AVANT lui, sous le titre du panneau, et
          plus en pied de carte : la mosaïque d'une pièce entière fait plusieurs
          écrans, donc une explication placée dessous n'arrivait qu'à qui avait
          déjà défilé jusqu'au bout, c'est-à-dire à qui n'en avait plus besoin.
          « Prise de parole » et pas « réplique » : les répliques voisines d'un
          même personnage sont fusionnées avant le dessin (cf. `blockRects`), donc
          un bloc vaut ce qu'il dit d'affilée, qui peut faire plusieurs répliques
          du script. Les camemberts, eux, comptent bien des répliques.
          « Appuyez » et pas « cliquez » : la page est ouverte à toute la troupe,
          donc au téléphone, et c'est le verbe du reste du site (cf. la page
          Enregistrement ; seule l'Édition l'évite, elle ne s'ouvre qu'à la
          souris).
          La dernière phrase est la seule de la page à dire la mise en évidence, et
          elle est ici parce que c'est ici qu'elle sert : le geste vaut pour les
          trois dessins, mais la mosaïque est le seul qui ne dise rien de lui-même
          (une part de camembert porte son nom dans la légende d'à côté). Elle
          nomme les deux surfaces qui répondent, et surtout pas la mosaïque, qui
          reste inerte au pointeur ; elle dit aussi OÙ sont les noms, la barre du
          haut n'étant plus juste sous le dessin qu'elle explique. Elle ne parle
          pas du survol : il se trouve tout seul, il n'existe pas au doigt, et une
          phrase qui décrit le pointeur ne sert que ceux qui n'en ont pas
          besoin. */}
      <p className="stats-caption">{t("stats.timeline.caption")}</p>

      <svg
        className="stats-block"
        viewBox={`0 0 ${columns} ${lineCount}`}
        /* Le nombre de colonnes descend au CSS, qui arrondit la largeur rendue à
           un multiple entier de ce nombre : c'est ce qui donne à tous les mots
           exactement la même taille sous `crispEdges` (cf. stats.css). */
        style={{ "--stats-columns": columns }}
        role="img"
        // Le résumé suit le choix ARRÊTÉ et pas le survol : une description qui
        // se réécrirait au passage du curseur n'est pas une description.
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

      {/* Tournure impersonnelle, comme sur les deux autres pages de la troupe
          (« la pièce doit d'abord être saisie ») et comme le vide de celle-ci :
          cette page est ouverte à tout le monde, or l'Édition ne l'est pas (elle
          n'est pas dans `ACTOR_CARDS`, et elle ne s'ouvre pas au doigt), donc un
          impératif y commanderait un geste que son lecteur ne peut pas faire.
          L'Avancement, lui, dit bien « Ouvrez la page Édition » : là c'est le
          responsable qui lit. */}
      {rows.some((row) => row.id === UNKNOWN) && (
        <p className="stats-warning">
          <WarnIcon />
          {t("stats.orphanWarning", { page: t(pageLabelKey("editor")) })}
        </p>
      )}
    </section>
  );
}
