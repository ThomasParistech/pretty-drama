---
name: diff-review
description: Revue complète du travail en cours (tout ce qui n'est pas encore publié sur la branche principale) — fond (bugs, régressions, sécurité du workflow), invariants du projet (ids, contrat ZIP, normalisation, uploads hostiles), passe langue du front bilingue (aucun texte en dur hors catalogues, parité fr/en), tests Python + JS + build, et audit front (agent front-reviewer contre le design system) si l'UI est touchée. Tranche et corrige tout ce qui est technique (bugs, formats, factorisation, langue, a11y, doc) et n'escalade que les questions de produit, d'UX et d'UI ; un seul rapport, qui finit par un titre de PR prêt à coller. À utiliser avant de committer/pousser, après des changements d'UI, ou sur demande (/diff-review).
---

# Revue du diff courant

Revue de **tout ce qui n'est pas encore publié** : commits non poussés,
modifications indexées ou non, fichiers non suivis. L'audit front en fait
partie (agent `front-reviewer`, revue statique contre le design system :
la cohérence visuelle est garantie *par construction* — composants partagés,
tokens — pas en comparant des rendus). Un seul rapport final, **court** (§7 : ce qui
est corrigé s'inventorie en une ligne, il ne se démontre pas), qui se termine par
un titre de PR prêt à coller (§8).

## 1. Base et périmètre

La base n'est **jamais codée en dur**, elle se calcule :

```sh
# branche principale distante (ici origin/master), sinon repli sur HEAD
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD)
[ -z "$BASE" ] && git rev-parse -q --verify origin/master >/dev/null && BASE=origin/master
[ -z "$BASE" ] && BASE=HEAD
# sur une branche de travail : partir du point de divergence
git merge-base HEAD "$BASE"
```

- Sur la branche principale elle-même (cas courant ici : tout se fait sur
  `master`) : base = `origin/master` → la revue couvre les commits non
  poussés + l'index + le worktree.
- Sur une branche de travail : base = `merge-base HEAD origin/<principale>`.
- Sans remote : base = `HEAD` (seuls les changements non committés sont
  revus). Ne lance pas de `git fetch` sans demander.

Puis délimite : `git log --oneline $BASE..HEAD`, `git diff $BASE --stat`,
`git status --porcelain`. Les fichiers **non suivis** font partie de la revue
(lis-les) ; ignore `dist/`, `node_modules/`, `clips/*.mp3`. Si le périmètre
est vide, dis-le et arrête-toi.

Classe les fichiers touchés, par risque décroissant :

1. **back** : `scripts/` et ses tests — code qui tourne en CI sur des
   entrées hostiles ;
2. **CI** : `.github/` — sécurité du workflow ;
3. **front partagé** : `src/shared/`, `vite.config.js` — impacte toutes les
   pages ;
4. **pages** : `src/<page>/`, `*.html`, CSS ;
5. **données** : `data/`, `uploads/` ;
6. **docs / config** : `CLAUDE.md`, `README`, `.claude/`.

## 2. Lancer l'audit front en parallèle

Si des fichiers front (3–4) sont touchés, lance **tout de suite** l'agent
`front-reviewer` (Agent tool, `subagent_type: "front-reviewer"` ; s'il n'est
pas enregistré dans la session, un agent `general-purpose` avec les
instructions de `.claude/agents/front-reviewer.md`). Il audite en
arrière-plan pendant que tu fais la revue de fond. Passe-lui la liste des
fichiers front touchés pour prioriser — il balaie quand même les 5 pages
(cohérence graphique, factorisation, a11y, responsive, langue). Son audit ne te
dispense pas de la passe langue du §3 bis : lui balaie tout le site, toi tu lis
le diff, et c'est le diff qui vient d'être écrit.

Son contrat est `references/design-system.md` (relatif à ce skill) : c'est
lui qui définit ce que « cohérent » veut dire, et la revue confronte le code
au contrat **dans les deux sens**. L'agent retourne des findings
`fichier:ligne` marqués `Sûr: oui|non` — relis toi-même chaque finding dans
le code avant d'agir (un finding invérifiable est abandonné, pas corrigé
« au cas où »), puis traite-les avec les mêmes règles que le reste (§6) et
fusionne-les dans le rapport final.

## 3. Revue de fond

Lis le diff fichier par fichier (`git diff $BASE -- <fichier>`), et pour
chaque hunk assez de code environnant pour juger en contexte — **jamais un
finding sur la seule lecture du diff**. Par zone :

- **`scripts/`** : bugs et cas limites ; toute entrée externe (ZIP, JSON
  uploadé à la main) est hostile — une entrée malformée est ignorée ou
  collectée dans `uploads_result.json` (puis dans le journal des dépôts),
  jamais un crash de workflow ; chemins via `scripts/common.py`, pas de
  chemins en dur ; messages d'erreur **en français** (ils finissent affichés
  sur la page Avancement, seul retour du respo).
