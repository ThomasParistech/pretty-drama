import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import fs from "fs";
// The play id pattern, imported and never copied over: it is what makes building
// the paths below safe (it accepts neither a dot nor a slash, so no folder can
// escape `plays/`).
import { DEV_PLAY_ID, SAFE_PLAY_ID } from "./src/shared/plays.js";

const ROOT = __dirname;

// The seven pages of a play, one per template in `pages/`. Every play gets all
// seven, written into its own folder: that is what makes a page read `data/…` and
// write `./rehearsal.html` as a RELATIVE path, without ever knowing which play it
// is running in. The two ROOT pages (the play chooser and the play management
// page) are not in here: they belong to no play.
const PLAY_PAGES = ["index", "respo", "rehearsal", "recorder", "stats", "dashboard", "editor"];

function playIds() {
  const dir = resolve(ROOT, "plays");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SAFE_PLAY_ID.test(e.name))
    .map((e) => e.name)
    .sort();
}

// Instantiates the templates into every play's folder, in dev as at build time.
//
// Called at CONFIG time and not from a plugin hook: `rollupOptions.input` must name
// files that already exist on disk, and the dev server only serves a `.html` if it
// is there. A single code path for both commands, hence no ordering trap.
//
// The file is only rewritten when it changed: in dev, Vite watches these `.html`,
// and rewriting them identically on every start would bring nothing. A play created
// while a dev server is running therefore requires restarting it, which is of no
// consequence for the troupe (a play is created on the published site).
function writePlayPages() {
  const ids = playIds();
  for (const page of PLAY_PAGES) {
    const template = fs.readFileSync(resolve(ROOT, "pages", `${page}.html`), "utf8");
    for (const id of ids) {
      const target = resolve(ROOT, "plays", id, `${page}.html`);
      const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
      if (current !== template) fs.writeFileSync(target, template);
    }
  }
  return ids;
}

// The build inputs: the two root pages, then the seven pages of every play. Since
// the JS modules are the same from one play to the next, Rollup only emits one set
// of chunks, shared by all of them: one more play only costs seven HTML files.
function buildInputs(ids) {
  const inputs = {
    plays: resolve(ROOT, "index.html"),
    manage: resolve(ROOT, "respo.html"),
  };
  for (const id of ids) {
    for (const page of PLAY_PAGES) {
      inputs[`${id}-${page}`] = resolve(ROOT, "plays", id, `${page}.html`);
    }
  }
  return inputs;
}

// plays/<id>/data/script.pdf is DERIVED from the play's script, and COMMITTED beside
// it: uploads.yml typesets it when a script is promoted, so the repo always carries
// the PDF of the script it carries, and the middleware below serves it like any other
// file of the play. Nothing to build and nothing to fetch here.
//
// This used to be a download. The file was gitignored and built by build.yml at deploy
// time, so it existed only on the published site, while the Progress page's button
// offers it unconditionally (cf. `ScriptPdfLink`); the dev server fetched it from the
// site once per play and wrote it to disk. All of that went away with the gitignore
// line. What a developer loses with it: nothing, they no longer need LaTeX NOR a
// published site to see the button work. What they still owe: after editing a local
// script.json, `python3 scripts/build_script_pdf.py <play>` is what re-typesets it,
// exactly as before, because a file that is there is served as is.

// In production, the GitHub Action copies data/ and every play folder into dist/.
// In dev, this middleware serves them straight from the repo so every page
// can fetch "data/manifest.json?t=..." etc. with the same relative URLs.
// It also returns a REAL 404 for missing files: without it, Vite's SPA
// fallback answers 200 with index.html and the pages misdiagnose the error.
//
// Two URL shapes, and that is the whole layout of the site: a PLAY's data
// (`/plays/<id>/data/…`, `/plays/<id>/clips/…`), and the ROOT's data
// (`/data/plays.json`, `/data/history.json`), which speak of no play in
// particular.
function serveRepoData() {
  const types = {
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    // A play's script.pdf, which the button on its Progress page downloads:
    // committed beside its script.json, so served from the repo like the rest.
    ".pdf": "application/pdf",
  };
  return {
    name: "serve-repo-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split("?")[0];
        const play = pathname.match(/^\/plays\/([^/]+)\/(data|clips)\/(.+)$/);
        const root = pathname.match(/^\/(data)\/(.+)$/);
        if (!play && !root) return next();
        // The id is validated BEFORE it is used to build a path, as everywhere else
        // in the project: the pattern accepts neither a dot nor a slash, and that is
        // what makes the concatenation safe.
        if (play && !SAFE_PLAY_ID.test(play[1])) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const base = play
          ? resolve(ROOT, "plays", play[1], play[2])
          : resolve(ROOT, root[1]);
        const file = resolve(base, decodeURIComponent(play ? play[3] : root[2]));
        // Strict containment: the resolved path must live under base/
        // (a bare startsWith would let ../data-backup.json escape).
        const rel = relative(base, file);
        if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        // A HEAD response has no body. Nothing probes these URLs that way any
        // more (the PDF button used to), but a server that answers GET must
        // answer HEAD, and without this branch the request would fall back on
        // Vite's SPA fallback, which returns 200 with index.html.
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// Vite only announces one URL ("Local: …"), whereas there are TWO entries: the
// actors' play chooser at the root and the play management page on respo.html. We
// therefore extend its list of URLs, in dev as in preview, so nobody has to remember
// the path of the hidden page.
//
// A third one joins them when the test bench is there: `plays/dev/` is absent from
// data/plays.json, so the chooser does not link to it and there is no path to it anywhere
// in the site. Printing it is what makes it reachable at all without going and reading
// CLAUDE.md, and it is its coordinator home that is named, the one page that links to the
// other six. Guarded on the folder: a company that forked the repository and deleted the
// play must not be shown a URL that 404s.
function printHomeUrls() {
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const extend = (server) => {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      // resolvedUrls is null when listening failed: in that case, nothing to say.
      const base = server.resolvedUrls?.local?.[0];
      if (!base) return;
      // Named after what each entry IS and not after who opens it: the root is the
      // play chooser, `respo.html` is the play management page. These two labels are
      // dev-server output, so they stay in the repo's language and never go through
      // the catalogues, which hold what the SITE says.
      const entries = [
        ["Chooser:", ""],
        ["Manage:", "respo.html"],
      ];
      // Short label so the column stays the one Vite itself uses ("Local:" padded to
      // nine): the URL says the rest.
      if (PLAY_IDS.includes(DEV_PLAY_ID)) entries.push(["Dev:", `plays/${DEV_PLAY_ID}/respo.html`]);
      for (const [label, path] of entries) {
        // Same template as Vite's own lines: "Local:   " then the URL.
        console.log(`  ${green("➜")}  ${bold(label.padEnd(9))}${green(base + path)}`);
      }
    };
  };
  return {
    name: "print-home-urls",
    configureServer: extend,
    configurePreviewServer: extend,
  };
}

// The templates are instantiated HERE, as the config is read: the build inputs must
// name files that exist, and the dev server only serves what is on disk. A single
// code path for `dev`, `build` and `preview`.
const PLAY_IDS = writePlayPages();

export default defineConfig({
  // Relative base so the site works at https://<user>.github.io/<any-repo-name>/
  // and at any depth: that is what makes a play page, two levels down, reference
  // its assets as `../../assets/…` without knowing anything.
  base: "./",
  plugins: [react(), serveRepoData(), printHomeUrls()],
  build: {
    rollupOptions: {
      input: buildInputs(PLAY_IDS),
    },
  },
});
