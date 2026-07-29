# Design system — contrat entre les pages

Référence pour la revue front. Si le code et ce fichier divergent, la revue doit
le signaler : soit le code est à corriger, soit ce contrat est à mettre à jour
(et la table « Repères rapides » de `CLAUDE.md` avec).

## Pages

| Entrée | Page | CSS propre |
| --- | --- | --- |
| `index.html` | Accueil des acteurs (Répétition + Enregistrement) | `src/home/home.css` |
| `respo.html` | Accueil du responsable (les 4 pages) | `src/home/home.css` (même `App.jsx`, autre liste de cartes) |
| `rehearsal.html` | Répétition | `src/rehearsal/rehearsal.css` |
| `recorder.html` | Enregistrement | `src/recorder/recorder.css` |
| `dashboard.html` | Avancement | `src/dashboard/dashboard.css` |
| `editor.html` | Édition | `src/editor/editor.css` |

**Sceaux (`--page-mark` / `--page-mark-soft`, classes `.page-<clé>` de
`theme.css`)** : la marque, la Répétition et l'Enregistrement partagent
**exactement** le même couple (bordeaux `#8b2635` sur sable `#f5eeda`) ; seuls
l'Avancement (vert) et l'Édition (violet) ont leur couleur propre. Deux teintes
voisines mais distinctes entre pages de la troupe est un finding : ou c'est le
même sceau, ou c'est franchement une autre couleur. Ce qui distingue Répétition
d'Enregistrement est l'icône. Le favicon et le `theme-color` du `.html`
redupliquent la couleur du sceau (une balise `<link>` ne lit pas une variable
CSS) : les trois `.html` de la troupe portent donc le même couple. Le favicon (et
l'`apple-touch-icon.png` qui en dérive) **est** la pastille de sceau, tuile en
`--page-mark-soft` et glyphe en `--page-mark` : un glyphe blanc sur tuile pleine
est un finding, c'est le négatif du sceau et ces icônes servent de vignette au
lien partagé. Le `theme-color`, lui, reste le `--page-mark` plein.

## Tokens (`src/shared/theme.css`)

Toutes les pages chargent `theme.css`. Les couleurs, rayons, ombres et fonts
passent par les tokens du `:root` : `--paper`, `--paper-dark`, `--card`,
`--ink`, `--ink-soft`, `--accent`, `--accent-dark` (hover des boutons pleins),
`--accent-soft`, `--gold`, `--border`, `--ok(-soft)`, `--warn(-soft)`,
`--radius`, `--shadow`, `--shadow-hover` (survol d'une carte cliquable, à ne
consommer qu'à travers `.lift-hover`, voir ci-dessous),
`--card-active` (carte de dialogue courante), `--focus-ring` /
`--focus-ring-offset` (bague de focus des éléments qui n'en ont pas par
défaut : slider, cartes, liens-cartes), `--notice-gutter` (gouttière latérale
des cartes pleine page `.page-notice` et `.load-error`, qui se centrent en
`margin: auto`), `--font-ui`, `--font-serif`, plus les
tokens réservés `--header-accent` / `--header-serif` / `--header-shadow`
(cf. plus bas) et `--ease-header` (courbe du repli du bandeau, neutralisée par
le bloc `prefers-reduced-motion`).

- Une page **peut** re-skinner des tokens dans un `:root` local à son CSS
  (seul l'éditeur le fait, design « Rail » : accent `#7a5cc0`, fonts IBM
  Plex/Spectral, neutres réchauffés).
- **Invariant** : un re-skin ne doit jamais changer l'identité visible d'un
  composant partagé — la marque et le titre du bandeau (PageHeader/
  PlayHeader) rendent identiquement sur toutes les pages via les tokens
  réservés `--header-accent`, `--header-serif` et `--header-shadow`, qu'aucune
  page ne redéfinit. **`scripts/tests/test_contracts.py` le vérifie en CI** :
  il lit la liste des `--header-*` dans theme.css, échoue si un CSS de page en
  redéfinit un, et échoue aussi si une règle de bandeau consomme `--accent`,
  `--font-serif`, `--shadow` (re-skinnés par l'éditeur) ou `--page-mark(-soft)`
  (re-skinnés par CHAQUE page, via la classe `page-<clé>` que les deux bandeaux
  posent sur leur racine). Une seule exemption, `.play-header-home*` : le retour
  à l'accueil dit la marque et non la page, donc il porte lui-même `page-home`,
  classe posée en JSX que ce garde, qui ne lit que du CSS, ne peut pas voir. C'est
  exactement par là qu'une ombre de bandeau a disparu sur la seule page
  Édition. Si l'identité d'un composant partagé (couleur d'accent, font,
  taille) passe par un token re-skinnable, c'est un finding haute ; les
  neutres re-skinnés « assortis » (`--card`, `--border`, `--ink-soft`) sont
  tolérés dans les composants partagés tant qu'ils restent perceptuellement
  équivalents. Une exception nommée, à ne pas rapporter : `.confirm-quote`
  (theme.css) consomme `--font-serif` **exprès**, comme son filet suit
  `--border`. La citation d'une réplique doit se lire dans la serif des
  répliques de SA page (Cormorant sur l'Enregistrement, Spectral sur
  l'Édition) : c'est le contenu de la page qui est cité, pas le châssis
  partagé. À l'inverse d'un bandeau, qui doit rendre pareil partout et prend
  donc `--header-serif`. Corollaire : toute font consommée par un composant partagé
  doit être chargée par le `<link>` Google Fonts de chaque `.html` concerné
  (graisse comprise, sinon fausse graisse silencieuse).
- **Survol des surfaces cliquables : `.lift-hover` (theme.css) et pas la paire
  recopiée.** Le geste est un pas vers le haut plus `--shadow-hover`, et il vit
  dans une classe unique, posée en JSX. Un `transform: translateY(…)` +
  `box-shadow: var(--shadow-hover)` réécrit dans un CSS de page est donc un
  finding `duplication` : c'était le cas sur les cartes des deux accueils, le
  bouton de dépôt et le bouton du PDF, dans trois fichiers. Le pas se règle par
  `--lift` sur l'élément (défaut `-1px`, `-3px` sur les cartes d'accueil, qui
  sont hautes) : c'est le seul écart légitime, parce qu'il dépend de la taille de
  la surface et non du geste. Deux pièges à connaître avant de rapporter :
  la `transition` reste chez chaque surface (elle est UNE propriété, une
  déclaration locale écraserait celle du fichier partagé), donc une surface qui
  prend la classe doit lister `transform` et `box-shadow` dans sa propre
  transition, et `.play-header-home` ne la prend **pas** (il garde le pas mais
  remplace l'ombre par la nappe crème du sceau : autre geste, pas celui-ci mal
  réglé).
- **Invariant** : le fond de page reste le crème partagé — `--paper` vaut
  `#faf6ef` sur toutes les pages, re-skin compris.
- Pas de couleur/ombre/rayon en dur dans un CSS de page quand un token
  équivalent existe. Les valeurs en dur sont réservées aux cas vraiment
  locaux (et doivent rester harmonieuses sur fond crème).

## Composants structurels

| Élément | Source | Pages |
| --- | --- | --- |
| Bandeau de marque (sceau + titre de la pièce en rangée du haut, marque et retour à l'accueil en pied) | `src/shared/PageHeader.jsx` — plus monté directement par aucune page : il ne sert que d'en-tête aux écrans de `PageState`, ceux qui n'ont pas de réglages à porter. **Même géométrie que `PlayHeader`, et le même `HomeLink` en pied** : ces écrans sont l'attente des quatre pages à bandeau de pièce, donc une marque placée ici en haut et là en bas sautait d'un bout à l'autre du bandeau à l'arrivée du manifest. Son `title` est le **titre de la pièce, et rien d'autre** ; il est facultatif, et le `<span>` n'est pas rendu sans lui (chargement, manifest illisible) : jamais de libellé de page ici, cf. plus bas. Sa typographie est la MÊME règle CSS que `.play-header-title`, pas une qui lui ressemble | via `PageState` uniquement |
| Bandeau de pièce (sceau + titre de la pièce, repliable ; **pas** de libellé de page en toutes lettres, il encombrait la barre sur mobile : c'est le sceau qui dit la page) | `src/shared/PlayHeader.jsx` — la rangée du haut ne dit QUE le titre de la pièce, le bouton de repli l'avale en entier ; le mot « PrettyDrama » et le retour à l'accueil vivent en pied du bandeau déplié (`.play-header-home`, logo + mot, classe `page-home` posée sur le lien pour la nappe crème de son survol). Les sélecteurs acte/scène sont fournis en `children` par les pages qui en ont (`.selects-row`), car leurs variantes sont réelles : `disabled` pendant l'enregistrement, compteurs « à enregistrer ». **Deux pages n'en passent aucun**, l'Avancement et l'Édition : la seconde a déplacé tout son plan (titre de la pièce, acte/scène, « + Scène »/« + Acte ») dans la section « Structure » de son rail, parce qu'elle FAÇONNE la structure là où les deux autres la parcourent. **Le bandeau se replie sur les quatre pages, ces deux comprises** (qui n'ont pourtant aucun réglage) : leur zone dépliée ne contient alors que la doc et le retour à l'accueil, et une page qui ne se replierait pas serait la seule à garder son bandeau sous le pouce | Répétition, Enregistrement, Édition, Avancement |
| Barre de contrôle basse `.controls` + `.ctrl-btn` | CSS dans `theme.css` | Répétition, Enregistrement |
| Slider de progression indexé | `src/shared/ProgressBar.jsx` | Répétition, Enregistrement |
| Cartes de dialogue `.dialogue-card` (+ palette « mes répliques » `.mine` et bordure `.active` communes) | `theme.css` — les pages posent `.mine` à côté de leur classe sémantique et ne gardent que leurs vrais écarts | Répétition, Enregistrement |
| Boutons `.btn` / `.btn.primary` | `theme.css` | toutes |
| Retour à l'accueil (logo aux deux masques + le mot « PrettyDrama », entre deux filets courts) | `src/shared/HomeLink.jsx`, **un seul composant pour les deux bandeaux**. Porte `page-home` sur le lien lui-même : c'est ce qui donne au survol le crème de la marque (`--page-mark-soft`) au lieu du vert ou du violet du bandeau. `test_contracts.py` interdit les tokens de sceau aux règles de bandeau et exempte nommément `.play-header-home*`, cette classe posée en JSX lui étant invisible | les deux bandeaux, donc les quatre pages et leurs écrans d'attente |
| Sceau de page (pastille ronde + icône) | `src/shared/PageMark.jsx` (+ `PAGES` de `src/shared/pages.js`) — la classe `page-<clé>` qu'il pose porte ses couleurs, il s'affiche donc juste partout, y compris hors d'un bandeau. Prop `label` quand le sceau ne désigne pas sa page (colonne Type du journal : le micro y veut dire « Voix »), et `label=""` quand il est **décoratif**, c'est-à-dire quand le mot est déjà écrit juste à côté (cartes de l'accueil, marque du hero, le retour à l'accueil en pied de bandeau qui porte déjà son `aria-label`, et le lien de page d'une phrase de doc `.hint-page-mark`) : sinon chaque lien s'annonce « Répétition, Répétition, Répétez… » | les deux bandeaux, les cartes de l'accueil, le bouton de dépôt de l'Avancement, et les DEUX colonnes d'icônes de son journal (la colonne Statut réutilise la pastille `.page-mark` avec les teintes `--ok`/`--warn` au lieu d'une couleur de page) |
| Doc du bandeau `.header-hint` (une seule classe, les deux paragraphes ont le même style : c'est leur place qui les distingue) | `theme.css` pour le style, mais **rendue par `PlayHeader` lui-même**, jamais par les pages : le premier paragraphe est `PAGES[page].desc` (le même que la carte de l'accueil, un seul endroit pour les deux emplois), le second la prop `hint`, facultative. Les deux encadrent les réglages (`desc` en tête du bandeau déplié, `hint` en pied) | les quatre : `desc` partout, `hint` seulement sur Enregistrement et Édition |
| Confirmation d'action destructive | `src/shared/ConfirmModal.jsx` — rendu en portail, Escape annule, focus initial sur le bouton à proposer. **Jamais de `window.confirm`** (dialogue natif hors thème). Citation de la réplique visée : `.confirm-quote` (`theme.css`) + `excerpt` (`data.js`) | Édition (réplique, scène, acte), Enregistrement (jeter une prise), et via `LeaveGuard` |
| Garde de sortie de page (travail non téléchargé) | `src/shared/LeaveGuard.jsx` — clics de liens interceptés en capture + `beforeunload` en filet | Édition, Enregistrement |
| Fetch manifest | `src/shared/useManifest.js` | Répétition, Enregistrement, Avancement (l'accueil appelle `fetchManifest` directement : il n'a ni écran de chargement ni écran d'erreur, un manifest absent laisse juste le titre vide) |
| Écran chargement/erreur plein-page | `src/shared/PageState.jsx` : les DEUX états prennent la carte partagée `.page-notice` (l'attente comme le message : c'est le même écran à deux moments, et le second succède presque toujours au premier) | toutes sauf accueil |

**Aucun bandeau n'écrit son libellé de page.** « Répétition », « Édition »,
« Avancement », « Enregistrement » dans une rangée du haut sont un finding, sans
exception : le sceau dit la page, et l'onglet du navigateur le répète. Le `title`
des deux bandeaux ne dit QUE le titre de la pièce, et il est facultatif.

**Écran d'attente ou écran définitif** (la distinction que `PageState` ne fait
pas toute seule) : un écran qu'on traverse (chargement, manifest illisible) ne
connaît pas encore la pièce, donc son bandeau **ne dit rien** ; il ne se rabat
pas sur le libellé de page. Le titre doit APPARAÎTRE à l'arrivée du manifest, et
jamais en RECOUVRIR un autre : un libellé posé pendant le chargement clignotait à
chaque ouverture de page. C'est gratuit, la hauteur de la rangée étant fixée par
le sceau et pas par le titre. Un écran **définitif** est le contenu final de la
page pour cet utilisateur, et il se tient au contrat des bandeaux : il nomme la
pièce. Ce qui le sépare d'un écran d'attente n'est pas la gravité du message mais
le fait qu'on y reste : un navigateur sans micro ne va pas s'en trouver un, donc
cet écran-là **est** la page. Il y en a **trois**, tous rendus après le
chargement exprès : l'Édition ouverte au doigt (`src/editor/App.jsx`),
l'Enregistrement sur un navigateur qui ne sait pas enregistrer
(`src/recorder/App.jsx`) et la Répétition d'une pièce encore vide
(`src/rehearsal/App.jsx`). Le repli quand la pièce n'a pas de titre est
« Pièce sans titre » sur tous, comme sur les quatre bandeaux. Corollaire à vérifier
dans le code, pas seulement
dans le rendu : la page doit **charger ce qu'il faut pour ça** (l'éditeur muré
fait son `fetch` du script pour son seul titre) ; un `if (…) return` posé avant
le chargement pour « économiser » une requête finit par se lire dans le bandeau,
et c'est exactement le bug qui a produit « Édition » en haut de l'écran mobile.

Règles associées :

- Pas de tiret cadratin « — » dans les textes vus par l'utilisateur, headers
  compris (convention de `CLAUDE.md` : deux-points, point-virgule, virgule,
  parenthèses ou une phrase de plus).
- Même palette rose/doré pour « mes répliques » côté Répétition (`.active`)
  et Enregistrement (`.own`/`.active`).
- Les pages n'implémentent jamais leur propre variante d'un de ces composants
  (pas de deuxième bandeau, pas de barre basse maison, pas de slider de
  progression recodé) ; quand une page a des selects acte/scène, ils restent
  des `children` du bandeau partagé, et une page qui n'en passe pas garde le
  bandeau tel quel plutôt que d'en dériver un (voir tableau ci-dessus).

## Factorisation

- Un style utilisé par **au moins deux pages** vit dans `theme.css`, jamais
  copié-collé entre deux CSS de page.
- Un composant/hook/helper JSX utilisé par au moins deux pages vit dans
  `src/shared/`.
- Un CSS de page ne contient que ce qui est propre à la page ; s'il redéfinit
  une classe de `theme.css`, c'est une variante volontaire, pas un doublon.

## Accessibilité

- Focus visible sur tout élément interactif (le `:focus` global de
  `theme.css` ou un équivalent par page).
- Tout bouton-icône porte un `title` ou `aria-label` en français.
- Zones tactiles ≥ 40 px dans les barres de contrôle (usage mobile). Deux
  exceptions assumées, à ne pas rouvrir : les étiquettes de case à cocher de la
  Répétition restent à 32 px sous 800 px (`rehearsal.css`), parce que cette
  hauteur EST l'interligne de la rangée et qu'à 40 px les deux lignes de cases
  se lisaient comme deux groupes sans rapport ; la largeur cliquable, une phrase
  entière, compense. Et l'Édition ne compte plus aucune cible tactile : la page
  ne s'ouvre pas sur un pointeur `coarse` (`src/editor/useTouchPointer.js`).
- Contrastes lisibles sur fond crème (`--ink-soft` est le minimum pour du
  texte informatif ; pas de texte plus clair).

## Responsive

- Chaque page est utilisable à 375 px de large : pas de scroll horizontal,
  les barres et bandeaux se replient (media queries existantes vers 800 px).
- Les acteurs utilisent surtout leur téléphone : Répétition et Enregistrement
  sont prioritaires.

## Textes

- Tout texte visible (UI, `title`, `aria-label`, messages d'erreur, hints)
  est en français, sans anglais résiduel, ton cohérent (tutoiement absent,
  infinitif ou impératif de politesse).