- **`.github/`** : pas d'injection dans les `run:` (contenu utilisateur —
  noms de fichiers, titres — passé via `env:`, jamais interpolé `${{ }}`
  dans le script) ; `permissions:` minimales ; les rôles des deux workflows
  restent étanches (`uploads.yml` seul écrit dans le dépôt et le journal,
  `build.yml` seul déploie et n'écrit rien) ; les **groupes de `concurrency`
  restent distincts** (sinon le workflow appelé s'interbloque avec son
  appelant) ; l'appel `jobs.site.uses` et les filtres `paths`/`paths-ignore`
  conservés (un commit du bot ne déclenche aucun workflow).
- **tests** : un changement de comportement dans `scripts/` sans cas de test
  correspondant est un finding ; la normalisation se teste via les cas
  partagés de `normalize-cases.json`.
- **`data/*.json`** : doit rester cohérent avec le code qui le produit
  (éditeur pour `script.json`, `build_manifest` pour `manifest.json`,
  `update_history` pour `history.json`) —
  pas d'édition manuelle qui divergera au prochain build, sauf montage de
  test assumé.
- **`src/<page>/App.jsx`** : passe en revue **tous les états de la page**, pas
  seulement celui que tu as sous les yeux. Liste ses `return` conditionnels
  (chargement, erreur de lecture, page murée, rien de sélectionné, liste vide)
  et juge chacun comme un écran à part entière : quel bandeau, quel titre,
  quelles données ont été chargées pour lui. Un état atteint sur un seul
  appareil (pointeur tactile, absence de micro) n'est jamais visité pendant la
  revue et c'est là que le contrat se perd en silence : un `fetch` sauté ou un
  `return` placé avant lui laisse le bandeau sans titre de pièce sans qu'aucun
  CSS ne le montre.
- **partout** : pas de secret ni de token dans le diff, pas de tiret cadratin
  dans un texte vu par l'utilisateur, et le français reste la langue du dépôt
  côté back (README, messages d'erreur de l'Action, qui finissent dans le
  journal des dépôts). Le FRONT, lui, est bilingue : voir §3 bis, qui est une
  passe à part entière et pas une ligne de checklist.

## 3 bis. Passe langue (front bilingue)

Le site se lit en français et en anglais, et **aucun texte visible ne vit dans
un composant** : tout passe par `src/shared/locales/fr.js` et `en.js`. Cette
passe est obligatoire dès que le diff touche un `.jsx` ou un `.js` de `src/`,
même « pour un petit changement » : c'est exactement ainsi que cinq pages
entières sont restées en français après leur traduction.

Elle se fait en deux temps, et **l'ordre compte** : les gardes d'abord, la
lecture ensuite. Les gardes disent ce qui est certain, la lecture voit ce qu'ils
ne peuvent pas voir.

1. **Les gardes**, qui tournent déjà dans la suite Python
   (`scripts/tests/test_contracts.py`, classe `TestCatalogues`) et côté JS
   (`src/shared/locales/parity.test.js`). Un échec ici est un finding **haute**,
   jamais un test à assouplir :
   - toute clé passée à `t()` / `<T>` existe dans les DEUX catalogues (une clé
     mal tapée s'affiche en clair à l'écran) ;
   - aucune clé déclarée n'est inutilisée (une clé orpheline signale une chaîne
     qu'on a cru traduire et qui est restée en dur) ;
   - aucun littéral accentué, aucun attribut porteur de texte
     (`title`, `aria-label`, `placeholder`, `alt`, `hint`, `error`, `label`,
     `unit`, `confirmLabel`, `primaryLabel`, `saveLabel`) et aucun nœud de texte
     JSX ne portent de littéral dans `src/` ;
   - les deux catalogues ont les mêmes clés, les mêmes placeholders, les mêmes
     formes de pluriel, et le français ses insécables.
2. **La lecture**, parce que les gardes ont un angle mort connu et documenté : un
   texte adjacent à une accolade sur la même ligne, et un texte anglais non
   accentué rangé dans une variable. Pour **chaque fichier front du diff**, liste
   les chaînes que l'utilisateur verra et vérifie, une par une :
   - elle vient de `t()` / `<T>` (jamais un littéral, jamais un
     template-literal assemblé à la main) ;
   - une phrase qui porte du balisage au milieu passe par `<T … p={{ … }} />`,
     le JSX devenant un paramètre : découpée en fragments, elle fige l'ordre des
     mots français dans le composant ;
   - aucun pluriel bricolé (`n > 1 ? "s" : ""`), aucun nombre, pourcentage ou
     date formaté à la main : `{ one, other }` + `t(clé, { count })`,
     `fmt.percent`, `fmt.dateTime`, `fmt.quote` ;
   - un libellé que deux endroits nomment est INTERPOLÉ depuis sa clé, pas
     recopié ;
   - la nouvelle entrée anglaise n'est pas un calque du français (ni la
     typographie : ni insécable, ni guillemets français) ;
   - aucun module couvert par `node --test` n'importe `locale.js` (il lit l'URL
     et le navigateur à l'import) : il reçoit `t` en argument, ou rend un code
     que la page traduit.

   Et **relis la page dans les deux langues** au moins mentalement : un texte qui
   n'existe qu'en français se voit en anglais, un texte trop long casse une
   rangée. Le rapport dit laquelle des deux a été vérifiée.

