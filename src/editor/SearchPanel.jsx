import React, { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon } from "../shared/icons.jsx";
import { characterColor, characterInk } from "../shared/characterColors.js";
import { matchExcerpt } from "./search.js";
import { fmt, t } from "../shared/locale.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";

// Les deux décomptes du panneau, composés ensuite dans les phrases : le pluriel
// vient d'`Intl.PluralRules` et plus d'un `n > 1 ? "s" : ""`, qui n'avait aucune
// chance en anglais (« 0 matches ») et n'aurait pas passé une troisième langue.
const matchCount = (count) => t("search.matchCount", { count });
const sceneCount = (count) => t("search.sceneCount", { count });

// La section « Recherche » du rail. Purement présentationnelle : elle reçoit
// l'état de recherche et des rappels, elle n'en garde aucun (changer de section
// démonte ce composant, cf. useSearch.js).
export default function SearchPanel({
  characters,
  query,
  setQuery,
  shownQuery,
  replacement,
  setReplacement,
  caseSensitive,
  setCaseSensitive,
  wholeWord,
  setWholeWord,
  replaceOpen,
  setReplaceOpen,
  total,
  groups,
  searching,
  currentMatch,
  next,
  prev,
  replaceCurrent,
  replaceAll,
  onSelect,
  focusSeq,
}) {
  const inputRef = useRef(null);
  const [confirmAll, setConfirmAll] = useState(false);

  // À l'ouverture du panneau, et à chaque Ctrl+F (d'où le compteur : un panneau
  // déjà ouvert ne change aucun état, il n'y aurait rien à observer).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);

  const hasQuery = query.length > 0;

  return (
    <>
      {/* Ces réglages ne défilent pas avec les résultats : on relit la requête,
          on recoche « Mot entier », on relance un remplacement en parcourant une
          longue liste, et les faire remonter chercher en haut du panneau était
          le geste le plus fréquent de l'écran. C'est `.editor-rail-body` qui
          n'accorde le défilement qu'à `.search-results`. */}
      <div className="search-controls">
        {/* Le libellé dit ce que la case fait, l'infobulle donne l'exemple : la
            règle des quatre cases de la Répétition.
            **Au-dessus du champ**, et c'est un déménagement : les deux cases
            séparaient la requête de son remplacement, alors que ce sont les deux
            champs qui vont ensemble (on tape l'un, on tape l'autre, on relit les
            deux avant de remplacer). Deux cases qui règlent la recherche se lisent
            très bien avant elle, un champ de remplacement à trois blocs de son
            champ de requête ne se lisait pas comme sa suite. */}
        <div className="search-options">
          <label title={t("search.caseSensitive.tip")}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            {t("search.caseSensitive")}
          </label>
          <label title={t("search.wholeWord.tip")}>
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            {t("search.wholeWord")}
          </label>
        </div>

        <div className="search-query-row">
          {/* Le dévoilement du remplacement est un chevron qui pivote, à GAUCHE du
              champ, comme dans un éditeur de code : il commande ce qui apparaît
              en dessous, donc il se lit avant. Il est ENCADRÉ au repos et haut
              comme le champ, contrairement au chevron nu du premier essai : c'est
              le seul chemin vers le remplacement, et un glyphe gris sans cadre au
              bord d'un champ de saisie se lisait comme une décoration du champ. */}
          <button
            className="search-replace-toggle"
            aria-label={t("search.replace")}
            title={t(replaceOpen ? "search.hideReplace" : "search.showReplace")}
            aria-expanded={replaceOpen}
            aria-controls="search-replace"
            onClick={() => setReplaceOpen(!replaceOpen)}
          >
            <ChevronIcon />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="search-field"
            placeholder={t("search.placeholder")}
            // L'étiquette dit le périmètre, que le placeholder n'a pas la place
            // de dire : la recherche ne voit que les répliques, ni les titres
            // d'acte ou de scène, ni les noms de personnages.
            aria-label={t("search.label")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Entrée appartient au CHAMP et jamais à `window` : sur window elle
              // tomberait aussi dans chaque textarea de réplique, où elle crée
              // déjà la réplique suivante. Et elle ne prend pas le focus (cf.
              // useSearch), pour rester répétable.
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            }}
          />
        </div>

        {/* Démonté et pas seulement masqué : le bandeau garde ses réglages
            montés pour pouvoir animer une hauteur inconnue, ici il n'y a rien à
            animer et rien ne doit rester dans le parcours au clavier. Le texte
            déjà tapé survit quand même, il vit dans useSearch.
            **Juste sous le champ de requête**, comme dans un éditeur de code : les
            deux champs se lisent et se tabulent d'affilée, et le chevron qui
            l'ouvre est à deux centimètres de ce qu'il fait apparaître. */}
        {replaceOpen && (
          <div className="search-replace" id="search-replace">
            <input
              type="text"
              className="search-field"
              placeholder={t("search.replacePlaceholder")}
              aria-label={t("search.replacePlaceholder")}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />

            {/* `.btn.small` et jamais `.btn.primary` : l'accent plein est le
                bouton de téléchargement du site, partout. */}
            <div className="search-actions">
              <span
                className="btn-tip"
                title={t(
                  currentMatch
                    ? "search.replaceCurrent.tip"
                    : total > 0
                      ? "search.pickFirst"
                      : "search.noneToReplace"
                )}
              >
                <button className="btn small" onClick={replaceCurrent} disabled={!currentMatch}>
                  {t("search.replace")}
                </button>
              </span>
              <span
                className="btn-tip"
                title={
                  total > 0
                    ? t("search.replaceAll.tip", { matches: matchCount(total) })
                    : t("search.noneToReplace")
                }
              >
                <button
                  className="btn small"
                  onClick={() => setConfirmAll(true)}
                  disabled={total === 0}
                >
                  {t("search.replaceAll")}
                </button>
              </span>
            </div>
          </div>
        )}

        {/* Le compte et les flèches ferment les réglages, juste au-dessus de la
            liste qu'ils comptent et parcourent. */}
        <div className="search-count-row">
          {/* Seul le compte est vif : un aria-live sur la liste bavarderait à
              chaque frappe. Pas de « 3 sur 12 » à côté des flèches, la liste est
              toujours affichée et marque la ligne courante, donc la position se
              voit (VSCode l'écrit parce que sa liste se replie). */}
          <p className={`search-count ${searching ? "stale" : ""}`} aria-live="polite">
            {hasQuery
              ? total > 0
                ? t("search.count", {
                    matches: matchCount(total),
                    scenes: sceneCount(groups.length),
                  })
                : t("search.none")
              : ""}
          </p>
          {/* Infobulles portées par une enveloppe et jamais par le bouton : un
              contrôle `disabled` ne reçoit aucun événement souris, donc son
              propre `title` ne s'afficherait pas au moment où il sert. Le nom
              accessible, lui, reste sur le bouton et ne dépend pas de l'état. */}
          <span className="search-nav">
            <span
              className="btn-tip"
              title={t(total > 0 ? "search.prev.tip" : "search.noneToBrowse")}
            >
              <button
                className="btn icon small"
                onClick={() => prev(true)}
                disabled={total === 0}
                aria-label={t("search.prev")}
              >
                <ArrowUpIcon />
              </button>
            </span>
            <span
              className="btn-tip"
              title={t(total > 0 ? "search.next.tip" : "search.noneToBrowse")}
            >
              <button
                className="btn icon small"
                onClick={() => next(true)}
                disabled={total === 0}
                aria-label={t("search.next")}
              >
                <ArrowDownIcon />
              </button>
            </span>
          </span>
        </div>
      </div>

      {groups.length > 0 && (
        <ResultList
          groups={groups}
          characters={characters}
          currentMatch={currentMatch}
          onSelect={onSelect}
          searching={searching}
        />
      )}

      {confirmAll && (
        // Le geste est annulable en une étape, et il se confirme quand même,
        // pour la raison qui fait confirmer une suppression d'acte : ce qu'on
        // touche n'est pas à l'écran, et c'est le nombre qui surprend.
        <ConfirmModal
          title={t("search.replaceAllTitle", { matches: matchCount(total) })}
          confirmLabel={t("search.replace")}
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => {
            setConfirmAll(false);
            replaceAll();
          }}
        >
          {/* `shownQuery` et pas `query` : le titre annonce un nombre issu du
              rendu différé (cf. useSearch.js), et c'est cette requête-là que
              `replaceAll` réécrit. Citer la frappe en cours ferait une phrase qui
              compte une requête et en nomme une autre, le temps que le rendu
              rattrape.
              Les guillemets viennent de `fmt.quote` (donc les insécables en
              français, des guillemets droits en anglais) et plus de `&nbsp;»`
              écrits à la main. Un champ de remplacement vide est légitime
              (supprimer un mot partout) : c'est la seconde phrase qui le dit,
              plutôt que de laisser croire à un remplacement par rien. */}
          <p>
            {replacement
              ? t("search.replaceAllInto", {
                  scenes: sceneCount(groups.length),
                  query: fmt.quote(shownQuery),
                  replacement: fmt.quote(replacement),
                })
              : t("search.replaceAllDelete", {
                  scenes: sceneCount(groups.length),
                  query: fmt.quote(shownQuery),
                })}
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

// Pas de virtualisation ? Impossible ici, et ce n'est pas un choix de confort :
// afficher toutes les occurrences (6216 pour une requête d'un seul caractère sur la
// vraie pièce) demandait à React de créer, puis de détruire à la frappe suivante,
// des dizaines de milliers de nœuds. `useDeferredValue` (useSearch.js) a réglé le
// rendu, qui est interruptible, mais la phase de COMMIT ne l'est pas : il restait
// des tâches bloquantes de 76 à 134 ms, donc une frappe qui bégaie. Mesuré.
//
// On ne rend donc que la tranche visible, et c'est la hauteur FIXE des rangées qui
// le permet : la position de chacune se calcule sans l'avoir mesurée, donc la
// hauteur totale est exacte dès le premier rendu et l'ascenseur ne mentira jamais
// (c'est la même exigence que celle qui a valu la hauteur fixe, cf. editor.css).
//
// Les deux hauteurs ci-dessous sont un CONTRAT avec editor.css : `.search-row`
// fait 66 px (62 de rangée plus 4 de gouttière) et `.search-group-head` 30. Les
// changer d'un côté sans l'autre décale la liste sous l'ascenseur.
//
// Prix assumé : un lecteur d'écran n'annonce que les éléments rendus, pas les 6216
// de la liste. C'est le prix de toute liste fenêtrée ; le compte, lui, est dit en
// clair juste au-dessus, et il est le seul `aria-live` du panneau.
const ROW_H = 66;
const HEAD_H = 30;
// De quoi couvrir un coup de molette entre deux rendus.
const OVERSCAN = 6;

function ResultList({ groups, characters, currentMatch, onSelect, searching }) {
  const boxRef = useRef(null);
  const [view, setView] = useState({ top: 0, height: 0 });

  // Une seule liste à plat : les en-têtes de scène y sont des éléments comme les
  // autres. C'est ce qui rend l'arithmétique des positions triviale (un tableau
  // cumulé), là où un fenêtrage par groupe demanderait de découper chaque groupe.
  const items = useMemo(() => {
    const out = [];
    for (const group of groups) {
      out.push({ head: group, key: `t-${group.actIndex}-${group.sceneIndex}` });
      for (const match of group.matches) out.push({ match, key: `${match.lineId}-${match.start}` });
    }
    return out;
  }, [groups]);

  const offsets = useMemo(() => {
    const offs = new Array(items.length + 1);
    let y = 0;
    for (let i = 0; i < items.length; i++) {
      offs[i] = y;
      y += items[i].head ? HEAD_H : ROW_H;
    }
    offs[items.length] = y;
    return offs;
  }, [items]);

  const totalH = offsets[items.length] ?? 0;

  // La hauteur visible se mesure, elle ne se devine pas : le panneau se
  // redimensionne (poignée du bord, fenêtre, dépliage du remplacement).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => setView({ top: box.scrollTop, height: box.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Amener la correspondance courante à l'écran : sans ça, « suivant » marquerait
  // une rangée qui n'est pas rendue, donc invisible et introuvable.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !currentMatch) return;
    const i = items.findIndex((it) => it.match === currentMatch);
    if (i < 0) return;
    const top = offsets[i];
    const bottom = top + ROW_H;
    if (top < box.scrollTop) box.scrollTop = top - HEAD_H;
    else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight;
    }
  }, [currentMatch, items, offsets]);

  const first = indexAt(offsets, view.top, items.length);
  const last = indexAt(offsets, view.top + view.height, items.length);
  const from = Math.max(0, first - OVERSCAN);
  const to = Math.min(items.length, last + 1 + OVERSCAN);
  // Les deux cales sont le remplissage de la liste : aucun élément de plus à
  // créer, et la hauteur totale reste exacte.
  const padTop = offsets[from];
  const padBottom = totalH - offsets[to];

  return (
    <div
      className={`search-results ${searching ? "stale" : ""}`}
      ref={boxRef}
      onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
    >
      <ul className="search-flat" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        {items.slice(from, to).map((item) =>
          item.head ? (
            <li className="search-group-head" key={item.key}>
              {/* Aucun séparateur écrit entre les deux libellés : à deux graisses
                  différentes il n'y a rien à séparer, et une ponctuation entre eux
                  serait à traduire pour rien. Ils sont dérivés du rang du groupe
                  (structureLabels.js), les actes et les scènes n'ayant plus de
                  titre. */}
              <h3 className="search-group-title">
                <span className="search-group-act">{actLabel(t, item.head.actIndex)}</span>
                <span className="search-group-scene">{sceneLabel(t, item.head.sceneIndex)}</span>
              </h3>
            </li>
          ) : (
            <li className="search-row" key={item.key}>
              <Hit
                match={item.match}
                characters={characters}
                isCurrent={item.match === currentMatch}
                onSelect={onSelect}
              />
            </li>
          )
        )}
      </ul>
    </div>
  );
}

