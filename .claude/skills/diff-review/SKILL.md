---
name: diff-review
description: Revue complète du travail en cours (tout ce qui n'est pas encore publié sur la branche principale) — fond (bugs, régressions, sécurité du workflow), invariants du projet (ids, contrat ZIP, normalisation, uploads hostiles), tests Python + build, et audit front (agent front-reviewer contre le design system) si l'UI est touchée. Corrige ce qui est sûr, liste le reste, un seul rapport, et finit par un titre de PR prêt à coller. À utiliser avant de committer/pousser, après des changements d'UI, ou sur demande (/diff-review).
---

# Revue du diff courant

Revue de **tout ce qui n'est pas encore publié** : commits non poussés,
modifications indexées ou non, fichiers non suivis. L'audit front en fait
partie (agent `front-reviewer`, revue statique contre le design system :
la cohérence visuelle est garantie *par construction* — composants partagés,
tokens — pas en comparant des rendus). Un seul rapport final, qui se termine par
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
(cohérence graphique, factorisation, a11y, responsive, textes français).

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
- **partout** : textes visibles par l'utilisateur en français (UI, README,
  messages d'erreur de l'Action, qui finissent dans le journal des dépôts) et
  sans tiret cadratin, pas de secret ni de token dans le diff.

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

- `python3 -m unittest discover -s scripts/tests`
- `npm run build`

Lance-les **deux fois** : une fois au début (état des lieux — un échec
préexistant n'est pas imputé à tes corrections) et une fois après toutes les
corrections (celles issues de l'audit front comprises). Un échec final est
un finding de
sévérité haute, sortie citée verbatim.

## 6. Corrections sûres

Applique sans demander :

- bug évident dont le fix est local, sans changement d'API ni de format de
  données, couvert ensuite par un test ;
- test manquant pour un comportement déjà voulu ;
- texte anglais résiduel → français, libellés incohérents alignés sur la
  version majoritaire, message d'erreur absent ou trompeur ;
- côté front, tout ce qui ne change ni le comportement ni la structure JSX :
  hex/ombre/rayon en dur → token existant ; bloc CSS dupliqué entre ≥ 2
  pages → déplacé dans `theme.css`, copies supprimées ; `title`/`aria-label`
  manquants, focus, tailles tactiles.

**Demande d'abord** pour : tout changement de format de données ou du contrat
ZIP, toute modification de comportement visible non dictée par un invariant,
l'extraction de composants JSX partagés ou tout changement de structure DOM,
et tout choix visuel non dicté par le contrat (nouvelles couleurs, nouveaux
espacements). En cas de doute : pas sûr. Cette revue ne fait **ni commit,
ni stage, ni push** — les fixes restent dans le worktree.

## 7. Rapport

Un seul rapport terminal (pas de fichier, pas d'artifact). En tête : la base
utilisée et le périmètre (« N fichiers vs origin/master, dont X non
suivis »). Puis findings front + back confondus, chacun au format :

```
- [sévérité] [catégorie] fichier:ligne — constat en une phrase.
  Fix : appliqué | proposé : …
```

- `sévérité` : **haute** (perte de données, crash du workflow, invariant
  cassé, bug visible par l'utilisateur), **moyenne** (cas limite, test
  manquant, duplication, a11y), **basse** (polissage).
- `catégorie` : `bug`, `invariant`, `securite`, `tests`, `donnees`, `ci`,
  ou celles du front-reviewer (`structure`, `tokens`, `duplication`, `a11y`,
  `responsive`, `textes`, `contrat`).

Trois sections, par sévérité décroissante : **Corrigé**, **À valider**
(fix proposé, pour décision), **RAS** (une ligne par dimension entièrement
conforme : invariants, tests, front…). Puis le titre du §8, qui ferme le
rapport.

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
- Un corps en 3 à 5 puces (une par sujet, dans l'ordre de risque du §1) ne
  s'ajoute que si le diff porte plus d'un sujet. Sinon le titre se suffit.
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
- L'éditeur a un re-skin volontaire (« Rail ») : ses différences de tokens
  listées dans le contrat ne sont pas des findings.
- Si le code a raison contre la doc (catégorie `contrat` du front-reviewer,
  ou `CLAUDE.md` périmé), mets à jour `references/design-system.md` ET la
  table « Repères rapides » de `CLAUDE.md` — ne « corrige » pas le code.
