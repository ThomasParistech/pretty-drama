import {
  ChecklistIcon,
  DialogueIcon,
  MasksIcon,
  MicIcon,
  PieIcon,
  QuillIcon,
} from "./icons.jsx";

// Identity of each page: link and "seal" icon. Colours live in `.page-<key>`
// (theme.css). STRUCTURE ONLY: words are `page.<key>.{label,desc}` in the catalogues,
// and test_contracts.py checks every key here has both. The home card and the header's
// first line read the SAME `desc`, so a card cannot promise what the header denies.
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

export function pageLabelKey(page) {
  return `page.${page}.label`;
}

export function pageDescKey(page) {
  return `page.${page}.desc`;
}

// `index.html` is the address handed to the troupe and offers ONLY the actors' pages.
// `respo.html` is the full home, bookmarked by the coordinator; nothing links to it.
export const ACTOR_CARDS = ["rehearsal", "recorder", "stats"];

// Troupe on the first row, coordinator on the second: the row says who a page is for.
export const RESPO_CARDS = ["rehearsal", "recorder", "stats", "editor", "dashboard"];

// The coordinator's pages return to THEIR home, or Editing -> brand -> Home loses the
// way back to the editor.
const RESPO_ONLY = new Set(["editor", "dashboard"]);

// THE PLAY's home, next door: a play's seven pages share one folder, so a bare
// relative href, as everywhere inside a play.
export function homeHref(page) {
  return RESPO_ONLY.has(page) ? "./respo.html" : "./index.html";
}

// The only front-end place that writes the `plays/<id>/<page>.html` layout.
export function playHref(playId, page) {
  return `./plays/${playId}/${page}.html`;
}

// The only link that LEAVES a play, hence the only place knowing a play page sits two
// levels below the root. Lives at the foot of a play's home and nowhere else.
export function chooserHref(page) {
  return RESPO_ONLY.has(page) ? "../../respo.html" : "../../index.html";
}
