// French catalogue. The project's reference language, and a catalogue of the
// same rank as any other: French no longer lives in the components. That is what
// makes completeness checkable, and what stops French from drifting in the JSX
// while English quietly ages beside it.
//
// Keys are flat and dotted, prefixed by their page or by `common` for anything
// shared. An entry is a plain string, or an object of plural forms
// { one, other } selected from `params.count` (see i18n.js). Placeholders are
// `{name}`.
//
// Three guards in scripts/tests/test_contracts.py hold this file to the code:
// every key used in a `t("…")` exists here, no key here goes unused, and no
// user-visible literal survives in a .jsx outside this folder (accented text,
// text-bearing attributes, JSX text nodes). locales/parity.test.js holds it to
// en.js.
//
// French typography belongs IN the strings, not in the JSX: the no-break space
// before `?`, `!` and `:`, and the guillemets. It is a fact of the language, so
// it is the translator's business, and English simply does not carry it.
export const FR = {
  // ------------------------------------------------------------------ common

  // The browser tab. `{page}` is a page label from below. French puts a space
  // before the colon, English does not, which is exactly why this is a key and
  // not a concatenation in the code.
  "common.docTitle": "PrettyDrama : {page}",

  "common.language": "Langue",
  "common.homeLink": "Accueil PrettyDrama",
  "common.headerToggle": "Déplier ou replier le bandeau",
  "common.progressPosition": "Position dans les répliques",
  // Les libellés de boutons partagés par plusieurs modales. Ils sont ici et pas
  // dans leur page parce qu'ils voisinent « Annuler » dans la même rangée : un
  // seul des deux traduit donnait « Supprimer » à côté de « Cancel ».
  "common.delete": "Supprimer",
  "common.dragHandle": "Glisser pour déplacer",
  "editor.leaveSave": "Télécharger puis quitter",
  "editor.deleteCharacterLines": "Supprimer ses répliques",
  "editor.reassign": "Réassigner",
  "recorder.leaveSave": "Télécharger le ZIP puis quitter",
  "search.replace": "Remplacer",
  "stats.scopeAllOption": "Toute la pièce",
  "stats.scopeActOption": "Tout l'acte",

  "common.cancel": "Annuler",
  "common.leaveAnyway": "Quitter quand même",

  // Le titre des confirmations de suppression d'un objet NOMMÉ (un acte, une
  // scène, un personnage) : le nom arrive déjà entre guillemets de la locale
  // (`fmt.quote`). Les suppressions d'un objet qu'on ne nomme pas (une réplique,
  // une prise) ont leur propre clé, la tournure y étant démonstrative.
  "common.deleteConfirm": "Supprimer {name} ?",

  // Le nom accessible des deux selects de portée, partagé par la Répétition,
  // l'Enregistrement et la Répartition : le mot NU, sans rang (« Acte I » est
  // `structure.act`).
  "common.actSelect": "Acte",
  "common.sceneSelect": "Scène",
  "common.myCharacter": "Mon personnage",
  // Une vraie insécable U+00A0 avant le `?`, et pas une espace ordinaire : le JSX
  // que cette clé remplace en posait une (`Qui jouez-vous&nbsp;?` dans le grand
  // titre de la carte d'accueil de l'Enregistrement), et sans elle le point
  // d'interrogation peut passer seul à la ligne.
  //
  // Les deux autres entrées qui portent un `:` gardent une espace ORDINAIRE, et
  // c'est délibéré : `common.docTitle` est un titre d'onglet, où rien ne se coupe,
  // et son jumeau statique dans les sept `.html` s'écrit pareil (un garde CI
  // compare les deux) ; `page.editor.desc` est reprise MOT POUR MOT de l'ancien
  // pages.js, et la changer ferait dériver un texte déjà validé. Le test de
  // parité connaît ces deux exceptions par leur nom.
  "common.whoDoYouPlay": "Qui jouez-vous ?",
  "common.prevMyLine": "Ma réplique précédente",
  "common.nextMyLine": "Ma réplique suivante",

  // Le repli quand la pièce n'a pas de titre, sur les cinq bandeaux et les trois
  // écrans pleine page définitifs. Une seule clé : il était écrit huit fois.
  "common.untitledPlay": "Pièce sans titre",

  "common.loadingPlay": "Chargement de la pièce…",
  "common.loadingScript": "Chargement du script…",

  // Reaches four pages through useManifest. Worded once so its phrasing cannot
  // drift between them.
  "common.manifestError":
    "Impossible de charger la pièce. Le site n'est peut-être pas encore publié : " +
    "réessayez dans quelques minutes ou contactez le responsable.",

  // Le décompte de répliques, seul, sans phrase autour : SIX endroits le
  // rendaient avec leur propre `n > 1 ? "s" : ""`, du compte d'un acte dans le
  // plan à celui d'un ZIP dans le journal des dépôts. Une seule entrée, et le
  // pluriel vient d'`Intl.PluralRules` (donc « 0 réplique » en français et
  // « 0 lines » en anglais, ce que le ternaire ne savait pas faire).
  "common.lineCount": {
    one: "{count} réplique",
    other: "{count} répliques",
  },

  // Le vide de trois pages qui lisent le manifest : la pièce n'a pas encore de
  // personnage, donc rien à jouer, à enregistrer ni à suivre. Tournure
  // impersonnelle parce que ces pages sont ouvertes à toute la troupe, alors que
  // l'Édition ne l'est pas : un impératif y commanderait un geste que son lecteur
  // ne peut pas faire.
  // `{page}` est le nom de la page Édition, INTERPOLÉ depuis `page.editor.label`
  // et jamais recopié : six entrées de chaque catalogue la citent, donc la
  // renommer demandait douze retouches et laissait les deux catalogues dériver en
  // silence. Même règle que le vide de la Répartition, qui cite
  // `stats.scopeAllOption`, et que l'aide d'une scène vide, qui cite
  // `rail.characters`.
  "common.noCharacters":
    "Aucun personnage pour l'instant : la pièce doit d'abord être saisie dans la page {page}.",

  // Deux noms de touches, cités dans la doc de l'Édition. Ils se traduisent comme
  // le reste : c'est le libellé gravé sur le clavier du lecteur.
  "common.keyEnter": "Entrée",
  "common.keyShiftEnter": "Maj + Entrée",

  // ----------------------------------------------------------------- the pages

  // A page label is read in three places: the browser tab, the home card, and
  // the `aria-label` of its seal. No header ever writes it out, deliberately.
  //
  // A `desc` is the page's COMPACT doc sentence, served both by the home card and
  // by the first line of its header (PlayHeader renders it). One place for both,
  // because a card promising one thing and a header saying another described two
  // different pages. Form to keep, and it also applies to the `hint` a page adds
  // below: an imperative verb first, about ten words, two sentences at the very
  // most, no question put to the reader, and a colon only to enumerate.
  "page.home.label": "Accueil",
  "page.respo.label": "Accueil responsable",

  "page.rehearsal.label": "Répétition",
  "page.rehearsal.desc": "Répétez à l'italienne, avec les vraies voix de la troupe.",

  "page.recorder.label": "Enregistrement",
  "page.recorder.desc": "Enregistrez vos répliques, puis envoyez le fichier au responsable.",

  "page.stats.label": "Répartition",
  // "Comparez qui parle le plus" was dropped: the page measures a play, not
  // actors, and a troupe's text does not rank people where there is only a
  // distribution of roles. "entre les personnages" is named rather than left to
  // be guessed, because without it the sentence said what the speech is divided
  // into (words, lines, scenes) but never between WHOM, which is the page's
  // question. And "personnages", never "acteurs": it is the word of script.json
  // and of the whole site, and an actor can hold two parts.
  "page.stats.desc":
    "Voyez comment la parole se répartit entre les personnages, en mots et en répliques, scène par scène.",

  "page.dashboard.label": "Avancement",
  "page.dashboard.desc":
    "Suivez l'avancement des enregistrements et déposez les fichiers que vous recevez.",

  "page.editor.label": "Édition",
  "page.editor.desc": "Éditez la pièce : personnages, actes, scènes et répliques.",

  // ------------------------------------------------------------- the structure

  // Acts and scenes have no stored title: these are derived from their rank (see
  // structureLabels.js). `{n}` is a roman numeral for an act and a digit for a
  // scene, the convention of the printed script.
  "structure.act": "Acte {n}",
  "structure.scene": "Scène {n}",

  // Le suffixe collé au libellé d'une scène dans les selects de la Répétition et
  // de l'Enregistrement. Il est DANS le catalogue et pluralisé : collé en
  // français à côté d'un libellé traduit, il donnait « Scene 1 (3 répliques) ».
  "rehearsal.sceneLines": {
    one: " ({count} réplique)",
    other: " ({count} répliques)",
  },
  "recorder.sceneTodo": " ({count} à enregistrer)",

  "structure.moveAct": "Déplacer {act}",
  "structure.moveScene": "Déplacer {scene}",
  "structure.openScene": "Ouvrir cette scène",
  "structure.deleteAct": "Supprimer cet acte",
  "structure.deleteAct.named": "Supprimer {act}",
  "structure.deleteScene": "Supprimer cette scène",
  "structure.deleteScene.named": "Supprimer {scene}",

  // Le seul nom qui se saisisse encore dans le plan : l'étiquette accessible du
  // champ ET son texte d'invite, qui doivent dire la même chose.
  "structure.playTitle": "Titre de la pièce",
  // Les trois boutons d'ajout du rail nomment tous l'objet qu'ils créent (cf.
  // `characters.add`), donc ils se lisent comme une famille dans le même meuble.
  "structure.addAct": "+ Acte",
  "structure.addScene": "+ Scène",
  // Ce que la suppression d'un acte ou d'une scène emporte. Le nombre est écrit
  // même au singulier (« 1 réplique sera supprimée. »), le pluriel ne pilotant
  // que l'accord du verbe.
  "structure.deleteLines": {
    one: "{count} réplique sera supprimée.",
    other: "{count} répliques seront supprimées.",
  },

  // La langue dans laquelle la pièce est ÉCRITE, choisie dans la section
  // « Structure » du rail. Un autre axe que la locale de l'interface : elle pilote
  // le PDF et la voix de synthèse qui remplace une réplique pas encore enregistrée.
  "structure.language": "Langue de la pièce",
  "structure.language.fr": "Français",
  "structure.language.en": "Anglais",

  // -------------------------------------------------------------- the rail

  // La bande de trois icônes de l'Édition. `label` nomme la section (c'est
  // l'`aria-label` du bouton ET le titre du panneau, qui ne doivent pas
  // diverger), `tip` dit ce qu'elle contient.
  "rail.label": "Structure, personnages et recherche",
  "rail.width": "Largeur du panneau",
  "rail.structure": "Structure",
  "rail.structure.tip": "Titre, actes et scènes de la pièce",
  "rail.characters": "Personnages",
  "rail.characters.tip": "Personnages de la pièce",
  "rail.search": "Recherche",
  "rail.search.tip": "Rechercher dans les répliques (Ctrl+F)",

  // ------------------------------------------------------------------- editing

  "editor.noPublishedScript": "Aucun script publié trouvé : vous partez d'une pièce vide.",
  // Le seul message du site à donner une marche à suivre sur GitHub : c'est le
  // respo qui le lit, et le fichier du dépôt est la seule chose qui puisse le
  // débloquer.
  "editor.readError":
    "Le script publié existe mais n'a pas pu être lu (fichier abîmé ou problème réseau). " +
    "Pour ne pas risquer d'écraser votre pièce, l'éditeur est désactivé. " +
    "Rechargez la page pour réessayer ; si l'erreur persiste, le fichier data/script.json " +
    "du dépôt est probablement abîmé ; sur GitHub, ouvrez l'historique du fichier, choisissez une " +
    "version antérieure et affichez-la en version brute, puis redéposez-la avant de continuer.",
  "editor.touchOnly":
    "Pour des raisons de praticité, le mode {page} n'est disponible que depuis un ordinateur.",

  // Les deux phrases du `hint`, dans l'ordre du travail : ce qui sert pendant la
  // saisie, puis ce qui sert une fois qu'on a fini.
  "editor.hintTyping": "Dans une réplique, {enter} crée la suivante, {shiftEnter} un retour à la ligne.",
  "editor.hintDownload":
    "Une fois vos modifications terminées, téléchargez le script avec le bouton en haut de la " +
    "page, puis déposez le fichier obtenu sur la page {page} comme pour les voix des acteurs.",

  "editor.dirty": "Modifications non téléchargées",
  // Le nom accessible d'un bouton ne dépend pas de son état ; seule l'infobulle
  // dit pourquoi il dort.
  "editor.undo": "Annuler",
  "editor.undo.tip": "Annuler la dernière modification (Ctrl+Z)",
  "editor.undo.none": "Rien à annuler pour l'instant",
  "editor.redo": "Rétablir",
  "editor.redo.tip": "Rétablir la modification annulée (Ctrl+Y)",
  "editor.redo.none": "Rien à rétablir pour l'instant",
  "editor.download": "Télécharger le script",
  "editor.download.none": "Aucune modification à télécharger pour l'instant",

  "editor.leaveTitle": "Vous n'avez pas téléchargé le script",
  "editor.leaveBody":
    "Vos modifications ne vivent que dans cet onglet : en quittant la page sans télécharger le " +
    "fichier {file}, vous les perdez.",

  // Le sort des répliques d'un personnage qu'on supprime. `{count}` arrive en
  // gras, composé par `common.lineCount`.
  "editor.deleteCharacterBody": "Ce personnage a encore {count}. Que faut-il en faire ?",
  "editor.reassignTo": "Réassigner à :",

  // ---------------------------------------------------------------- characters

  "characters.empty": "Aucun personnage pour l'instant :",
  "characters.namePlaceholder": "Nom du personnage",
  "characters.add": "+ Personnage",
  "characters.rename": "Renommer",
  "characters.changeColor": "Changer la couleur",
  "characters.changeColorOf": "Changer la couleur de {name}",
  "characters.delete": "Supprimer ce personnage",
  "characters.deleteNamed": "Supprimer {name}",
  // « la couleur X » et pas « le X » : sur vingt noms, quatre commencent par une
  // voyelle (orange, olive, et leurs teintes claires) et l'article ne s'y élide
  // pas. Un nom de couleur apposé se passe d'accord, alors qu'un adjectif en
  // demanderait un. L'anglais n'a ni l'un ni l'autre problème et dit le nom.
  "characters.colorCurrent": "{color}, couleur actuelle",
  "characters.colorChoose": "Choisir la couleur {color}",

  // Les vingt noms de la palette (Tableau 10 puis ses dix teintes claires), dans
  // l'ordre de `CHARACTER_COLORS`. Ils NOMMENT les pastilles : sans eux, les
  // vingt boutons portaient tous « Choisir cette couleur », donc au clavier et au
  // lecteur d'écran la palette était vingt homonymes dont la seule information,
  // la couleur, n'était pas dite. `characterColors.js` porte les clés, pas les
  // mots, pour que l'ordre reste vérifié à côté des hex.
  "color.blue": "Bleu",
  "color.orange": "Orange",
  "color.green": "Vert",
  "color.red": "Rouge",
  "color.purple": "Violet",
  "color.brown": "Brun",
  "color.pink": "Rose",
  "color.grey": "Gris",
  "color.olive": "Olive",
  "color.cyan": "Cyan",
  "color.blueLight": "Bleu clair",
  "color.orangeLight": "Orange clair",
  "color.greenLight": "Vert clair",
  "color.redLight": "Rouge clair",
  "color.purpleLight": "Violet clair",
  "color.brownLight": "Brun clair",
  "color.pinkLight": "Rose clair",
  "color.greyLight": "Gris clair",
  "color.oliveLight": "Olive clair",
  "color.cyanLight": "Cyan clair",

  // ------------------------------------------------------- lines and scenes

  "line.character": "Personnage de la réplique",
  "line.characterUnset": "Personnage ?",
  "line.placeholder": "Texte de la réplique…",
  "line.delete": "Supprimer cette réplique",
  "line.deleteConfirm": "Supprimer cette réplique ?",

  "scene.insert": "+ insérer",
  "scene.firstLine": "Écrire la première réplique : les suivantes se créent avec la touche Entrée.",
  // `{section}` est le nom de la section du rail, entre guillemets de la locale :
  // recopier « Personnages » ici le ferait dériver du rail au premier renommage.
  "scene.needCharacter":
    "Ajoutez d'abord un personnage (icône {section} du rail, à gauche) pour pouvoir saisir des répliques.",

  // ------------------------------------------------- search and replace

  "search.caseSensitive": "Respecter la casse",
  "search.caseSensitive.tip": "« Marie » ne trouve plus « marie ».",
  "search.wholeWord": "Mot entier",
  "search.wholeWord.tip": "« art » ne trouve plus « partie ».",
  "search.showReplace": "Afficher le champ de remplacement (Ctrl+H)",
  "search.hideReplace": "Masquer le champ de remplacement",
  "search.placeholder": "Rechercher",
  // L'étiquette dit le périmètre, que le texte d'invite n'a pas la place de dire :
  // la recherche ne voit que les répliques.
  "search.label": "Rechercher dans les répliques",
  "search.replacePlaceholder": "Remplacer par",
  "search.replaceCurrent.tip": "Remplacer la correspondance courante",
  "search.pickFirst": "Choisissez d'abord une correspondance",
  "search.noneToReplace": "Aucune correspondance à remplacer",
  "search.replaceAll": "Tout remplacer",
  "search.replaceAll.tip": "Remplacer {matches} dans toute la pièce",
  // Les deux décomptes de la recherche, composés dans les phrases ci-dessous.
  "search.matchCount": {
    one: "{count} correspondance",
    other: "{count} correspondances",
  },
  "search.sceneCount": {
    one: "{count} scène",
    other: "{count} scènes",
  },
  // La forme de cette phrase ne change JAMAIS selon les nombres : elle se réécrit
  // à chaque frappe, et une phrase qui change de forme en tapant se lit comme un
  // clignotement.
  "search.count": "{matches} dans {scenes}",
  "search.none": "Aucune correspondance",
  "search.prev": "Correspondance précédente",
  "search.prev.tip": "Correspondance précédente (Maj+Entrée)",
  "search.next": "Correspondance suivante",
  "search.next.tip": "Correspondance suivante (Entrée)",
  "search.noneToBrowse": "Aucune correspondance à parcourir",
  "search.replaceAllTitle": "Remplacer {matches} ?",
  // Un champ de remplacement vide est légitime (supprimer un mot partout) : c'est
  // ici que ça se dit, plutôt que de laisser croire à un remplacement par rien.
  "search.replaceAllInto": "Dans {scenes} de la pièce : {query} devient {replacement}.",
  "search.replaceAllDelete": "Dans {scenes} de la pièce : {query} sera supprimé.",

  // ------------------------------------------------------------- rehearsal

  "rehearsal.emptyPlay":
    "La pièce est vide pour l'instant. Le responsable doit d'abord la saisir dans la page {page}.",

  // Les quatre cases : le libellé dit ce que la case FAIT, l'infobulle dit
  // pourquoi. « Muet », « Bip » et « Avant » ne se comprenaient qu'une fois
  // essayés. La quatrième ne se raccourcit pas en « Démarrer avant ma réplique » :
  // « avant » y désignerait un rang, alors qu'il désigne un instant dans la case
  // du dessus.
  "rehearsal.mute": "Couper ma voix",
  "rehearsal.mute.tip": "Mes répliques ne sont pas jouées : je les dis moi-même",
  "rehearsal.hideText": "Cacher mon texte",
  "rehearsal.hideText.tip": "Flouter le texte de mes répliques",
  "rehearsal.beep": "Bip avant ma réplique",
  "rehearsal.beep.tip": "Un bip sonore annonce chacune de mes répliques",
  "rehearsal.cueEarly": "Démarrer une réplique avant la mienne",
  "rehearsal.cueEarly.tip":
    "Les flèches « ma réplique » s'arrêtent sur la réplique qui me lance, pas sur la mienne",

  "rehearsal.tts": "voix de synthèse",
  "rehearsal.tts.tip": "Pas encore de vraie voix",
  "rehearsal.yourTurn": "À vous…",
  "rehearsal.prevLine": "Réplique précédente",
  "rehearsal.nextLine": "Réplique suivante",
  "rehearsal.playPause": "Lecture / pause",

  // ------------------------------------------------------------- recording

  "recorder.unsupported":
    "Votre navigateur ne permet pas d'enregistrer du son. Essayez avec une version récente de " +
    "Chrome, Firefox ou Safari.",
  "recorder.micError":
    "Impossible d'accéder au micro. Vérifiez que vous avez autorisé le micro pour ce site.",
  "recorder.hint":
    "Placez-vous sur une de vos répliques, puis appuyez sur le micro pour l'enregistrer. Quand " +
    "vous avez fini (toutes vos répliques ou seulement une partie), téléchargez le fichier.",

  "recorder.notSaved":
    "Vos enregistrements ne sont PAS sauvegardés tant que vous n'avez pas téléchargé le fichier.",
  "recorder.downloadedNote": "Fichier téléchargé. Envoyez-le au responsable.",
  "recorder.noLinesInScene": "Vous n'avez aucune réplique dans cette scène.",

  // Les trois états d'une de mes répliques, en étiquette au coin de la carte et
  // en légende en tête de liste : les deux endroits lisent les mêmes clés.
  "recorder.status.todo": "À enregistrer",
  "recorder.status.fresh": "À télécharger",
  "recorder.status.done": "Déjà enregistrée",
  "recorder.recording": "Enregistrement…",
  "recorder.recordingLabel": "Enregistrement",

  "recorder.record": "Enregistrer cette réplique (le micro démarre aussitôt)",
  "recorder.stop": "Terminer l'enregistrement",
  "recorder.downloadZip": "Télécharger le ZIP des prises",
  "recorder.downloadZipCount": "Télécharger le ZIP des prises ({count})",
  // Le NOM du fichier téléchargé, et il se traduit comme le reste : un acteur
  // anglophone ne reçoit pas « voix-marie.zip ». L'Action ne lit jamais ce nom
  // (le type vient de l'extension, les clips de leur id), donc le contrat du ZIP
  // n'en dépend pas. `{names}` est la liste des personnages en slug.
  "recorder.zipName": "voix-{names}",
  "recorder.zipFallback": "prises",
  // Le repli de `slugify` quand le nom d'un personnage ne laisse rien après
  // nettoyage (« ??? ») : il nomme un fichier, donc il suit la locale.
  "recorder.characterSlug": "personnage",

  "recorder.leaveTitle": "Vos prises ne sont pas téléchargées",
  // Le nombre de prises a quitté cette phrase : le titre juste au-dessus dit déjà
  // qu'elles ne sont pas téléchargées, et le compte exact ne change pas la
  // décision. Le pluriel ne règle donc plus que l'accord.
  "recorder.leaveBody": {
    one:
      "Votre prise ne vit que dans cet onglet : en quittant la page sans télécharger le ZIP, " +
      "vous devrez tout réenregistrer.",
    other:
      "Vos prises ne vivent que dans cet onglet : en quittant la page sans télécharger le ZIP, " +
      "vous devrez tout réenregistrer.",
  },

  // L'encart d'accueil, à la place des répliques tant qu'aucun personnage n'est
  // choisi. `{your}` est le mot mis en gras : il est une entrée à lui pour que la
  // traduction garde l'ordre des mots au lieu de le figer dans le JSX.
  "recorder.intro.lead": "Choisissez votre personnage : la page mettra alors {your} répliques en avant.",
  "recorder.intro.leadEmphasis": "vos",
  "recorder.intro.step1":
    "Placez-vous sur une de vos répliques et appuyez sur le micro : il démarre aussitôt.",
  "recorder.intro.step2": "Réécoutez, refaites la prise si besoin, puis passez à la suivante.",
  "recorder.intro.outro":
    "Quand vous avez terminé (un ou plusieurs personnages, ou même seulement une partie de vos " +
    "répliques), appuyez sur le bouton {icon} pour sauvegarder vos prises et les envoyer au " +
    "responsable.",
  "recorder.intro.noLines": "aucune réplique",
  "recorder.intro.allDone": "tout est enregistré",
  "recorder.intro.todo": "{count} à enregistrer",

  "recorder.player.play": "Écouter",
  "recorder.player.pause": "Pause",
  "recorder.player.delete": "Supprimer cette prise",
  "recorder.player.deleteConfirm": "Supprimer cette prise ?",

  // ---------------------------------------------------- the speaking share

  // La portée lue, composée par `scopeText` (stats/App.jsx).
  // Le seuil sous lequel on dit le palier et non la valeur ; `{value}` est déjà
  // formaté (« 0,1 % »).
  "stats.shareBelow": "< {value}",

  "stats.scope.all": "toute la pièce",
  "stats.scope.act": "{act}, en entier",
  "stats.scope.scene": "{act}, {scene}",

  // Le seul réglage d'AFFICHAGE de la page.
  "stats.columns": "Mots par ligne",
  "stats.columns.tip":
    "Largeur de la chronologie du dialogue : le même nombre de mots par ligne pour toute la " +
    "pièce, donc des blocs qui se comparent d'une scène à l'autre",

  "stats.highlight": "Mettre un personnage en évidence",

  // Deux vides à ne pas confondre : une pièce vide s'écrit dans l'Édition, une
  // portée vide se change en choisissant ailleurs. `{all}` reprend le premier
  // choix du select de portée plutôt que de le recopier.
  "stats.emptyPlay":
    "Aucune réplique dans la pièce : elle doit d'abord être saisie dans la page {page}.",
  "stats.emptyScope":
    "Aucune réplique dans cette partie de la pièce : choisissez un autre acte, une autre scène, ou {all}.",

  // Les trois libellés de panneau sont ceux du PDF de la troupe, mot pour mot :
  // c'est le même document, servi à l'écran et tenu à jour.
  "stats.words.title": "Distribution du nombre de mots",
  "stats.words.unit": "mots",
  "stats.lines.title": "Distribution du nombre de répliques",
  "stats.lines.unit": "répliques",
  "stats.donutLabel": "{title}, {where} : {total} {unit} au total",

  "stats.timeline.title": "Chronologie du dialogue",
  // Comment lire le dessin, AVANT lui. « Prise de parole » et pas « réplique » :
  // les répliques voisines d'un même personnage sont fusionnées avant le dessin.
  // « Appuyez » et pas « cliquez » : la page est ouverte à toute la troupe, donc
  // au téléphone.
  "stats.timeline.caption":
    "Le dialogue se lit ligne par ligne, de haut en bas. Chaque carré est un mot, sa couleur est " +
    "le personnage qui le prononce, donc la taille d'un bloc est la longueur de sa prise de " +
    "parole. Appuyez sur un nom de la barre du haut ou sur une part de camembert pour ne garder " +
    "que ce personnage dans les trois dessins, et de nouveau pour tout remontrer.",
  "stats.timeline.label":
    "Chronologie du dialogue, {where} : chaque carré est un mot, sa couleur est le personnage qui le prononce.",
  "stats.timeline.labelOnly":
    "Chronologie du dialogue, {where} : les mots de {name} seuls sont en couleur.",

  // Deux replis de nom, et pas un seul : le seau des orphelines n'a jamais de
  // nom, mais un personnage de la distribution peut n'en pas avoir non plus.
  "stats.unknownCharacter": "Personnage inconnu",
  "stats.unnamedCharacter": "Personnage sans nom",
  "stats.showEveryone": "Montrer tout le monde",
  "stats.showOnly": "Ne montrer que {name}",
  "stats.orphanWarning":
    "Des répliques n'ont pas de personnage valide : elles comptent dans les totaux et " +
    "apparaissent en gris. Le responsable peut leur en assigner un dans la page {page}.",

  // ----------------------------------------------------------- the progress

  // Ici c'est le responsable qui lit, donc l'impératif est de mise (les pages de
  // la troupe, elles, restent impersonnelles sur le même sujet).
  "dashboard.orphans.count": {
    one: "{count} réplique sans personnage valide",
    other: "{count} répliques sans personnage valide",
  },
  "dashboard.orphans":
    "{count} : personne ne peut les enregistrer. Ouvrez la page {page} et assignez-leur un personnage.",
  "dashboard.legend":
    "Chaque cellule indique le nombre de répliques enregistrées sur le total des répliques du " +
    "personnage dans la scène.",
  "dashboard.table": "Avancement par personnage et par scène",

  "dashboard.journal.title": "Derniers dépôts de fichiers",
  "dashboard.journal.region": "Journal des dépôts",
  "dashboard.journal.date": "Date",
  "dashboard.journal.status": "Statut",
  "dashboard.journal.type": "Type",
  "dashboard.journal.detail": "Détail",
  "dashboard.journal.empty":
    "Aucun dépôt pour l'instant : chaque fichier déposé apparaîtra ici, avec ce que l'outil en a fait.",
  // Un tableau qui s'arrête sans un mot se lit comme « il n'y a rien de plus »,
  // dans le seul canal de retour du projet.
  "dashboard.journal.more": {
    one: "{count} dépôt plus ancien non affiché.",
    other: "{count} dépôts plus anciens non affichés.",
  },
  // Le détail d'une ligne de voix : le nom du fichier (en `<code>`) et son
  // nombre de répliques. Une entrée plutôt que deux morceaux juxtaposés dans le
  // JSX, où l'ordre des deux et l'espace qui les sépare étaient figés : c'est le
  // cas que `<T>` existe pour couvrir, et rien ne garantit qu'une langue mette le
  // fichier avant son décompte.
  "dashboard.journal.detailVoices": "{file} {count}",
  // Le détail d'un échec. `{reason}` est le motif rendu par l'Action, donc du
  // français non traduit (c'est la langue du DÉPÔT, cf. CLAUDE.md) : la phrase est
  // mixte en anglais, et c'est assumé. Elle est une entrée quand même, pour que
  // l'ordre du nom de fichier et du motif reste celui du traducteur.
  "dashboard.journal.detailError": "{file} {reason}",
  "dashboard.journal.ok": "réussi",
  "dashboard.journal.failed": "échoué",
  "dashboard.journal.unknownDate": "date inconnue",

  // Le TYPE du fichier déposé, pas la page dont le sceau porte les couleurs.
  "dashboard.kind.voix": "Voix",
  "dashboard.kind.script": "Script",
  "dashboard.kind.inconnu": "Autre",

  // Les deux mots colorés du bouton de dépôt sont des paramètres : chacun porte
  // la couleur de sa page, et le français comme l'anglais gardent leur ordre.
  "dashboard.upload": "Déposer des {voices} ou le {script}",
  "dashboard.upload.voices": "voix",
  "dashboard.upload.script": "script de la pièce",

  // « la pièce à imprimer » et non « le script de la pièce » : la carte de dépôt
  // juste au-dessus dit déjà « script de la pièce (JSON) », et deux libellés
  // partageant leur groupe de mots ne se distinguaient plus que par l'acronyme.
  "dashboard.pdf": "Télécharger la pièce à imprimer {format}",
  // Le nom du fichier téléchargé quand le titre de la pièce ne laisse rien après
  // nettoyage : « script.pdf » ne dit rien dans un dossier de téléchargements,
  // mais c'est mieux que rien.
  "dashboard.pdfSlug": "script",

  // -------------------------------------------------------------------- home

  "home.footer": "Un outil libre pour les troupes de théâtre, {link}",
};
