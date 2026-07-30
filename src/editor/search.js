// Recherche et remplacement dans les répliques de la pièce, pour l'éditeur.
// Module PUR : ni React, ni DOM, ni reducer. C'est ici que vit tout ce qui est
// dur, donc tout ce que `node --test` peut vérifier (cf. search.test.js).
//
// **Le contrat central : le repliement conserve la longueur.**
// `foldText(raw).length === raw.length`, toujours. Un indice dans le texte
// replié est donc un indice dans le texte BRUT, celui du textarea, et les
// offsets d'une occurrence servent directement à `setSelectionRange` et au
// découpage du remplacement. Sans ce contrat il faudrait une carte d'index par
// réplique ; avec, il n'y a aucune arithmétique d'offsets nulle part ailleurs.
//
// **Ce n'est pas la normalisation du projet.** `scripts/normalize.py` reste la
// seule implémentation de la normalisation (invariant du CLAUDE.md) : elle sert
// à comparer une réplique au texte d'un enregistrement, et son résultat voyage
// jusqu'au manifest. Le repliement d'ici ne sert QU'À trouver une occurrence à
// l'écran : il n'est ni stocké, ni transporté, ni comparé à un clip, et il vit
// le temps d'un rendu.
//
// **Aucune expression régulière n'est construite depuis la requête.** Le
// matching est un `indexOf` ; les deux seules RegExp du fichier sont des
// littéraux appliqués au TEXTE. Donc rien à échapper, aucun état « expression
// invalide » à afficher, aucun retour sur trace catastrophique. C'est aussi
// pourquoi « Mot entier » est un test de frontière et pas un `\b`.
//
// **Limites assumées du repliement** (aucune n'existe au clavier français, et
// la pièce publiée n'en contient aucune) : les ligatures et lettres sans
// décomposition canonique (`œ`, `æ`, `ﬁ`) ne se déplient pas, donc « oeuvre »
// ne trouve pas « œuvre » ; `İ` garde sa forme ; et un texte déjà stocké en NFD
// (accent en point de code séparé) ne donne aucune occurrence sur la lettre
// accentuée plutôt qu'une demi-occurrence (cf. `cutsGrapheme`). Le seul
// remède serait une carte indice replié -> indice brut par réplique, soit un
// tableau par réplique : c'est pour ça qu'elle n'est pas là.

// Marques combinantes : ce que NFD sépare de sa lettre.
// Écrites en échappements et pas en caractères : entre crochets, deux marques
// combinantes littérales se posent sur le crochet ouvrant et la classe devient
// illisible dans la moitié des éditeurs.
const COMBINING_G = /[\u0300-\u036f]/g; // pour .replace
// La même, sans le drapeau global : `.test` d'une RegExp globale est suant
// (il avance `lastIndex`), donc un appel sur deux répondrait faux.
const COMBINING = /[\u0300-\u036f]/;

// Apostrophes et tirets typographiques ramenés à leur forme frappée au clavier,
// UN caractère pour UN. Ce n'est pas un raffinement : la pièce publiée porte
// l'apostrophe courbe sur 253 répliques et la droite sur 324, dans la MÊME
// pièce (une partie a été saisie ailleurs). Sans cette table, chercher
// « l'amour » n'en trouve que la moitié, sans que rien ne l'explique à l'écran.
const UNIFY = {
  "’": "'",
  "‘": "'",
  "ʼ": "'",
  "–": "-",
  "—": "-",
};

// Un caractère de mot, pour « Mot entier » : lettre ou chiffre Unicode.
// Ni « _ », ni « ' », ni « - », exprès : dans une pièce, « vous » est un mot
// entier dans « mettez-vous » et « homme » un mot entier dans « l'homme ».
const WORD = /[\p{L}\p{N}]/u;

