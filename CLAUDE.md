# PrettyDrama Voices

Outil libre pour troupes de théâtre : répétition « à l'italienne » avec les vraies voix
des acteurs. Site statique (GitHub Pages) + GitHub Action Python/ffmpeg. Aucun serveur.

Conventions d'écriture :
- Le DÉPÔT est en français (README, commentaires, messages d'erreur de l'Action, qui
  finissent dans le journal des dépôts que lit le respo).
- L'INTERFACE est bilingue, français par défaut. **Aucun texte visible ne vit dans un
  composant**, tout passe par `src/shared/locales/{fr,en}.js`.
- **Jamais de tiret cadratin**, nulle part (doc, UI, catalogue anglais).

> Ce fichier a été condensé depuis une version de 180 ko qui documentait chaque décision
> de design et chaque piste écartée. Si un choix d'UI semble arbitraire ou si une règle
> CSS semble inutilement tordue, `git log -p CLAUDE.md` a le pourquoi : le consulter
> avant de « simplifier ».

## Plusieurs pièces, cloisonnées

Chaque pièce est un SILO (pages, données, clips, zone de dépôt, journal) et ignore les
autres.

```
index.html  respo.html         pages RACINE (sélecteur / gestion), entrées Vite
pages/*.html                   les 7 gabarits d'une pièce, non servis tels quels
plays/<id>/
  *.html                       GÉNÉRÉS au build depuis pages/, gitignorés
  data/script.json             source de vérité, commitée (porte l'id de la pièce)
  data/{clips,history,manifest}.json   commités
  data/script.pdf              dérivé, gitignoré
  clips/<lineId>.mp3           commités
uploads/<id>/                  zone de dépôt de la pièce
uploads/                       racine : le seul canal de CRÉATION d'une pièce
data/plays.json                index des pièces, dérivé, commité
data/history.json              journal des dépôts qu'aucune pièce n'a réclamés
```

**À l'intérieur d'une pièce, aucun chemin ne change** (`fetch("data/manifest.json")`,
`./rehearsal.html`) : c'est tout l'intérêt du découpage. Aucune PAGE ne connaît la
disposition `plays/<id>/` ; **cinq endroits seulement** la connaissent : `chooserHref` et
`playHref` (`src/shared/pages.js`), `githubRepoUrl` et `githubPlayFolderUrl`
(`src/shared/data.js`), `vite.config.js`. Pas de `?play=<slug>` : les liens internes sont
des href relatifs nus, le site perdrait le paramètre à chaque navigation.

`plays/.gitkeep` et `uploads/.gitkeep` sont **suivis** : `uploads.yml` finit par
`git add -A plays data uploads`, et `git add` d'un chemin absent échoue en code 128.

**Identifiant d'une pièce** : slug tiré du titre, minté une fois et jamais changé ni
reminté (il nomme un dossier et une URL). `sanitizeScript` le RECOPIE.

**Le DOSSIER de dépôt route, le contenu vérifie.** Un fichier appartient à la pièce dont
il alimente la zone de dépôt, jamais à celle qu'il déclare (un ZIP illisible atterrit
quand même dans le journal de sa pièce). L'id porté par le fichier sert à REFUSER un dépôt
fait dans la zone d'une autre pièce.

**Une pièce naît d'un dépôt de script** dans une zone orpheline : `uploads/<nouvel id>/`
(ce que propose la page de gestion) ou la RACINE d'`uploads/` (filet, routé par l'`id` du
fichier). Un ZIP de voix n'est jamais accepté à la racine. **Supprimer** une pièce demande
un commit, donc se fait à la main sur GitHub (la page de gestion donne le lien).

Migrer un fork en service : `python3 scripts/migrate_to_plays.py <id>` (idempotent ; l'id
est un ARGUMENT, pour ne pas réimplémenter `slugify` en Python).

## Architecture

**Frontend** : React + Vite, multi-pages (pas de SPA), `base: "./"`, tout en chemins
relatifs. Les 2 pages racine sont des entrées Vite écrites en clair ; les 7 gabarits de
`pages/` sont instanciés dans le dossier de chaque pièce par `writePlayPages`
(`vite.config.js`), appelé au moment de la CONFIG parce que `rollupOptions.input` doit
citer des fichiers existants et que le serveur de dev ne sert que le disque. Les modules
JS étant partagés, une pièce de plus ne coûte que 7 fichiers HTML. **Créer une pièce
pendant qu'un serveur de dev tourne demande de le relancer.**

Sources dans `src/<page>/`, partagé dans `src/shared/`. `dist/` gitignoré, build en CI.

**Backend** : deux workflows aux rôles étanches.
- `uploads.yml` (push touchant `uploads/**`) traite les dépôts, écrit le journal, commite,
  **puis appelle `build.yml`** (`jobs.site.uses`).
- `build.yml` (tout autre push, `workflow_dispatch`, `workflow_call`) construit et déploie
  Pages, n'écrit **jamais** dans le dépôt.

