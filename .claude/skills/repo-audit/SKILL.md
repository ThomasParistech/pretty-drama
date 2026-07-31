---
name: repo-audit
description: Audit de santé du dépôt ENTIER (pas seulement le diff) — invariants vérifiés à l'échelle de tout l'arbre, sécurité du workflow CI, robustesse du back sur entrées hostiles, couverture de tests, code mort et duplication, cohérence front des 5 pages (agent front-reviewer), et dérive de la doc (CLAUDE.md, design-system.md) vs le code réel. Tranche et corrige tout ce qui est technique (invariants, formats, factorisation, langue, a11y, code mort, doc) et n'escalade que les questions de produit, d'UX et d'UI ; un seul rapport priorisé. À utiliser pour établir une base de santé, après un gros refactor, ou sur demande (/repo-audit). Pour « suis-je bon pour committer », utilise plutôt diff-review.
---

# Audit du dépôt entier

Passe délibéré sur **tout le code de `HEAD`**, pas sur le travail en cours.
C'est le pendant de `diff-review` : là où `diff-review` juge un *changement*
en contexte avant un commit, `repo-audit` cherche les problèmes
**systémiques** (un invariant discrètement violé quelque part, du code mort,
une doc périmée) sur tout l'arbre. Comme `diff-review`, il **tranche lui-même
tout ce qui est technique et n'escalade que le produit, l'UX et l'UI** (§7) — le
livrable est un worktree assaini + un rapport priorisé et **court** (§9 : ce qui est
corrigé s'inventorie en une ligne, il ne se démontre pas).

Si l'intention est « est-ce que je peux committer ce que je viens de faire »,
c'est `diff-review` qu'il faut, pas ce skill.

## 0. Cadre

- **Périmètre = l'arbre entier à `HEAD`**, pas `git diff`. On ne calcule pas
  de base : on lit le code tel qu'il est. Ignore `dist/`, `node_modules/`,
  `clips/*.mp3` et les binaires.
- **Corrige, et tranche (§7).** Tout ce qui est technique t'appartient, même
  lourd : bug, changement de format quand les deux côtés bougent ensemble,
  factorisation, extraction de composant, texte en dur, token, code mort dont le
  non-usage est prouvé, doc périmée. N'escalade que ce qui relève du produit, de
  l'UX ou de l'UI. Ce skill ne fait **ni commit, ni stage, ni push** : les fixes
  restent dans le worktree.
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

Ses findings arrivent `fichier:ligne` marqués `Sûr: oui|non`. **Son marquage
n'est pas une décision**, c'est une estimation : relis chaque finding dans le
code, puis traite-le avec les règles du §7, qui décident seules. Les deux sens
comptent. Un `Sûr: non` purement technique s'applique (il l'a marqué ainsi parce
qu'il touche au comportement ou au JSX, pas parce que le choix t'échappe). Et un
`Sûr: oui` se **RÉFUTE** quand une mesure, un précédent du dépôt ou une
contrainte qu'il ne voyait pas dit le contraire : un refus argumenté est un
résultat d'audit, et il s'écrit **dans un commentaire du code**, pas dans le
rapport, parce que c'est le code que le prochain passage relira, et donc lui seul
qui peut empêcher la question de se rouvrir. Un finding invérifiable est
abandonné, pas corrigé « au cas où ». Fusionne le tout dans le rapport (§9).

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
- **Bilingue** : AUCUN texte visible ne vit dans un composant. Balaie tout
  `src/` (hors `src/shared/locales/`) à la recherche d'un littéral affiché :
  texte entre balises, `title`, `aria-label`, `placeholder`, `alt`, et les props
  de texte (`hint`, `error`, `label`, `unit`, `confirmLabel`, `primaryLabel`,
  `saveLabel`). C'est l'invariant que la CI garde le mieux (les trois tests de
  `TestCatalogues` dans `scripts/tests/test_contracts.py`, plus
  `src/shared/locales/parity.test.js`), donc commence par les lancer ; ce qui
  reste à faire à la main est ce qu'ils ne voient pas, un texte adjacent à une
  accolade sur la même ligne et un texte anglais non accentué rangé dans une
  variable. Vérifie aussi que rien de couvert par `node --test` n'importe
  `locale.js` (il lit l'URL et le navigateur à l'import) : un module pur reçoit
  `t` en argument, ou rend un code que la page traduit.

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

