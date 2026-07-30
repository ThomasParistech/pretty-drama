# Design system — contrat entre les pages

Référence pour la revue front. Si le code et ce fichier divergent, la revue doit
le signaler : soit le code est à corriger, soit ce contrat est à mettre à jour
(et la table « Repères rapides » de `CLAUDE.md` avec).

## Pages

| Entrée | Page | CSS propre |
| --- | --- | --- |
| `index.html` | Accueil des acteurs (Répétition, Enregistrement, Répartition) | `src/home/home.css` |
| `respo.html` | Accueil du responsable (les 5 pages) | `src/home/home.css` (même `App.jsx`, autre liste de cartes) |
| `rehearsal.html` | Répétition | `src/rehearsal/rehearsal.css` |
| `recorder.html` | Enregistrement | `src/recorder/recorder.css` |
| `stats.html` | Répartition | `src/stats/stats.css` |
| `dashboard.html` | Avancement | `src/dashboard/dashboard.css` |
| `editor.html` | Édition | `src/editor/editor.css` |

**Sceaux (`--page-mark` / `--page-mark-soft`, classes `.page-<clé>` de
`theme.css`)** : la marque, la Répétition, l'Enregistrement et la Répartition
partagent **exactement** le même couple (bordeaux `#8b2635` sur sable `#f5eeda`) ;
seuls l'Avancement (vert) et l'Édition (violet) ont leur couleur propre, parce
qu'ils sont les deux modes du responsable. Deux teintes voisines mais distinctes
entre pages de la troupe est un finding : ou c'est le même sceau, ou c'est
franchement une autre couleur. Ce qui distingue ces pages entre elles est
l'icône. Le favicon et le `theme-color` du `.html` redupliquent la couleur du
sceau (une balise `<link>` ne lit pas une variable CSS) : les quatre `.html` de la
troupe portent donc le même couple. Le favicon (et
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
  posent sur leur racine). Le garde porte sur la REDÉFINITION, pas sur la
  lecture : une page a le droit de LIRE un token réservé quand elle doit rendre
  exactement comme le bandeau, et deux le font, la Répartition dont la barre de
  légende prend `--header-shadow` (deux bandes empilées portent la même ombre) et
  l'Édition dont `.btn.primary` prend `--header-accent`. Ce n'est donc pas un
  finding ; en redéfinir un, si. Une seule exemption, `.play-header-home*` : le retour
  à l'accueil dit la marque et non la page, donc il porte lui-même `page-home`,
  classe posée en JSX que ce garde, qui ne lit que du CSS, ne peut pas voir. C'est
  exactement par là qu'une ombre de bandeau a disparu sur la seule page
  Édition. Si l'identité d'un composant partagé (couleur d'accent, font,
  taille) passe par un token re-skinnable, c'est un finding haute ; les
  neutres re-skinnés « assortis » (`--card`, `--border`, `--ink-soft`) sont
  tolérés dans les composants partagés tant qu'ils restent perceptuellement
  équivalents. Première exception nommée, à ne pas rapporter : **`.flag-icon`**
  (`theme.css`), les drapeaux des deux sélecteurs de langue. C'est la seule
  image du dépôt qui ne soit ni en `currentColor` ni dimensionnée sur la
  font-size : un drapeau a ses couleurs propres et une taille fixe (24x16).
  Une seule règle pour ses deux consommateurs (le pied des accueils et le plan
  du rail), le même motif que ci-dessous. Son filet est un `box-shadow`
  extérieur et pas une `border` : sans lui la bande blanche du tricolore et le
  fond blanc de l'Union Jack se fondent dans le papier crème.
  Seconde exception nommée, à ne pas rapporter : `.confirm-quote`
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
| Bandeau de marque (sceau + titre de la pièce en rangée du haut, marque et retour à l'accueil en pied) | `src/shared/PageHeader.jsx` — plus monté directement par aucune page : il ne sert que d'en-tête aux écrans de `PageState`, ceux qui n'ont pas de réglages à porter. **Même géométrie que `PlayHeader`, et le même `HomeLink` en pied** : ces écrans sont l'attente des cinq pages à bandeau de pièce, donc une marque placée ici en haut et là en bas sautait d'un bout à l'autre du bandeau à l'arrivée du manifest. Son `title` est le **titre de la pièce, et rien d'autre** ; il est facultatif, et le `<span>` n'est pas rendu sans lui (chargement, manifest illisible) : jamais de libellé de page ici, cf. plus bas. Sa typographie est la MÊME règle CSS que `.play-header-title`, pas une qui lui ressemble | via `PageState` uniquement |
| Bandeau de pièce (sceau + titre de la pièce, repliable ; **pas** de libellé de page en toutes lettres, il encombrait la barre sur mobile : c'est le sceau qui dit la page) | `src/shared/PlayHeader.jsx` — la rangée du haut ne dit QUE le titre de la pièce, le bouton de repli l'avale en entier ; le mot « PrettyDrama » et le retour à l'accueil vivent en pied du bandeau déplié (`.play-header-home`, logo + mot, classe `page-home` posée sur le lien pour la nappe crème de son survol). Les sélecteurs acte/scène sont fournis en `children` par les pages qui en ont (`.selects-row`), car leurs variantes sont réelles : `disabled` pendant l'enregistrement, compteurs « à enregistrer ». **Deux pages n'en passent aucun**, l'Avancement et l'Édition : la seconde a déplacé tout son plan (titre de la pièce, acte/scène, « + Scène »/« + Acte ») dans la section « Structure » de son rail, parce qu'elle FAÇONNE la structure là où les deux autres la parcourent. **Le bandeau se replie sur les cinq pages, ces deux comprises** (qui n'ont pourtant aucun réglage) : leur zone dépliée ne contient alors que la doc et le retour à l'accueil, et une page qui ne se replierait pas serait la seule à garder son bandeau sous le pouce | Répétition, Enregistrement, Répartition, Édition, Avancement |
| Barre de contrôle basse `.controls` + `.ctrl-btn` | CSS dans `theme.css` | Répétition, Enregistrement |
| Slider de progression indexé | `src/shared/ProgressBar.jsx` | Répétition, Enregistrement |
| Cartes de dialogue `.dialogue-card` (+ palette « mes répliques » `.mine` et bordure `.active` communes) | `theme.css` — les pages posent `.mine` à côté de leur classe sémantique et ne gardent que leurs vrais écarts | Répétition, Enregistrement |
| Boutons `.btn` / `.btn.primary` | `theme.css` | toutes |
| Retour à l'accueil (logo aux deux masques + le mot « PrettyDrama », entre deux filets courts) | `src/shared/HomeLink.jsx`, **un seul composant pour les deux bandeaux**. Porte `page-home` sur le lien lui-même : c'est ce qui donne au survol le crème de la marque (`--page-mark-soft`) au lieu du vert ou du violet du bandeau. `test_contracts.py` interdit les tokens de sceau aux règles de bandeau et exempte nommément `.play-header-home*`, cette classe posée en JSX lui étant invisible | les deux bandeaux, donc les cinq pages et leurs écrans d'attente |
| Sceau de page (pastille ronde + icône) | `src/shared/PageMark.jsx` (+ `PAGES` de `src/shared/pages.js`) — la classe `page-<clé>` qu'il pose porte ses couleurs, il s'affiche donc juste partout, y compris hors d'un bandeau. Prop `label` quand le sceau ne désigne pas sa page (colonne Type du journal : le micro y veut dire « Voix »), et `label=""` quand il est **décoratif**, c'est-à-dire quand le mot est déjà écrit juste à côté (cartes de l'accueil, marque du hero, le retour à l'accueil en pied de bandeau qui porte déjà son `aria-label`, et le lien de page d'une phrase de doc `.hint-page-mark`) : sinon chaque lien s'annonce « Répétition, Répétition, Répétez… » | les deux bandeaux, les cartes de l'accueil, le bouton de dépôt de l'Avancement, et les DEUX colonnes d'icônes de son journal (la colonne Statut réutilise la pastille `.page-mark` avec les teintes `--ok`/`--warn` au lieu d'une couleur de page) |
| Doc du bandeau `.header-hint` (une seule classe, les deux paragraphes ont le même style : c'est leur place qui les distingue) | `theme.css` pour le style, mais **rendue par `PlayHeader` lui-même**, jamais par les pages : le premier paragraphe est `PAGES[page].desc` (le même que la carte de l'accueil, un seul endroit pour les deux emplois), le second la prop `hint`, facultative. Les deux encadrent les réglages (`desc` en tête du bandeau déplié, `hint` en pied) | les cinq : `desc` partout, `hint` seulement sur Enregistrement et Édition |
| Confirmation d'action destructive | `src/shared/ConfirmModal.jsx` — rendu en portail, Escape annule, focus initial sur le bouton à proposer. **Jamais de `window.confirm`** (dialogue natif hors thème). Citation de la réplique visée : `.confirm-quote` (`theme.css`) + `excerpt` (`data.js`) | Édition (réplique, scène, acte), Enregistrement (jeter une prise), et via `LeaveGuard` |
| Garde de sortie de page (travail non téléchargé) | `src/shared/LeaveGuard.jsx` — clics de liens interceptés en capture + `beforeunload` en filet | Édition, Enregistrement |
| Sélecteur de langue du SITE (deux drapeaux) | `src/shared/LocaleSwitch.jsx` — deux vrais liens portant `?lang=`, donc clic droit et nouvel onglet, et aucun état : c'est le chargement suivant qui mémorise le choix (`locale.js`). **Monté au pied des deux accueils et par eux SEULS**, et c'est une règle, pas un hasard : une langue est un réglage de SITE, donc elle se choisit en entrant, et le pied du bandeau partagé est une composition finie (le sceau seul et centré, encadré de deux filets courts) qu'un second objet décentrerait. Le nom d'une langue s'y écrit **dans cette langue** (`Français`, `English`), jamais traduit : c'est le seul littéral accentué que le garde CI exempte nommément. Ne pas le confondre avec la langue de la PIÈCE, qui montre les mêmes drapeaux dans le plan du rail mais est un CHAMP éditant `script.json`, avec un nom de langue traduit | les deux accueils |
| Phrase portant du balisage | `src/shared/T.jsx` — `<T k="…" p={{ … }} />`, le morceau de JSX devenant un PARAMÈTRE de la phrase. Une phrase découpée en fragments dans le composant est un finding, cf. la section Langue | toutes celles qui citent un `<strong>`, un `<code>`, une icône ou un lien au milieu d'une phrase |
| Libellés d'acte et de scène | `src/shared/structureLabels.js` — DÉRIVÉS du rang (`actLabel(t, i)`, `sceneLabel(t, i)`), les actes et les scènes ne portant aucun titre dans `script.json`. Pur, `t` reçu en argument. Le Python en tient une seconde implémentation pour le papier (`STRUCTURE`, `roman_numeral` dans `build_script_pdf.py`), depuis la langue de la PIÈCE, et `TestStructureLabels` interdit aux deux de diverger | les deux selects de portée, l'Avancement, la Répartition, la Recherche, le plan du rail, le PDF |
| Compte de répliques d'un objet de la pièce | `src/editor/CountBadge.jsx` — chiffre nu à l'écran (la colonne des comptes doit s'aligner), la phrase dans l'`aria-label`, `role="img"` pour le rendre valable sur un `<span>`. Les deux panneaux du rail en avaient chacun leur copie, alors que leur CSS était déjà commun (`.character-count, .structure-count`) | les sections « Structure » et « Personnages » du rail de l'Édition |
| Fetch manifest | `src/shared/useManifest.js` | Répétition, Enregistrement, Répartition, Avancement (l'accueil appelle `fetchManifest` directement : il n'a ni écran de chargement ni écran d'erreur, un manifest absent laisse juste le titre vide) |
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
« Pièce sans titre » sur tous, comme sur les cinq bandeaux. Corollaire à vérifier
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
- Tout bouton-icône porte un `title` ou `aria-label`, et il vient du catalogue
  (cf. « Textes ») : c'est le premier endroit où un texte oublié se cache, parce
  qu'il ne se lit qu'au survol ou au lecteur d'écran.
- Zones tactiles ≥ 40 px dans les barres de contrôle (usage mobile). Trois
  exceptions assumées, à ne pas rouvrir : les étiquettes de case à cocher de la
  Répétition restent à 32 px sous 800 px (`rehearsal.css`), parce que cette
  hauteur EST l'interligne de la rangée et qu'à 40 px les deux lignes de cases
  se lisaient comme deux groupes sans rapport ; la largeur cliquable, une phrase
  entière, compense. Les deux légendes de camembert de la Répartition s'arrêtent
  à 32 px pour la même raison (`stats.css`), et seule la barre de légende du haut
  monte à 40 px : ces légendes sont d'abord des tableaux de nombres, et à dix
  personnages 40 px par rangée ajoutaient 400 px à CHACUN des deux panneaux sur
  un téléphone ; là aussi la rangée entière est la cible, d'un bord de la carte
  à l'autre. Et l'Édition ne compte plus aucune cible tactile : la page
  ne s'ouvre pas sur un pointeur `coarse` (`src/editor/useTouchPointer.js`).
- Contrastes lisibles sur fond crème (`--ink-soft` est le minimum pour du
  texte informatif ; pas de texte plus clair).

## Responsive

- Chaque page est utilisable à 375 px de large : pas de scroll horizontal,
  les barres et bandeaux se replient (media queries existantes vers 800 px).
- Les acteurs utilisent surtout leur téléphone : Répétition et Enregistrement
  sont prioritaires.

## Textes

Le site est **bilingue** (français par défaut, anglais), et c'est une contrainte
de structure avant d'être une contrainte de style : **aucun texte visible ne vit
dans un composant**. Tout passe par les catalogues `src/shared/locales/fr.js` et
`en.js`, lus par `t()` / `<T>` (moteur `src/shared/i18n.js`, locale résolue par
`src/shared/locale.js`).

- **Zéro littéral visible dans `src/`**, hors catalogues : ni texte entre deux
  balises, ni `title`, `aria-label`, `placeholder`, `alt`, ni prop qui porte du
  texte (`hint`, `error`, `label`, `unit`, `confirmLabel`, `primaryLabel`,
  `saveLabel`). Un `title="Renommer"` est un finding **haute**, pas un détail :
  il ne se traduira jamais et rien à l'écran ne le montrera côté français.
- **Une phrase reste une phrase.** Un texte qui porte du balisage au milieu
  (`<strong>`, `<code>`, une icône, un lien, un `<span>` coloré) passe par
  `<T k="…" p={{ … }} />`, le morceau de JSX devenant un PARAMÈTRE. Découper la
  phrase en fragments JSX fige l'ordre des mots français dans le composant, et
  c'est irréparable en traduction.
- **Aucun pluriel bricolé.** Pas de `n > 1 ? "s" : ""` : une entrée de catalogue
  `{ one, other }` et `t(clé, { count })`, le choix venant d'`Intl.PluralRules`
  (« 0 réplique » en français, « 0 lines » en anglais, ce qu'un ternaire ne sait
  pas faire). Même règle pour les pourcentages et les dates : `fmt.percent` /
  `fmt.dateTime`, jamais un `.replace(".", ",")` ni un `"fr-FR"` en dur.
- **Un nombre est groupé par sa locale**, « 10 307 » et « 10,307 ». Dans une
  phrase, c'est le MOTEUR qui le fait : tout paramètre numérique de `t()` passe
  par `Intl.NumberFormat`, donc il n'y a rien à écrire au point d'appel et rien
  à oublier. `fmt.number` ne sert qu'aux nombres écrits SEULS, hors de toute
  phrase (le total au centre de l'anneau de la Répartition, les décomptes de sa
  légende) ; un nombre nu rendu directement en JSX est un finding.
- **Les guillemets viennent de `fmt.quote`**, jamais des `«&nbsp;…&nbsp;»`
  écrits à la main : le français veut ses insécables, l'anglais des guillemets
  courbes.
- **La typographie française vit DANS les chaînes** (insécable avant `?`, `!`,
  `:`, guillemets), jamais dans le JSX : c'est un fait de langue, donc l'affaire
  du traducteur, et l'anglais ne le porte pas.
- **Un libellé partagé n'existe qu'une fois.** Quand deux endroits nomment la
  même chose, le second INTERPOLE la clé du premier (le vide de la Répartition
  cite `stats.scopeAllOption`, l'aide d'une scène vide cite `rail.characters`)
  au lieu de recopier le mot. Cas le plus lourd, et le seul tenu par la CI : le
  **nom d'une page citée dans une phrase** passe par un `{page}` alimenté par
  `t(pageLabelKey(...))`, jamais par le mot écrit en clair. Le garde de
  `test_contracts.py` ne voit que la tournure « page X » / « mode X », et c'est
  volontaire : en français les noms de page sont des noms communs, donc
  « Enregistrement… » et « Avancement par personnage et par scène » sont
  légitimes.
- **Deux axes de langue, à ne pas confondre** : la locale de l'INTERFACE (choisie
  par le lecteur, `LocaleSwitch`) et la langue de la PIÈCE (`script.language`,
  choisie dans le plan du rail, qui pilote le PDF et la voix de synthèse). Un
  libellé d'acte ou de scène suit la première (c'est de la navigation), le texte
  des répliques la seconde.
- **Ce qu'un module pur ne fait jamais** : importer `locale.js`. Il lit l'URL, le
  stockage et le navigateur dès son import, donc il casse `node --test`. Un
  module couvert par les tests reçoit `t` en argument (`stats.js`) ou rend un
  CODE que la page traduit (`useRecorder.js` et son `"mic"`).
- Style, dans les deux langues : ton cohérent (tutoiement absent, infinitif ou
  impératif de politesse), pas de tiret cadratin, et l'anglais ne traduit pas mot
  à mot ce qui n'existe qu'en français (« répéter à l'italienne » → « run your
  lines », « le responsable » → « the coordinator », jamais « your coordinator »).