À ne pas défaire : (1) l'appel explicite, un commit poussé avec le `GITHUB_TOKEN` ne
déclenchant aucun workflow ; (2) des **groupes de `concurrency` distincts** (`uploads` /
`pages`), un workflow appelé qui partage le groupe de son appelant étant annulé comme
interblocage ; (3) le `paths-ignore: uploads/**` de `build.yml` ; (4) son checkout sur
`ref: github.ref_name` et pas sur le SHA du run (appelé, il tourne dans le run d'un push
antérieur au commit qu'`uploads.yml` vient de pousser).

**Aucun des deux n'écrit à destination du respo sur GitHub** (ni issue, ni statut README) :
son seul retour est le journal des dépôts de la page Avancement. Corollaires assumés : un
run en échec ne se raconte pas (mais la date du dernier dépôt cesse d'avancer), et le
commit précède le déploiement.

**Commandes**
- `npm run dev` (middleware Vite qui sert les données depuis le repo avec de vrais 404),
  ou `npm start` = `scripts/dev.sh`. `npm run build`.
- Build de prod à la main : `npm run build && cp -r data dist/data && rsync -a
  --exclude='*.html' plays/ dist/plays/ && npm run preview`. L'exclusion des `.html` est
  obligatoire : ceux de l'arbre de travail sont les gabarits en clair, ceux de `dist/` ont
  les URLs d'assets hachées.
- `python3 -m unittest discover -s scripts/tests` : statuts, normalisation, contrat ZIP,
  journal, PDF, **contrats inter-fichiers** (`test_contracts.py`).
- `npm test` = `node --test` **sans argument** (Node 22+ traite un positionnel comme un
  fichier ; sans argument les motifs par défaut trouvent les mêmes fichiers de Node 20
  à 24). Couvre la logique **pure** du front : reducer, history, search, data, plays,
  useRecorder, characterColors, stats, i18n, structureLabels, parité des catalogues.
  **Aucune dépendance de test, aucun rendu React** : ce qui touche au DOM se vérifie à la
  main. Corollaire : un module couvert par `node --test` n'importe jamais `locale.js` (qui
  lit URL, stockage et navigateur dès l'import) ; il reçoit `t` en argument ou rend un CODE
  que la page traduit.

Tester une page sans build : éditer `plays/<id>/data/manifest.json` à la main puis
`npm run dev`. Voir le journal peuplé : `cp scripts/tests/history-example.json
plays/<id>/data/history.json && python3 scripts/build_manifest.py` (même fichier que les
tests, exprès). Le `history.json` d'une pièce se **livre vide** ; il ne l'est pas dans ce
dépôt-ci pendant le prototypage, à vider avant publication.

## Flux de données

Chemins relatifs au dossier de la pièce, sauf mention contraire.

1. `data/script.json` : **source de vérité**, produit par l'éditeur, arrivé par la zone de
   dépôt puis validé. Reste potentiellement malformé (édition à la main dans le dépôt),
   donc tout consommateur est tolérant (`sanitize_script`).
2. Page Enregistrement → ZIP contenant `manifest.json`
   (`{play: id, clips: {lineId: texte brut}}`, rien d'autre) et un audio `{lineId}.{ext}`
   par réplique (webm/mp4/ogg selon le navigateur).
3. L'acteur envoie le ZIP au respo, qui le glisse dans `uploads/<id>/`. **Un seul dossier
   par pièce** ; le type vient de la seule extension (`kind_of` : `.zip` = voix, `.json` =
   script), jamais du nom (le navigateur renomme en « script (1).json »).
4. `scripts/process_uploads.py`, par fichier de chaque zone :
   - `.zip` : valide tout le manifest, refuse un ZIP nommant une autre pièce, transcode
     (ffmpeg : trim silences + loudnorm, mp3 mono 64 kbps) → `clips/<lineId>.mp3` et
     `data/clips.json`. Merge **tout-ou-rien par ZIP**.
   - `.json` : `validate_script` puis promotion **verbatim** (passer par `sanitize_script`
     perdrait les teintes des personnages) ; dans une zone orpheline, c'est ce qui CRÉE la
     pièce (`ensure_play_layout`).
   - autre : consigné comme inconnu.

   Le fichier est supprimé même en cas d'erreur (sinon il échoue à chaque run) ; les
   fichiers cachés restent. Sort de chaque fichier écrit dans `uploads_result.json`
   (éphémère, gitignoré), rangé par pièce plus une liste pour les non-routables.
5. `scripts/update_history.py` : une entrée `{at, files}` dans le `history.json` de chaque
   pièce concernée (plafonné à `MAX_RUNS`), plus le journal racine pour le reste. Un seul
   horodatage par run. Écrit par `uploads.yml` seul, donc un journal ne contient QUE des
   dépôts.
6. `scripts/build_manifest.py` : par pièce, join stateless `script.json` × `clips.json` →
   `data/manifest.json`, **seul fichier que ses pages lisent** (l'éditeur lit aussi
   `script.json`) ; y recopie `history.json` et l'`id`. Statut par réplique : `ok` /
   `perime` (texte modifié depuis l'enregistrement) / `manquant`. Une pièce dont le script
   ne se lit pas est SAUTÉE, manifest laissé tel quel (le reconstruire vide effacerait la
   pièce du site sur une erreur de syntaxe) ; le run finit en échec, les autres pièces sont
   construites. Un dossier SANS script reçoit un manifest vide, pour que son Avancement
   s'ouvre et montre le journal qui dit pourquoi.
7. `scripts/build_plays_index.py` : `data/plays.json` (racine). La liste vient des DOSSIERS
   et pas des manifests (une pièce ne disparaît pas du sélecteur parce que son manifest est
   abîmé) ; ordre par identifiant, les pages racine triant par titre avec `Intl.Collator`
   (un fichier machine ne connaît pas de locale).
8. `scripts/build_script_pdf.py` : `script.json` → `data/script.pdf`, gitignoré, construit
   par `build.yml` seul.

## Invariants (à ne pas casser)

- **Normalisation de texte : une seule implémentation**, `scripts/normalize.py`, appelée
  uniquement dans `build_manifest.compute_status`. Le navigateur stocke et transporte du
  texte **brut**. Le repliement de `src/editor/search.js` n'est PAS cette normalisation
  (il ne sert qu'à trouver une occurrence à l'écran).
- **Les ids de répliques ne sont jamais recyclés** (ils nomment les mp3).
- **L'identifiant d'une pièce n'est jamais recyclé ni reminté.** On valide **avant** de
  concaténer un chemin, jamais après.
- **Contrats tenus par `test_contracts.py`**, qui LIT les sources plutôt que de recopier
  les valeurs attendues : `SAFE_ID` (`src/editor/reducer.js`) ↔ `LINE_ID_PATTERN`
  (`process_uploads.py`), `^[0-9a-zA-Z-]{1,64}$` ; `SAFE_PLAY_ID` (`src/shared/plays.js`)
  ↔ `PLAY_ID_PATTERN` (`scripts/common.py`), `^[a-z0-9][a-z0-9-]{0,63}$` ; les libellés de
  structure JS ↔ `build_script_pdf.py` (chiffres romains compris) ; les entrées de
  `vite.config.js` ↔ les `.html` racine ; aucun CSS de page ne redéfinit un token
  `--header-*` ; aucune règle de bandeau ne consomme `--accent` / `--font-serif` /
  `--shadow` (re-skinnés par l'éditeur) ; chaque clé de `PAGES` a ses deux variables de
  sceau ; `build_manifest` ne valide qu'une forme `#rrggbb` de couleur ; plus les gardes
  i18n (voir plus bas). Sur l'arbre réel : chaque `script.json` publié déclare l'id de son
  dossier, chaque pièce a sa zone de dépôt avec son `.gitkeep`.
- **Format du ZIP = contrat navigateur ↔ Action** : toucher `downloadZip`
  (`src/recorder/App.jsx`) ET `parse_manifest` (`process_uploads.py`) ensemble. Vaut
  `{play, clips: {lineId: texte}}` ; le mapping NU d'avant les pièces multiples reste
  accepté (un acteur peut avoir son ZIP depuis des semaines, et il ne nomme aucune pièce).
  La présence d'une des deux clés nommées tranche, ce qui continue de refuser la forme
  encore plus ancienne (`clips` en liste).
- **`sanitize_script` (Python) est le miroir tolérant de `sanitizeScript` (JS)** : une
  entrée malformée est ignorée, jamais un crash de workflow. Trois asymétries assumées :
  le JS **reminte** les ids invalides/dupliqués (il est le producteur), le Python ne
  vérifie qu'« id = chaîne non vide » (il ne peut pas reminter sans orpheliner les mp3) ;
  le JS **plancher** la structure (il faut une scène où écrire), le Python jamais
  (`acts: []` rend `acts: []`) ; l'`id` de la pièce est la seule valeur validée de la MÊME
  façon des deux côtés (`isPlayId` / `is_play_id`), parce qu'elle devient un CHEMIN. Tout
  le reste doit dire exactement la même chose, y compris qu'**un personnage sans nom réel
  est écarté par les deux**.
- **`sanitizeScript` ne déplace jamais une réplique d'un personnage à un autre.** Id hors
  `SAFE_ID` : ses répliques le suivent (`characterRemap`). Id **dupliqué** : le premier
  porteur garde id et répliques, le second repart avec un id neuf et aucune réplique
  (remapper ferait sortir la voix de l'un sous le nom de l'autre, les mp3 étant nommés par
  id de *réplique*). Le remap se consulte sur la valeur brute du `characterId`, **avant**
  tout contrôle contre `SAFE_ID`.
- **Un no-op ne fabrique pas un nouvel état.** `updateScene` rend l'état reçu tel quel,
  `scriptReducer` aussi pour toute action refusée, et `history.js` reconnaît une action
  sans effet à l'identité (`present === state.present`).
- **`validate_script` est volontairement plus strict que `sanitize_script`** : le second
  est un lecteur tolérant, le premier décide d'écraser la source de vérité. Un candidat
  sans aucune réplique ne remplace jamais une pièce qui en a.
- **Uploads hostiles** : caps de taille réels (les en-têtes ZIP mentent), noms de membres
  validés par fullmatch, un fichier cassé ne bloque jamais les autres.
- **Prises d'enregistrement en mémoire uniquement** (garde `LeaveGuard` tant que non
  exportées), une seule prise par réplique, `URL.revokeObjectURL` à chaque remplacement.
- **Aucune persistance locale du travail** (décision produit : un brouillon oublié dans un
  navigateur redeviendrait une source de vérité périmée face au dépôt). Vaut pour la
  largeur du rail, le curseur de la Répartition, les prises, le script en cours d'édition.
  **Seule exception, `prettydrama.lang`** : sans lui, `navigator.language` ramène un
  francophone au français sur chaque page, et ce site perd ses paramètres d'URL à chaque
  navigation.
- **Aucun texte visible dans un composant** : texte entre balises, `title`, `aria-label`,
  `placeholder`, `alt`, props porteuses de texte (`hint`, `error`, `label`, `unit`,
  `confirmLabel`, `primaryLabel`, `saveLabel`), jusqu'au nom des fichiers téléchargés. Un
  littéral oublié ne se voit PAS côté français, d'où les gardes `TestCatalogues` sur TOUT
  `src/`, sans liste de fichiers à tenir : toute clé passée à `t()`/`<T>` existe dans les
  deux catalogues, aucune clé déclarée n'est inutilisée, aucun littéral visible ne survit
  (vu sous trois angles : littéral accentué, attribut porteur de texte, nœud de texte JSX).
  Une clé composée à l'exécution est couverte par motif ; une table de clés se nomme
  `*_KEY`/`*_KEYS`.
- **Aucun emoji dans l'UI** (sur mobile ils rendent en couleur pleine, hors palette, à une
  hauteur variable) : SVG dans `src/shared/icons.jsx`, dimensionnés sur la font-size et en
  `currentColor`. Exceptions : quelques caractères monochromes qui suivent la fonte
  (`✓ ✕ ↓`, chevron `▼`, poignée `⠿`, `?` du journal), et `FlagIcon`, seule image ni en
  `currentColor` ni dimensionnée sur la font-size, mais **dessinée et jamais l'emoji**
  (Windows ne rend pas 🇫🇷 et affiche « FR »).

## Interface bilingue

Moteur PUR dans `src/shared/i18n.js` (quelle locale gagne, pluriel par `Intl.PluralRules`,
`{placeholder}`, guillemets, nombres, dates). Face environnement dans
`src/shared/locale.js` (lit `?lang=`, puis le choix mémorisé, puis le navigateur ; expose
`t`, `fmt`, `LOCALE`, `translator`, `applyDocumentLanguage`). Catalogues plats et dotés :
`locales/fr.js` (référence) et `en.js`. **Un singleton de module et pas un contexte
React** : le site est multi-pages et changer de langue NAVIGUE, donc la locale est une
constante par document.

1. Une phrase qui porte du balisage au milieu passe par `<T k="…" p={{ … }} />`
   (`src/shared/T.jsx`), le JSX devenant un PARAMÈTRE. Découpée en fragments dans le
   composant, elle figerait l'ordre des mots français.
2. **Aucun pluriel bricolé** : `{ one, other }` + `t(clé, { count })`. Idem nombres,
   pourcentages, dates, guillemets (`fmt.percent`, `fmt.dateTime`, `fmt.quote`). Un
   paramètre NUMÉRIQUE est formaté par le moteur, pas au point d'appel (« 10 307 mots » /
   « 10,307 words ») ; `fmt.number` ne sert qu'aux nombres écrits SEULS. Un paramètre
   CHAÎNE traverse intact.
3. **La typographie française vit DANS les chaînes** (insécables, guillemets), pas dans le
   JSX : c'est un fait de langue, et l'anglais ne le porte pas.
4. Un libellé que deux endroits nomment ne s'écrit qu'une fois, le second INTERPOLANT la
   clé du premier. Le **nom d'une page citée dans une phrase** reçoit un `{page}` alimenté
   par `t(pageLabelKey("editor"))`, et un garde interdit « page X » / « mode X » écrit en
   clair (borné à cette tournure, les noms de page étant des noms communs en français).

**Ne pas confondre avec la langue de la PIÈCE** (`script.language`, choisie dans le plan du
rail), qui pilote le PDF, la voix de synthèse et les libellés d'acte/scène de l'Édition.
`src/shared/structureLabels.js` suit donc **la locale du LECTEUR sur les quatre pages qui
NAVIGUENT** et **la langue de la PIÈCE sur l'Édition**, où l'on façonne le document que le
PDF imprimera. D'où `t` en PARAMÈTRE de `actLabel`/`sceneLabel` et non en import ;
l'éditeur passe un traducteur lié à `script.language` (`translator`, mémorisé par locale).
La langue descend en CHAÎNE dans les composants, jamais le traducteur (`SceneEditor` est en
`React.memo`, une fonction fraîche le ferait rendre à chaque frappe). Corollaire assumé :
la même scène s'appelle « Scene 3 » sur l'Édition et « Scène 3 » sur l'Avancement.

**Sélecteur de langue** (`src/shared/LocaleSwitch.jsx`) : au pied des DEUX accueils et
nulle part ailleurs (une langue est un réglage de SITE). Deux vrais liens portant `?lang=`
(donc clic droit et nouvel onglet, aucun gestionnaire de clic), deux drapeaux avec le nom
de la langue en `title` et en nom accessible, écrit **dans cette langue, jamais traduit**
(`NAMES`, seul littéral accentué exempté du garde CI). La langue courante n'est pas un lien
et porte un filet d'accent. Le même couple de drapeaux sert la langue de la PIÈCE dans le
plan du rail, mais là c'est un champ (radios) qui édite la pièce, nom de langue TRADUIT.

## Repères rapides

Où vit quoi. Chaque ligne nomme le fichier ou le symbole, puis ce qu'il ne faut pas
défaire ; les sous-tables suivent le découpage des pages.

### Structure des pages

| Quoi | Où |
| --- | --- |
| Les 2 pages racine | `src/chooser/` : même composant, drapeau `manage`. `index.html` = sélecteur donné à la troupe (une carte par pièce, toute la carte est le lien), `respo.html` = gestion. **Aucun lien ne mène du premier au second.** Elles portent la MARQUE et pas un sceau de page, habillage emprunté à `home.css`. Propre à la gestion : « Nouvelle pièce » (`NewPlay.jsx` : titre → `script.json` téléchargé → lien de dépôt ; l'id est minté là, une fois, et un titre déjà pris est REFUSÉ), deux liens par pièce (zone de dépôt, dossier GitHub : le respo n'a pas à connaître GitHub), et le relevé des dépôts non réclamés, affiché SEULEMENT s'il porte quelque chose. La carte de gestion n'est PAS un lien (elle en porte trois) |
| Les 2 accueils d'une pièce | même composant `src/home/App.jsx`, deux listes de cartes (`ACTOR_CARDS`/`RESPO_CARDS` dans `src/shared/pages.js`). `pages/index.html` : Répétition, Enregistrement, Répartition (lien donné à la troupe, un acteur ne tombe jamais sur l'éditeur). `pages/respo.html` : les cinq pages. Aucun lien de l'un vers l'autre, `respo.html` se bookmarke. `homeHref(page)` : retour vers `respo.html` depuis Édition et Avancement, vers `index.html` sinon. Leur pied porte le seul lien qui sorte d'une pièce (`chooserHref`) et le sélecteur de langue |
| Bandeau de pièce | `src/shared/PlayHeader.jsx`, sur les **cinq** pages qui connaissent la pièce : titre serif + sceau en haut, réglages au milieu, marque en pied. `PageHeader.jsx` est son pendant pour les écrans sans manifest (via `PageState`), **même géométrie et même `HomeLink` en pied**, sinon la marque sauterait du haut vers le bas à l'arrivée du manifest. **Aucun bandeau n'écrit son libellé de page** : le sceau le dit, l'onglet le répète. `title` est **facultatif** : pièce inconnue, rien n'est rendu (pas même le `<span>`), donc le titre APPARAÎT au lieu d'en REMPLACER un autre ; la hauteur de rangée est fixée par le sceau. Repli « Pièce sans titre » partout. Le titre vit dans **une seule règle CSS** pour les deux bandeaux (`.play-header-title, .page-header .page-title`) |
| Marque / retour accueil | `src/shared/HomeLink.jsx` (logo aux deux masques + le mot « PrettyDrama »), **un seul composant pour les deux bandeaux**, **en pied du bandeau déplié**. Motif : sur mobile le pouce vise le haut de la barre pour la replier et tombait sur la marque, donc le geste le plus courant sortait de la page en perdant le personnage choisi et les prises non exportées. Maintenant tout ce que le doigt atteint en haut replie. Le sceau reste hors du bouton (son `role="img"` brouillerait le nom accessible). Survol : pas d'un pixel + nappe crème (classe `page-home` posée sur le lien pour lire `--page-mark-soft`) |
| Repli du bandeau | Réglages **montés** dans un conteneur grille dont l'unique ligne passe de la hauteur du contenu à zéro (interpolable, contrairement à `height: auto`). Piste en **`minmax(0, 1fr)` / `minmax(0, 0fr)`** et jamais `1fr`/`0fr` : le minimum d'une piste `fr` vaut `auto`, donc la piste « à zéro » restait haute du padding. `visibility: hidden` sort les selects du clavier sans démonter. Rognage sur la grille et pas sur l'enfant. Bouton en `align-self: stretch`, sinon quatre pixels morts en haut de la barre, là où le pouce vise. Se replie sur les cinq pages, y compris l'Avancement qui n'a aucun réglage |
| Phrases de doc | **Deux éléments par mode, pas plus.** (1) `PAGES[page].desc` (`src/shared/pages.js`), servi à la fois par la carte de l'accueil et par le bandeau, que **`PlayHeader` rend lui-même** (`.header-hint`) : une carte et un bandeau qui divergent décrivent deux pages. (2) le `hint` que la page passe à `PlayHeader`, pour ce qui n'aurait aucun sens sur une carte. Les deux **encadrent les réglages**. Forme : impératif en tête, une dizaine de mots, deux phrases au maximum, pas de question au lecteur. Seules l'Enregistrement et l'Édition ont un `hint`. Le libellé exact des boutons ne se recopie pas dans la phrase ; la troupe dit « le responsable », jamais « votre responsable ». Le lien vers une autre page (Édition seule) est le sceau + le nom (`.hint-page-link`), pas un mot souligné |
| Couleurs des sceaux | `.page-<clé>` dans `theme.css` (`--page-mark` / `--page-mark-soft`), **source de vérité** ; les favicons et `theme-color` des `.html` les redupliquent (un `<link>` ne lit pas une variable CSS). La couleur ne teinte QUE la pastille. Les quatre pages de la troupe partagent exactement le même couple (bordeaux `#8b2635` sur sable `#f5eeda`) : ce sont les ICÔNES qui disent la page. Seuls les modes du respo ont une couleur propre (vert Avancement, violet Édition). La terre `#a84f00` n'est plus qu'un statut (`--warn`) |
| Logo | `MasksIcon` (`icons.jsx`). **Géométrie fournie par `design/drama-wine.svg`, à ne pas redessiner** : les 8 tracés et leurs `transform` sont repris tels quels ; seules adaptations, `currentColor` + `var(--page-mark-soft)` et un `viewBox` recadré au carré (`37.5 36 262 262`). **Ne se lit qu'à partir de ~34 px** (en dessous les masques se touchent). Corollaire : la règle mobile qui rapetisse le sceau est visée sur `.page-header .page-mark` / `.play-header .page-mark`, **jamais sur `.page-mark` tout court** |
| Icônes d'onglet | favicon SVG en `data:` URI dans chaque `.html` + un PNG par page dans `public/`. **Chaque icône est la pastille de sceau de sa page** (tuile `--page-mark-soft`, glyphe `--page-mark`) : ces icônes SORTENT du site (vignette WhatsApp/iOS) et le négatif d'un sceau ne se reconnaissait pas. `theme-color` garde le `--page-mark` plein. Safari ne lit ni les favicons SVG ni les `data:` URI et iOS exige un PNG : les PNG sont **dérivés des mêmes tracés** (180 px, `rx` retiré, aplati en RGB sans alpha), donc toucher un favicon oblige à régénérer son PNG. `href` absolus, `public/` étant recopié tel quel |

### Pages de la troupe (Répétition, Enregistrement, Répartition)

| Quoi | Où |
| --- | --- |
| Cartes de dialogue | `.dialogue-card` dans `theme.css`, y compris la palette rose/doré « mes répliques » (`.mine`) et la bordure `.active` ; les pages ne gardent que leurs vrais écarts. **Les `--rec-*` de `recorder.css` ne doivent PAS dériver de `--warn`/`--ok`** malgré la sémantique partagée : ces étiquettes sont sur la carte rose `--accent-soft`, où `--ok` tombe à 4,31:1 (échec AA) quand `--rec-fresh` tient 4,87:1 |
| Barre de contrôle basse | `src/shared/ProgressBar.jsx` (slider indexé), CSS `.controls`/`.ctrl-btn` dans `theme.css` (dont `.ctrl-btn.my-jump` des sauts « ma réplique ») |
| Tirer le curseur | **Un glissement coupe DEUX lissés.** (1) Le pouce et le remplissage perdent leur transition (classe `dragging`), une transition de 0,15 s en cours de glissement se lisant comme une latence. (2) Le recentrage de la carte active échange le `scrollIntoView({behavior:"smooth"})` du navigateur contre un suivi **exponentiel** (90 % du chemin en 110 ms, `setSeekDragging` + la boucle de `useScrollToActiveCard.js`) : le lissé du navigateur est trop LONG et relancé à chaque cran, donc la liste traîne derrière la souris, alors qu'un nouveau cran ne fait ici que déplacer la cible. À ne pas défaire : (a) la cible est **BORNÉE à la course réelle du scroller** (`centerTarget`), sinon une carte du tout début, qui ne PEUT pas être centrée, fait repartir la boucle indéfiniment sur un `delta` constant (une image toutes les 16 ms sur une page ouverte une répétition entière) ; (b) la **seconde sortie** quand la course change sous la boucle (bandeau replié en pleine main) ; (c) le drapeau **se CONSOMME**, donc les sauts discrets retrouvent leur lissé même si la fin du geste passe à la trappe ; (d) `onPointerMove` porte le **même garde que `scrub`** (`disabled`, `count === 0`, `e.buttons === 0`), sinon survoler une barre désactivée bouton enfoncé lève un drapeau que rien ne repose. `onLostPointerCapture` rend les deux lissés (garanti, `onPointerDown` appelant `setPointerCapture`) |
| Réglages de la Répétition | `.checks-row` (`rehearsal.css`), rangée `flex-wrap` : « Couper ma voix », « Cacher mon texte », « Bip avant ma réplique », « Démarrer une réplique avant la mienne ». Les libellés disent ce que la case FAIT et remplacent le `hint` que la page n'a pas. **`flex-wrap` et jamais un nombre de colonnes fixé** : une largeur imposée aligne les quatre sur le plus long, donc quatre cases à deux lignes sur téléphone. Sous 800 px c'est la hauteur des étiquettes (32 px) qui espace les lignes et le `row-gap` est à **zéro** (les deux s'additionnaient), d'où aussi le `margin-block: -5px` du bloc |
| Page Enregistrement | comme la Répétition, navigation contrainte à SES répliques, micro central, bouton Télécharger. Les prises survivent au changement de personnage (ZIP multi-voix). Sans personnage choisi : `IntroCard` à la place de la liste, barre basse masquée, `hint` à `null`, select en accent (`.character-select.unset`) |
| Statut des répliques | 3 états : `todo` « À enregistrer », `fresh` « À télécharger » (prise de la séance ; **reste fresh après téléchargement du ZIP**, « Déjà enregistrée » n'étant vrai qu'une fois le ZIP intégré et le site republié), `done` « Déjà enregistrée » (clip publié à jour). Le téléchargement ne touche pas aux statuts, il ne pilote que la note « pas sauvegardé », qui vit dans le bandeau du HAUT. Lecteur `TakePlayer` (durée avec workaround Infinity des blobs MediaRecorder, onde décorative déterministe) |
| Jeter une prise | corbeille en bout de rangée du lecteur (`.player-delete`), **seulement sur une prise de la séance** (un clip publié vit dans le dépôt, le retirer demanderait un canal de dépôt qui n'existe pas). `deleteTake` révoque l'URL, retire la clé et **repose `downloaded` à faux** (le ZIP déjà téléchargé contient encore la prise jetée) ; la réplique retombe sur `line.status`, sans code dédié |
| Micro et ZIP | `src/recorder/useRecorder.js` (MediaRecorder, stream réutilisé, `release()` en fin de session) ; `downloadZip` dans `src/recorder/App.jsx` |
| Couleurs des personnages | `src/shared/characterColors.js` (partagé, testé : Édition + Répartition). Couleur **stockée** sur le personnage (`color: "#1f77b4"`), pas une teinte : la palette est **Tableau 10**, qu'aucune teinte ne peut indexer ; slots 11-20 = les dix teintes claires de `tab20`. **C'est la clarté qui distingue, pas la teinte** (la palette précédente était à clarté fixe, et sur un bloc d'un carré par mot deux voisines se confondaient). Aplats pour les surfaces, `characterInk` pour le texte (plafonne la clarté en gardant la chroma, donc les vingt au-dessus de 5:1 ; un `color-mix` vers le noir éteignait la couleur). Auto = 1re libre ; palette de vingt pastilles en deux rangées de dix, **dans le flux** du panneau du rail. **Le comblement n'a qu'une implémentation** : `build_manifest.py` recopie sans jamais réparer, le front comble avec `assignColors` |

**Page Répartition** (`src/stats/` : `stats.js` **pur et testé**, `App.jsx` le dessin,
`stats.css`). Portage de la visualisation Python de la troupe : deux camemberts (mots,
répliques) et un bloc où **chaque carré est un mot**. « Carré » et jamais « pixel », la
page étant ouverte à toute la troupe. Cinq contrats :

1. **La somme des largeurs des rectangles vaut le nombre de mots** (`blockRects`, testé) :
   une réplique à cheval sur trois rangées donne trois rectangles, un mot occupe un carré
   une fois.
2. Un `<rect>` par **tronçon** (répliques consécutives d'un même personnage fusionnées), en
   SVG et en `crispEdges` (sans quoi un liseré translucide voile la grille). **La largeur
   rendue est arrondie à un multiple entier du nombre de colonnes** (`@supports (width:
   round(...))`, le nombre descendant en `--stats-columns`) : `crispEdges` cale chaque bord
   sur le pixel écran, donc 6,833 px par mot sortaient en 7,7,7,6,7… ce qui se lit comme du
   blocage JPEG. Prix : jusqu'à une cellule de moins que la carte, d'où le centrage. Plus
   un **plancher d'un pixel par carré** (`min-width` sur `.stats-block`), inatteignable
   aujourd'hui mais gardé : `round(down, A, B)` vaut ZÉRO dès que A < B, et le bloc
   disparaîtrait en silence.
3. **Chaque camembert se trie sur SA grandeur** (ordre d'AFFICHAGE, donc dans le composant
   et pas dans `speechStats`).
4. **Les pourcentages ne sont pas posés sur les parts** (chevauchement dès qu'une part est
   petite) mais dans la légende, en `tabular-nums` ; le total occupe le centre de l'anneau
   **à une taille qui rétrécit quand le texte ne tient plus** (`centerFontSize`, testé,
   dans `stats.js` puisque c'est le module qui décide).
5. **Le personnage mis en évidence appartient à la PAGE** : les trois dessins répondent au
   même choix. Les **trois légendes sont un seul composant** (`CharacterLegend`) et la
   SEULE surface accessible au clavier (les SVG sont en `role="img"`). Deux états :
   `selected` (choix arrêté) et `hovered` (le préfigure, gagne s'il existe) ; `aria-pressed`
   suit le choix arrêté, jamais le survol. **Le survol ne vaut qu'à la souris**
   (`hoverProps` filtre sur `pointerType`) : au doigt le survol émulé restait accroché. **La
   mosaïque ne se désigne pas au pointeur**, un mot faisant 4 à 8 px.

Portée : les deux selects du bandeau, **les trois niveaux tenant dedans** (chacun porte en
premier choix le niveau au-dessus : « Toute la pièce », « Tout l'acte »). Sur « Toute la
pièce » le select de scène est **désactivé, grisé et vide**, d'où la règle
`select:disabled` dans `theme.css` (le `background: #fff` du select défait celui du
navigateur) ; pas d'infobulle dessus, un `disabled` ne recevant aucun événement souris.
Choisir un acte pose sa **PREMIÈRE scène** et pas « Tout l'acte » : on descend d'un cran par
geste. `actIndex` vaut `ALL` à l'ouverture.

La légende vit **en barre, sous le bandeau** (`.stats-legend-bar`) et pas sous la mosaïque,
qui fait plusieurs écrans : en pied de carte elle n'était visible qu'en bout de course. Elle
passe à la ligne (jamais un défilement en travers), hauteur bornée à 30 dvh, cibles de
40 px. Portée par la coquille partagée `.page-shell`/`.page-scroll`.

Largeur du bloc : curseur « Mots par ligne », 50 à 200 par pas de 5, 100 au départ (**le
défaut et le plancher sont les deux valeurs de la référence Python** ; 100 colonnes dans
820 px donnent 8 px pile). Elle a été DÉRIVÉE du nombre de mots, ce qui donnait des formes
flatteuses **au prix d'un carré qui changeait de taille d'une portée à l'autre** : à nombre
de mots par ligne constant, un carré fait la même taille partout et la HAUTEUR dit la
longueur. `countWords` reprend le `re.findall(r'\w+')` de la référence, apostrophes
comprises : les totaux gonflent mais la page n'affiche que des proportions et les chiffres
concordent avec le PDF. Les répliques sans personnage valide sont comptées **à part** et
signalées.

### Pages du responsable (Avancement, Édition)

| Quoi | Où |
| --- | --- |
| Grille d'avancement | `ProgressTable` dans `src/dashboard/App.jsx`, `.dash-table*` : personnages × scènes, « enregistrées / total », échelle ambre/vert portée par les cases, les noms, les numéros et les actes (`statusClass`), donc une rangée ou un acte tout vert se lit sans compter. (1) La **colonne des noms est figée** (`sticky; left: 0` sur `.dash-name` et les deux `.dash-corner`) et c'est le CONTENEUR qui défile, jamais la page ; le coin prend le fond `--paper` (sinon les numéros défilent visiblement dessous) et porte le filet gauche des deux rangées d'en-tête ; le conteneur est une région nommée et `tabIndex={0}` (une zone défilante sans rien de focalisable est hors d'atteinte au clavier). (2) Le tableau est en **`border-collapse: separate`** : sous `collapse` les filets sont peints par le tableau et ne suivent pas une cellule `sticky`, donc la colonne figée perdait ses bordures au premier pixel de défilement ; chaque cellule porte son filet droit et bas, et le filet haut ne se pose surtout pas sur tous les noms (il s'ajouterait au filet bas du précédent). Nom dans `.dash-name-text` coupé en « … » (`title` sur la cellule). Sous 560 px on resserre cette colonne d'abord |
| Journal des dépôts | `scripts/update_history.py` → le `history.json` de chaque pièce (`{runs: [{at, files}]}`, récent d'abord, plafonné à 30), recopié dans son manifest ; affiché par `Journal` (`src/dashboard/App.jsx`). **C'est le canal d'erreur du projet** : ni issue GitHub ni statut README, donc un fichier refusé ne se dit QUE là. **Une ligne par FICHIER et pas par dépôt** (un ZIP abîmé au milieu de trois bons n'empêche pas les autres), `<table>` dont le conteneur défile, en-tête `sticky`. Quatre colonnes : date (année comprise), statut, type, détail. Les deux colonnes d'icônes empruntent la pastille des sceaux (type = sceau de la page productrice, donc aucune légende à donner ; pastille au `?` pour un fichier qu'aucune page ne revendique), avec `aria-label` et `title` puisqu'elles ne portent aucun mot. Plafonné à `JOURNAL_ROWS` et **le dit** (`.dash-journal-more`) : dans le seul canal de retour, un tableau qui s'arrête sans un mot se lit comme « il n'y a rien de plus ». Reste affiché même vide. La date de la première ligne fait détecteur de panne ; **pas d'horodatage du run dans le manifest**, qui ferait un commit robot à chaque push |
| Bouton de dépôt | `githubUploadUrl(playId)` (`src/shared/data.js`) → `…/upload/master/uploads/<id>`, reconstruit depuis l'URL Pages ; `null` hors github.io (dev, domaine perso), où la carte se masque plutôt que de forger un 404. **Une seule carte** (`UploadLinks`), il n'y a qu'un dossier de dépôt. Deux formes d'URL Pages, site de projet et **site racine** ; trois formes de premier segment disent « site racine » : rien, un nom de fichier, et **`plays`** depuis que les pages d'une pièce vivent deux niveaux plus bas (le seul cas qui ne se voie pas à l'œil ; sans lui le bouton visait `github.com/<owner>/plays`) |
| PDF du script | `scripts/build_script_pdf.py` : `script.json` → `.tex` → `data/script.pdf`, par pièce (ou celles nommées en argument). **`pdflatex` + paquets apt** (`texlive-latex-recommended`, `texlive-lang-french`, `texlive-fonts-recommended`, `lmodern`) ; `tectonic` accepté en second dans `ENGINES`. **tectonic a été essayé en CI puis écarté, ne pas y revenir sans nouvel élément** (URL de release figée, sha256 à faire suivre, cache évincé au bout de 7 jours, pour gagner moins d'une minute : la compilation n'est pas le coût, 0,25 s pour 26 pages). Mise en page reprise du script LaTeX de la troupe (`article` 10pt deux colonnes, babel français, `\speak`, filet entre scènes) ; une pièce en un seul acte n'imprime pas son titre d'acte (`show_acts`). À ne pas défaire : (1) **ce script ne peut pas faire échouer le déploiement** (rend 0 même si LaTeX plante, étapes en `continue-on-error`), c'est structurel puisqu'un run rouge ne se raconte nulle part ; (2) le texte est **échappé** (`latex_escape`, une seule passe de `re.sub`, jamais un `str.replace` par caractère qui ré-échapperait les antislashs) et les blancs **aplatis**, parce qu'une ligne vide est un `\par` et que `\lhead`/`\MakeUppercase` s'arrêtent net dessus, donc un titre hand-édité sur deux paragraphes faisait disparaître le PDF de TOUTE la pièce ; (3) `lmodern`, sans quoi les fontes T1 n'existent qu'en tailles discrètes et le titre sortait 16 pt trop petit avec un simple avertissement. Page de titre : `\newgeometry{nohead,nofoot}` + `\topskip` à zéro + un `\vbox to \textheight` à deux ressorts en rapport **3:5** (centre optique), `\hsize\textwidth` obligatoire en deux colonnes ; puis un verso blanc, `\restoregeometry` **après** lui. `render_tex` rend une chaîne, donc la mise en page se teste en lisant du texte ; seul le test bout en bout compile. Aucune dépendance Python. Les didascalies n'existent pas encore dans `script.json` (le futur champ ne sera pas un booléen, l'original en distinguait trois sortes) |
| Bouton PDF | `ScriptPdfLink` / `.dash-script-btn` sur l'Avancement. **`.btn.primary`, le bouton de téléchargement du site**, comme le ZIP des prises et le script : un téléchargement se présente pareil partout, forme ET couleur. Les deux gestes de la page ne se ressemblent donc pas au repos, et c'est le but : le dépôt est une carte blanche (on part sur GitHub), le téléchargement un aplat d'accent. **Le bouton est INCONDITIONNEL**, il ne sonde pas le fichier : quand il sondait en `HEAD`, il arrivait après la page et poussait le tableau, et en dev (PDF gitignoré) il n'arrivait jamais. **C'est la production du fichier qui suit le bouton** : `build.yml` le construit avant de déployer, et le serveur de dev le **télécharge depuis le site publié** (`ensureScriptPdf` dans `vite.config.js`, promesse mémorisée PAR PIÈCE ; URL déduite du **remote git**, réponse validée sur la **signature `%PDF-`** et pas sur le code de retour puisqu'un site sans PDF répond sa page 404, écriture par `.part` puis `rename`, échec **pas retenté** dans la session). Le middleware garde sa branche `HEAD` (sinon la requête retombe sur le repli SPA de Vite) et son type MIME. Libellé « Télécharger la pièce à imprimer (PDF) » et **pas « le script de la pièce »**, que la carte de dépôt emploie déjà ; le `download` renomme avec le slug. **Pas de sceau sur le bouton** : la plume désigne le fichier qu'on DÉPOSE |

### Édition

| Quoi | Où |
| --- | --- |
| Design « Rail » | tokens re-skinnés dans `src/editor/editor.css` (`:root` local) : même fond crème `--paper`, accent `#7a5cc0`, IBM Plex + Spectral. **Le re-skin ne fuit jamais dans le bandeau partagé**, qui consomme les tokens réservés `--header-accent`/`--header-serif`, qu'aucune page ne redéfinit (contrat CI ; les LIRE est autorisé, cf. `--ed-tile-act`, `--ed-panel-shadow`). Les répliques vivent dans UN panneau blanc (`.line-list`) |
| Réservée à l'ordinateur | `src/editor/useTouchPointer.js` : sur `(pointer: coarse)` l'éditeur ne se rend pas du tout, `App` renvoie un `PageState` d'une phrase. **Le critère est le pointeur, pas la largeur** (un téléphone en paysage fait 844 px et reste inutilisable, une fenêtre rétrécie garde souris et clavier) ; ça se teste avec l'émulation d'appareil, pas en réduisant une fenêtre. La requête est **écoutée** (`change`), sinon un hybride qui rattache son clavier reste bloqué ; sans `matchMedia` on ne bloque pas. Le `fetch` du script a lieu **même murée**, son seul emploi étant de nommer la pièce dans le bandeau. Ordre des sorties de `App` : chargement, mur, erreur de lecture. La carte Édition de l'accueil respo n'est PAS masquée sur mobile. `editor.css` n'a donc plus de règles tactiles ; il ne reste que le repli des `.line-row`, en requête de **conteneur** (`container: ed-column`) et pas de fenêtre, depuis que le rail prend sa largeur sur la colonne. **Piège** : `container-type` implique le confinement de mise en page, donc la colonne devient le bloc conteneur des descendants `fixed` ; ne rien y poser de `fixed` |
| Le rail | `src/editor/EditorRail.jsx` : bande de trois icônes toujours visible (48 px) et **une section ouverte à la fois** (272 px par défaut) : Structure, Personnages, Recherche. Ordre = ordre du parcours clavier ; Structure d'abord parce qu'elle porte la NAVIGATION, et c'est la section ouverte à l'arrivée. **Pas un `role="tablist"`** (qui promettrait un onglet toujours sélectionné, or le rail a un état « rien d'ouvert ») : trois boutons de dévoilement à `aria-expanded`, lu par le CSS. **Les icônes sont le seul interrupteur** : recliquer l'icône ouverte replie, Escape aussi (écouté sur le panneau, le rail étant le seul à savoir à quelle icône rendre le focus). Ne pas remettre de languette de repli sur le bord droit : elle partagerait son `pointerdown` avec la poignée de largeur, qui appelle `setPointerCapture`, et un pointeur capturé retarge le `click` sur l'élément capturant |
| Géométrie du rail | Coquille `.page-shell` (`--shell-height: 100vh` ici), bandeau dans le flux, puis `.editor-layout` (grille `auto minmax(0, 1fr)`) ; rail et `<main>` défilent chacun pour son compte, la page ne défile plus en entier. **Motif, valable aussi pour la barre de légende de la Répartition** : la seule autre façon d'obtenir ça est un élément collant sous le bandeau, dont la hauteur est un inconnu **animé**, donc à mesurer en JS, remesurer à chaque repli, et il traînerait derrière l'animation. Ici rien n'est mesuré et `PlayHeader` n'est pas touché. La coquille est posée sur un élément et jamais sur `body`, pour que les écrans pleine page gardent le défilement normal. **Quatre pièges déjà payés** : (1) le rail rogne en **`overflow: clip` et jamais `hidden`**, qui en ferait un conteneur de défilement, donc au montage du panneau le focus du champ de recherche faisait défiler le rail et la bande d'icônes sortait par la gauche ; (2) la rangée de `.editor-layout` s'écrit **`grid-template-rows: minmax(0, 1fr)`** et jamais implicitement, sinon elle grandit à la hauteur DÉPLIÉE de la liste des résultats (8643 px mesurés) et la poignée de largeur descend hors de l'écran ; (3) `min-height: 0` sur `.editor-rail-body` (même piège côté flex) ; (4) le rail ne prend **ni `position` ni `z-index`**, qui enfermeraient le `z-index: 20` de la palette de couleurs. La largeur est animée (0,26 s, `--ease-header` emprunté au bandeau) et c'est le rail qui rogne, le panneau gardant sa largeur fixe, d'où **`flex: none` sur `.editor-rail-panel`** (par défaut `flex-shrink: 1` le laissait s'écraser et recomposer son texte à chaque image). **Le panneau ne défile pas** : tête fixe, chaque section accordant le défilement à ce qui doit défiler ; `.character-list` s'écrit `flex: 0 1 auto` et surtout pas `flex: 1`, qui poussait le formulaire d'ajout au bas du panneau. **Largeur réglée en tirant le bord droit** (`.editor-rail-edge`, `role="separator"` focalisable, flèches + Début/Fin + double-clic pour le défaut), bornes 200-560 px ; transition coupée pendant le glissement (classe `resizing`), et `preventDefault` sur `pointerdown` supprimant les événements souris de compatibilité, le double-clic est reconnu à la main. **Rien ne replie le rail à la place de l'utilisateur** (une règle CSS ferait mentir `aria-expanded`). Repère `complementary`, **avant** `<main>` dans le DOM comme à l'écran |
| Plan de la pièce | `src/editor/StructurePanel.jsx` : titre, langue, actes, scènes ; à la fois la NAVIGATION et le seul endroit où la structure se façonne. **Seule la PIÈCE porte un nom** : acte et scène ont un libellé DÉRIVÉ de leur rang (`structureLabels.js`), donc un seul champ de texte ici, et pas de « Prologue » possible (ce serait un champ FACULTATIF à rajouter). Motif : un titre stocké est une donnée dans une langue, et il voyageait vers le manifest, le PDF, l'Avancement et la Répartition sans que rien puisse le traduire. **Une scène est un `<button>`** (le chemin clavier venait gratuitement avec l'ancien champ) ; le nom d'un acte ne mène nulle part, donc texte nu. Rangée cliquable, le ✕ fait `stopPropagation`. **Chaque rangée est une TUILE dont la couleur dit le niveau** : `--ed-tile-act` (`--header-accent` à 18 %, le seul rouge que ce `:root` ne re-skinne pas) pour un acte, blanc `--card` pour une scène ; contrastes notés dans `editor.css` (`--accent` tombe à 3,8:1 sur la tuile, d'où `--ed-accent-ink`). **À ne pas défaire** : (1) une scène ne change jamais d'acte (`MOVE_SCENE` borné à son acte, donc un seul indice de conteneur) ; (2) le filtrage des cibles se fait **à la détection de collision** (`collision`) et pas en garde à l'arrivée, les deux `SortableContext` vivant dans un seul `DndContext` (sans lui `closestCenter` désignait la scène d'un autre acte et le glissement se figeait) ; (3) actes et scènes n'ayant pas d'id, leur identité dnd-kit et leurs clés React sont des **rangs préfixés** (`act:2`, `scene:2:0`) ; (4) le regard suit l'objet déplacé via `indexAfterMove`/`indexAfterRemoval` (`reducer.js`, testés à côté de `MOVE_*`), qui décrivent exactement la permutation appliquée. Corollaire dans `history.js` : **toute clé de fusion identifie son objet par une valeur STABLE**, un id ou rien, jamais un rang |
| Personnages | `src/editor/CharacterPanel.jsx` : une puce par personnage, pastille de couleur, renommage en place, compte, suppression, formulaire d'ajout. Vraie `<ul>`. Le compte passe par `CountBadge.jsx` (chiffre SEUL à l'écran via `fmt.number`, phrase dans l'`aria-label`, `role="img"` pour le rendre valable sur un `<span>`). Ni ce panneau ni la Structure ne peuvent remonter dans le bandeau : il est **partagé par cinq pages** et n'a de place que pour ce que les cinq ont en commun |
| Bandeau de l'Édition | ne garde que ce que les cinq pages ont en commun, plus dans ses `actions` le téléchargement **en icône seule** (`.btn.script-download-btn` ; l'Enregistrement a son propre `.zip-download-btn` aux règles contraires) et la paire annuler/rétablir. Accent = le **vin du thème partagé**, comme les deux autres téléchargements ; dessin de 19 px mais **hauteur calée** sur les boutons d'historique (31 px). **Désactivé quand `dirty` est faux** ; seule l'infobulle change, jamais l'`aria-label`. **Ces infobulles sont portées par une enveloppe `.btn-tip`** : un contrôle `disabled` ne reçoit aucun événement souris, donc son propre `title` ne s'affiche pas. Corollaire connu : un script réparé par `sanitizeScript` n'est pas téléchargeable tant qu'on n'y touche pas |
| Annuler / rétablir | `src/editor/history.js` : pile d'états qui **enveloppe** `scriptReducer` (qui reste pur), `{present, past, future, lastKey, saved}`, `past` plafonné à 100. Toute édition vide `future`. Les frappes (`EDIT_TEXT` d'une même réplique, `SET_TITLE`) sont fusionnées, closes par toute autre action, un undo/redo ou `HISTORY_BREAK` (au blur). `LOAD_SCRIPT` réinitialise. `SET_LINE_TEXTS` (remplacement) ne fusionne avec rien : **une** étape qu'il touche une réplique ou cent, et c'est pourquoi il n'emprunte pas `EDIT_TEXT`, dont la clé laisserait la rafale ouverte. Ctrl+Z / Ctrl+Y (et Cmd+Maj+Z) globaux, interceptés même dans un textarea (l'undo natif désynchroniserait la pile) sauf quand il n'y a rien à faire |
| « Modifications non téléchargées » | dérivé, jamais un drapeau : `dirty = present !== saved`, `saved` étant l'état du dernier script téléchargé (`MARK_SAVED` au téléchargement). **Un ALLER-RETOUR l'éteint aussi** : `asSavedIfUnchanged` compare les champs de haut niveau **à l'identité** et repose l'OBJET `saved` s'ils s'y retrouvent tous. À ne pas défaire : la liste des champs est **dérivée de `EMPTY_SCRIPT`** (`Object.keys`) et jamais recopiée ; la comparaison reste **à l'identité et jamais en profondeur**, donc la promesse est bornée aux champs SCALAIRES (retaper une lettre puis l'effacer reconstruit `acts` et laisse l'étiquette allumée). L'étape s'empile normalement dans les deux cas |
| Recherche | `src/editor/search.js` (pur, testé), `useSearch.js`, `SearchPanel.jsx`. Porte sur **le texte des répliques uniquement**, dans toute la pièce (pas les titres, pas les noms de personnages, qui ont leur geste dédié). Casse et accents ignorés par défaut, plus « Respecter la casse » et « Mot entier ». **Pas de regex** : le matching est un `indexOf`, donc rien à échapper, aucun état « expression invalide », aucun retour sur trace ; « Mot entier » est un test de frontière (`\p{L}`/`\p{N}`, ni `_` ni `'` ni `-`). **Le contrat central est un repliement à LONGUEUR CONSERVÉE** (`foldText`) : point de code par point de code, tout candidat de longueur différente refusé, donc un indice dans le replié est un indice dans le texte BRUT et les offsets vont directement à `setSelectionRange`, sans carte d'index. La table `UNIFY` (apostrophes et tirets typographiques) n'est pas un raffinement : la pièce publiée porte l'apostrophe courbe sur 253 répliques et la droite sur 324. Limites documentées en tête de module (`œ`, `æ`, `ﬁ`, `İ`, NFD, où `cutsGrapheme` refuse l'occurrence). **Un seul itérateur** (`eachMatch`) sert la recherche, le remplacement d'une occurrence et le global, sinon « Tout remplacer » réécrirait ce que la liste n'a jamais montré ; après une occurrence ACCEPTÉE on repart après elle, après une REFUSÉE d'UN cran. Occurrences **toujours fraîches** (`useMemo` sur le script), repliement mémorisé par OBJET réplique dans une `WeakMap` (correct parce que le reducer est immuable). **La correspondance courante est une ancre de position** (`{lineId, lineOrdinal, start}`) et pas un rang : quand rien n'est exactement là, `currentIndex` vaut -1 et tous les cas limites tombent du calcul dérivé |
| Forme du panneau de recherche | du haut : les deux cases, le champ de requête, le champ de remplacement, le compte et ses flèches (ce sont les deux CHAMPS qui doivent se toucher ; les cases règlent la recherche et se lisent avant elle). Le champ de remplacement est décalé de la largeur du chevron plus sa gouttière (26 + 4 px), donc aligné sur celui de requête. **Le remplacement est REPLIÉ par défaut**, derrière un chevron encadré au repos et haut comme le champ (`align-self: stretch`). Il est **démonté** et pas masqué (rien à animer, rien ne doit rester dans le parcours clavier) mais le texte tapé survit dans `useSearch`. **Ctrl+H** ouvre avec le remplacement déjà déplié |
| Liste des résultats | **Aucun plafond, et une liste FENÊTRÉE** (`ResultList`) : toutes les occurrences existent, y compris les 6216 d'une requête d'un caractère, mais seule la tranche visible est rendue. Trois mécanismes, tous à garder : tout rendre coûtait **329 ms de tâche bloquante** et `content-visibility` n'y faisait rien (il épargne mise en page et peinture, pas le travail de React) ; `useDeferredValue` a rendu le RENDU interruptible (pire cas 76 ms) mais la phase de COMMIT ne s'interrompt pas ; le fenêtrage ramène toutes les tâches longues à **zéro**. Il repose sur la **hauteur fixe** des rangées, écrite **des deux côtés** (66 px par rangée, 30 par en-tête de scène, dans `editor.css` comme dans `ResultList` ; les faire diverger décale la liste sous l'ascenseur). **La carte remplit sa rangée** (`height: 100%`) et **rien ne s'insère entre les deux**, sinon le pourcentage retombe sur un parent à hauteur automatique. Corollaires : extrait **dissymétrique** (`EXCERPT_BEFORE` 34, `EXCERPT_AFTER` 64, l'occurrence devant être garantie visible en deux lignes), liste **plate** (les en-têtes sont des éléments comme les autres), correspondance courante **amenée à l'écran**. Prix assumé : un lecteur d'écran n'annonce que les rangées rendues ; le compte, seul `aria-live` du panneau, est dit juste au-dessus, en « N correspondances dans M scènes », **forme de phrase invariable** (« dans 1 scène » compris) |
| Navigation de la recherche | **Deux modes** : un clic focalise la réplique et y sélectionne le texte (on va éditer là), Entrée et F3 sélectionnent **sans prendre le clavier**, sinon le curseur partirait dans un textarea où Entrée crée la réplique suivante (contrepartie : Chrome ne peint pas la sélection d'un textarea non focalisé). Tout passe par `focusRequest` (`App.jsx`, `{lineId, selection, focus}`, effacé dès honoré) : les quatre changements d'état vivent dans le même gestionnaire, donc React les regroupe en UN rendu où la scène est déjà désignée et la rangée se monte avec sa demande dans le même commit. Ni `setTimeout` ni `requestAnimationFrame`, et `React.memo` n'y fait rien. Raccourcis dans un effet **séparé** de celui d'annuler/rétablir (qui se réabonne à chaque édition) : Ctrl+F (pris au navigateur exprès, sa recherche ne lit pas les textarea), Ctrl+H, F3 / Maj+F3, Escape. Le garde **`if (e.defaultPrevented) return;` est obligatoire** : `ConfirmModal` écoute Escape en CAPTURE et appelle `preventDefault` sans `stopPropagation`. Entrée appartient au CHAMP, jamais à `window`. Focaliser le champ demande un COMPTEUR (`focusSeq`), Ctrl+F sur un panneau déjà ouvert devant re-focaliser sans qu'aucun état change. Côté reducer, une seule action `SET_LINE_TEXTS`, appliquée par `applyTextEdits`, qui rend l'état PRÉCIS reçu quand rien ne change et garde l'identité des actes, scènes et répliques (`mapAllLines` reconstruirait tout) |
| Confirmations | jamais de `window.confirm` : `src/shared/ConfirmModal.jsx` (partagé avec l'Enregistrement via `LeaveGuard`), rendu en **portail** dans `document.body` (une `.line-row` peut porter un transform dnd-kit, qui deviendrait le bloc conteneur du backdrop `fixed`). Escape annule, le bouton destructif prend le focus sauf quand un `primaryLabel`/`onPrimary` offre une sortie sûre. Supprimer un élément VIDE ne demande rien. Le remplacement global se confirme quand même bien qu'annulable en une étape, pour la raison qui fait confirmer une suppression d'acte : **ce qu'il touche n'est pas à l'écran** |
| Sortie de page | **un seul composant**, `src/shared/LeaveGuard.jsx` (`active`, `title`, `saveLabel`, `onSave`), monté par l'éditeur (`dirty`, `download`) et l'Enregistrement (`hasUnexported`, `downloadZip`, awaité). Deux couches : (1) clics interceptés en **capture** sur `document`, tout `a[href]` qui sort ouvre un `ConfirmModal` (écoute globale plutôt que lien par lien, les futurs liens sont couverts ; clic modifié, `target="_blank"`, `download` et ancres internes passent) ; (2) `setBeforeUnloadGuard` en filet pour le rechargement et la fermeture d'onglet, où le navigateur n'autorise QUE son dialogue (rien à habiller, ne pas réessayer). Détails : `setBeforeUnloadGuard(false)` à la main avant de naviguer, 200 ms de délai après le téléchargement (décharger dans la même tâche l'annule), et le modal reste affiché quand `active` retombe |

### Partagé, à ne pas recopier

Dans `theme.css`, posées en JSX : **`.truncate`** (le triplet overflow/ellipsis/nowrap ; la
largeur max et le `flex` restent locaux, l'appelant double toujours d'un `title`),
**`.btn-tip`** (l'enveloppe qui porte l'infobulle d'un bouton qui s'éteint, un `disabled`
ne recevant aucun événement souris), **`.lift-hover`** (ombre haute + pas d'un pixel vers
le haut, le geste de toutes les surfaces cliquables ; `--lift: -3px` pour les cartes
d'accueil. La `transition` reste chez chaque surface et n'est **pas** remontée :
`transition` est une seule propriété, une déclaration locale l'écraserait au lieu de s'y
ajouter), **`.page-shell` / `.page-scroll`** (coquille à la hauteur de la fenêtre, réglée
par `--shell-height`), **`.dialogue-card`**, **`.confirm-quote`**, **`.page-notice`** (la
carte de tous les états pleine page), **`--shadow-float`** (l'ombre d'un calque qui
FLOTTE), **`.flag-icon`** (24x16), et les règles en sélecteur d'élément pour les contrôles
que plusieurs pages veulent identiques (cases à cocher, `select:disabled`,
`.checks-row label, .search-options label`).

Côté JS, `src/shared/` : **`mountPage.jsx`** (le montage des neuf documents ; l'import de
`theme.css` vit dedans et son ORDRE compte, d'où l'import de ce module AVANT `App.jsx` dans
chaque point d'entrée), **`PageState.jsx`**, **`PageMark.jsx`** (la pastille, qui pose
`page-<clé>` sur elle-même, donc porte ses couleurs hors d'un bandeau ; le garde CI qui
interdit les tokens de sceau aux règles de bandeau exempte nommément `.play-header-home*`),
**`useScrollToActiveCard.js`**, **`myLineNumber`** dans `data.js`, **`formatWhen.js`** (un
module à part et pas une fonction de `data.js`, qui est couvert par `node --test` et ne peut
donc pas importer `locale.js`), **`plays.js`** (motif de l'identifiant, mintage, pièce
vide), **`share.js`** (`share` et `formatShare`, qui portent le SEUIL empêchant « 0,0 % » en
face d'un décompte de 1, donc les dupliquer laisserait une page contredire l'autre),
**`characterColors.js`**, **`structureLabels.js`**.

Côté Python, `scripts/common.py` : `REPO_ROOT`, `write_json`, `load_json` (lecture tolérante
d'un fichier DÉRIVÉ), et toute la disposition d'une pièce (`PLAYS_DIR`, `play_dir`,
`play_data_dir`, `play_clips_dir`, `play_uploads_dir`, `play_ids`, `PLAY_ID_PATTERN`,
`is_play_id`).

Middleware dev : `serveRepoData` dans `vite.config.js`, deux formes d'URL (données d'une
PIÈCE, données de la RACINE) ; l'identifiant est validé contre `SAFE_PLAY_ID` **avant** de
servir à construire un chemin.

Mouvement réduit : chaque fichier CSS neutralise SES animations en fin de fichier
(`theme.css` et `editor.css` ont chacun son bloc `prefers-reduced-motion`) ; faire connaître
des classes de l'éditeur au thème partagé casserait le sens des deux.
