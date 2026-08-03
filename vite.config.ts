import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import fs from "fs";
// Imported, never copied: it accepts neither a dot nor a slash, which makes the paths safe.
import { DEV_PLAY_ID, SAFE_PLAY_ID } from "./src/shared/plays.ts";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

const ROOT = __dirname;

// One per template in `pages/`, written into every play's folder so a page reads `data/…`
// and links `./rehearsal.html` without knowing which play it is in. The two root pages
// belong to no play.
const PLAY_PAGES = ["index", "respo", "rehearsal", "recorder", "stats", "dashboard", "editor"];

function playIds(): string[] {
  const dir = resolve(ROOT, "plays");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SAFE_PLAY_ID.test(e.name))
    .map((e) => e.name)
    .sort();
}

// Called at CONFIG time, not from a plugin hook: `rollupOptions.input` must name files that
// exist and the dev server only serves a `.html` on disk. Rewritten only when changed, Vite
// watching them, so creating a play while the dev server runs requires a restart.
function writePlayPages(): string[] {
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

// Vite entries = the two root .html files plus every play's seven. The modules being
// identical, Rollup emits one shared set of chunks: a play costs seven HTML files.
function buildInputs(ids: string[]): Record<string, string> {
  const inputs: Record<string, string> = {
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

// Serves the repo's data from disk in dev, so pages fetch the same relative URLs as in
// production. A REAL 404 on a missing file: without it Vite's SPA fallback answers 200 with
// index.html and the pages misdiagnose the error. Two URL shapes, /plays/<id>/{data,clips}/…
// and /data/…. script.pdf is committed, so it is served like the rest (no LaTeX in dev);
// after editing a local script.json, re-run scripts/build_script_pdf.py.
function serveRepoData(): Plugin {
  const types: Record<string, string> = {
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".pdf": "application/pdf",
  };
  return {
    name: "serve-repo-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // `req.url` is optional in Node's types and always set for a served request.
        const pathname = (req.url ?? "").split("?")[0]!;
        const play = pathname.match(/^\/plays\/([^/]+)\/(data|clips)\/(.+)$/);
        const root = pathname.match(/^\/(data)\/(.+)$/);
        if (!play && !root) return next();
        // Validate the id BEFORE building a path with it, as everywhere else.
        if (play && !SAFE_PLAY_ID.test(play[1]!)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const base = play
          ? resolve(ROOT, "plays", play[1]!, play[2]!)
          : resolve(ROOT, root![1]!);
        const file = resolve(base, decodeURIComponent(play ? play[3]! : root![2]!));
        // Strict containment: a bare startsWith would let ../data-backup.json escape.
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
        // A server answering GET must answer HEAD; without this branch the request falls
        // through to Vite's SPA fallback, which returns 200 with index.html.
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// Vite announces one URL, but there are two entries plus the test bench, which no link
// reaches. Guarded on the folder: a fork that deleted plays/dev/ must not get a 404.
function printHomeUrls(): Plugin {
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const extend = (server: ViteDevServer | PreviewServer) => {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      // resolvedUrls is null when listening failed.
      const base = server.resolvedUrls?.local?.[0];
      if (!base) return;
      // Dev-server output, so English and never through the catalogues.
      const entries = [
        ["Chooser:", ""],
        ["Manage:", "respo.html"],
      ];
      if (PLAY_IDS.includes(DEV_PLAY_ID)) entries.push(["Dev:", `plays/${DEV_PLAY_ID}/respo.html`]);
      for (const [label, path] of entries) {
        // Same padding as Vite's own lines ("Local:" to nine).
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

// At config read, so one code path for dev, build and preview (cf. `writePlayPages`).
const PLAY_IDS = writePlayPages();

export default defineConfig({
  // Relative base so the site works under any /<repo>/ and at any depth: a play page, two
  // levels down, reaches its assets as `../../assets/…` without knowing where it is.
  base: "./",
  plugins: [react(), serveRepoData(), printHomeUrls()],
  build: {
    rollupOptions: {
      input: buildInputs(PLAY_IDS),
    },
  },
});