## 4. Invariants du projet

Checklist explicite, à vérifier dès que le diff touche la zone concernée :

- **Normalisation** : une seule implémentation (`scripts/normalize.py`),
  appelée uniquement dans `build_manifest.compute_status`. Aucun code JS ne
  normalise : le navigateur stocke et transporte du texte **brut**.
- **Ids de répliques** : jamais recyclés (ils nomment les mp3) ; `SAFE_ID`
  (`src/editor/reducer.js`) et `LINE_ID_PATTERN`
  (`scripts/process_uploads.py`) strictement identiques.
- **Contrat ZIP** : si `downloadZip` (recorder) OU `parse_manifest`
  (process_uploads) est touché, relis **l'autre côté** et vérifie qu'ils
  restent synchrones (manifest = mapping nu `{lineId: texte brut}`, un audio
  `{lineId}.{ext}` par réplique, rien d'autre).
- **Miroirs de sanitization** : `sanitize_script` (Python) reste le miroir
  tolérant du `sanitizeScript` de l'éditeur — si l'un évolue, l'autre suit.
- **Uploads hostiles** : caps de taille réels (les en-têtes ZIP mentent),
  noms de membres validés par `fullmatch`, merge tout-ou-rien par ZIP, un
  ZIP cassé ne bloque jamais les autres, ZIP supprimé même en cas d'erreur.
- **Prises d'enregistrement** : en mémoire uniquement, garde `beforeunload`
  tant que non exportées, `URL.revokeObjectURL` à chaque remplacement.

## 5. Vérifications exécutables

- `python3 -m unittest discover -s scripts/tests` (contrats d'i18n compris,
  cf. §3 bis)
- `npm test` (`node --test`, sans argument : logique pure du front, dont la
  parité des deux catalogues)
- `npm run build`

Lance-les **trois**, **deux fois** : une fois au début (état des lieux — un échec
préexistant n'est pas imputé à tes corrections) et une fois après toutes les
corrections (celles issues de l'audit front comprises). Un échec final est
un finding de
sévérité haute, sortie citée verbatim.

## 6. Corrections : tranche toi-même, escalade ce qui n'est pas technique

La ligne de partage n'est **pas** « risqué / pas risqué », c'est **à qui la
décision appartient**. Une question technique, même lourde, est la tienne : tu as
le code, les tests et de quoi mesurer. Une question de produit, d'UX ou d'UI est
celle du responsable du projet, parce que rien dans le dépôt ne la tranche.

**Tranche et applique, sans demander** — et cette liste est ouverte, ce qui est
technique t'appartient même s'il n'y figure pas :

- tout bug, cas limite ou test manquant, y compris quand le fix touche plusieurs
  fichiers ;
- **un changement de format de données ou du contrat ZIP**, à condition de bouger
  les DEUX côtés dans le même diff et de le couvrir par un test (c'est
  exactement ce que `test_contracts.py` existe pour tenir) ;
- une factorisation : remonter un bloc CSS ou un helper dans `theme.css` /
  `src/shared/`, extraire un composant JSX partagé, changer une structure DOM
  quand le rendu ne bouge pas ;
- texte visible en dur → clé de catalogue dans les DEUX langues, clé manquante,
  libellé recopié qui devient une clé interpolée, ponctuation ou séparateur
  remonté du JSX vers la chaîne ;
- accessibilité : `title` / `aria-label` manquants, bague de focus, rôle,
  enveloppe `.btn-tip` sur un bouton qui s'éteint ;
- la doc (`CLAUDE.md`, `references/design-system.md`) quand le code a raison
  contre elle ;
- **la suppression de code mort**, à condition de prouver le non-usage : grep du
  symbole ET des clés composées à l'exécution (`page.${x}.label`), des entrées
  `.html`, des classes posées en JSX. Preuve faite, supprime ; preuve
  impossible, garde et dis-le en une ligne.

**Escalade, et seulement ça** (`AskUserQuestion` si ça bloque un lot, sinon la
section « À valider » du rapport) :

- **produit** : ce qu'une page doit faire, ce qui entre ou sort du périmètre, un
  geste à ajouter ou à retirer ;
- **UX** : ce qu'on demande à l'utilisateur, ce qu'un geste veut dire, ce qui est
  confirmé ou non ;
- **UI** : un choix visible que ni le contrat ni un précédent du site ne
  tranchent (une couleur nouvelle, une hiérarchie, une mise en page) ;
- le **ton** d'un libellé quand il porte une position produit (comment le site
  parle à la troupe), pas sa grammaire ni sa ponctuation ;
- toute action hors du worktree (commit, push, écriture dans `data/`).

Trois réflexes avant d'escalader quelque chose qui *ressemble* à une question
d'UI :

1. **Mesure.** Beaucoup de ces questions ont une réponse chiffrée. « Ces deux
   verts sont-ils le même ? » se calcule (un ratio de contraste sur le fond réel,
   un ΔE), et la mesure peut refuser le changement : c'est ce qui a sauvé
   `--rec-fresh`, qui ressemblait à un doublon de `--ok` et tient l'AA là où
   `--ok` échoue. Une mesure vaut mieux qu'une question, et elle se garde dans un
   commentaire pour que la question ne se rouvre pas.
2. **Cherche le précédent.** Le site nomme déjà, sépare déjà, aligne déjà.
   S'aligner sur ce qui existe (`common.actScene` plutôt qu'un « · » inventé) est
   un choix technique, pas un choix d'UI : la décision a déjà été prise ailleurs.
3. **Choisis, puis dis-le.** S'il faut vraiment arbitrer et que l'effet visible
   est mince, prends l'option la plus défendable, applique-la, et écris en une
   ligne du rapport ce qui change à l'écran. Un rapport qui annonce un
   changement visible est meilleur qu'une question qui bloque un lot de fixes.

En cas de doute réel, le doute porte presque toujours sur le PÉRIMÈTRE (« est-ce
que ça fait encore partie de ce diff ? ») et pas sur la solution : dans ce cas,
applique et signale, ne demande pas. Cette revue ne fait **ni commit, ni stage,
ni push** — les fixes restent dans le worktree.

## 7. Rapport

Un seul rapport terminal (pas de fichier, pas d'artifact), et **court**.

Ce qui est corrigé est corrigé : le rapport en tient l'INVENTAIRE, pas la
démonstration. Le pourquoi de chaque fix vit déjà dans le commentaire du code, que
ce dépôt exige de toute façon, et dans le diff que le lecteur a sous la main : le
répéter ici lui fait lire deux fois la même chose, en moins précis. Un rapport de
revue n'est pas le journal de la revue.

**Budget : une trentaine de lignes en tout.** S'il déborde, ce n'est pas que le
diff était gros, c'est que le rapport explique au lieu de lister.

En tête, UNE ligne : base, périmètre (« N fichiers vs origin/master, dont X non
suivis »), et l'état des trois vérifications.

### Corrigé

Une LIGNE par correction, dans l'ordre de sévérité décroissante :

```
- [sévérité] fichier:ligne — le défaut, en une demi-phrase.
```

- Pas de « Fix : appliqué » (tout ce qui est dans cette section l'est), pas de
  catégorie (la sévérité et le fichier suffisent à trier), pas de justification.
- On nomme le DÉFAUT, jamais sa cause en trois temps ni la solution retenue : « le
  test des ZIP ne descend pas dans les zones de dépôt, donc ffmpeg n'est jamais
  installé » et rien de plus.
- `sévérité` : **haute** (perte de données, crash du workflow, invariant cassé, bug
  visible par l'utilisateur), **moyenne** (cas limite, test manquant, duplication,
  a11y), **basse** (polissage).
- Les corrections **basses** ne prennent pas une ligne chacune : UNE ligne les compte
  et les nomme en quelques mots (« 5 polissages : règles CSS mortes, repli de date,
  deux libellés »).
- Au-delà de six lignes hautes et moyennes, garde les six plus graves et compte le
  reste sur une ligne.

### À valider

Ce qui attend le responsable, et rien d'autre (produit, UX, UI : cf. §6). Une entrée
technique qui atterrit ici est une correction que tu n'as pas faite, pas un choix à
soumettre. Deux lignes par entrée au maximum : la question, puis ce que tu ferais et
ce que ça change à l'écran. Souvent vide, et c'est le bon signe ; vide, elle s'écrit
« Rien ».

### RAS

**Une seule ligne**, pas une par dimension : les dimensions entièrement conformes
s'énumèrent d'affilée (« invariants, contrat ZIP, sécurité CI, tests 166 + 205,
langue : 9 fichiers front relus dans les deux langues »). Le décompte de fichiers
relus reste obligatoire dès que le diff touche `src/`, c'est la seule promesse que
les gardes ne tiennent pas seuls.

Puis le titre du §8, qui ferme le rapport.

**Ce qui n'a pas sa place dedans** : une section « Réfuté » (un finding réfuté se
règle dans un commentaire du code, cf. les garde-fous, et ne coûte au rapport
qu'une ligne quand il a demandé une mesure) ; la sortie des tests quand ils passent
(« verts » suffit ; un échec, lui, se cite) ; ce que le diff FAIT, qui est le rôle du
titre ; les captures, les tableaux, et l'annonce de ce que tu vas faire ensuite.

## 8. Titre de PR

Le rapport se termine par **une ligne prête à coller**, le titre de la PR (ou
du commit : ce dépôt travaille surtout en direct sur `master`).

Convention à lire dans `git log`, pas à inventer : gitmoji en forme textuelle
(`:sparkles:` pour une fonctionnalité, `:art:` pour l'UI et le polissage,
`:bug:` pour un correctif) puis une phrase courte en minuscules, en français
dès qu'elle porte du contenu.

- Il dit ce que le diff **fait**, jamais ce que la revue y a corrigé : les
  findings sont un moyen, pas le sujet. « corrections de revue » n'apprend rien
  à qui relira l'historique dans deux ans.
- Une ligne, sans point final, sous une soixantaine de caractères.
- Il nomme le sujet **dominant**. Si le diff en porte plusieurs sans rapport
  entre eux, **le dire** et proposer les coutures (un titre par lot et les
  fichiers de chacun) : c'est un constat sur le diff, pas un service en plus.
  Jamais de titre-valise (« divers », « MAJ UI + PDF + CI »).
- Il ne mentionne ni la doc (`CLAUDE.md`, `.claude/`) ni les tests ajoutés :
  ils suivent le sujet, ils ne sont pas le sujet.
- Un corps de 3 puces au maximum (une par sujet, dans l'ordre de risque du §1) ne
  s'ajoute que si le diff porte plus d'un sujet. Sinon le titre se suffit, et c'est
  le cas courant.
- Comme le reste de cette revue, c'est une **proposition** : ni commit, ni
  stage, ni push, même si le titre est validé dans la réponse suivante (il faut
  une demande explicite).

## Garde-fous

- Chaque finding est vérifié en relisant le code incriminé avant d'être
  rapporté — `fichier:ligne` exacts, pas de finding « probable » ; un
  finding invérifiable est abandonné.
- Diff volumineux : priorise dans l'ordre de risque du §1, mais ne saute
  rien en silence — ce qui n'a été que survolé est listé comme tel dans le
  rapport.
- Ne « répare » jamais `data/` à la main pour faire passer une vérification.
- Une question technique ne se pose pas au responsable : elle se mesure, se
  cherche dans les précédents du dépôt, ou se tranche (§6). Ce qui se pose, c'est
  le produit, l'UX et l'UI.
- Un finding proposé par l'agent front n'est pas une décision prise : `Sûr: oui`
  se relit et peut être RÉFUTÉ (mesure, précédent, contrainte que l'agent ne
  voyait pas). Un refus argumenté est un résultat de revue, mais il s'écrit **dans
  un commentaire du code**, là où il empêchera la question de se rouvrir, et pas
  dans le rapport, qui n'en garde au mieux une ligne (§7).
- L'éditeur a un re-skin volontaire (« Rail ») : ses différences de tokens
  listées dans le contrat ne sont pas des findings.
- Si le code a raison contre la doc (catégorie `contrat` du front-reviewer,
  ou `CLAUDE.md` périmé), mets à jour `references/design-system.md` ET la
  table « Repères rapides » de `CLAUDE.md` — ne « corrige » pas le code.
