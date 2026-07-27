---
name: repo-audit
description: Audit de santé du dépôt ENTIER (pas seulement le diff) — invariants vérifiés à l'échelle de tout l'arbre, sécurité du workflow CI, robustesse du back sur entrées hostiles, couverture de tests, code mort et duplication, cohérence front des 5 pages (agent front-reviewer), et dérive de la doc (CLAUDE.md, design-system.md) vs le code réel. Corrige avec confiance ce qui est sûr, pose des questions quand il y a un doute, un seul rapport priorisé. À utiliser pour établir une base de santé, après un gros refactor, ou sur demande (/repo-audit). Pour « suis-je bon pour committer », utilise plutôt diff-review.
---

# Audit du dépôt entier

Passe délibéré sur **tout le code de `HEAD`**, pas sur le travail en cours.
C'est le pendant de `diff-review` : là où `diff-review` juge un *changement*
en contexte avant un commit, `repo-audit` cherche les problèmes
**systémiques** (un invariant discrètement violé quelque part, du code mort,
une doc périmée) sur tout l'arbre. Comme `diff-review`, il **corrige avec
confiance ce qui est sûr et pose des questions quand il y a un doute** — le
livrable est un worktree assaini + un rapport priorisé.

Si l'intention est « est-ce que je peux committer ce que je viens de faire »,
c'est `diff-review` qu'il faut, pas ce skill.

## 0. Cadre

- **Périmètre = l'arbre entier à `HEAD`**, pas `git diff`. On ne calcule pas
  de base : on lit le code tel qu'il est. Ignore `dist/`, `node_modules/`,
  `clips/*.mp3` et les binaires.
- **Corrige, mais avec discernement (§7).** Applique sans demander les fixes
  sûrs (bug local sans changement d'API/format, test manquant, texte français,
  token en dur, duplication à remonter) ; **demande d'abord** dès qu'il y a un
  doute ou un choix (changement de format/contrat, comportement visible,
  extraction de composant, suppression de code cru mort). Ce skill ne fait
  **ni commit, ni stage, ni push** : les fixes restent dans le worktree.
- **Pas de blâme.** Un audit whole-repo ne dit pas « tu viens de casser ça »
  mais « ça ne tient pas » ; peu importe depuis quel commit. Ne relance pas
  `git blame` pour attribuer.
- Diff volumineux hors sujet ici : le volume, c'est le dépôt. Priorise par
  l'ordre de risque du §2 et **liste explicitement** ce qui n'a été que
  survolé — ne saute rien en silence.

Commence par te réancrer sur la carte du projet : lis `CLAUDE.md` (surtout
la table « Repères rapides » et les invariants) — c'est le contrat contre
lequel tu confrontes le code, dans les deux sens (§6).

## 1. Lancer l'audit front en parallèle

Lance **tout de suite** l'agent `front-reviewer` (Agent tool,
`subagent_type: "front-reviewer"` ; sinon un `general-purpose` avec les
instructions de `.claude/agents/front-reviewer.md`). C'est déjà un audit
whole-UI : il balaie les 5 pages contre le design system, indépendamment
de tout diff — son périmètre naturel coïncide avec celui de ce skill.
Il tourne en arrière-plan pendant les §2–§6.

Ses findings arrivent `fichier:ligne` marqués `Sûr: oui|non`. Relis chaque
finding dans le code pour le confirmer (un finding invérifiable est abandonné,
pas corrigé « au cas où »), puis traite-les avec les règles du §7 : `Sûr: oui`
→ applique, `Sûr: non` → mets en attente pour validation. Fusionne-les dans le
rapport final (§8).

## 2. Zones, par risque décroissant

1. **back** (`scripts/`, ses tests) : code CI sur entrées hostiles ;
2. **CI** (`.github/`) : sécurité du workflow ;
3. **front partagé** (`src/shared/`, `vite.config.js`) : impacte tout ;
4. **pages** (`src/<page>/`, `*.html`, CSS) : couvert par le front-reviewer ;
5. **données** (`data/`) : cohérence avec le code producteur ;
6. **docs / config** (`CLAUDE.md`, `README`, `.claude/`).

## 3. Invariants, vérifiés à l'échelle du dépôt

