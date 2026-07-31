import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import { spawnSync } from "child_process";
import fs from "fs";
// The play id pattern, imported and never copied over: it is what makes building
// the paths below safe (it accepts neither a dot nor a slash, so no folder can
// escape `plays/`).
import { SAFE_PLAY_ID } from "./src/shared/plays.js";

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

// plays/<id>/data/script.pdf is DERIVED from the play's script, gitignored, and
// built by build.yml right before deploying: it is therefore nowhere in the repo, it
// only exists on the PUBLISHED SITE. Yet the Progress page's button always offers
// it, it is not optional (cf. `ScriptPdfLink`), so the dev server goes and fetches
// it where it lives rather than recompiling it: one download, once, on the first
// request, written into the play's folder (where it stays gitignored) so that the
// following requests and sessions serve it from disk.
//
// A developer thus needs no LaTeX distribution at all to see the button work. What
// they get is the PDF of the PUBLISHED play, so not the one of the local
// script.json if they have just edited it; a file that is there is served as is and
// never revalidated, and running `python3 scripts/build_script_pdf.py` by hand
// remains the way to see one's own changes (its output simply takes the place of
// the download).
function scriptPdfPath(playId) {
  return resolve(ROOT, "plays", playId, "data", "script.pdf");
}

// The published site's URL, deduced from the git remote: this is the counterpart of
// `githubUploadUrl()` (src/shared/data.js), which deduces the upload URL from the
// page's URL, and it covers the same two forms of Pages site, project
// (owner.github.io/repo) and root (the repo is named owner.github.io).
function publishedSiteUrl() {
  const run = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const remote = run.status === 0 ? run.stdout.trim() : "";
  // The two spellings of a GitHub remote: SSH (git@github.com:owner/repo.git)
  // and HTTPS (https://github.com/owner/repo).
  const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  const owner = m[1].toLowerCase();
  const repo = m[2];
  const host = `https://${owner}.github.io`;
  return repo.toLowerCase() === `${owner}.github.io` ? host : `${host}/${repo}`;
}

// A single download per play and per session, in flight or already finished: we keep
// the promise. A failure (Pages not deployed yet, no network, a fork without a site)
// is therefore not retried, otherwise every opening of the Progress page would wait
// for a timeout; the message names the fallback. One entry per play, each having its
// own PDF: without that, the first play opened would have decided for the others.
const pdfFetches = new Map();

function ensureScriptPdf(playId) {
  if (fs.existsSync(scriptPdfPath(playId))) return null;
  if (!pdfFetches.has(playId)) pdfFetches.set(playId, fetchScriptPdf(playId));
  return pdfFetches.get(playId);
}

async function fetchScriptPdf(playId) {
  const site = publishedSiteUrl();
  const url = site && `${site}/plays/${playId}/data/script.pdf`;
  // The message names the PAGE and the file, never the button's label: that one
  // lives in the catalogues (`dashboard.pdf`), so copying it here would make the dev
  // server lie at the first rename, and it is anyway written in one language only
  // whereas the page reads in two.
  const fallback =
    " The PDF download on the Progress page will return a 404;" +
    " `python3 scripts/build_script_pdf.py` writes the file locally.";
  const label = `plays/${playId}/data/script.pdf`;
  if (!url) {
    console.warn(`  ${label}: no GitHub remote to download it from.${fallback}`);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    // The signature and not the status code alone: a site deployed without a PDF
    // (build.yml's two LaTeX steps are in `continue-on-error`) answers with its 404
    // page, and we do not want to write HTML into a .pdf file.
    if (!body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("the response is not a PDF");
    }
    // Write then rename: a concurrent request cannot land on a half-written file
    // (`existsSync` alone would be enough to let it through).
    const target = scriptPdfPath(playId);
    const tmp = `${target}.part`;
    fs.mkdirSync(resolve(target, ".."), { recursive: true });
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, target);
    console.log(`  ${label} downloaded from ${url} (${Math.round(body.length / 1024)} kB)`);
  } catch (err) {
    console.warn(`  ${label} not found at ${url} (${err.message}).${fallback}`);
  }
}

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
    // gitignored, hence taken from the published site by `ensureScriptPdf` then
    // served as in prod.
    ".pdf": "application/pdf",
  };
  return {
    name: "serve-repo-data",
    configureServer(server) {
      // Asynchronous for the sole `await` of `ensureScriptPdf`: everything else is
      // synchronous, and this function has no rejection to propagate (the
      // download catches its own errors and lets the 404 happen).
      server.middlewares.use(async (req, res, next) => {
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
        // The only file the repo does not carry: we take it from the published
        // site before answering, cf. `ensureScriptPdf`.
        if (play && file === scriptPdfPath(play[1])) await ensureScriptPdf(play[1]);
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
      for (const [label, path] of [
        ["Chooser:", ""],
        ["Manage:", "respo.html"],
      ]) {
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
