import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildReplaceEdits, replaceOneEdit, searchScript } from "./search.js";

// L'état de la recherche de l'éditeur : la requête, les deux options, le texte
// de remplacement, et l'ANCRE de la correspondance courante.
//
// Il vit ici et pas dans SearchPanel, parce que changer de section du rail
// démonte le panneau : une requête perdue en allant renommer un personnage
// serait une régression de tous les instants.
//
// **Les correspondances sont toujours FRAÎCHES**, recalculées par `useMemo` sur
// le script. Jamais un instantané pris à la validation : un instantané ne serait
// pas seulement périmé, il serait faux, ses offsets pointant dans un texte qui
// n'existe plus, donc un clic sélectionnerait la mauvaise portion et un
// remplacement couperait au mauvais indice. Le coût est de l'ordre de la
// dizaine de microsecondes par frappe, le repliement étant mémorisé par
// réplique (cf. search.js).
//
// **L'ancre n'est pas un rang.** Les rangs glissent à chaque frappe et le nombre
// de correspondances change à chaque remplacement : on retient une POSITION
// (`{lineId, lineOrdinal, start}`) et on retrouve son rang par render. Quand
// aucune correspondance n'est exactement là (après un remplacement, après une
// frappe qui a changé le texte trouvé, après un changement de requête, après un
// Ctrl+Z sur un « Tout remplacer »), `currentIndex` vaut -1 : le compte
// s'affiche, aucune ligne n'est marquée courante, et le « suivant » reprend là
// où on en était. Tout cela tombe du calcul dérivé, sans une ligne de code par
// cas.
export default function useSearch({ script, dispatch, goToMatch, isOpen, onOpen, onClose, enabled }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(null);
  // Le remplacement est REPLIÉ par défaut, comme dans un éditeur de code : la
  // plupart du temps on cherche une réplique pour aller la retoucher à la main,
  // et un champ « Remplacer par » toujours ouvert propose une réécriture en masse
  // à qui voulait seulement retrouver un passage. Le drapeau vit ici et pas dans
  // SearchPanel, comme la requête : changer de section du rail démonte le
  // panneau, et rouvrir sur un remplacement replié ferait perdre le texte de
  // remplacement déjà tapé.
  const [replaceOpen, setReplaceOpen] = useState(false);
  // Compteur et pas un booléen : Ctrl+F sur un panneau DÉJÀ ouvert doit
  // re-focaliser le champ et tout sélectionner, alors qu'aucun état ne change.
  // La demande de focus d'une réplique, elle, n'en a pas besoin : elle s'efface
  // dès qu'elle est honorée (cf. focusRequest dans App.jsx).
  const [focusSeq, setFocusSeq] = useState(0);

  const options = useMemo(() => ({ caseSensitive, wholeWord }), [caseSensitive, wholeWord]);

  // **La frappe ne rend pas la liste dans la même tâche qu'elle.** Chercher est
  // gratuit (quelques dizaines de microsecondes, cf. search.js), mais AFFICHER
  // plusieurs milliers de résultats coûte à React la création d'autant de
  // composants : mesuré, une tâche bloquante de 329 ms pour la requête « e » et
  // ses 6216 occurrences, 88 ms dès 750. Pendant ce temps le champ ne se
  // rafraîchit pas, donc la frappe bégaie. `content-visibility` (editor.css) n'y
  // fait rien : il épargne la mise en page et la peinture, pas le travail de
  // React.
  // `useDeferredValue` rend la requête au champ tout de suite et la liste dans une
  // passe interruptible : React peut la découper en tranches et ABANDONNER celle
  // qui est déjà périmée quand la frappe suivante arrive. On ne paie donc plus le
  // rendu des états intermédiaires (« v », « vo », « vou » en tapant « vous »).
  // Piste écartée : replafonner le nombre de résultats affichés, c'est-à-dire
  // reprendre d'une main ce que « tout afficher » venait de donner.
  const shownQuery = useDeferredValue(query);
  const shownOptions = useDeferredValue(options);
  // Le rendu à l'écran est en retard sur le champ : c'est ce qui permet de le
  // signaler sans mentir (le compte et la liste décrivent la MÊME requête, celle
  // du dernier rendu, jamais celle qu'on est en train de taper).
  const searching = query !== shownQuery || options !== shownOptions;

  const { matches, total, groups } = useMemo(
    () => searchScript(script, shownQuery, shownOptions),
    [script, shownQuery, shownOptions]
  );

  const currentIndex = useMemo(() => {
    if (!current) return -1;
    return matches.findIndex((m) => m.lineId === current.lineId && m.start === current.start);
  }, [matches, current]);

  const anchorOn = (match, start = match.start) => ({
    lineId: match.lineId,
    lineOrdinal: match.lineOrdinal,
    start,
  });

  const goTo = useCallback(
    (match, focus) => {
      setCurrent(anchorOn(match));
      goToMatch(match, focus);
    },
    [goToMatch]
  );

  // `focus` distingue les deux gestes, et ce n'est pas un détail : Entrée dans
  // le champ et F3 ne doivent PAS prendre le clavier, sinon le curseur part dans
  // un textarea de réplique où Entrée crée déjà la réplique suivante, et la
  // touche ne se répète plus. Un clic sur un résultat, lui, focalise : on va
  // éditer là.
  const next = useCallback(
    (focus = false) => {
      if (total === 0) return;
      if (currentIndex >= 0) return goTo(matches[(currentIndex + 1) % total], focus);
      if (!current) return goTo(matches[0], focus);
      const after = matches.find(
        (m) =>
          m.lineOrdinal > current.lineOrdinal ||
          (m.lineOrdinal === current.lineOrdinal && m.start >= current.start)
      );
      goTo(after ?? matches[0], focus);
    },
    [matches, total, currentIndex, current, goTo]
  );

  const prev = useCallback(
    (focus = false) => {
      if (total === 0) return;
      if (currentIndex >= 0) return goTo(matches[(currentIndex - 1 + total) % total], focus);
      if (!current) return goTo(matches[total - 1], focus);
      let before = null;
      for (const m of matches) {
        const earlier =
          m.lineOrdinal < current.lineOrdinal ||
          (m.lineOrdinal === current.lineOrdinal && m.start < current.start);
        if (!earlier) break;
        before = m;
      }
      goTo(before ?? matches[total - 1], focus);
    },
    [matches, total, currentIndex, current, goTo]
  );

  const replaceCurrent = useCallback(() => {
    if (currentIndex < 0) return;
    const match = matches[currentIndex];
    const edit = replaceOneEdit(match, replacement);
    dispatch({
      type: "SET_LINE_TEXTS",
      edits: [{ lineId: edit.lineId, text: edit.text }],
    });
    // L'ancre passe APRÈS ce qui vient d'être écrit : « suivant » ne peut donc
    // pas retomber sur le remplacement lui-même, qui peut contenir la requête.
    setCurrent(anchorOn(match, edit.nextStart));
  }, [matches, currentIndex, replacement, dispatch]);

  const replaceAll = useCallback(() => {
    // Ré-dérivé de la pièce et pas du tableau affiché (que le panneau plafonne) :
    // un plafond d'affichage ne doit jamais décider de ce qui est réécrit.
    const edits = buildReplaceEdits(script, shownQuery, shownOptions, replacement);
    if (edits.length === 0) return;
    dispatch({ type: "SET_LINE_TEXTS", edits });
    setCurrent(null);
    // La requête affichée et non celle du champ : c'est le compte annoncé par la
    // confirmation qu'on doit réécrire, et il vient de la liste affichée.
  }, [script, shownQuery, shownOptions, replacement, dispatch]);

  const openAndFocus = useCallback(() => {
    onOpen();
    setFocusSeq((n) => n + 1);
  }, [onOpen]);

  // Raccourcis de la page. Effet SÉPARÉ de celui d'annuler/rétablir (App.jsx),
  // qui se réabonne à chaque édition (ses dépendances sont `canUndo`/`canRedo`) :
  // les mélanger réabonnerait les deux à chaque frappe et emmêlerait deux listes
  // de dépendances. Les deux écoutent en phase de bouillonnement et se partagent
  // des touches disjointes, donc l'ordre d'inscription est indifférent.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      // Un ConfirmModal ouvert écoute Escape en phase de CAPTURE et appelle
      // preventDefault sans stopPropagation : sans ce garde, un Escape destiné à
      // fermer la modale fermerait aussi le panneau derrière elle. Le garde vit
      // ici et pas dans le composant partagé, que la page Enregistrement utilise
      // aussi.
      if (e.defaultPrevented) return;

      // Ctrl+H, le compagnon de Ctrl+F : il ouvre la recherche AVEC son
      // remplacement déplié. Sans lui, un remplacement replié par défaut se paie
      // d'un clic de plus à chaque fois.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        seedFromSelection(setQuery);
        setReplaceOpen(true);
        openAndFocus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        // On prend la main sur le Ctrl+F du navigateur, exprès : sa recherche ne
        // lit pas la valeur des textarea, et une seule scène est montée à la
        // fois, donc elle ne trouverait presque rien.
        e.preventDefault();
        seedFromSelection(setQuery);
        openAndFocus();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
        return;
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, isOpen, onClose, openAndFocus, next, prev]);

  return {
    query,
    setQuery,
    // La requête RENDUE, celle que décrivent le compte, la liste et
    // `replaceAll`. Exposée parce que la confirmation de « Tout remplacer » doit
    // citer celle-là et pas celle du champ : son titre annonce un nombre issu du
    // rendu différé, donc citer la frappe en cours ferait une phrase qui compte
    // une requête et en nomme une autre.
    shownQuery,
    replacement,
    setReplacement,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    replaceOpen,
    setReplaceOpen,
    matches,
    total,
    groups,
    searching,
    currentIndex,
    next,
    prev,
    select: goTo,
    replaceCurrent,
    replaceAll,
    focusSeq,
    openAndFocus,
  };
}

// Ctrl+F depuis une réplique reprend le texte sélectionné, comme un éditeur de
// code : c'est le geste que l'on fait pour chercher « cet autre endroit où j'ai
// écrit ça ». Une sélection multiligne est ignorée, elle ne se cherche pas.
function seedFromSelection(setQuery) {
  const el = document.activeElement;
  if (!el || el.tagName !== "TEXTAREA" || !el.classList.contains("line-text")) return;
  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart === selectionEnd) return;
  const seed = value.slice(selectionStart, selectionEnd);
  if (seed && !seed.includes("\n")) setQuery(seed);
}