La différence avec `diff-review` : on ne vérifie pas les invariants seulement
là où le diff les touche, on prouve qu'ils tiennent **partout**. Pour chacun,
pars du code, pas de la doc.

- **Normalisation** : `grep` toute normalisation de texte dans l'arbre. Il
  ne doit exister qu'une implémentation (`scripts/normalize.py`), appelée
  **uniquement** dans `build_manifest.compute_status`. Aucun `.js`/`.jsx` ne
  normalise (le navigateur transporte du texte **brut**). Tout autre appelant,
  ou une normalisation JS, est un finding haute sévérité.
- **Ids de répliques** : `SAFE_ID` (`src/editor/reducer.js`) et
  `LINE_ID_PATTERN` (`scripts/process_uploads.py`) doivent être le **même
  motif** (`^[0-9a-zA-Z-]{1,64}$`). Lis les deux et compare caractère par
  caractère. Vérifie aussi qu'aucun chemin ne recycle un id.
- **Contrat ZIP** : lis `downloadZip` (recorder `App.jsx`) ET `parse_manifest`
  (`process_uploads.py`) côte à côte. Le manifest reste un mapping nu
  `{lineId: texte brut}`, un audio `{lineId}.{ext}` par réplique, rien
  d'autre. Toute divergence entre les deux côtés est haute sévérité.
- **Miroirs de sanitization** : `sanitize_script` (Python) reste le miroir
  tolérant de `sanitizeScript` (éditeur) — compare les deux, signale toute
  règle présente d'un seul côté.
- **Uploads hostiles** : caps de taille réels (pas de confiance aux en-têtes
  ZIP), noms de membres validés par `fullmatch`, merge tout-ou-rien par ZIP,
  un ZIP cassé n'en bloque jamais d'autres, ZIP supprimé même en cas d'erreur.
- **Prises d'enregistrement** : en mémoire uniquement, garde `beforeunload`
  tant que non exportées, `URL.revokeObjectURL` à chaque remplacement.

## 4. Sécurité & robustesse (whole-repo)

- **`.github/`** : balaie **tous** les `run:` pour l'injection (contenu
  utilisateur — noms de fichiers, titres — passé via `env:`, jamais interpolé
  `${{ }}` dans le script) ; `permissions:` minimales ; `concurrency`
  présente et **de groupes distincts entre appelant et appelé** (sinon
  interblocage) ; rôles étanches (`uploads.yml` seul écrit dans le dépôt et le
  journal, `build.yml` seul déploie) ; **aucun retour au respo écrit sur
  GitHub** (ni issue, ni statut README : son seul canal est le journal des
  dépôts affiché par la page Avancement).
- **`scripts/`** : toute entrée externe (ZIP, JSON uploadé à la main) traitée
  comme hostile — ignorée ou collectée dans `uploads_result.json` (puis dans le
  journal des dépôts), jamais un crash de workflow ; chemins via
  `scripts/common.py`, aucun chemin en dur ; messages d'erreur en français (ils
  finissent affichés sur la page Avancement).
- **Secrets** : aucun token/secret en clair dans l'arbre (grep large).

## 5. Dette : tests, code mort, duplication

- **Couverture** : tout comportement de `scripts/` sans cas de test
  correspondant est un finding (la normalisation se teste via
  `normalize-cases.json`). Signale les branches non testées des chemins
  d'entrée hostile.
- **Code mort** : exports/fonctions/composants/CSS jamais référencés,
  fichiers orphelins, entrées de `vite.config.js` sans `.html`, et
  inversement. Confirme le non-usage par `grep` avant de rapporter.
- **Duplication** : blocs CSS quasi identiques dans ≥ 2 fichiers (à remonter
  dans `theme.css`), helpers JS dupliqués entre pages (à remonter dans
  `src/shared/`). Le front-reviewer couvre le CSS des pages ; toi, couvre
  `src/shared/`, les `scripts/` et la frontière shared↔page.

## 6. Dérive de la documentation

Un audit whole-repo est le bon moment pour ça (`diff-review` ne le fait que si
le diff y touche). Confronte, dans les deux sens :

- la table **« Repères rapides »** de `CLAUDE.md` : chaque fichier/symbole
  cité existe-t-il encore, au bon endroit, avec le rôle décrit ?
- `references/design-system.md` (du skill diff-review) vs le code réel.

