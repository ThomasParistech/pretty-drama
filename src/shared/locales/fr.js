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
  // Button labels shared by several modals. They live here and not in their page
  // because they sit next to "Annuler" in the same row: translating only one of
  // the two gave "Supprimer" beside "Cancel".
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

  // The title of any delete confirmation about a NAMED thing (an act, a scene, a
  // character): the name arrives already wrapped in the locale's quotes
  // (`fmt.quote`). Deletions of a thing that is not named (a line, a take) have
  // their own key, the wording there being demonstrative.
  "common.deleteConfirm": "Supprimer {name} ?",

  // The accessible name of the two scope selects, shared by Rehearsal, Recording
  // and Speaking share: the BARE word, with no rank ("Acte I" is
  // `structure.act`).
  "common.actSelect": "Acte",
  "common.sceneSelect": "Scène",
  "common.myCharacter": "Mon personnage",
  // A real U+00A0 no-break space before the `?`, and not an ordinary space: the
  // JSX this key replaces laid one down (`Qui jouez-vous&nbsp;?` in the big
  // heading of the Recording intro card), and without it the question mark can
  // wrap onto a line of its own.
  //
  // The two other entries that carry a `:` keep an ORDINARY space, and that is
  // deliberate: `common.docTitle` is a browser tab title, where nothing wraps, and
  // its static twin in the nine `.html` documents is written the same way (a CI guard
  // compares the two); `page.editor.desc` is taken WORD FOR WORD from the old
  // pages.js, and changing it would make an already validated text drift. The
  // parity test knows these two exceptions by name.
  "common.whoDoYouPlay": "Qui jouez-vous ?",
  "common.prevMyLine": "Ma réplique précédente",
  "common.nextMyLine": "Ma réplique suivante",

  // The fallback when the play has no title, on the five headers and the three
  // final full-page screens. A single key: it used to be written eight times.
  "common.untitledPlay": "Pièce sans titre",

  "common.loadingPlay": "Chargement de la pièce…",
  "common.loadingScript": "Chargement du script…",

  // Reaches four pages through useManifest. Worded once so its phrasing cannot
  // drift between them.
  "common.manifestError":
    "Impossible de charger la pièce. Le site n'est peut-être pas encore publié : " +
    "réessayez dans quelques minutes ou contactez le responsable.",

  // A line count on its own, with no sentence around it: SIX places used to render
  // it with their own `n > 1 ? "s" : ""`, from an act's count in the plan to a
  // ZIP's count in the upload log. A single entry, and the plural comes from
  // `Intl.PluralRules` (hence "0 réplique" in French and "0 lines" in English,
  // which the ternary could not do).
  "common.lineCount": {
    one: "{count} réplique",
    other: "{count} répliques",
  },

  // The note an `<option>` of a scope select carries beside its label, brackets and
  // nothing else, what goes inside being INTERPOLATED. One entry and not one per
  // page: Rehearsal puts a line count in it (`common.lineCount`) and Recording what
  // is left to record (`recorder.toRecord`, `recorder.noLines`), but the brackets and
  // the space before them are the same piece of punctuation, and a language that
  // wrote them differently would have to be told twice. It is IN the catalogue at
  // all because, left in the component beside a translated label, it produced
  // "Scene 1 (3 répliques)".
  "common.optionNote": " ({note})",

  // The act + scene pair, everywhere the two are named together: the Speaking
  // share scope, the Progress column and the tooltip on its heading. A single
  // entry for all three: the separator is a fact of language, and it was a comma
  // on one side and a "·" hard-coded in the JSX on the other, on the same screen
  // of the same site.
  "common.actScene": "{act}, {scene}",

  // The format a file tile announces, parentheses INCLUDED: they are punctuation, so
  // they live here and not in the JSX, like every separator of the site (cf.
  // `common.myLineNumber`, which carries the "(3/12)" of the two reading pages). Both
  // catalogues write them the same way, and that is not a reason to write them in a
  // component: what a language decides is where the group goes and what surrounds it,
  // which is exactly what the `{format}` of `dashboard.upload.voices` and
  // `dashboard.pdf.play` leaves it. The acronym itself is the extension the coordinator
  // reads in their own file manager, hence untranslated.
  "common.format.zip": "(ZIP)",
  "common.format.pdf": "(PDF)",

  // "Nom (3/12)" on my dialogue cards: my rank among MY lines in the scene. Two
  // pages show it (Rehearsal and Recording) and each wrote this template on its
  // own side, brackets and slash included. The leading space is in the string, as
  // for `common.optionNote`: it is a suffix stuck to a name, not a sentence of
  // its own.
  "common.myLineNumber": " ({n}/{total})",

  // The empty state of the three pages that read the manifest: the play has no
  // character yet, so there is nothing to play, to record or to follow. An
  // impersonal turn of phrase because these pages are open to the whole troupe,
  // whereas Editing is not: an imperative there would order a gesture its reader
  // cannot make.
  // `{page}` is the Editing page's name, INTERPOLATED from `page.editor.label` and
  // never copied: six entries per catalogue name it, so renaming it meant twelve
  // touch-ups and left the two catalogues to drift in silence. Same rule as the
  // Speaking share empty state, which quotes `stats.scopeAllOption`, and as the
  // help on an empty scene, which quotes `rail.characters`.
  "common.noCharacters":
    "Aucun personnage pour l'instant : la pièce doit d'abord être saisie dans la page {page}.",

  // The other empty state of those same grids, and it is NOT the one above: a play
  // can carry its whole cast and not a single scene (a script edited by hand in the
  // repository, `acts: []`, which the Python sanitize deliberately does not floor
  // where the editor does). Saying "no characters" there stated something false about
  // the one thing the page did have. In `common.` because two grids show it, Progress
  // and Speaking share, and a sentence named twice is written once.
  "common.emptyPlay":
    "Aucune réplique dans la pièce : elle doit d'abord être saisie dans la page {page}.",

  // Two key names, quoted in the Editing doc. They translate like the rest: this is
  // the label engraved on the reader's keyboard.
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
    "Suivez l'avancement des enregistrements et déposez les fichiers de voix que vous recevez.",

  "page.editor.label": "Édition",
  "page.editor.desc": "Éditez la pièce : personnages, actes, scènes et répliques.",

  // ------------------------------------------------------------- the structure

  // Acts and scenes have no stored title: these are derived from their rank (see
  // structureLabels.js). `{n}` is a roman numeral for an act and a digit for a
  // scene, the convention of the printed script.
  "structure.act": "Acte {n}",
  "structure.scene": "Scène {n}",

  // The tick the Recording menus put on an act, a scene or a character with nothing
  // left to record, and NOT "(0 à enregistrer)": that is the one line of a menu
  // nobody needs to read, since what it says is exactly that there is nothing to do
  // there. A bare glyph, with no colour and no disc around it: an `<option>` is drawn
  // by the BROWSER and not by the page, it holds no element of ours, and a background
  // laid on it is honoured by some engines and ignored by others. So the mark has to
  // be one of the monochrome characters that follow the font, like the `✓ ✕ ↓ ▼` of
  // the rest of the site. What goes in the OTHER two cases is interpolated into
  // `common.optionNote` (`recorder.toRecord`, `recorder.noLines`), so those sentences
  // are written once and the intro card reads the very same ones.
  "recorder.optionDone": " ✓",

  "structure.moveAct": "Déplacer {act}",
  "structure.moveScene": "Déplacer {scene}",
  "structure.openScene": "Ouvrir cette scène",
  "structure.deleteAct": "Supprimer cet acte",
  "structure.deleteAct.named": "Supprimer {act}",
  "structure.deleteScene": "Supprimer cette scène",
  "structure.deleteScene.named": "Supprimer {scene}",

  // The only name still typed in the plan: the field's accessible label AND its
  // placeholder, which must say the same thing.
  "structure.playTitle": "Titre de la pièce",
  // The rail's three add buttons all name the thing they create (see
  // `characters.add`), so they read as a family in the same piece of furniture.
  "structure.addAct": "+ Acte",
  "structure.addScene": "+ Scène",
  // What deleting an act or a scene takes away with it. The number is written even
  // in the singular ("1 réplique sera supprimée."), the plural only driving the
  // agreement of the verb.
  "structure.deleteLines": {
    one: "{count} réplique sera supprimée.",
    other: "{count} répliques seront supprimées.",
  },

  // The language the play is WRITTEN in, chosen in the "Structure" section of the
  // rail. A different axis from the interface locale: it drives the PDF and the
  // synthetic voice that stands in for a line not yet recorded.
  "structure.language": "Langue de la pièce",
  "structure.language.fr": "Français",
  "structure.language.en": "Anglais",

  // -------------------------------------------------------------- the rail

  // The Editing page's strip of three icons. `label` names the section (it is both
  // the button's `aria-label` AND the panel's title, which must not diverge), `tip`
  // says what it contains.
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
  // The site's only message that gives a procedure to follow on GitHub: the
  // coordinator is the one who reads it, and the file in the repository is the only
  // thing that can unblock them.
  "editor.readError":
    "Le script publié existe mais n'a pas pu être lu (fichier abîmé ou problème réseau). " +
    "Pour ne pas risquer d'écraser votre pièce, l'éditeur est désactivé. " +
    "Rechargez la page pour réessayer ; si l'erreur persiste, le script de cette pièce est " +
    "probablement abîmé dans le dépôt ; sur GitHub, ouvrez l'historique du fichier, choisissez une " +
    "version antérieure et affichez-la en version brute, puis redéposez-la avant de continuer.",
  "editor.touchOnly":
    "Pour des raisons de praticité, le mode {page} n'est disponible que depuis un ordinateur.",

  // The two sentences of the `hint`, in the order of the work: what serves while
  // typing, then what serves once you are done.
  "editor.hintTyping": "Dans une réplique, {enter} crée la suivante, {shiftEnter} un retour à la ligne.",
  "editor.hintUpload":
    "Une fois vos modifications terminées, cliquez sur le bouton en haut de la page pour mettre " +
    "à jour la pièce.",

  "editor.dirty": "Modifications non sauvegardées",
  // The accessible name of a button does not depend on its state; only the tooltip
  // says why it is asleep.
  "editor.undo": "Annuler",
  "editor.undo.tip": "Annuler la dernière modification (Ctrl+Z)",
  "editor.undo.none": "Rien à annuler pour l'instant",
  "editor.redo": "Rétablir",
  "editor.redo.tip": "Rétablir la modification annulée (Ctrl+Y)",
  "editor.redo.none": "Rien à rétablir pour l'instant",
  "editor.upload": "Mettre à jour le {script}",
  "editor.upload.script": "script de la pièce",
  "editor.upload.tip": "Télécharger le script, puis le déposer sur GitHub",
  "editor.upload.none": "Aucune modification à déposer pour l'instant",

  // The box that announces the gesture, BEFORE it happens: hence the future tense
  // throughout, and the order of the two halves is the order they will come in.
  // `{file}` arrives as code, like in `editor.leaveBody`. It has no title of its own:
  // the box wears the tile's label, `editor.upload` composed with
  // `editor.upload.script`, so the gesture is named identically where it is offered
  // and where it is confirmed.
  // The green button is quoted by the name GitHub gives it in this language: the
  // coordinator is looking for it on a page we do not own, and a translated name they
  // cannot find would be worse than no name.
  // The last sentence is the only one about what follows the commit: the Action takes
  // minutes, and without that a coordinator reloads the site and concludes it failed.
  "editor.uploadNotice.body":
    "Le fichier {file} va être téléchargé, puis GitHub s'ouvrira dans un autre onglet : " +
    "glissez-y le fichier et appuyez sur le bouton vert « Valider les modifications ».{br}" +
    "La mise à jour prendra ensuite quelques minutes.",
  "editor.uploadNotice.go": "Continuer",

  "editor.leaveTitle": "Vous n'avez pas téléchargé le script",
  "editor.leaveBody":
    "Vos modifications ne vivent que dans cet onglet : en quittant la page sans télécharger le " +
    "fichier {file}, vous les perdez.",

  // The fate of the lines of a character being deleted. `{count}` arrives in bold,
  // composed by `common.lineCount`.
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
  // "la couleur X" and not "le X": out of twenty names, four begin with a vowel
  // (orange, olive, and their light tints) and the article does not elide before
  // them. An apposed colour name needs no agreement, whereas an adjective would
  // demand one. English has neither problem and simply says the name.
  "characters.colorCurrent": "{color}, couleur actuelle",
  "characters.colorChoose": "Choisir la couleur {color}",

  // The twenty palette names (Tableau 10, then its ten light tints), in the order
  // of `CHARACTER_COLORS`. They NAME the swatches: without them, all twenty
  // buttons read "Choisir cette couleur", so to the keyboard and the screen reader
  // the palette was twenty homonyms whose only piece of information, the colour,
  // was never spoken. `characterColors.js` carries the keys, not the words, so that
  // the order stays checked next to the hex values.
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
  // `{section}` is the name of the rail section, inside the locale's quotes:
  // copying "Personnages" here would make it drift from the rail on the first
  // rename.
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
  // The label states the scope, which the placeholder has no room to state: the
  // search only ever sees the lines.
  "search.label": "Rechercher dans les répliques",
  "search.replacePlaceholder": "Remplacer par",
  "search.replaceCurrent.tip": "Remplacer la correspondance courante",
  "search.pickFirst": "Choisissez d'abord une correspondance",
  "search.noneToReplace": "Aucune correspondance à remplacer",
  "search.replaceAll": "Tout remplacer",
  "search.replaceAll.tip": "Remplacer {matches} dans toute la pièce",
  // The search's two counts, composed into the sentences below.
  "search.matchCount": {
    one: "{count} correspondance",
    other: "{count} correspondances",
  },
  "search.sceneCount": {
    one: "{count} scène",
    other: "{count} scènes",
  },
  // The shape of this sentence NEVER changes with the numbers: it is rewritten on
  // every keystroke, and a sentence that changes shape as you type reads like a
  // flicker.
  "search.count": "{matches} dans {scenes}",
  "search.none": "Aucune correspondance",
  "search.prev": "Correspondance précédente",
  "search.prev.tip": "Correspondance précédente (Maj+Entrée)",
  "search.next": "Correspondance suivante",
  "search.next.tip": "Correspondance suivante (Entrée)",
  "search.noneToBrowse": "Aucune correspondance à parcourir",
  "search.replaceAllTitle": "Remplacer {matches} ?",
  // An empty replacement field is legitimate (deleting a word everywhere): this is
  // where that gets said, rather than letting one believe in a replacement by
  // nothing.
  "search.replaceAllInto": "Dans {scenes} de la pièce : {query} devient {replacement}.",
  "search.replaceAllDelete": "Dans {scenes} de la pièce : {query} sera supprimé.",

  // ------------------------------------------------------------- rehearsal

  "rehearsal.emptyPlay":
    "La pièce est vide pour l'instant. Le responsable doit d'abord la saisir dans la page {page}.",

  // The four checkboxes: the label says what the box DOES, the tooltip says why.
  // "Muet", "Bip" and "Avant" could only be understood once tried. The fourth does
  // not shorten to "Démarrer avant ma réplique": "avant" would then designate a
  // rank, whereas it designates a moment in the box just above.
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

  // The three states of one of my lines, as a tag in the corner of the card and as
  // a legend at the head of the list: both places read the same keys.
  "recorder.status.todo": "À enregistrer",
  "recorder.status.fresh": "À télécharger",
  "recorder.status.done": "Déjà enregistrée",
  "recorder.recording": "Enregistrement…",
  "recorder.recordingLabel": "Enregistrement",

  "recorder.record": "Enregistrer cette réplique (le micro démarre aussitôt)",
  "recorder.stop": "Terminer l'enregistrement",
  "recorder.downloadZip": "Télécharger le ZIP des prises",
  "recorder.downloadZipCount": "Télécharger le ZIP des prises ({count})",
  // The number of takes written ON the button, next to its arrow: that is all the
  // button says on screen, its verb living in the tooltip and the `aria-label` just
  // above. The brackets are in the string, they used to be in the JSX.
  "recorder.downloadCount": "({count})",
  // My position among my lines in the scene, in the corner of the bottom bar. Kept
  // separate from `common.myLineNumber`: that one is stuck to a character's name,
  // this one sits alone in its corner and therefore carries no brackets.
  "recorder.lineCounter": "{n}/{total}",
  // The NAME of the downloaded file, and it translates like the rest: an
  // English-speaking actor does not receive "voix-marie.zip". The Action never
  // reads this name (the type comes from the extension, the clips from their id),
  // so the ZIP contract does not depend on it. `{names}` is the list of characters
  // as a slug.
  "recorder.zipName": "voix-{names}",
  "recorder.zipFallback": "prises",
  // The `slugify` fallback when a character's name leaves nothing after cleaning
  // ("???"): it names a file, so it follows the locale.
  "recorder.characterSlug": "personnage",

  "recorder.leaveTitle": "Vos prises ne sont pas téléchargées",
  // The number of takes has left this sentence: the title just above already says
  // they are not downloaded, and the exact count does not change the decision. The
  // plural therefore only settles the agreement.
  "recorder.leaveBody": {
    one:
      "Votre prise ne vit que dans cet onglet : en quittant la page sans télécharger le ZIP, " +
      "vous devrez tout réenregistrer.",
    other:
      "Vos prises ne vivent que dans cet onglet : en quittant la page sans télécharger le ZIP, " +
      "vous devrez tout réenregistrer.",
  },

  // The intro card, standing in for the lines as long as no character is chosen.
  // `{your}` is the word set in bold: it is an entry of its own so that the
  // translation keeps the word order instead of freezing it in the JSX.
  "recorder.intro.lead": "Choisissez votre personnage : la page mettra alors {your} répliques en avant.",
  "recorder.intro.leadEmphasis": "vos",
  "recorder.intro.step1":
    "Placez-vous sur une de vos répliques et appuyez sur le micro : il démarre aussitôt.",
  "recorder.intro.step2": "Réécoutez, refaites la prise si besoin, puis passez à la suivante.",
  "recorder.intro.outro":
    "Quand vous avez terminé (un ou plusieurs personnages, ou même seulement une partie de vos " +
    "répliques), appuyez sur le bouton {icon} pour sauvegarder vos prises et les envoyer au " +
    "responsable.",
  "recorder.intro.allDone": "tout est enregistré",

  // Said twice on this page, and therefore written once: under a character on the
  // intro card, and inside the brackets of `common.optionNote` in the three menus
  // of the header.
  "recorder.noLines": "aucune réplique",
  "recorder.toRecord": "{count} à enregistrer",

  // Elapsed and total time of the take being played back. Both durations arrive
  // already composed as "m:ss" (the universal format for a short excerpt,
  // identical in both languages, and `Intl` does not expose a duration formatter
  // everywhere); what was hard-coded in the JSX and now lives here is what JOINS
  // them.
  "recorder.player.time": "{elapsed} / {total}",
  "recorder.player.play": "Écouter",
  "recorder.player.pause": "Pause",
  "recorder.player.delete": "Supprimer cette prise",
  "recorder.player.deleteConfirm": "Supprimer cette prise ?",

  // ---------------------------------------------------- the speaking share

  // The chosen scope, composed by `scopeText` (stats/App.jsx).
  // The floor below which the threshold is stated instead of the value; `{value}`
  // arrives already formatted ("0,1 %").
  "stats.shareBelow": "< {value}",

  "stats.scope.all": "toute la pièce",
  "stats.scope.act": "{act}, en entier",
  // The "one scene" scope has no entry of its own: it is `common.actScene`, shared
  // with Progress, that names the act + scene pair everywhere on the site.

  // The page's only DISPLAY setting.
  "stats.columns": "Mots par ligne",
  "stats.columns.tip":
    "Largeur de la chronologie du dialogue : le même nombre de mots par ligne pour toute la " +
    "pièce, donc des blocs qui se comparent d'une scène à l'autre",

  "stats.highlight": "Mettre un personnage en évidence",

  // Two empty states not to be confused: an empty play is written in Editing, an
  // empty scope is changed by choosing elsewhere. `{all}` reuses the first option
  // of the scope select rather than copy it.
  "stats.emptyScope":
    "Aucune réplique dans cette partie de la pièce : choisissez un autre acte, une autre scène, ou {all}.",

  // The three panel labels are those of the troupe's PDF, word for word: it is the
  // same document, served on screen and kept up to date.
  "stats.words.title": "Distribution du nombre de mots",
  "stats.words.unit": "mots",
  "stats.lines.title": "Distribution du nombre de répliques",
  "stats.lines.unit": "répliques",
  "stats.donutLabel": "{title}, {where} : {total} {unit} au total",

  "stats.timeline.title": "Chronologie du dialogue",
  // How to read the drawing, BEFORE it. "Prise de parole" and not "réplique":
  // neighbouring lines of the same character are merged before the drawing.
  // "Appuyez" and not "cliquez": the page is open to the whole troupe, hence to
  // phones.
  "stats.timeline.caption":
    "Le dialogue se lit ligne par ligne, de haut en bas. Chaque carré est un mot, sa couleur est " +
    "le personnage qui le prononce, donc la taille d'un bloc est la longueur de sa prise de " +
    "parole. Appuyez sur un nom de la barre du haut ou sur une part de camembert pour ne garder " +
    "que ce personnage dans les trois dessins, et de nouveau pour tout remontrer.",
  "stats.timeline.label":
    "Chronologie du dialogue, {where} : chaque carré est un mot, sa couleur est le personnage qui le prononce.",
  "stats.timeline.labelOnly":
    "Chronologie du dialogue, {where} : les mots de {name} seuls sont en couleur.",

  // Two name fallbacks, not one: the bucket of orphan lines never has a name, but a
  // character of the cast may well have none either.
  "stats.unknownCharacter": "Personnage inconnu",
  "stats.unnamedCharacter": "Personnage sans nom",
  "stats.showEveryone": "Montrer tout le monde",
  "stats.showOnly": "Ne montrer que {name}",
  "stats.orphanWarning":
    "Des répliques n'ont pas de personnage valide : elles comptent dans les totaux et " +
    "apparaissent en gris. Le responsable peut leur en assigner un dans la page {page}.",

  // ----------------------------------------------------------- the progress

  // Here it is the coordinator who reads, so the imperative is in order (the
  // troupe's pages, for their part, stay impersonal on the same subject).
  "dashboard.orphans.count": {
    one: "{count} réplique sans personnage valide",
    other: "{count} répliques sans personnage valide",
  },
  "dashboard.orphans":
    "{count} : personne ne peut les enregistrer. Ouvrez la page {page} et assignez-leur un personnage.",
  "dashboard.legend":
    "Chaque cellule indique le nombre de répliques enregistrées sur le total des répliques du " +
    "personnage dans la scène. La colonne à droite des noms résume chaque personnage, la ligne " +
    "sous les numéros de scène résume chaque scène, et la coche verte remplace le compte quand " +
    "il n'en manque plus aucune.",
  // The tooltip and the accessible name of the tick, wherever it is drawn: in a finished
  // cell, in the status column, or before a scene number or an act. It is never written
  // on the page (that column is 44 px wide on a phone), so it is what a screen reader
  // gets in place of a drawing, and what the pointer gets as a tooltip.
  "dashboard.mark.done": "Toutes les répliques sont enregistrées",
  // The names of the grid's two summaries, and they are NEVER written on the screen:
  // neither the status column nor the totals row carries a title (the column is 52 px
  // wide, and a ratio says what it is), so these two go into an `aria-label` on the
  // header cell that names the column and on the one that opens the row. A screen
  // reader then announces "Toute la pièce, Claire, 4 sur 12" instead of a bare figure.
  // The legend under the table says the same thing to whoever reads with their eyes.
  "dashboard.total.play": "Toute la pièce",
  "dashboard.total.cast": "Tous les personnages",
  // The grid's name, and it is NOT written on the screen: the grid needs no title
  // (see the comment above `<Journal>` in dashboard/App.jsx), it needs to be reachable
  // by keyboard and by screen reader, which is what this label is for.
  "dashboard.table": "Avancement par personnage et par scène",

  "dashboard.journal.title": "Derniers dépôts de fichiers",
  "dashboard.journal.region": "Journal des dépôts",
  "dashboard.journal.date": "Date",
  "dashboard.journal.status": "Statut",
  "dashboard.journal.type": "Type",
  "dashboard.journal.detail": "Détail",
  "dashboard.journal.empty":
    "Aucun dépôt pour l'instant : chaque fichier déposé apparaîtra ici, avec ce que l'outil en a fait.",
  // A table that stops without a word reads as "there is nothing more", in the
  // project's only feedback channel.
  // The table's cap, and it counts ROWS, hence files: the log has one row per file
  // and not per upload (an upload of three ZIPs makes three of them). The word
  // "dépôt" said something other than what the number measured, in the project's
  // only feedback channel.
  "dashboard.journal.more": {
    one: "{count} fichier déposé plus ancien non affiché.",
    other: "{count} fichiers déposés plus anciens non affichés.",
  },
  // The detail of a voices row: the file name (in `<code>`) and its number of
  // lines. One entry rather than two pieces juxtaposed in the JSX, where the order
  // of the two and the space between them were frozen: this is the case `<T>` exists
  // to cover, and nothing guarantees that a language puts the file before its
  // count.
  "dashboard.journal.detailVoices": "{file} {count}",

  // A promoted script: its file name, then what the upload CHANGED in the play. Same
  // shape as the voices row just above, two parameters and no fragment in the JSX:
  // the order of the two belongs to the language.
  // This cell showed nothing at all until the Action started comparing the two
  // versions of the script (scripts/script_diff.py): it was the one empty cell of
  // the table.
  "dashboard.journal.detailScript": "{file} {changes}",
  // The counts, each a WHOLE phrase and not a piece of one: the translator is the one
  // who decides whether to repeat the noun or elide it, and the comma that joins them
  // comes from the locale (`fmt.list`), never from the JSX. Plurals come from the
  // engine.
  // Every entry NAMES its noun, and the shorter elided forms ("3 supprimées", "5
  // modifiées") were tried and dropped. They only read when a phrase naming the noun
  // precedes them, and `script_changes` omits its empty fields: the most ordinary
  // promotion of all, a round of typo fixes, publishes `linesEdited` ALONE, and the
  // journal's only cell for that run then read "script.json 5 modifiées", a phrase
  // hanging off nothing in the project's single feedback channel. Repeating the noun
  // costs a longer row when all three fire at once; eliding it costs a sentence with
  // no subject on the common case.
  "dashboard.journal.changeAdded": {
    one: "{count} réplique ajoutée",
    other: "{count} répliques ajoutées",
  },
  "dashboard.journal.changeRemoved": {
    one: "{count} réplique supprimée",
    other: "{count} répliques supprimées",
  },
  // "modifiée" and not "à réenregistrer": the count is measured on normalized text,
  // so it does say the line changed, but a line edited before anyone recorded it asks
  // for nothing extra. The grid above the journal is what says what to redo, play by
  // play.
  "dashboard.journal.changeEdited": {
    one: "{count} réplique modifiée",
    other: "{count} répliques modifiées",
  },
  // This is the one change the site says nowhere else: the clip is keyed by line id,
  // so it stays attached and the grid keeps showing the line green, in the previous
  // character's voice.
  "dashboard.journal.changeReassigned": {
    one: "{count} réplique change de personnage",
    other: "{count} répliques changent de personnage",
  },
  // The cast is counted apart because no line count reveals it: twelve lines handed
  // to a new role read as "+12" and nothing else.
  "dashboard.journal.changeCastAdded": {
    one: "{count} personnage ajouté",
    other: "{count} personnages ajoutés",
  },
  "dashboard.journal.changeCastRemoved": {
    one: "{count} personnage supprimé",
    other: "{count} personnages supprimés",
  },
  "dashboard.journal.changeCastRenamed": {
    one: "{count} personnage renommé",
    other: "{count} personnages renommés",
  },
  // The title and the language of the play: one of each, so a flag and not a count
  // (`changesOf` reads the type of the value). The language is the one the play is
  // WRITTEN in, not the interface's: it drives the PDF and the synthetic voice, which
  // is why it is reported.
  "dashboard.journal.changeTitle": "titre modifié",
  "dashboard.journal.changeLanguage": "langue de la pièce modifiée",
  // The safety net, and it only ever speaks alone: something moved in the script (a
  // character colour, an added scene, a line moved, some punctuation) that none of the
  // mentions above covers. It is what stops "aucun changement" from being a lie, and
  // an expensive one: the coordinator would conclude their upload failed.
  "dashboard.journal.changeOther": "autres retouches",
  // The birth of the play, first item of the enumeration: a script that creates its
  // play fills it in the same gesture, and the row then reads "pièce créée, 120
  // répliques ajoutées". A play born from a title has nothing to count, and that lone
  // mention is what keeps its row from being blank.
  "dashboard.journal.changeCreated": "pièce créée",
  // The upload changed nothing: we SAY so. That is the whole point of this detail, an
  // empty cell reading as "the tool has no idea what became of your file".
  "dashboard.journal.changeNone": "aucun changement",

  // The detail of a failure. `{reason}` is the reason returned by the Action, still
  // French because those strings are DATA and not interface text: translating them
  // would only swap one hardcoded language for another (see the "known gap" note in
  // CLAUDE.md, whose fix is error CODES the front translates). So the sentence is
  // mixed in English, and that is accepted for now. It is an entry all the same, so
  // that the order of the file name and the reason stays the translator's.
  "dashboard.journal.detailError": "{file} {reason}",
  "dashboard.journal.ok": "réussi",
  "dashboard.journal.failed": "échoué",
  "dashboard.journal.unknownDate": "date inconnue",

  // The TYPE of the uploaded file, not the page whose seal carries the colours.
  "dashboard.kind.voix": "Voix",
  "dashboard.kind.script": "Script",
  "dashboard.kind.inconnu": "Autre",

  // The coloured group of words of the upload tile is a parameter: it carries the
  // colour of its page, and French as much as English keeps its own word order.
  "dashboard.upload": "Déposer les {voices}",
  "dashboard.upload.voices": "voix {format}",

  // "la pièce à imprimer" and not "le script de la pièce": the upload tile of the
  // Editing page says "script de la pièce", and two labels sharing their group of
  // words were told apart by the acronym alone (the Editing tile names no format,
  // producing the file rather than pointing at one, so there the acronym is not even
  // there to tell them apart).
  // Same shape as `dashboard.upload` above and as `editor.upload`: a sentence whose
  // coloured group of words names the FILE, so the three tiles of the site read the
  // same way. `{play}` carries "(PDF)" with it, as "voix" carries "(ZIP)".
  "dashboard.pdf": "Télécharger la {play}",
  "dashboard.pdf.play": "pièce à imprimer {format}",
  // The name of the downloaded file when the play's title leaves nothing after
  // cleaning: "script.pdf" says nothing in a downloads folder, but it is better
  // than nothing.
  "dashboard.pdfSlug": "script",

  // -------------------------------------------------------------------- home

  "home.footer": "Un outil libre pour les troupes de théâtre, {link}",
  // The site's only link that leaves a play, at the foot of its home. It says
  // "changer" and not "retour": you are not going back where you came from, you are
  // going to choose something else, and that is just as true for whoever opened the
  // play from a bookmark.
  "home.changePlay": "Changer de pièce",

  // ------------------------------------------------------- choosing a play

  // The two ROOT pages, the ones that live above the plays: the troupe's chooser
  // (index.html) and the coordinator's play management page (respo.html). These are
  // not play pages: they have neither a seal nor a doc sentence, they carry the
  // brand, and their label only ever serves the browser tab.
  "chooser.label": "Pièces",
  "manage.label": "Gestion des pièces",

  "chooser.heading": "Choisissez une pièce",
  "chooser.empty": "Aucune pièce pour l'instant. Le responsable en créera une.",
  // The FAILURE, distinct from the empty state: a 404 is a legitimate emptiness (the
  // index has not been built yet), everything else is a failure, and announcing it
  // as "no plays" would tell the troupe its plays have vanished. The same
  // distinction as everywhere else on the site (see `HttpError` in data.js).
  "chooser.loadError":
    "Impossible de charger la liste des pièces. Le site n'est peut-être pas encore " +
    "publié : réessayez dans quelques minutes ou contactez le responsable.",
  // What a card says about its play: how many roles it hands out, how long it is. The
  // number is a parameter, hence formatted by the engine ("12 340" and "12,340"
  // without anyone having to see to it), and the plural is the engine's too.
  // "personnages" and never "acteurs": it is the word of script.json, and the same
  // word the Speaking share page uses (cf. `page.stats.desc`).
  "chooser.characters": {
    one: "{count} personnage",
    other: "{count} personnages",
  },
  "chooser.words": {
    one: "{count} mot",
    other: "{count} mots",
  },
  // A play created but not yet written: the figures would have nothing to say, and
  // "0 %" would read as a delay when it is a beginning.
  "chooser.emptyPlay": "Pièce encore vide",

  "manage.heading": "Vos pièces",
  "manage.empty": "Aucune pièce pour l'instant : créez la première ci-dessous.",
  // The ONE thing a management card says that a troupe's card does not: the recorded
  // share, the coordinator's own question, asked of every play at once. The share
  // arrives already written (`formatShare`, which holds the rounding and the "< 0,1 %"
  // threshold it shares with the Speaking share page's legend), like the figure of
  // `stats.shareBelow`: the catalogue receives it, it does not format it.
  "manage.recorded": "{share} des répliques enregistrées",

  "manage.new.title": "Nouvelle pièce",
  // The three stages of the gesture, in the order they are done: it is the site's
  // only doc sentence that describes a three-step journey, and it has to, the play
  // only existing once the file has been uploaded and processed.
  // Two sentences, like every doc sentence on the site, and no colon: it is reserved
  // for an enumeration here.
  // The GitHub button is not named here, only in the file the next step opens
  // (`manage.new.fileNote`): this sentence is read BEFORE GitHub opens, so a label to
  // look for would arrive too early to be of any use.
  // What the file CONTAINS is not said either: the coordinator has nothing to do with
  // it, GitHub hands it to them already written, and the file explains itself once it is
  // open (`manage.new.fileNote`). Naming the format here would put a word of plumbing
  // into the only sentence that has to be followed.
  // The DELAY is said, on the other hand, and it is the one thing this block cannot
  // leave out: the play does not appear on commit, it appears once the Action has run,
  // and a coordinator who reloads this page onto the same list concludes the gesture
  // failed.
  "manage.new.hint":
    "Donnez un titre, puis créez la pièce. Confirmez l'enregistrement sur GitHub, et " +
    "la pièce apparaîtra ici dans quelques minutes.",
  "manage.new.label": "Titre de la pièce",
  "manage.new.create": "Créer la pièce",
  // What the coordinator READS in GitHub's text box, written into the file itself under
  // the separator line, where the Action stops reading. A box holding one bare word
  // explains nothing, and this is the only screen of the whole journey the site does not
  // own: it can put a sentence there, so it does.
  // Two sentences and no more: the gesture that finishes the job, and what to expect
  // afterwards. The title is not asked for, it is already on the line above, and saying
  // "add nothing" invited reading the box as a form to fill in.
  // The GitHub button is NAMED, where `manage.new.hint` only describes it, and it is
  // named in the reader's language like everything else in this catalogue: github.com is
  // translated too, and the company that reads the site in French reads its GitHub in
  // French. It is the only label of another site this catalogue carries, so it is also
  // the only line to fix should GitHub word it differently.
  // The line breaks are DATA here, and this is the only entry of either catalogue where
  // they are: everywhere else a string is one paragraph and the wrapping belongs to the
  // renderer. This one is written into a file, read in GitHub's editor, which wraps
  // nothing: as one long line it reads as a wall. So the source lines below are the
  // file's lines, and they are kept short enough to be read in that box.
  "manage.new.fileNote":
    "Cliquez simplement sur le bouton vert « Valider les modifications ».\n" +
    "La nouvelle pièce, dont le titre est écrit au-dessus, sera en ligne\n" +
    "dans quelques minutes.",
  "manage.new.emptyTitle": "Donnez un titre à la pièce.",
  "manage.new.badTitle":
    "Ce titre ne laisse aucune adresse utilisable : ajoutez-y des lettres ou des chiffres.",
  // The test is on the ADDRESS derived from the title and not on the title itself:
  // two different titles can reduce to the same identifier ("L'École des femmes" and
  // "L École des femmes"), and a message that talks about the title would then
  // describe something untrue.
  "manage.new.taken": "Une pièce occupe déjà cette adresse : changez un mot du titre.",

  // The log of the uploads no play has claimed. It is only shown when it carries
  // something: it is a record of anomalies and not the upload log, which lives in
  // each play's Progress page.
  "manage.unrouted.title": "Dépôts sans pièce",
  "manage.unrouted.hint":
    "Ces fichiers n'ont pas dit à quelle pièce ils appartiennent. Déposez-les depuis le bouton de dépôt de leur pièce.",
};