// Le premier élément dont le bas dépasse `y`, par dichotomie sur les positions
// cumulées (elles sont croissantes par construction).
function indexAt(offsets, y, count) {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Rend le BOUTON seul, sans élément de liste : c'est `.search-row` qui est le
// `<li>`. Un `<li>` de plus ici (il y en a eu un) était à la fois un élément de
// liste imbriqué dans un élément de liste, donc du HTML invalide qu'un lecteur
// d'écran annonce comme une liste de plus, et un bug visible : `.search-hit`
// prend `height: 100%`, or un pourcentage se résout contre la hauteur du parent,
// et ce parent-là n'en avait pas de fixée. La carte retombait donc à la hauteur de
// son contenu, un extrait qui tient sur une ligne (ou une réplique dont le
// personnage a disparu) laissait 14 à 18 px de crème sous elle, et l'interligne
// de la liste avait l'air de changer d'une rangée à l'autre.
function Hit({ match, characters, isCurrent, onSelect }) {
  const { before, hit, after } = matchExcerpt(match);
  const character = characters.find((c) => c.id === match.characterId) ?? null;
  const color = characterColor(characters, match.characterId);
  const ink = color === null ? null : characterInk(color);

  return (
    <button
      type="button"
      className={`search-hit ${isCurrent ? "current" : ""}`}
      // La correspondance courante n'est pas signalée par la seule couleur.
      aria-current={isCurrent ? "true" : undefined}
      // Un clic focalise la réplique et y sélectionne le texte trouvé : on va
      // éditer là, contrairement à Entrée et F3, qui laissent le clavier au champ.
      onClick={() => onSelect(match, true)}
    >
      {character && (
        // Le nom est du texte en 11 px : c'est l'encre et pas l'aplat de la
        // palette, qui est faite pour des surfaces (cf. `characterInk`).
        <span className="search-hit-who" style={{ color: ink ?? undefined }}>
          {character.name}
        </span>
      )}
      {/* `<mark>` est exact ici : c'est un extrait de texte, pas un textarea. */}
      <span className="search-hit-text">
        {before}
        <mark>{hit}</mark>
        {after}
      </span>
    </button>
  );
}