## 7. Corrections : tranche toi-même, escalade ce qui n'est pas technique

Tu corriges, tu ne te contentes pas de rapporter, et **tu décides**. La ligne de
partage n'est pas « risqué / pas risqué », c'est **à qui la décision
appartient** : une question technique, même lourde, est la tienne (tu as le code,
les tests et de quoi mesurer) ; une question de produit, d'UX ou d'UI est celle du
responsable, parce que rien dans le dépôt ne la tranche. C'est le même partage que
`diff-review`, à l'échelle du dépôt.

**Tranche et applique, sans demander** — liste ouverte, ce qui est technique
t'appartient même s'il n'y figure pas :

- tout bug, cas limite ou test manquant, y compris quand le fix traverse
  plusieurs fichiers ;
- **un changement de format de données ou du contrat ZIP**, à condition de bouger
  les DEUX côtés dans le même passage et de le couvrir par un test — c'est
  précisément ce que `test_contracts.py` existe pour tenir ;
- une factorisation à l'échelle de l'arbre : remonter un bloc CSS ou un helper
  dans `theme.css` / `src/shared/`, extraire un composant JSX partagé, changer une
  structure DOM quand le rendu ne bouge pas ;
- texte visible en dur → clé de catalogue dans les DEUX langues, clé manquante,
  libellé recopié qui devient une clé interpolée, ponctuation ou séparateur
  remonté du JSX vers la chaîne, message d'erreur absent ou trompeur ;
- accessibilité : `title` / `aria-label` manquants, bague de focus, rôle, taille
  tactile, enveloppe d'infobulle sur un contrôle qui s'éteint ;
- la doc (`CLAUDE.md`, `design-system.md`) quand le code a raison contre elle
  (§6) ;
- **la suppression de code mort**, à condition de PROUVER le non-usage : grep du
  symbole, des clés composées à l'exécution (`page.${x}.label`), des entrées
  `.html`, des classes posées en JSX, des noms atteints par réflexion. Preuve
  faite, supprime ; preuve impossible, garde le code et dis-le en une ligne du
  rapport. C'est la preuve qui décide, pas le confort.

**Escalade, et seulement ça** (`AskUserQuestion` si ça bloque un lot de fixes,
sinon la section « À valider ») :

- **produit** : ce qu'une page doit faire, ce qui entre ou sort du périmètre, un
  geste à ajouter ou à retirer, une donnée à commencer à stocker ;
- **UX** : ce qu'on demande à l'utilisateur, ce qu'un geste veut dire, ce qui se
  confirme ou non ;
- **UI** : un choix visible que ni le contrat ni un précédent du site ne
  tranchent (une couleur nouvelle, une hiérarchie, une mise en page) ;
- le **ton** d'un libellé quand il porte une position produit (comment le site
  parle à la troupe), jamais sa grammaire ni sa ponctuation ;
- toute action hors du worktree (commit, push, écriture dans `data/`).

Trois réflexes avant d'escalader quelque chose qui *ressemble* à une question
d'UI. Un audit whole-repo en produit beaucoup, et la plupart ont une réponse dans
le dépôt :

1. **Mesure.** « Ces deux verts sont-ils le même ? » se calcule (ratio de
   contraste sur le fond RÉEL, ΔE), et la mesure peut REFUSER le changement :
   c'est ce qui a sauvé `--rec-fresh`, qui ressemblait à un doublon de `--ok` et
   tient l'AA sur la carte rose là où `--ok` échoue à 4,31:1. Une mesure vaut
   mieux qu'une question, et elle se garde dans un commentaire pour que la
   question ne se rouvre pas au prochain audit.
2. **Cherche le précédent.** Le site nomme déjà, sépare déjà, aligne déjà.
   S'aligner sur ce qui existe (`common.actScene` plutôt qu'un « · » inventé) est
   un choix technique : la décision a déjà été prise ailleurs, tu la retrouves.
3. **Choisis, puis dis-le.** S'il faut vraiment arbitrer et que l'effet visible
   est mince, prends l'option la plus défendable, applique-la, et écris en une
   ligne ce qui change à l'écran. Un rapport qui annonce un changement visible
   vaut mieux qu'une question qui bloque un lot de corrections.

Ce skill ne fait **ni commit, ni stage, ni push** : les fixes restent dans le
worktree.

## 8. Vérifications exécutables