/**
 * Replie un texte pour la comparaison, EN CONSERVANT SA LONGUEUR.
 *
 * La boucle parcourt les points de code (`for...of`) et jamais les unités
 * UTF-16 : une paire de substitution (emoji) n'est donc jamais coupée en deux.
 * Chaque transformation candidate est refusée si elle ne fait pas la même
 * longueur que sa source ; dans ce cas on garde le caractère brut. On perd
 * l'insensibilité sur lui, on ne perd JAMAIS l'alignement des offsets.
 *
 * NFD et pas NFKD : la décomposition canonique ne produit que « base +
 * marques », donc le test de longueur passe presque toujours ; NFKD casserait
 * `ﬁ` en `fi` et refuserait plus de caractères pour rien en français.
 */
export function foldText(raw, caseSensitive = false) {
  let out = "";
  for (const ch of raw) {
    let folded = UNIFY[ch] ?? ch;
    if (!caseSensitive) {
      const lower = folded.toLowerCase();
      // « İ » minusculé fait deux unités : refusé.
      if (lower.length === folded.length) folded = lower;
    }
    const stripped = folded.normalize("NFD").replace(COMBINING_G, "");
    // « é » précomposé se déplie en « e » (1 pour 1) : accepté. Une marque
    // combinante seule disparaîtrait (1 pour 0) : refusée, elle reste.
    if (stripped.length === folded.length) folded = stripped;
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
}

// Mémo du repliement, clé = l'OBJET réplique. Replier toute la pièce coûte
// quelques millisecondes (un millier de répliques, cinquante mille
// caractères) et le scan qui suit quelques dizaines de microsecondes : sans
// mémo, chaque frappe repaierait le repliement entier. Une frappe ne change
// l'identité que de la réplique éditée, donc une seule est repliée à nouveau.
//
// Ce cache n'est correct QUE parce que le reducer est immuable : un objet
// réplique ne voit jamais son texte changer sous lui, il est remplacé. Une Map
// par texte, elle, grossirait d'une entrée à chaque frappe ; une WeakMap par
// objet laisse partir tout ce que la pile d'annulation oublie.
const foldCache = new WeakMap(); // réplique -> [insensible, sensible]

function foldLine(line, caseSensitive) {
  let pair = foldCache.get(line);
  if (!pair) foldCache.set(line, (pair = [null, null]));
  const slot = caseSensitive ? 1 : 0;
  if (pair[slot] === null) pair[slot] = foldText(line.text, caseSensitive);
  return pair[slot];
}

const isWordAt = (s, i) => i >= 0 && i < s.length && WORD.test(s[i]);

// Refuse une occurrence dont un bord tombe sur une marque combinante : dans un
// texte stocké en NFD, chercher « e » tomberait sur le « e » d'un « é »
// décomposé, et le remplacement laisserait l'accent orphelin, collé au mot
// d'à côté. Aucune occurrence plutôt qu'une fausse.
const cutsGrapheme = (s, start, end) =>
  COMBINING.test(s[start] ?? "") || COMBINING.test(s[end] ?? "");

/**
 * Parcourt les occurrences de `foldedQuery` dans `folded`, dans l'ordre et
 * sans recouvrement, en appelant `visit(start, end)` pour chacune.
 *
 * **L'itérateur UNIQUE du module** : la recherche, le remplacement d'une
 * occurrence et le remplacement global le partagent tous les trois. Sans ça,
 * « Tout remplacer » pourrait réécrire quelque chose que la liste n'a jamais
 * montré, et personne ne s'en apercevrait avant de relire la pièce.
 */
function eachMatch(folded, foldedQuery, wholeWord, visit) {
  const n = foldedQuery.length;
  // `"".indexOf("")` rend 0 : sans ce garde, une requête vide boucle sans fin.
  if (n === 0) return;
  let from = 0;
  for (;;) {
    const start = folded.indexOf(foldedQuery, from);
    if (start === -1) return;
    const end = start + n;
    const ok =
      !cutsGrapheme(folded, start, end) &&
      (!wholeWord || (!isWordAt(folded, start - 1) && !isWordAt(folded, end)));
    if (ok) {
      visit(start, end);
      // Acceptée : on repart APRÈS, les occurrences ne se recouvrent pas
      // (comme VSCode).
      from = end;
    } else {
      // Refusée : UN cran plus loin, et pas la longueur de la requête, sinon
      // « aa » dans « aaa aa » perdrait la seconde occurrence.
      from = start + 1;
    }
  }
}

/**
 * Toutes les occurrences de la pièce, à plat et groupées par scène.
 *
 * Rend `{ matches, total, groups }` :
 *  - `matches` est l'autorité pour précédent/suivant (ordre de lecture) ;
 *  - `groups` est `[{ actIndex, sceneIndex, matches }]` (des RANGS : un acte et
 *    une scène n'ont pas de titre, c'est le panneau qui dérive leur libellé,
 *    cf. src/shared/structureLabels.js)
 *    et partage LES MÊMES objets : le panneau et la navigation ne peuvent pas
 *    se désaccorder sur ce qu'est l'occurrence courante.
 *
 * Une occurrence ne porte PAS son extrait : une requête d'un seul caractère en
 * donne plusieurs milliers sur une vraie pièce, et le panneau n'en rend qu'une
 * poignée. Les extraits se construisent à l'affichage (`matchExcerpt`).
 */
export function searchScript(script, query, options = {}) {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  const matches = [];
  const groups = [];
  if (foldedQuery.length === 0) return { matches, total: 0, groups };

  let lineOrdinal = 0;
  script.acts.forEach((act, actIndex) => {
    act.scenes.forEach((scene, sceneIndex) => {
      let group = null;
      for (const line of scene.lines) {
        const ordinal = lineOrdinal++;
        eachMatch(foldLine(line, caseSensitive), foldedQuery, wholeWord, (start, end) => {
          const match = {
            index: matches.length,
            actIndex,
            sceneIndex,
            // Rang de la réplique dans toute la pièce : la clé d'ordre de
            // l'ancre (cf. useSearch), qui doit survivre à un changement de
            // requête, donc ne peut pas être un rang d'occurrence.
            lineOrdinal: ordinal,
            lineId: line.id,
            // L'id et pas le nom : le panneau le résout comme les rangées de
            // réplique (`characterColor`, src/shared/characterColors.js), et un
            // nom recopié ici se désaccorderait d'un renommage.
            characterId: line.characterId,
            // Référence au texte existant, zéro copie.
            text: line.text,
            start,
            end,
          };
          matches.push(match);
          if (group === null) {
            // Les rangs seuls : un acte et une scène n'ont plus de titre, leur
            // libellé se dérive du rang au rendu (structureLabels.js), donc c'est
            // le panneau qui les met en mots, et dans la langue de la PIÈCE,
            // comme le reste de l'éditeur. Ce module reste ainsi sans un mot
            // d'aucune langue, donc pur et testable sans DOM.
            group = { actIndex, sceneIndex, matches: [] };
            groups.push(group);
          }
          group.matches.push(match);
        });
      }
    });
  });
  return { matches, total: matches.length, groups };
}

// Ce qu'on garde de part et d'autre de l'occurrence, et ce n'est pas symétrique.
// La rangée de résultat fait DEUX lignes de texte, pas plus (hauteur fixe, cf.
// `.search-hits > li` dans editor.css), donc l'extrait doit tenir dans deux
// lignes ET garantir que l'occurrence en fait partie : ce qui la précède est donc
// bridé à peu près à une ligne, et le reste va à ce qui la suit, parce qu'on lit
// vers l'avant et que la suite de la phrase en dit plus long sur la réplique que
// son début.
export const EXCERPT_BEFORE = 34;
export const EXCERPT_AFTER = 64;

/**
 * Extrait CENTRÉ sur l'occurrence, en trois morceaux prêts à rendre : le
 * panneau écrit `{before}<mark>{hit}</mark>{after}` sans jamais retoucher un
 * offset.
 *
 * Pas `excerpt()` de shared/data.js, qui tronque depuis le DÉBUT : il reste bon
 * pour citer une réplique dans un ConfirmModal, mais une occurrence au
 * six-centième caractère d'une tirade n'y apparaîtrait pas.
 *
 * Les blancs sont aplatis parce qu'une réplique peut contenir des retours à la
 * ligne (Maj + Entrée) : c'est de l'affichage, le texte brut n'est pas touché.
 */
export function matchExcerpt(match, before = EXCERPT_BEFORE, after = EXCERPT_AFTER) {
  const flat = (s) => s.replace(/\s+/g, " ");
  const from = Math.max(0, match.start - before);
  const to = Math.min(match.text.length, match.end + after);
  return {
    before: (from > 0 ? "…" : "") + flat(match.text.slice(from, match.start)),
    hit: flat(match.text.slice(match.start, match.end)),
    after: flat(match.text.slice(match.end, to)) + (to < match.text.length ? "…" : ""),
  };
}

// Réécrit un texte à partir des occurrences calculées sur SA VERSION D'ORIGINE,
// consommées de gauche à droite. Jamais de nouvelle recherche dans le résultat :
// c'est ce qui rend inoffensif un remplacement qui contient la requête
// (« a » -> « aa » double le texte et s'arrête, il ne s'emballe pas).
function replaceFolded(text, folded, foldedQuery, wholeWord, replacement) {
  let out = "";
  let cursor = 0;
  eachMatch(folded, foldedQuery, wholeWord, (start, end) => {
    out += text.slice(cursor, start) + replacement;
    cursor = end;
  });
  // Aucune occurrence : on rend la chaîne REÇUE, pas une copie. Le reducer en
  // dépend pour garder l'identité de la réplique (cf. applyTextEdits).
  if (cursor === 0) return text;
  out += text.slice(cursor);
  return out === text ? text : out;
}

/**
 * Remplace toutes les occurrences dans UN texte. Rend le texte reçu à
 * l'identique quand rien ne change.
 *
 * Conséquence assumée d'un remplacement insensible : il réécrit la
 * typographie. Remplacer « l'amour » dans une réplique à apostrophe courbe
 * écrit une apostrophe droite ; remplacer « eleve » par « ELEVE » perd les
 * accents d'« élève ». VSCode fait exactement pareil avec la casse, et
 * l'alternative (rejouer la casse et les accents de la source sur le
 * remplacement) devinerait à la place de l'utilisateur. C'est testé, donc
 * personne ne le « corrigera » par surprise.
 */
export function replaceInText(text, query, options = {}, replacement = "") {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  if (foldedQuery.length === 0) return text;
  return replaceFolded(text, foldText(text, caseSensitive), foldedQuery, wholeWord, replacement);
}

/**
 * Le lot d'éditions d'un « Tout remplacer » : une entrée par réplique
 * RÉELLEMENT changée, rien pour les autres.
 *
 * Refait sa propre passe sur la pièce plutôt que de consommer le tableau
 * d'occurrences affiché : le panneau plafonne ce qu'il rend, et un plafond
 * d'affichage ne doit jamais décider de ce qui est écrit. Même itérateur des
 * deux côtés, donc le compte annoncé et le compte réécrit ne peuvent pas
 * différer.
 */
export function buildReplaceEdits(script, query, options = {}, replacement = "") {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  const edits = [];
  if (foldedQuery.length === 0) return edits;
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        const text = replaceFolded(
          line.text,
          foldLine(line, caseSensitive),
          foldedQuery,
          wholeWord,
          replacement
        );
        if (text !== line.text) edits.push({ lineId: line.id, text });
      }
    }
  }
  return edits;
}

/**
 * Remplace UNE occurrence désignée : de l'arithmétique d'offsets, pas une
 * nouvelle recherche.
 *
 * `nextStart` place l'ancre juste après ce qui vient d'être écrit, pour que
 * « suivant » tombe sur l'occurrence d'après et jamais sur le remplacement
 * lui-même (qui peut contenir la requête).
 */
export function replaceOneEdit(match, replacement = "") {
  return {
    lineId: match.lineId,
    text: match.text.slice(0, match.start) + replacement + match.text.slice(match.end),
    nextStart: match.start + replacement.length,
  };
}
