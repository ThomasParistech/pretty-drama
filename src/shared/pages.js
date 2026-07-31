import {
  ChecklistIcon,
  DialogueIcon,
  MasksIcon,
  MicIcon,
  PieIcon,
  QuillIcon,
} from "./icons.jsx";

// The identity of each page: its link and its "seal" (the icon reused in the
// header, on the home cards and in the favicon). Colours live in CSS, in the
// `.page-<key>` classes of src/shared/theme.css, which carry --page-mark.
//
// STRUCTURE ONLY: the words have moved out. A page label is `page.<key>.label`
// and its compact doc sentence is `page.<key>.desc`, both in
// src/shared/locales/. The writing doctrine for those two now lives there, next
// to the text it governs, and a guard in scripts/tests/test_contracts.py checks
// that every key here has both.
//
// The one-sentence-two-places rule still holds and now costs nothing: the home
// card and the first line of the page header (which PlayHeader renders itself)
// read the SAME `desc` key, so a card cannot promise one thing while the header
// says another.
export const PAGES = {
  home: {
    href: "./index.html",
    Icon: MasksIcon,
  },
  rehearsal: {
    href: "./rehearsal.html",
    Icon: DialogueIcon,
  },
  recorder: {
    href: "./recorder.html",
    Icon: MicIcon,
  },
  stats: {
    href: "./stats.html",
    Icon: PieIcon,
  },
  dashboard: {
    href: "./dashboard.html",
    Icon: ChecklistIcon,
  },
  editor: {
    href: "./editor.html",
    Icon: QuillIcon,
  },
};

// The catalogue keys of a page, so no caller builds them by hand and the CI guard
// has a single shape to look for.
export function pageLabelKey(page) {
  return `page.${page}.label`;
}

export function pageDescKey(page) {
  return `page.${page}.desc`;
}

// Two homes, the same component, two lists of cards. `index.html` is the address
// handed to the troupe: it offers ONLY the actors' pages, so that an actor never
// lands on the editor (from where the play's script is downloaded) nor on the
// progress page. `respo.html` is the full home, known to the coordinator alone: no
// page links to it from `index.html`, it gets bookmarked.
export const ACTOR_CARDS = ["rehearsal", "recorder", "stats"];

// Three columns: the troupe on top (rehearse, record, compare), the coordinator
// below (write, follow), centred underneath. The row therefore says who the page
// is meant for, which is what the 2x2 square said before Speaking share joined the
// pages open to everyone.
export const RESPO_CARDS = ["rehearsal", "recorder", "stats", "editor", "dashboard"];

// The home the header's brand links back to: the coordinator's pages return to
// THEIR home, otherwise a round trip Editing -> brand -> Home would make them lose
// the way to the editor.
const RESPO_ONLY = new Set(["editor", "dashboard"]);

// THE PLAY's home, next door to the current page: the seven pages of a play live in
// the same folder (`plays/<id>/`), so this link stays a plain relative href, exactly
// as it was back when the site only knew one play.
export function homeHref(page) {
  return RESPO_ONLY.has(page) ? "./respo.html" : "./index.html";
}

// The path of a play page, seen from the ROOT: the only place in the front end that
// writes out the `plays/<id>/<page>.html` layout. The two root pages are the only
// ones that need it (their play cards), and each named it on its own side, hence in
// two places from which the layout could drift.
export function playHref(playId, page) {
  return `./plays/${playId}/${page}.html`;
}

// The ONLY link on the site that leaves a play, and therefore the only place that
// knows the depth of a play page: the two root pages are two levels above
// (`plays/<id>/rehearsal.html` -> `../../index.html`). It lives only at the foot of a
// play's home, never on the five other pages: you switch play by going back through
// the home, just as you switch language by going back through the entrance.
export function chooserHref(page) {
  return RESPO_ONLY.has(page) ? "../../respo.html" : "../../index.html";
}