- `python3 -m unittest discover -s scripts/tests` (contrats d'i18n compris)
- `npm test` (dont la parité des deux catalogues)
- `npm run build`

Lance-les **deux fois** : au début (état des lieux — un échec préexistant
n'est pas imputé à tes corrections) et après toutes les corrections (front
comprises). Un échec final est un finding haute sévérité, sortie citée
verbatim.

## 9. Rapport

Un seul rapport terminal (pas de fichier, pas d'artifact), et **court**.

Ce qui est corrigé est corrigé : le rapport en tient l'INVENTAIRE, pas la
démonstration. Le pourquoi de chaque fix vit déjà dans le commentaire du code, que
ce dépôt exige de toute façon, et dans le diff que le lecteur a sous la main : le
répéter ici lui fait lire deux fois la même chose, en moins précis. Un rapport
d'audit n'est pas le journal de l'audit.

Un audit du dépôt entier relève légitimement plus d'entrées qu'une revue de diff,
donc ce n'est pas leur NOMBRE qu'on borne, c'est leur longueur : **une ligne
chacune**, et rien de plus.

En tête, UNE ligne : périmètre (« dépôt entier à `HEAD`, commit `<sha>` »), état des
vérifications, et ce qui a été survolé faute de temps.

### Corrigé

Une LIGNE par correction, dans l'ordre de sévérité décroissante :

```
- [sévérité] fichier:ligne — le défaut, en une demi-phrase.
```

- Pas de « Fix : appliqué » (tout ce qui est dans cette section l'est), pas de
  catégorie (la sévérité et le fichier suffisent à trier), pas de justification.
- On nomme le DÉFAUT, jamais sa cause en trois temps ni la solution retenue.
- `sévérité` : **haute** (invariant cassé, faille CI, perte de données, bug
  visible), **moyenne** (cas limite, test manquant, duplication, a11y, code
  mort), **basse** (polissage, doc).
- **Une famille qui se répète est une ligne, pas dix** : un même défaut sur douze
  fichiers se dit « douze occurrences » avec deux ou trois fichiers nommés en
  exemple. C'est le relevé le plus utile d'un audit, et le plus vite illisible.
- Les corrections **basses** ne prennent pas une ligne chacune : UNE ligne les compte
  et les nomme en quelques mots.

### À valider

Ce qui attend le responsable, et rien d'autre (produit, UX, UI : cf. §7). Une entrée
technique qui atterrit ici est une correction que tu n'as pas faite, pas un choix à
soumettre. Deux lignes par entrée au maximum : la question, puis ce que tu ferais et
ce que ça change à l'écran. Souvent vide, et c'est le bon signe ; vide, elle s'écrit
« Rien ».

### RAS

**Une seule ligne**, pas une par dimension : les dimensions entièrement conformes
s'énumèrent d'affilée (« invariants, sécurité CI, tests, front, doc »).

Puis **une phrase** de synthèse sur la santé du dépôt, qui ferme le rapport.

**Ce qui n'a pas sa place dedans** : une section « Réfuté » (un finding de l'agent
front que tu as réfuté s'écrit avec sa mesure **dans un commentaire du code**, et
c'est ÇA qui empêche l'audit suivant de le reproposer, puisque le prochain audit lit
le code et non ce rapport ; il ne coûte ici qu'une ligne au plus) ; la sortie des
vérifications quand elles passent (« vertes » suffit ; un échec, lui, se cite) ; les
captures, les tableaux, et l'annonce de ce que tu vas faire ensuite.

## Garde-fous

- Chaque finding est vérifié en relisant le code incriminé — `fichier:ligne`
  exacts, jamais de finding « probable ». Un finding invérifiable est
  abandonné, pas corrigé « au cas où ».
- Ne « répare » jamais `data/` à la main pour faire passer une vérification :
  si une donnée du dépôt contredit la doc, c'est la doc qui dit dans quel état le
  TEMPLATE se livre, la donnée du prototypage se nettoyant à part.
- Une question technique ne se pose pas au responsable : elle se mesure, se
  cherche dans les précédents du dépôt, ou se tranche (§7). Ce qui se pose, c'est
  le produit, l'UX et l'UI.
- Ne corrige jamais le code pour coller à une doc périmée : c'est la doc qui
  suit le code (§6).
- Ne confonds pas avec `diff-review` : si le périmètre voulu est le travail en
  cours (avant commit), arrête-toi et redirige vers `diff-review`.
