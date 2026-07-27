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
CSS) : les trois `.html` de la troupe portent donc la même tuile bordeaux, glyphe
blanc.

## Tokens (`src/shared/theme.css`)

Toutes les pages chargent `theme.css`. Les couleurs, rayons, ombres et fonts
passent par les tokens du `:root` : `--paper`, `--paper-dark`, `--card`,
`--ink`, `--ink-soft`, `--accent`, `--accent-dark` (hover des boutons pleins),
`--accent-soft`, `--gold`, `--border`, `--ok(-soft)`, `--warn(-soft)`,
`--radius`, `--shadow`, `--font-ui`, `--font-serif`, plus les tokens réservés
`--header-accent` / `--header-serif` (cf. plus bas) et `--ease-header` (courbe
du repli du bandeau, neutralisée par le bloc `prefers-reduced-motion`).

- Une page **peut** re-skinner des tokens dans un `:root` local à son CSS
  (seul l'éditeur le fait, design « Rail » : accent `#7a5cc0`, fonts IBM
  Plex/Spectral, neutres réchauffés).
- **Invariant** : un re-skin ne doit jamais changer l'identité visible d'un
  composant partagé — la marque et le titre du bandeau (PageHeader/
  PlayHeader) rendent identiquement sur toutes les pages via les tokens
  réservés `--header-accent` et `--header-serif`, qu'aucune page ne
  redéfinit. Si l'identité d'un composant partagé (couleur d'accent, font,
  taille) passe par un token re-skinnable, c'est un finding haute ; les
  neutres re-skinnés « assortis » (`--card`, `--border`, `--ink-soft`) sont
  tolérés dans les composants partagés tant qu'ils restent perceptuellement
  équivalents. Corollaire : toute font consommée par un composant partagé
  doit être chargée par le `<link>` Google Fonts de chaque `.html` concerné
  (graisse comprise, sinon fausse graisse silencieuse).
- **Invariant** : le fond de page reste le crème partagé — `--paper` vaut
  `#faf6ef` sur toutes les pages, re-skin compris.
- Pas de couleur/ombre/rayon en dur dans un CSS de page quand un token
  équivalent existe. Les valeurs en dur sont réservées aux cas vraiment
  locaux (et doivent rester harmonieuses sur fond crème).

## Composants structurels

| Élément | Source | Pages |
| --- | --- | --- |
| Bandeau de marque (lien accueil) | `src/shared/PageHeader.jsx` | toutes sauf accueil |
| Bandeau de pièce (marque + label + titre, repliable) | `src/shared/PlayHeader.jsx` — les sélecteurs acte/scène sont fournis par chaque page en `children` (`.selects-row`), car leurs variantes sont réelles : `disabled` pendant l'enregistrement, compteurs « à enregistrer », boutons « + Scène »/« + Acte » côté éditeur. **Sans children** (cas de l'Avancement, qui n'a aucun réglage) le titre n'est plus un bouton et le chevron disparaît (`.play-header-title-plain`) | Répétition, Enregistrement, Édition, Avancement |
| Barre de contrôle basse `.controls` + `.ctrl-btn` | CSS dans `theme.css` | Répétition, Enregistrement |
| Slider de progression indexé | `src/shared/ProgressBar.jsx` | Répétition, Enregistrement |
| Cartes de dialogue `.dialogue-card` (+ palette « mes répliques » `.mine` et bordure `.active` communes) | `theme.css` — les pages posent `.mine` à côté de leur classe sémantique et ne gardent que leurs vrais écarts | Répétition, Enregistrement |
| Boutons `.btn` / `.btn.primary` | `theme.css` | toutes |
| Sceau de page (pastille ronde + icône) | `src/shared/PageMark.jsx` (+ `PAGES` de `src/shared/pages.js`) — la classe `page-<clé>` qu'il pose porte ses couleurs, il s'affiche donc juste partout, y compris hors d'un bandeau. Prop `label` quand le sceau ne désigne pas sa page (colonne Type du journal : le micro y veut dire « Voix ») | les deux bandeaux, les cartes de l'accueil, le bouton de dépôt de l'Avancement, et les DEUX colonnes d'icônes de son journal (la colonne Statut réutilise la pastille `.page-mark` avec les teintes `--ok`/`--warn` au lieu d'une couleur de page) |
| Texte d'explication en tête des réglages `.header-hint` | `theme.css` | Répétition, Enregistrement, Édition |
| Confirmation d'action destructive | `src/shared/ConfirmModal.jsx` — rendu en portail, Escape annule, focus initial sur le bouton à proposer. **Jamais de `window.confirm`** (dialogue natif hors thème) | Édition (réplique, scène, acte), et via `LeaveGuard` |
| Garde de sortie de page (travail non téléchargé) | `src/shared/LeaveGuard.jsx` — clics de liens interceptés en capture + `beforeunload` en filet | Édition, Enregistrement |
| Fetch manifest | `src/shared/useManifest.js` | Répétition, Enregistrement, Avancement (l'accueil appelle `fetchManifest` directement : il n'a ni écran de chargement ni écran d'erreur, un manifest absent laisse juste le titre vide) |
| Écran chargement/erreur plein-page | `src/shared/PageState.jsx` | toutes sauf accueil |

Règles associées :

- Pas de tiret cadratin « — » dans les textes vus par l'utilisateur, headers
  compris (convention de `CLAUDE.md` : deux-points, point-virgule, virgule,
  parenthèses ou une phrase de plus).
- Même palette rose/doré pour « mes répliques » côté Répétition (`.active`)
  et Enregistrement (`.own`/`.active`).
- Les pages n'implémentent jamais leur propre variante d'un de ces composants
  (pas de deuxième bandeau, pas de barre basse maison, pas de slider de
  progression recodé) ; les selects acte/scène restent des `children` par
  page (voir tableau ci-dessus).

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
- Zones tactiles ≥ 40 px dans les barres de contrôle (usage mobile).
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
