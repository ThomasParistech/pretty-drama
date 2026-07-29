import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import fs from "fs";

const ROOT = __dirname;

// In production, the GitHub Action copies data/ and clips/ into dist/.
// In dev, this middleware serves them straight from the repo so every page
// can fetch "data/manifest.json?t=..." etc. with the same relative URLs.
// It also returns a REAL 404 for missing files — without it, Vite's SPA
// fallback answers 200 with index.html and the pages misdiagnose the error.
function serveRepoData() {
  const types = {
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    // data/script.pdf, que le bouton de l'Avancement télécharge : gitignoré,
    // donc absent tant qu'on n'a pas lancé build_script_pdf.py à la main, mais
    // servi comme en prod dès qu'il est là.
    ".pdf": "application/pdf",
  };
  return {
    name: "serve-repo-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split("?")[0];
        const m = pathname.match(/^\/(data|clips)\/(.+)$/);
        if (!m) return next();
        const base = resolve(ROOT, m[1]);
        const file = resolve(base, decodeURIComponent(m[2]));
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
        // L'Avancement sonde `data/script.pdf` en HEAD avant d'afficher son
        // bouton de téléchargement : il ne lit que le code de retour, et une
        // réponse HEAD n'a pas de corps.
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// Vite n'annonce qu'une URL (« Local: … »), or il y a DEUX accueils : celui des
// acteurs à la racine et celui du responsable sur respo.html. On complète donc
// sa liste d'URLs, en dev comme en preview, pour ne pas avoir à retenir le
// chemin de l'accueil caché.
function printHomeUrls() {
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const extend = (server) => {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      // resolvedUrls est null si l'écoute a échoué : dans ce cas, rien à dire.
      const base = server.resolvedUrls?.local?.[0];
      if (!base) return;
      for (const [label, path] of [
        ["Acteurs:", ""],
        ["Respo:", "respo.html"],
      ]) {
        // Même gabarit que les lignes de Vite : « Local:   » puis l'URL.
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

export default defineConfig({
  // Relative base so the site works at https://<user>.github.io/<any-repo-name>/
  base: "./",
  plugins: [react(), serveRepoData(), printHomeUrls()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(ROOT, "index.html"),
        respo: resolve(ROOT, "respo.html"),
        editor: resolve(ROOT, "editor.html"),
        recorder: resolve(ROOT, "recorder.html"),
        rehearsal: resolve(ROOT, "rehearsal.html"),
        dashboard: resolve(ROOT, "dashboard.html"),
      },
    },
  },
});