**Si le code a raison contre la doc**, c'est un finding catégorie `doc` :
mets à jour `CLAUDE.md` (table « Repères rapides ») et/ou
`references/design-system.md` — ne « corrige » **jamais** le code pour coller
à une doc périmée. Rappel : le re-skin « Rail » de l'éditeur est volontaire —
ses écarts de tokens documentés ne sont pas des findings.

## 7. Corrections : avec confiance, mais bornées

Tu corriges, tu ne te contentes pas de rapporter. Le partage est le même que
`diff-review`, appliqué à l'échelle du dépôt.

**Applique sans demander** (fix sûr) :

- bug évident dont le fix est local, sans changement d'API ni de format de
  données, couvert ensuite par un test ;
- test manquant pour un comportement déjà voulu ;
- texte anglais résiduel → français, libellés incohérents alignés sur la
  version majoritaire, message d'erreur absent ou trompeur ;
- côté front, tout ce qui ne change ni le comportement ni la structure JSX :
  hex/ombre/rayon en dur → token existant ; bloc CSS dupliqué entre ≥ 2
  fichiers → remonté dans `theme.css`, copies supprimées ; helper JS dupliqué
  → remonté dans `src/shared/` ; `title`/`aria-label` manquants, focus,
  tailles tactiles ;
- mise à jour de la doc (`CLAUDE.md`, `design-system.md`) quand le code a
  raison contre elle (§6).

**Demande d'abord** (doute ou choix) :

- tout changement de format de données ou du contrat ZIP, toute modification
  d'un invariant, tout comportement visible non dicté par un invariant ;
- l'extraction d'un composant JSX partagé ou tout changement de structure DOM,
  tout choix visuel non dicté par le contrat (nouvelles couleurs, espacements) ;
- **la suppression de code cru mort** : un usage indirect (entrée `.html`,
  chaîne dynamique, réflexion) est vite raté — présente la preuve de non-usage
  et laisse trancher. En cas de doute : pas sûr, on demande.

Quand une question bloque un lot de fixes, utilise `AskUserQuestion` plutôt que
d'abandonner en silence. Ce skill ne fait **ni commit, ni stage, ni push** :
les fixes restent dans le worktree.

## 8. Vérifications exécutables

- `python3 -m unittest discover -s scripts/tests`
- `npm run build`

Lance-les **deux fois** : au début (état des lieux — un échec préexistant
n'est pas imputé à tes corrections) et après toutes les corrections (front
comprises). Un échec final est un finding haute sévérité, sortie citée
verbatim.

## 9. Rapport

Un seul rapport terminal (pas de fichier, pas d'artifact). En tête : périmètre
(« dépôt entier à `HEAD`, commit `<sha>` ») et ce qui a été survolé faute de
temps. Puis findings front + back confondus, triés par sévérité décroissante :

```
- [sévérité] [catégorie] fichier:ligne — constat en une phrase.
  Fix : appliqué | proposé : …
```

- `sévérité` : **haute** (invariant cassé, faille CI, perte de données, bug
  visible), **moyenne** (cas limite, test manquant, duplication, a11y, code
  mort), **basse** (polissage, doc).
- `catégorie` : `invariant`, `securite`, `bug`, `tests`, `mort`, `duplication`,
  `donnees`, `ci`, `doc`, ou celles du front-reviewer (`structure`, `tokens`,
  `duplication`, `a11y`, `responsive`, `textes`, `contrat`).

Trois sections, par sévérité décroissante : **Corrigé**, **À valider** (fix
proposé, pour décision), **RAS** (une ligne par dimension entièrement conforme :
invariants, CI, tests, front, doc…). Termine par une phrase de synthèse (santé
générale du dépôt).

## Garde-fous

- Chaque finding est vérifié en relisant le code incriminé — `fichier:ligne`
  exacts, jamais de finding « probable ». Un finding invérifiable est
  abandonné, pas corrigé « au cas où ».
- Ne « répare » jamais `data/` à la main pour faire passer une vérification.
- Ne corrige jamais le code pour coller à une doc périmée : c'est la doc qui
  suit le code (§6).
- Ne confonds pas avec `diff-review` : si le périmètre voulu est le travail en
  cours (avant commit), arrête-toi et redirige vers `diff-review`.
