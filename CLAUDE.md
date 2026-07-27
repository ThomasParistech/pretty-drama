# PrettyDrama Voices

Outil libre pour troupes de théâtre : répétition « à l'italienne » avec les vraies
voix des acteurs. Site statique (GitHub Pages) + GitHub Action Python/ffmpeg.
Tout est en français côté utilisateur (UI, README, messages d'erreur de
l'Action, qui finissent affichés dans le journal des dépôts).
Convention d'écriture : jamais de tiret cadratin, ni dans cette doc, ni dans
les textes affichés à l'utilisateur. Utiliser deux-points, point-virgule,
virgule, parenthèses ou une phrase de plus.

## Architecture

- **Frontend** : React + Vite, multi-pages (pas de SPA). Entrées déclarées dans
  `vite.config.js` : `index.html` (accueil acteurs), `respo.html` (accueil
  responsable), `rehearsal.html`, `recorder.html`,
  `dashboard.html`, `editor.html`. Sources dans `src/<page>/`, partagé dans
  `src/shared/` (`data.js` = fetch + helpers, `useManifest.js`,
  `PageHeader.jsx`, `PageState.jsx` = écran chargement/erreur commun,
  `PageMark.jsx` = la pastille de sceau, seule à poser la classe `page-<clé>`,
  `useScrollToActiveCard.js` = défilement vers la `.dialogue-card.active`,
  partagé par Répétition et Enregistrement, `theme.css`). `dist/` est
  gitignoré, build en CI.
- **Backend** : aucun serveur, **deux workflows** aux rôles étanches.
  `uploads.yml` (sur push touchant `uploads/**`) traite les dépôts, écrit le
  journal, commite, **puis appelle `build.yml`** (`jobs.site.uses`) ;
  `build.yml` (sur tout autre push, `workflow_dispatch`, `workflow_call`)
  construit et déploie Pages et n'écrit **jamais** dans le dépôt. Trois choses
  à ne pas défaire : (1) l'appel explicite, parce qu'un commit poussé avec le
  `GITHUB_TOKEN` ne déclenche aucun workflow (garde anti-récursion), donc sans
  lui le site ne serait jamais republié après un dépôt ; (2) les **groupes de
  `concurrency` distincts** (`uploads` et `pages`), un workflow appelé qui
  partage le groupe de son appelant étant détecté comme interblocage et annulé ;
  (3) le `paths-ignore: uploads/**` de `build.yml`, sans quoi un dépôt
  déclencherait les deux en parallèle et publierait un site sans les nouvelles
  voix. `build.yml` fait son checkout sur `ref: github.ref_name` et pas sur le
  SHA du run : appelé, il tourne dans le run d'un push antérieur au commit
  qu'`uploads.yml` vient de pousser.
  **Aucun des deux n'écrit à destination du respo sur GitHub** : ni issue, ni
  statut dans le README (il part du bouton de la page Avancement et ne visite
  jamais le dépôt, donc il ne les lirait pas). Son seul retour est le journal
  des dépôts de la page Avancement. Corollaires assumés : un run en échec ne se
  raconte pas (mais la date du dernier dépôt cesse d'avancer), et le commit
  précède le déploiement (l'inverse imposerait de transporter `clips/` et
  `data/` en artefact entre deux jobs ; si le déploiement échoue, les données
  sont dans le dépôt et le prochain build les publie).
- Dev : `npm run dev` (un middleware Vite sert `data/` et `clips/` depuis le
  repo avec de vrais 404), ou `npm start` = `scripts/dev.sh` (install si besoin,
  ouverture des DEUX accueils dans le navigateur dès que le serveur répond ;
  `exec ./node_modules/.bin/vite`, pas `npm run dev`, pour que Vite prenne la
  place du script : le Ctrl+C tue vraiment le serveur et libère le port, sans
  wrapper npm ni pid à surveiller), `npm run build`. **Deux suites de tests**,
  toutes deux rejouées par `build.yml`, donc à chaque push de code comme après
  chaque dépôt (`uploads.yml` finit par l'appeler) :
  - Python, `python3 -m unittest discover -s scripts/tests` : statuts,
    normalisation (cas partagés dans `normalize-cases.json`), contrat ZIP,
    journal, plus les **contrats inter-fichiers** (`test_contracts.py`, voir
    plus bas). Un seul test :
    `python3 -m unittest scripts.tests.test_normalize.TestNormalizeSharedCases.test_idempotent`.
  - JS, `npm test` = `node --test src/` : la logique **pure** du front, celle
    qui ne se relit pas à l'œil. `reducer.test.js` (réparation d'un
    `script.json` douteux, ids jamais recyclés, qui parle après une
    suppression), `history.test.js` (fusion des frappes, « Modifications non
    téléchargées »), `data.test.js` (URL de dépôt, slugs), `useRecorder.test.js`
    (l'extension du membre audio reste dans l'alphabet qu'accepte l'Action).
    **Aucune dépendance de test** : `node --test` est intégré à Node, ces
    modules sont du JS pur sans React ni DOM, et un fork de troupe ne doit pas
    payer un `npm ci` plus lourd pour ça. Pas de test de composant React, donc
    pas de rendu : ce qui touche au DOM se vérifie toujours à la main.

  Build de prod à tester à la main (l'Action copie `data/` et `clips/` dans
  `dist/`) : `npm run build && cp -r data clips dist/ && npm run preview`.

## Flux de données

1. `data/script.json` : **source de vérité**, produit par l'éditeur. Il n'est
   plus déposé par-dessus : il arrive dans `uploads/`, est validé
   (`validate_script`) puis promu. Reste potentiellement malformé (édition à la
   main dans le dépôt) : tout consommateur doit être tolérant, cf.
   `sanitize_script`.
2. Page Enregistrement → ZIP `voix-<slug>.zip` contenant :
   - `manifest.json` : **mapping nu `{lineId: texte brut au moment de
     l'enregistrement}`** (rien d'autre : ni nom de fichier ni personnage) ;
   - un audio `{lineId}.{ext}` par réplique (`ext` = webm/mp4/ogg selon le
     navigateur, cf. `extensionForMimeType`). L'Action retrouve le fichier
     depuis l'id seul.
3. L'acteur envoie le ZIP au responsable, qui le glisse dans `uploads/`. **Un
   seul dossier de dépôt** pour les deux sortes de fichiers (le respo n'a qu'une
   adresse à connaître, d'où le bouton unique de l'Avancement) ; le type vient
   de la seule extension (`kind_of` : `.zip` = voix, `.json` = script), pas du
   nom, que le navigateur renomme volontiers en « script (1).json ».
4. `scripts/process_uploads.py`, pour chaque fichier de `uploads/` :
   - `.zip` : valide TOUT le manifest, transcode chaque clip (ffmpeg : trim
     silences + loudnorm, mp3 mono 64 kbps) → `clips/{lineId}.mp3` et
     `data/clips.json` (`{lineId: texte brut}`). Merge **tout-ou-rien par ZIP** ;
   - `.json` : `validate_script` puis promotion **verbatim** dans
     `data/script.json` (passer par `sanitize_script` perdrait les teintes des
     personnages) ;
   - autre : consigné comme inconnu.
   Le fichier est supprimé même en cas d'erreur (sinon il échouerait à chaque
   run) ; les fichiers cachés (`.gitkeep`) sont laissés en place. Sort de chaque
   fichier (succès **et** erreur) écrit dans `uploads_result.json` (éphémère,
   gitignoré).
5. `scripts/update_history.py` : `uploads_result.json` → une entrée
   `{at, files}` dans `data/history.json` (journal des dépôts affiché par
   l'Avancement, plafonné à `MAX_RUNS`). Écrit par `uploads.yml` seul, donc le
   journal ne contient QUE des dépôts, jamais une reconstruction du site.
6. `scripts/build_manifest.py` : join stateless `script.json` × `clips.json` →
   `data/manifest.json`, **seul fichier lu par les pages** (l'éditeur lit aussi
   `script.json`) ; y recopie aussi `history.json`. Statut par réplique : `ok` / `perime` (« À refaire », texte modifié depuis
   l'enregistrement) / `manquant` (« À enregistrer »).

## Invariants (à ne pas casser)

- **Normalisation de texte : une seule implémentation**, `scripts/normalize.py`,
  appelée uniquement dans `build_manifest.compute_status`. Le navigateur stocke
  et transporte du texte **brut**, jamais normalisé.
- **Les ids de répliques ne sont jamais recyclés** (ils nomment les mp3).
  `SAFE_ID` (`src/editor/reducer.js`) et `LINE_ID_PATTERN`
  (`scripts/process_uploads.py`) doivent rester synchrones :
  `^[0-9a-zA-Z-]{1,64}$` (alphanumérique, pas seulement hex : ids lisibles
  édités à la main acceptés). Ce n'est plus une consigne mais un test :
  `test_contracts.py` lit les deux fichiers et compare les deux expressions,
  donc les faire diverger casse la CI.
- Le format du ZIP est un contrat navigateur ↔ Action : toute modification doit
  toucher `downloadZip` (recorder `App.jsx`) ET `parse_manifest`
  (`process_uploads.py`) en même temps.
- `sanitize_script` (Python) est le miroir tolérant du `sanitizeScript` de
  l'éditeur : une entrée malformée est ignorée, jamais un crash de workflow.
  Asymétrie assumée : le JS valide chaque id contre `SAFE_ID` et **reminte** les
  ids invalides/dupliqués (il est le producteur, doit rester réparable) ; le
  Python ne vérifie qu'« id = chaîne non vide » (il ne peut pas reminter sans
  orpheliner les mp3 déjà nommés). C'est sans conséquence : un id hors `SAFE_ID`
  hand-édité dans `script.json` n'a jamais de clip (l'Action rejette ces ids à
  l'upload) → statut `manquant`, `clip: null`, aucune URL forgée n'est émise.
- **`sanitizeScript` ne déplace jamais une réplique d'un personnage à un
  autre.** Deux cas à ne pas confondre quand un id de personnage est reminté :
  hors `SAFE_ID`, l'id n'est porté que par lui, donc ses répliques le suivent
  (`characterRemap`) ; **dupliqué**, le premier porteur garde l'id ET ses
  répliques, le second repart avec un id neuf et aucune réplique. Remapper un
  doublon changerait qui parle dans la pièce alors que les mp3, nommés par id
  de *réplique*, ne bougeraient pas : la voix enregistrée par l'un sortirait
  sous le nom de l'autre. Corollaire de tuyauterie : le remap se consulte sur
  la valeur brute du `characterId`, **avant** tout contrôle contre `SAFE_ID`,
  puisque les ids qu'il contient sont justement ceux qui n'y passent pas.
- **Un no-op ne doit pas fabriquer un nouvel état.** `updateScene`
  (`reducer.js`) rend l'état reçu tel quel quand la scène ne change pas, et
  `scriptReducer` en fait autant pour toute action refusée. `history.js`
  reconnaît une action sans effet à l'identité (`present === state.present`) :
  sans cette sortie, reposer une réplique glissée exactement où elle était
  allumait « Modifications non téléchargées » et laissait une étape vide à
  annuler.
- Uploads hostiles : caps de taille réels (les en-têtes ZIP mentent), noms de
  membres validés par fullmatch, un fichier cassé ne bloque jamais les autres.
- **`validate_script` est volontairement plus strict que `sanitize_script`** :
  le second est un lecteur tolérant, le premier décide d'écraser la source de
  vérité. Un JSON valide mais étranger (`[1,2,3]`, un export d'autre chose) se
  sanitiserait en pièce vide et effacerait la pièce de la troupe, d'où le
  garde-fou : un candidat sans aucune réplique ne remplace jamais une pièce qui
  en a.
- Prises d'enregistrement : en mémoire uniquement (garde `LeaveGuard` tant que
  non exportées), une seule prise par réplique, `URL.revokeObjectURL` à chaque
  remplacement.

## Repères rapides

| Quoi | Où |
| --- | --- |
| Lien GitHub affiché (footer accueil) | `src/home/App.jsx`, repo `ThomasParistech/prettydrama-voices` |
| Les deux accueils | même composant `src/home/App.jsx`, deux entrées et deux listes de cartes (`ACTOR_CARDS`/`RESPO_CARDS` dans `src/shared/pages.js`) : `index.html` + `src/home/main.jsx` ne montre que Répétition et Enregistrement (c'est le lien donné à la troupe : un acteur ne doit jamais tomber sur l'éditeur, d'où se télécharge le script), `respo.html` + `src/home/respo.jsx` montre les quatre pages en carré 2x2. **Aucun lien ne mène de l'accueil des acteurs vers celui du responsable** (sinon la séparation ne sert à rien) : il se bookmarke, et l'adresse à retenir est le raccourci `…/respo` (sans `.html`), servi par `public/respo/index.html`, une redirection `meta refresh` vers `../respo.html`. C'est une redirection et pas une entrée Vite `respo/index.html` parce que tout le site vit en chemins relatifs (`base: "./"`, `fetch("data/manifest.json")`, `href="./rehearsal.html"`) : une vraie page à un niveau de profondeur obligerait le code partagé (`data.js`, `pages.js`, `homeHref`) à savoir dans quel dossier elle tourne. Contrepartie assumée : la barre d'adresse finit sur `respo.html`. Corollaire porté par `homeHref(page)` (`pages.js`) et consommé par les deux bandeaux partagés : la marque des pages Édition et Avancement ramène à `respo.html`, celle des deux autres à `index.html`. Les cartes n'ont plus de sous-titre « Pour les acteurs / Pour le responsable » : l'URL le dit. `npm run dev` et `npm run preview` annoncent les deux URLs (plugin `printHomeUrls` dans `vite.config.js`, qui enveloppe `server.printUrls`) : l'accueil caché n'est pas à retenir de tête |
| Couleurs des sceaux | `.page-<clé>` dans `src/shared/theme.css` (`--page-mark` / `--page-mark-soft`), **source de vérité** ; la couleur de page ne teinte plus QUE la pastille : le filet de 3 px qu'elle posait en haut de chaque écran (bandeaux et accueil) est retiré, il barrait la page d'un trait dont le sceau disait déjà tout ; les favicons et `theme-color` des `.html` les redupliquent (un `<link>` ne lit pas une variable CSS). Les trois pages de la troupe (marque, Répétition, Enregistrement) partagent EXACTEMENT le même couple, bordeaux `#8b2635` sur sable `#f5eeda` : elles avaient chacune sa nuance (deux bordeaux voisins et une terre), assez proches pour qu'on n'y lise pas une distinction, assez différentes pour qu'on les croie ratées. Ce sont les icônes (masques, bulles, micro) qui disent la page. Seuls les modes du responsable gardent une couleur propre, vert pour l'Avancement et violet pour l'Édition : elle ne sépare plus deux pages voisines, elle marque un autre territoire. Corollaire : la terre `#a84f00` n'est plus qu'un statut (`--warn`, « À enregistrer »), plus une identité de page |
| Logo (les deux masques) | `MasksIcon` dans `src/shared/icons.jsx`. **Géométrie fournie par un fichier de design (`drama-wine.svg`), à ne pas redessiner** : les 8 tracés et leurs `transform` sont repris tels quels. Deux adaptations assumées, sans toucher aux formes : les remplissages passent en `currentColor` (le vin) et `var(--page-mark-soft)` (les deux aplats d'intérieur) pour que la marque suive le système des sceaux au lieu de figer des hex ; le `viewBox` est recadré au carré (`37.5 36 262 262`) parce que l'encre était décentrée dans la boîte d'origine (259x262 à l'offset 39,36 dans 329x345), ce qui donnait un anneau inégal dans la pastille. Le dessin ne se lit qu'à partir de ~34 px (à 20 px les deux masques se touchent) : il ne sert QUE dans le hero de l'accueil, sur une pastille agrandie (`.home-brand-mark`, 52 px pour 34 px de dessin) ; les bandeaux des autres pages portent le sceau de leur page. La marque n'étant pas une page, `.page-home` prend le bordeaux `#8b2635` de la marque (et non plus l'or) : logo et mot « PrettyDrama » s'accordent. Favicon d'`index.html` : même géométrie et même recadrage, en blanc sur tuile bordeaux (mou à 16 px, net dès 32). Corollaire mobile : la règle qui rapetisse le sceau à 30/17 px sous 800 px (fin de `theme.css`) est visée sur `.page-header .page-mark` et `.play-header .page-mark`, **jamais sur `.page-mark` tout court**, sinon la marque tombe à 17 px, taille à laquelle les deux visages se touchent. Ça tenait avant par accident (même spécificité que `.home-brand-mark`, qui ne gagnait que parce que `main.jsx` importe `theme.css` avant `home.css`) |
| Icônes | `src/shared/icons.jsx`, toutes en SVG dimensionné sur la font-size (1em) et en `currentColor` : **aucun emoji dans l'UI**, ni de contrôle ni de ponctuation. Sur mobile, `▶ ⏸ ⚠️ 🤖` rendent en couleur pleine, hors palette, avec une hauteur qui change d'une plateforme à l'autre. Deux familles : aplats pour les contrôles (lecture, micro), trait de 2 px pour tout le reste. Exceptions assumées : quelques caractères restent des caractères, parce qu'ils sont monochromes (aucune variante emoji, donc aucun rendu en couleur pleine) et qu'ils suivent la fonte du texte : `✓ ✕ ↓` des étiquettes et boutons, le chevron `▼` du repli de `PlayHeader`, la poignée de glisser `⠿` de `LineRow`, et le `?` de la pastille « type inconnu » du journal. Autre exception, celle-là graphique : `SparkleIcon` (« voix de synthèse ») est en aplat alors que sa famille est au trait, parce que son étiquette est en 11.5 px et qu'un trait s'y referme (un robot au trait n'y était plus qu'une tache). `WarnIcon` porte lui-même sa classe d'alignement `.warn-icon` (`theme.css`) : il ne sert qu'en tête de phrase, dans les quatre avertissements du site |
| Icônes d'onglet et d'écran d'accueil | favicon SVG en `data:` URI dans chaque `.html` (tuile de la couleur de page, glyphe blanc de la page), plus un PNG par page dans `public/` : Safari ne lit ni les favicons SVG ni les `data:` URI, et iOS exige un PNG pour « Ajouter à l'écran d'accueil ». `apple-touch-icon.png` sert les deux accueils (les masques), les quatre autres pages ont le leur. **Dérivés des mêmes tracés que les favicons, pas redessinés** : on reprend le SVG du `<link rel="icon">`, on lui pose `width`/`height` à 180, on retire le `rx='6'` (iOS applique son propre masque arrondi) puis on rastérise et on aplatit en RGB sans alpha (iOS remplit le transparent en noir). Toucher un favicon oblige donc à régénérer son PNG. Les `href` s'écrivent absolus (`/apple-touch-icon.png`) : Vite les rend relatifs au build, `public/` étant recopié tel quel dans `dist/` |
| Cartes de dialogue (look commun Répétition/Enregistrement) | `.dialogue-card` dans `src/shared/theme.css`, qui porte aussi la palette rose/doré « mes répliques » (`.dialogue-card.mine`) et la bordure `.active` communes. Les pages posent `.mine` à côté de leur classe sémantique (`.muted` côté répétition, `.own` côté enregistrement) et ne gardent que leurs vrais écarts (`.hide-text`, `.fresh`, `.recording`…) ; côté enregistrement l'état des prises est porté par l'étiquette `.rec-status` orange/verte (palette en variables `--rec-*` locales à `recorder.css`) |
| Bandeau de pièce + barre de contrôle basse (communs Répétition/Enregistrement) | composants `src/shared/PlayHeader.jsx` (marque + titre de la pièce, repliable) et `src/shared/ProgressBar.jsx` (slider indexé) ; CSS dans `theme.css` (`.play-header*`, `.controls`, `.ctrl-btn`, y compris `.ctrl-btn.my-jump` pour les sauts « ma réplique », communs aux deux pages…). Pas de tiret cadratin dans les headers. `PlayHeader` sert aussi à l'Édition et à l'Avancement : les quatre pages qui connaissent la pièce affichent son titre en haut, au même endroit et dans la même serif. Sans children (cas de l'Avancement, qui n'a aucun réglage) le titre n'est plus un bouton et le chevron disparaît (`.play-header-title-plain`) : pas de repli promis puis vide. Seul `PageHeader` (titre = libellé de page) reste pour les écrans qui n'ont pas encore le manifest, via `PageState` |
| Repli animé du bandeau | les réglages restent **montés** (sinon rien à animer) dans un conteneur grille dont l'unique ligne passe de la hauteur du contenu à zéro : c'est interpolable, contrairement à `height: auto`. Deux pièges déjà payés, à ne pas réintroduire : la piste s'écrit `minmax(0, 1fr)` / `minmax(0, 0fr)` et **jamais** `1fr` / `0fr` (le minimum d'une piste `fr` vaut `auto`, donc la contribution min-content du contenu : la piste « à zéro » restait haute du padding bas des réglages, soit une ligne vide sous le titre), et l'enfant `.play-header-settings-inner` garde `min-height: 0` (sans quoi le minimum automatique d'un élément de grille le plafonnerait à sa hauteur de contenu, et rien ne se replierait). `visibility: hidden` (propriété discrète, donc appliquée en fin de fermeture et au début de l'ouverture) sort les selects du parcours clavier sans les démonter. Le repli n'enlève QUE les réglages : la rangée du haut ne bouge pas d'un pixel (ni padding, ni taille du sceau, ni corps du titre), et le titre reste donc centré dans une barre au padding symétrique. Le rognage est posé sur la grille et **pas** sur son enfant : en `border-box`, un enfant de hauteur 0 garde ses 14 px de padding bas, qui débordaient sous le bandeau fermé et l'épaississaient. Il n'est actif **que** fermé ou en mouvement (classe `animating`, retirée par un minuteur de 340 ms) : ouvert et immobile, le popover de couleur de l'éditeur doit pouvoir dépasser du bandeau. Minuteur et pas `transitionend` : à mouvement réduit l'événement ne vient jamais et le bandeau resterait rogné. Durées et `--ease-header` dans `theme.css`, neutralisées par le bloc `prefers-reduced-motion` en fin de fichier |
| Page Enregistrement | structurée comme la Répétition : sélecteurs acte/scène/personnage, navigation contrainte à SES répliques, micro central (SVG) dans la barre basse, bouton Télécharger à droite. Les prises survivent au changement de personnage (ZIP multi-voix : `voix-<noms>.zip`). Tant qu'aucun personnage n'est choisi : `IntroCard` à la place de la liste de répliques (« Qui jouez-vous ? » + mode d'emploi + un bouton par personnage avec son reste à enregistrer), barre basse et mode d'emploi du bandeau masqués, select du bandeau en accent (`.character-select.unset`) |
| Statut des répliques (Enregistrement) | 3 états par réplique, étiquette au coin de la carte + légende en tête de liste : `todo` « À enregistrer » (point ambre), `fresh` « À télécharger » (prise de la séance, halo vert + lecteur vert vif ; reste fresh MÊME après téléchargement du ZIP : « Déjà enregistrée » n'est vrai qu'une fois le ZIP intégré par le respo et le site republié), `done` « Déjà enregistrée » (clip publié à jour uniquement, lecteur vert grisé). Le téléchargement ne touche pas aux statuts, il ne pilote que la note « pas sauvegardé »/« téléchargé » ; les flèches de la barre basse parcourent TOUTES mes répliques et portent donc le design des sauts « ma réplique » de la Répétition (`.ctrl-btn.my-jump`, icônes `SkipPrev`/`SkipNext`) ; l'avertissement « pas sauvegardé » vit dans le bandeau du HAUT (jamais dans la barre basse) ; lecteur intégré à la carte (`TakePlayer` : play rond, durée avec workaround Infinity des blobs MediaRecorder, onde décorative déterministe) |
| Couleurs des personnages (éditeur) | teinte **stockée** sur le personnage (`{id, name, hue}` dans script.json) ; palette `CHARACTER_HUES` (12 teintes, rendu `oklch(0.58 0.14 H)`, attribution auto entrelacée via `HUE_ASSIGN_ORDER`) dans `src/editor/reducer.js`, helpers dans `CharacterPanel.jsx` ; auto = 1re libre, modifiable via popover ; teinte invalide réparée au chargement |
| Design « Rail » de l'éditeur | tokens re-skinnés dans `src/editor/editor.css` (`:root` local à la page) : même fond crème `--paper` que les autres pages, filets/neutres réchauffés assortis, accent `#7a5cc0`, fonts IBM Plex Sans/Mono + Spectral (chargées par `editor.html`) ; les autres pages gardent le thème chaud partagé. Le re-skin ne fuit jamais dans le bandeau partagé : PageHeader/PlayHeader consomment les tokens réservés `--header-accent`/`--header-serif` (theme.css), qu'aucune page ne redéfinit (Cormorant 700 chargée aussi par `editor.html`). Les répliques de la scène vivent dans UN panneau blanc (`.line-list` : card blanche arrondie sur le crème, lignes fines à filet 1px dedans) pour le même contraste blanc-sur-crème que les cartes des autres modes |
| Navigation d'édition | une scène à la fois via le `PlayHeader` partagé (acte/scène + « + Scène »/« + Acte ») ; à la place du select personnage des autres pages : la **gestion** des personnages en puces (`CharacterChips` dans `src/editor/CharacterPanel.jsx`) ; titre de pièce éditable dans le bandeau ; bouton Télécharger dans les `actions` du bandeau |
| Annuler / rétablir (éditeur) | `src/editor/history.js` : pile d'états qui **enveloppe** `scriptReducer` (qui reste pur et inchangé), `{present, past, future, lastKey, saved}`, `past` plafonné à 100 entrées (les états sont structurellement partagés, une entrée coûte quelques objets). Toute nouvelle édition vide `future` (la timeline fourche). Les frappes clavier (`EDIT_TEXT` d'une même réplique, `SET_TITLE`) sont fusionnées en une seule étape, close par toute autre action, par un undo/redo ou par `HISTORY_BREAK` (dispatché au blur du textarea et du titre) ; `LOAD_SCRIPT` réinitialise la pile ; une action refusée par le reducer n'empile rien. Paire de boutons icône `.history-group` dans les `actions` du bandeau + raccourcis Ctrl+Z / Ctrl+Y (et Cmd+Maj+Z) globaux, interceptés même dans un textarea (l'undo natif du navigateur désynchroniserait la pile) sauf quand il n'y a rien à annuler/rétablir |
| Confirmations de suppression (éditeur) | jamais de `window.confirm` (dialogue natif hors thème) : `src/shared/ConfirmModal.jsx` (partagé depuis que l'enregistrement s'en sert aussi, via `LeaveGuard`), même habillage `.modal-backdrop`/`.modal` que le modal de suppression de personnage, rendu en **portail** dans `document.body` (une `.line-row` peut porter un transform dnd-kit, qui deviendrait le bloc conteneur du backdrop `fixed`). Escape annule, le bouton destructif prend le focus (sauf quand un `primaryLabel`/`onPrimary` optionnel offre une sortie sûre : c'est elle qui le prend). Utilisé pour réplique (`LineRow`), scène (`SceneEditor`), acte et sortie de page (`App`) ; supprimer un élément VIDE ne demande rien |
| « Modifications non téléchargées » (éditeur) | dérivé, jamais un drapeau : `dirty = present !== saved` où `saved` est l'état de la pile d'annulation correspondant au dernier `script.json` téléchargé (le script chargé au départ). Annuler jusqu'à cet état fait donc disparaître l'étiquette, y compris quand la pile n'est pas vide (édition, téléchargement, édition, annulation). Le téléchargement dispatche `MARK_SAVED` ; l'identité des objets suffit, la pile restitue les états qu'elle a stockés |
| Sortie de page avec du travail non téléchargé | **un seul composant pour les deux pages concernées** : `src/shared/LeaveGuard.jsx` (`active`, `title`, `saveLabel`, `onSave`, message en children), monté par l'éditeur (`active={dirty}`, `onSave={download}`) et par l'enregistrement (`active={hasUnexported}`, `onSave={downloadZip}`, awaité car async). Il porte les deux couches : (1) clics interceptés en phase capture sur `document`, tout `a[href]` qui sort de la page ouvre un `ConfirmModal` du thème (« Télécharger … puis quitter » / « Quitter quand même » / Annuler) ; écoute globale plutôt que lien par lien, donc les futurs liens sont couverts d'office ; clic modifié, `target="_blank"`, `download` et ancres internes passent ; (2) `setBeforeUnloadGuard` (seul appelant restant) comme filet pour le rechargement, la barre d'adresse et la fermeture d'onglet : là le navigateur n'autorise QUE son dialogue (message et style imposés depuis Chrome 51 / Firefox 44), rien à habiller, ne pas réessayer. Détails à ne pas défaire : `setBeforeUnloadGuard(false)` à la main avant de naviguer (sinon le dialogue natif se superpose au modal), 200 ms de délai après le téléchargement (décharger la page dans la même tâche l'annule), et le modal reste affiché quand `active` retombe. **Aucune persistance locale du travail** (localStorage) : décision produit, un brouillon oublié dans un navigateur redeviendrait une source de vérité périmée face au dépôt |
| Enregistrement micro | `src/recorder/useRecorder.js` (MediaRecorder, stream réutilisé, `release()` en fin de session) |
| Construction du ZIP | `downloadZip` dans `src/recorder/App.jsx` |
| Seul retour du respo (journal des dépôts) | `scripts/update_history.py` → `data/history.json` (`{runs: [{at, files}]}`, la plus récente d'abord, plafonné à 30), recopié dans `manifest.json` par `build_manifest` ; affiché par `Journal` dans `src/dashboard/App.jsx`. **C'est le canal d'erreur du projet** : il n'y a plus ni issue GitHub ni statut README, donc un fichier refusé ne se dit QUE là. **Une ligne par FICHIER et pas par dépôt** (chaque fichier a son propre sort : un ZIP abîmé au milieu de trois bons n'empêche pas les autres), dans un `<table>` dont le conteneur défile (`max-height` + `overflow: auto`, en-tête `sticky` : une trentaine de dépôts ne doit pas allonger la page sans fin). Quatre colonnes : date (année comprise, un journal se relit des mois plus tard), statut, type, détail. **Les deux colonnes d'icônes empruntent la pastille des sceaux** (`page-mark` + `.dash-journal-mark`, centrées) : le type porte le sceau de la page productrice (micro de l'Enregistrement, plume de l'Édition, les deux mêmes que le bouton de dépôt juste au-dessus, donc aucune légende à donner ; pastille neutre avec un `?` pour un fichier qu'aucune page ne revendique), et le statut prend les mêmes vert et ambre que la grille au-dessus avec `CheckIcon`/`CrossIcon`. Aucun mot dans ces deux colonnes, donc chaque pastille porte un `aria-label` et un `title`. Détail optionnel (`detailOf`) : rien pour un script réussi, nom du ZIP et compte de répliques pour des voix, nom et motif pour un échec. Le tableau est plafonné à `JOURNAL_ROWS` lignes, et **le dit** (`.dash-journal-more`, « N dépôts plus anciens non affichés ») : dans le seul canal de retour du projet, un tableau qui s'arrête sans un mot se lit comme « il n'y a rien de plus ». **Aucun rappel en haut de page** : la ligne du journal suffit, un bandeau d'alerte a été essayé puis retiré. La date de la première ligne fait aussi office de détecteur de panne (un run en échec ne commite rien, donc elle arrête d'avancer) ; **pas d'horodatage du run dans le manifest**, un champ réécrit à chaque exécution ferait différer `manifest.json` à tous les pushes, donc un commit robot chaque fois |
| Bouton de dépôt (Avancement) | `githubUploadUrl()` (`src/shared/data.js`) → `https://github.com/<owner>/<repo>/upload/master/uploads`, reconstruit depuis l'URL Pages ; `null` hors github.io (dev, domaine perso), où la carte se masque plutôt que de forger un 404. Deux formes d'URL Pages à couvrir : site de projet (`owner.github.io/<repo>/…`, le dépôt est le premier segment) et **site racine** (`owner.github.io/…`, où le premier segment est un nom de fichier et le dépôt porte le nom du domaine) ; sans ce second cas le bouton pointait vers `github.com/<owner>/dashboard.html`. **Une seule carte** (`UploadLinks`) : il n'y a qu'un dossier de dépôt, et deux cartes vers la même URL se liraient comme deux destinations. Les deux sceaux (micro, plume) l'encadrent et disent les deux sortes de fichiers, `.dash-upload-word` colorant chaque mot avec le `--page-mark` de sa page |
| Filtre audio ffmpeg | `audio_filter(peak)` dans `scripts/process_uploads.py`, construit par prise à partir de son pic (mesuré par `measure_peak_dbfs`, une passe `volumedetect` avant la conversion). Deux choses à ne pas défaire : le seuil de silence est **relatif au pic** de la prise, jamais une valeur absolue (les niveaux varient énormément selon la distance au micro et l'AGC du navigateur : un seuil fixe laissait une seconde de vide sur une prise forte et mangeait le premier mot d'une prise faible), et `start_duration` est **obligatoire** (les navigateurs posent un clic de quelques dizaines de ms sur les tout premiers échantillons ; sans durée d'attaque minimale, `silenceremove` considère que le son a commencé à l'échantillon 0 et ne coupe rien du tout). Sous `SILENT_PEAK_DBFS` la prise est convertie sans trim : la rogner entièrement écrirait un mp3 vide et illisible |
| Contrats inter-fichiers tenus par la CI | `scripts/tests/test_contracts.py`. Il vérifie ce qui ne vivait que dans un commentaire « keep in sync », en **lisant les sources** plutôt qu'en recopiant les valeurs attendues (recopier ne ferait que déplacer le problème) : `SAFE_ID` (JS) identique à `LINE_ID_PATTERN` (Python) ; aucun CSS de page ne redéfinit un token `--header-*` (la liste est lue dans `theme.css`, donc un nouveau token réservé est couvert d'office) ; aucune règle de bandeau ne consomme `--accent`, `--font-serif` ou `--shadow`, tous re-skinnés par l'éditeur ; chaque clé de `PAGES` a ses deux variables de sceau dans `theme.css` et pas l'inverse ; les entrées de `vite.config.js` et les `.html` de la racine coïncident exactement. Un test qui ne peut pas échouer ne sert à rien : chacun de ces gardes a été vérifié par mutation |
| Chemins repo côté Python | `scripts/common.py` (`REPO_ROOT`, `write_json`) |
| Middleware dev data/clips | `serveRepoData` dans `vite.config.js` |

Pour tester les pages sans build : éditer `data/manifest.json` à la main puis
`npm run dev`.

`data/history.json` est **livré vide** (`{"runs": []}`) : le journal d'un dépôt
est l'histoire d'une troupe, pas une donnée d'exemple. `Journal` reste affiché
même vide (tableau et colonnes en place, une ligne d'explication à la place des
dépôts) : c'est le seul canal de retour du projet, donc il doit se faire
connaître avant le premier dépôt, pas apparaître le jour où il a une mauvaise
nouvelle à donner. Pour voir la page peuplée, copier le jeu d'exemple partagé,
qui couvre exprès les quatre cas d'affichage :

```bash
cp scripts/tests/history-example.json data/history.json && python3 scripts/build_manifest.py
```

C'est le **même fichier que les tests** (`test_history.py` vérifie sa forme et
`test_build_manifest.py` sa recopie dans le manifest) : un exemple qui dérive du
contrat casse la CI au lieu de mentir tranquillement à l'écran.
