// English catalogue. Mirrors fr.js key for key, which locales/parity.test.js
// enforces, along with the placeholders of each entry: a `{count}` lost in
// translation is exactly the kind of mistake nothing else would catch.
//
// Not a literal translation where a literal translation would be worse. Two
// standing examples, both of them French-only overhead:
//   - no space before `?`, `!` or `:`, and straight double quotes instead of
//     guillemets (the engine's `fmt.quote` carries this for quoted user text);
//   - "la couleur X" exists in French only to dodge elision and gender
//     agreement; English says "the X colour" or simply the name.
//
// Wording follows the same form as the French: an imperative verb first, about
// ten words, two sentences at the most. Same rule as the rest of the repo, no em
// dash: use a colon, a semicolon, a comma, brackets, or one more sentence.
export const EN = {
  // ------------------------------------------------------------------ common

  // English puts no space before the colon.
  "common.docTitle": "PrettyDrama: {page}",

  "common.language": "Language",
  "common.homeLink": "PrettyDrama home",
  "common.headerToggle": "Expand or collapse the header",
  "common.progressPosition": "Position in the dialogue",
  // Button labels shared by several modals. They live here and not in their page
  // because they sit next to "Cancel" in the same row: translating only one of
  // the two produced "Supprimer" beside "Cancel".
  "common.delete": "Delete",
  "common.dragHandle": "Drag to move",
  "editor.leaveSave": "Download, then leave",
  "editor.deleteCharacterLines": "Delete their lines",
  "editor.reassign": "Reassign",
  "recorder.leaveSave": "Download the ZIP, then leave",
  "search.replace": "Replace",
  "stats.scopeAllOption": "The whole play",
  "stats.scopeActOption": "The whole act",

  "common.cancel": "Cancel",
  "common.leaveAnyway": "Leave anyway",

  // The title of any delete confirmation about a NAMED thing (an act, a scene, a
  // character): the name arrives already wrapped in the locale's quotes
  // (`fmt.quote`).
  "common.deleteConfirm": "Delete {name}?",

  // The accessible name of the two scope selects, shared by Rehearsal,
  // Recording and Speaking share: the BARE word, with no rank ("Act I" is
  // `structure.act`).
  "common.actSelect": "Act",
  "common.sceneSelect": "Scene",
  "common.myCharacter": "My character",
  "common.whoDoYouPlay": "Who are you playing?",
  "common.prevMyLine": "My previous line",
  "common.nextMyLine": "My next line",

  "common.untitledPlay": "Untitled play",

  "common.loadingPlay": "Loading the play…",
  "common.loadingScript": "Loading the script…",

  // "le responsable" is rendered "the coordinator" throughout: it is the neutral,
  // non-hierarchical term, and it must NOT become "your coordinator", the French
  // avoiding that possessive for the same reason.
  "common.manifestError":
    "The play could not be loaded. The site may not be published yet: " +
    "try again in a few minutes, or ask the coordinator.",

  // A bare line count, composed into the sentences below. Note "0 lines", which
  // the hand-rolled `n > 1 ? "s" : ""` this replaces got wrong in English (and
  // right in French, where zero is singular).
  "common.lineCount": {
    one: "{count} line",
    other: "{count} lines",
  },

  "common.optionNote": " ({note})",

  "common.actScene": "{act}, {scene}",

  "common.format.zip": "(ZIP)",
  "common.format.pdf": "(PDF)",

  "common.myLineNumber": " ({n}/{total})",

  // `{page}` is the Editing page's name, INTERPOLATED from `page.editor.label`
  // and never copied: six entries per catalogue name it. Note the word order
  // differs from the French ("in the Editing page" against "dans la page
  // Édition"), which is exactly why the name is a parameter rather than a
  // fragment glued on in the component.
  "common.noCharacters":
    "No characters yet: the play has to be written in the {page} page first.",

  // The other empty state of those same grids: a play can carry its whole cast and
  // not a single scene. See the French entry for why it lives in `common.`.
  "common.emptyPlay": "No lines in the play: it has to be written in the {page} page first.",

  // Key names as they are printed on the reader's keyboard.
  "common.keyEnter": "Enter",
  "common.keyShiftEnter": "Shift + Enter",

  // ----------------------------------------------------------------- the pages

  "page.home.label": "Home",
  "page.respo.label": "Coordinator home",

  "page.rehearsal.label": "Rehearsal",
  // "répéter à l'italienne" is a French theatre term for running the lines
  // without staging. "Run your lines" is the English idiom for it, not a literal
  // translation of the phrase.
  "page.rehearsal.desc": "Run your lines with the real voices of the cast.",

  "page.recorder.label": "Recording",
  "page.recorder.desc": "Record your lines, then send the file to the coordinator.",

  // NOT "Distribution", which is a false friend: French "la distribution" is the
  // cast, so an English reader would expect a cast list here.
  "page.stats.label": "Speaking share",
  "page.stats.desc":
    "See how the speaking is divided between the characters, in words and in lines, scene by scene.",

  "page.dashboard.label": "Progress",
  "page.dashboard.desc":
    "Follow how the recordings are going, and upload the voice files you receive.",

  "page.editor.label": "Editing",
  "page.editor.desc": "Edit the play: characters, acts, scenes and lines.",

  // ------------------------------------------------------------- the structure

  // Acts and scenes have no stored title: these are derived from their rank (see
  // structureLabels.js). `{n}` is a roman numeral for an act and a digit for a
  // scene, the convention of the printed script.
  "structure.act": "Act {n}",
  "structure.scene": "Scene {n}",

  "recorder.optionDone": " ✓",

  "structure.moveAct": "Move {act}",
  "structure.moveScene": "Move {scene}",
  "structure.openScene": "Open this scene",
  "structure.deleteAct": "Delete this act",
  "structure.deleteAct.named": "Delete {act}",
  "structure.deleteScene": "Delete this scene",
  "structure.deleteScene.named": "Delete {scene}",

  "structure.playTitle": "Play title",
  "structure.addAct": "+ Act",
  "structure.addScene": "+ Scene",
  "structure.deleteLines": {
    one: "{count} line will be deleted.",
    other: "{count} lines will be deleted.",
  },

  // The language the PLAY is written in, chosen in the Structure section of the
  // rail. A different axis from the reader's UI locale: it drives the PDF and the
  // synthetic voice that stands in for an unrecorded line.
  "structure.language": "Language of the play",
  "structure.language.fr": "French",
  "structure.language.en": "English",

  // -------------------------------------------------------------- the rail

  "rail.label": "Structure, characters and search",
  "rail.width": "Panel width",
  "rail.structure": "Structure",
  "rail.structure.tip": "The play's title, acts and scenes",
  "rail.characters": "Characters",
  "rail.characters.tip": "The characters of the play",
  "rail.search": "Search",
  "rail.search.tip": "Search the lines (Ctrl+F)",

  // ------------------------------------------------------------------- editing

  "editor.noPublishedScript": "No published script found: you are starting from an empty play.",
  "editor.readError":
    "The published script exists but could not be read (damaged file, or a network problem). " +
    "So that your play cannot be overwritten, the editor is disabled. " +
    "Reload the page to try again; if the error persists, this play's script is probably damaged " +
    "in the repository; on GitHub, open the file history, pick an earlier version and view it raw, " +
    "then upload it again before carrying on.",
  "editor.touchOnly": "For practical reasons, {page} is only available on a computer.",

  "editor.hintTyping": "Inside a line, {enter} creates the next one, {shiftEnter} a line break.",
  "editor.hintUpload":
    "Once your changes are done, click the button at the top of the page to update the play.",

  "editor.dirty": "Changes not saved",
  "editor.undo": "Undo",
  "editor.undo.tip": "Undo the last change (Ctrl+Z)",
  "editor.undo.none": "Nothing to undo yet",
  "editor.redo": "Redo",
  "editor.redo.tip": "Redo the undone change (Ctrl+Y)",
  "editor.redo.none": "Nothing to redo yet",
  "editor.upload": "Update the {script}",
  "editor.upload.script": "script of the play",
  "editor.upload.tip": "Download the script, then upload it on GitHub",
  "editor.upload.none": "No changes to upload yet",

  // The box that announces the gesture, BEFORE it happens: hence the future tense
  // throughout, and the order of the two halves is the order they will come in.
  // `{file}` arrives as code, like in `editor.leaveBody`. It has no title of its own:
  // the box wears the tile's label (see the French entry).
  // "Commit changes" is the name GitHub prints on that green button in English, kept
  // verbatim for the same reason the French entry keeps the French one: it is a button
  // on a page we do not own, and it has to be found by its name.
  "editor.uploadNotice.body":
    "The {file} file will be downloaded, then GitHub will open in another tab: drag the file " +
    "in and press the green \"Commit changes\" button.{br}" +
    "The update will then take a few minutes.",
  "editor.uploadNotice.go": "Continue",

  "editor.leaveTitle": "You have not downloaded the script",
  "editor.leaveBody":
    "Your changes only live in this tab: leaving the page without downloading the {file} file " +
    "loses them.",

  // "them" for the character, whose gender the play does not tell us.
  "editor.deleteCharacterBody": "This character still has {count}. What should happen to them?",
  "editor.reassignTo": "Reassign to:",

  // ---------------------------------------------------------------- characters

  "characters.empty": "No characters yet:",
  "characters.namePlaceholder": "Character name",
  "characters.add": "+ Character",
  "characters.rename": "Rename",
  "characters.changeColor": "Change the colour",
  "characters.changeColorOf": "Change the colour of {name}",
  "characters.delete": "Delete this character",
  "characters.deleteNamed": "Delete {name}",
  // English needs neither the article nor the noun the French has to carry: the
  // colour name stands on its own.
  "characters.colorCurrent": "{color}, current colour",
  "characters.colorChoose": "Choose {color}",

  // The twenty palette names (Tableau 10, then its ten light tints), in the order
  // of `CHARACTER_COLORS`. British spelling throughout, as in the rest of this
  // catalogue.
  "color.blue": "Blue",
  "color.orange": "Orange",
  "color.green": "Green",
  "color.red": "Red",
  "color.purple": "Purple",
  "color.brown": "Brown",
  "color.pink": "Pink",
  "color.grey": "Grey",
  "color.olive": "Olive",
  "color.cyan": "Cyan",
  "color.blueLight": "Light blue",
  "color.orangeLight": "Light orange",
  "color.greenLight": "Light green",
  "color.redLight": "Light red",
  "color.purpleLight": "Light purple",
  "color.brownLight": "Light brown",
  "color.pinkLight": "Light pink",
  "color.greyLight": "Light grey",
  "color.oliveLight": "Light olive",
  "color.cyanLight": "Light cyan",

  // ------------------------------------------------------- lines and scenes

  "line.character": "Character of the line",
  "line.characterUnset": "Character?",
  "line.placeholder": "Line text…",
  "line.delete": "Delete this line",
  "line.deleteConfirm": "Delete this line?",

  "scene.insert": "+ insert",
  "scene.firstLine": "Write the first line: the next ones are created with the Enter key.",
  "scene.needCharacter":
    "Add a character first (the {section} icon in the rail, on the left) to be able to write lines.",

  // ------------------------------------------------- search and replace

  "search.caseSensitive": "Match case",
  "search.caseSensitive.tip": "“Marie” no longer finds “marie”.",
  // The French example turns on "art" inside "partie"; the English one needs its
  // own pair, since neither word behaves the same way.
  "search.wholeWord": "Whole word",
  "search.wholeWord.tip": "“art” no longer finds “apart”.",
  "search.showReplace": "Show the replacement field (Ctrl+H)",
  "search.hideReplace": "Hide the replacement field",
  "search.placeholder": "Search",
  "search.label": "Search the lines",
  "search.replacePlaceholder": "Replace with",
  "search.replaceCurrent.tip": "Replace the current match",
  "search.pickFirst": "Pick a match first",
  "search.noneToReplace": "No match to replace",
  "search.replaceAll": "Replace all",
  "search.replaceAll.tip": "Replace {matches} in the whole play",
  "search.matchCount": {
    one: "{count} match",
    other: "{count} matches",
  },
  "search.sceneCount": {
    one: "{count} scene",
    other: "{count} scenes",
  },
  "search.count": "{matches} in {scenes}",
  "search.none": "No match",
  "search.prev": "Previous match",
  "search.prev.tip": "Previous match (Shift+Enter)",
  "search.next": "Next match",
  "search.next.tip": "Next match (Enter)",
  "search.noneToBrowse": "No match to browse",
  "search.replaceAllTitle": "Replace {matches}?",
  "search.replaceAllInto": "In {scenes} of the play: {query} becomes {replacement}.",
  "search.replaceAllDelete": "In {scenes} of the play: {query} will be removed.",

  // ------------------------------------------------------------- rehearsal

  "rehearsal.emptyPlay":
    "The play is empty for now. The coordinator has to write it in the {page} page first.",

  // The label says what the box DOES, the tooltip says why.
  "rehearsal.mute": "Mute my voice",
  "rehearsal.mute.tip": "My lines are not played back: I say them myself",
  "rehearsal.hideText": "Hide my text",
  "rehearsal.hideText.tip": "Blur the text of my own lines",
  "rehearsal.beep": "Beep before my line",
  "rehearsal.beep.tip": "A beep announces each of my lines",
  "rehearsal.cueEarly": "Start one line before mine",
  "rehearsal.cueEarly.tip":
    "The “my line” arrows stop on the line that cues me, not on mine",

  "rehearsal.tts": "synthetic voice",
  "rehearsal.tts.tip": "No real voice yet",
  "rehearsal.yourTurn": "Your turn…",
  "rehearsal.prevLine": "Previous line",
  "rehearsal.nextLine": "Next line",
  "rehearsal.playPause": "Play / pause",

  // ------------------------------------------------------------- recording

  "recorder.unsupported":
    "Your browser cannot record sound. Try a recent version of Chrome, Firefox or Safari.",
  "recorder.micError":
    "The microphone could not be reached. Check that you have allowed the microphone for this site.",
  "recorder.hint":
    "Move to one of your lines, then press the mic to record it. When you are done (all your " +
    "lines, or only some of them), download the file.",

  "recorder.notSaved": "Your recordings are NOT saved until you have downloaded the file.",
  "recorder.downloadedNote": "File downloaded. Send it to the coordinator.",
  "recorder.noLinesInScene": "You have no lines in this scene.",

  "recorder.status.todo": "To record",
  "recorder.status.fresh": "To download",
  "recorder.status.done": "Already recorded",
  "recorder.recording": "Recording…",
  "recorder.recordingLabel": "Recording",

  "recorder.record": "Record this line (the mic starts straight away)",
  "recorder.stop": "Finish the recording",
  "recorder.downloadZip": "Download the ZIP of your takes",
  "recorder.downloadZipCount": "Download the ZIP of your takes ({count})",
  "recorder.downloadCount": "({count})",
  "recorder.lineCounter": "{n}/{total}",
  "recorder.zipName": "voices-{names}",
  "recorder.zipFallback": "takes",
  "recorder.characterSlug": "character",

  "recorder.leaveTitle": "Your takes are not downloaded",
  "recorder.leaveBody": {
    one:
      "Your take only lives in this tab: leaving the page without downloading the ZIP means " +
      "recording everything again.",
    other:
      "Your takes only live in this tab: leaving the page without downloading the ZIP means " +
      "recording everything again.",
  },

  "recorder.intro.lead": "Choose your character: the page will then bring {your} lines forward.",
  "recorder.intro.leadEmphasis": "your",
  "recorder.intro.step1": "Move to one of your lines and press the mic: it starts straight away.",
  "recorder.intro.step2": "Listen back, redo the take if you need to, then move on to the next one.",
  "recorder.intro.outro":
    "When you are done (one character or several, or even only some of your lines), press the " +
    "{icon} button to save your takes and send them to the coordinator.",
  "recorder.intro.allDone": "all recorded",

  "recorder.noLines": "no lines",
  "recorder.toRecord": "{count} to record",

  "recorder.player.time": "{elapsed} / {total}",
  "recorder.player.play": "Play",
  "recorder.player.pause": "Pause",
  "recorder.player.delete": "Delete this take",
  "recorder.player.deleteConfirm": "Delete this take?",

  // ---------------------------------------------------- the speaking share

  // The chosen scope, composed by `scopeText` (stats/App.jsx).
  // The floor below which the threshold is shown instead of the value;
  // `{value}` arrives already formatted ("0.1%").
  "stats.shareBelow": "< {value}",

  "stats.scope.all": "the whole play",
  "stats.scope.act": "{act}, in full",

  "stats.columns": "Words per line",
  "stats.columns.tip":
    "Width of the dialogue timeline: the same number of words per line for the whole play, so " +
    "blocks compare from one scene to the next",

  "stats.highlight": "Highlight a character",

  "stats.emptyScope":
    "No lines in this part of the play: choose another act, another scene, or {all}.",

  "stats.words.title": "Distribution of the word count",
  "stats.words.unit": "words",
  "stats.lines.title": "Distribution of the line count",
  "stats.lines.unit": "lines",
  "stats.donutLabel": "{title}, {where}: {total} {unit} in total",

  "stats.timeline.title": "Dialogue timeline",
  // "turn" rather than "line": consecutive lines of the same character are
  // merged before the drawing, so one block can be several lines of the script.
  "stats.timeline.caption":
    "The dialogue reads line by line, from top to bottom. Each square is a word, its colour is " +
    "the character who speaks it, so the size of a block is the length of that turn. Press a " +
    "name in the bar at the top, or a pie slice, to keep only that character in the three " +
    "drawings, and press again to show everyone.",
  "stats.timeline.label":
    "Dialogue timeline, {where}: each square is a word, its colour is the character who speaks it.",
  "stats.timeline.labelOnly":
    "Dialogue timeline, {where}: only the words of {name} are in colour.",

  "stats.unknownCharacter": "Unknown character",
  "stats.unnamedCharacter": "Unnamed character",
  "stats.showEveryone": "Show everyone",
  "stats.showOnly": "Show only {name}",
  "stats.orphanWarning":
    "Some lines have no valid character: they count towards the totals and show up in grey. The " +
    "coordinator can assign one in the {page} page.",

  // ----------------------------------------------------------- the progress

  "dashboard.orphans.count": {
    one: "{count} line with no valid character",
    other: "{count} lines with no valid character",
  },
  "dashboard.orphans":
    "{count}: nobody can record them. Open the {page} page and assign them a character.",
  "dashboard.legend":
    "Each cell gives the number of recorded lines out of the character's total lines in that " +
    "scene. The column beside the names sums up each character, the row under the scene numbers " +
    "sums up each scene, and the green tick replaces the count once none are missing any more.",
  "dashboard.mark.done": "All the lines are recorded",
  "dashboard.total.play": "Whole play",
  "dashboard.total.cast": "All the characters",
  "dashboard.table": "Progress by character and by scene",

  "dashboard.journal.title": "Latest file uploads",
  "dashboard.journal.region": "Upload log",
  "dashboard.journal.date": "Date",
  "dashboard.journal.status": "Status",
  "dashboard.journal.type": "Type",
  "dashboard.journal.detail": "Detail",
  "dashboard.journal.empty":
    "No uploads yet: every file you upload will appear here, with what the tool made of it.",
  "dashboard.journal.more": {
    one: "{count} older uploaded file not shown.",
    other: "{count} older uploaded files not shown.",
  },
  "dashboard.journal.detailVoices": "{file} {count}",

  // A promoted script: its file name, then what the upload CHANGED in the play. Same
  // two-parameter shape as the voices row above, so the order stays the translator's.
  "dashboard.journal.detailScript": "{file} {changes}",
  // Each count is a WHOLE phrase, joined by `fmt.list` (the comma is the locale's).
  // Every entry names its noun: the shorter elided forms ("3 removed", "5 edited")
  // only read when a phrase naming the noun precedes them, and `script_changes` omits
  // its empty fields, so a round of typo fixes publishes `linesEdited` alone and the
  // row read "script.json 5 edited". Plurals come from the engine, hence the
  // { one, other } pairs.
  "dashboard.journal.changeAdded": {
    one: "{count} line added",
    other: "{count} lines added",
  },
  "dashboard.journal.changeRemoved": {
    one: "{count} line removed",
    other: "{count} lines removed",
  },
  // "edited" and not "to record again": the count is measured on normalized text, so it
  // does say the line changed, but a line edited before anyone recorded it asks for
  // nothing extra. The grid above the journal is what says what to redo.
  "dashboard.journal.changeEdited": {
    one: "{count} line edited",
    other: "{count} lines edited",
  },
  // This is the one change the site says nowhere else: the clip is keyed by line id, so
  // it stays attached and the grid keeps the line green, in the previous character's
  // voice.
  "dashboard.journal.changeReassigned": {
    one: "{count} line changes character",
    other: "{count} lines change character",
  },
  // The cast is counted apart because no line count reveals it: twelve lines handed to a
  // new role read as "+12" and nothing else.
  "dashboard.journal.changeCastAdded": {
    one: "{count} character added",
    other: "{count} characters added",
  },
  "dashboard.journal.changeCastRemoved": {
    one: "{count} character removed",
    other: "{count} characters removed",
  },
  "dashboard.journal.changeCastRenamed": {
    one: "{count} character renamed",
    other: "{count} characters renamed",
  },
  // One title and one language, so a flag rather than a count (`changesOf` reads the
  // type of the value). The language is the one the play is WRITTEN in, not the
  // interface's: it drives the PDF and the synthetic voice, which is why it is reported.
  "dashboard.journal.changeTitle": "title changed",
  "dashboard.journal.changeLanguage": "language of the play changed",
  // The safety net, and it only ever speaks alone: something moved in the script (a
  // character colour, an added scene, a line moved, some punctuation) that none of the
  // mentions above covers. It is what stops "no change" from being a lie, and an
  // expensive one: the coordinator would conclude their upload failed.
  "dashboard.journal.changeOther": "other edits",
  "dashboard.journal.changeCreated": "play created",
  "dashboard.journal.changeNone": "no change",
  // `{reason}` comes from the Action and stays French: the REPOSITORY is French,
  // and the coordinator reads their own repository, not a locale. A mixed
  // sentence here is deliberate.
  "dashboard.journal.detailError": "{file} {reason}",
  "dashboard.journal.ok": "succeeded",
  "dashboard.journal.failed": "failed",
  "dashboard.journal.unknownDate": "unknown date",

  "dashboard.kind.voix": "Voices",
  "dashboard.kind.script": "Script",
  "dashboard.kind.inconnu": "Other",

  "dashboard.upload": "Upload the {voices}",
  "dashboard.upload.voices": "voices {format}",

  "dashboard.pdf": "Download the {play}",
  "dashboard.pdf.play": "play for printing {format}",
  "dashboard.pdfSlug": "script",

  // -------------------------------------------------------------------- home

  "home.footer": "A free tool for theatre companies, {link}",
  "home.changePlay": "Switch play",

  // ------------------------------------------------------- choosing a play

  "chooser.label": "Plays",
  "manage.label": "Manage plays",

  "chooser.heading": "Choose a play",
  "chooser.empty": "No plays yet. The coordinator will create one.",
  "chooser.loadError":
    "The list of plays could not be loaded. The site may not be published yet: " +
    "try again in a few minutes, or ask the coordinator.",
  "chooser.characters": {
    one: "{count} character",
    other: "{count} characters",
  },
  "chooser.words": {
    one: "{count} word",
    other: "{count} words",
  },
  "chooser.emptyPlay": "Play still empty",

  "manage.heading": "Your plays",
  "manage.empty": "No plays yet: create the first one below.",
  "manage.recorded": "{share} of lines recorded",

  "manage.new.title": "New play",
  // The GitHub button is described and never quoted, on this side too: github.com
  // follows the language of the reader's own account, so the label they see is not ours
  // to name (cf. the note in fr.js).
  "manage.new.hint":
    "Give it a title, then create the play. Confirm the commit on GitHub, and the " +
    "play shows up here within a few minutes.",
  "manage.new.label": "Title of the play",
  "manage.new.create": "Create the play",
  // Written into the file itself, under the separator line where the Action stops
  // reading: it is what the coordinator sees in GitHub's text box, and its line breaks
  // are data (see fr.js, which also carries why the button is named here and not in
  // `manage.new.hint`). The button keeps its English label on this side, which is the
  // same rule as the French one: GitHub is read in the reader's language.
  "manage.new.fileNote":
    'Just click the green "Commit changes" button.\n' +
    "The new play, whose title is written above, will be online\n" +
    "in a few minutes.",
  "manage.new.emptyTitle": "Give the play a title.",
  "manage.new.badTitle": "This title leaves no usable address: add letters or digits to it.",
  "manage.new.taken": "A play already uses this address: change a word of the title.",

  "manage.unrouted.title": "Uploads with no play",
  "manage.unrouted.hint":
    "These files did not say which play they belong to. Upload them from their own play's upload button.",
};
