import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import { spawnSync } from "child_process";
import fs from "fs";

const ROOT = __dirname;

// data/script.pdf est DÉRIVÉ de data/script.json, gitignoré, et construit par
// build.yml juste avant de déployer : il n'est donc nulle part dans le dépôt, il
// n'existe que sur le SITE PUBLIÉ. Or le bouton de l'Avancement le propose
// toujours, il n'est pas optionnel (cf. `ScriptPdfLink`), donc le serveur de dev
// va le chercher là où il est plutôt que de le recompiler : un téléchargement,
// une fois, à la première requête, posé dans data/ (où il reste gitignoré) pour
// que les requêtes et les sessions suivantes le servent depuis le disque.
//
// Le dev n'a ainsi besoin d'aucune distribution LaTeX pour voir le bouton
// marcher. Ce qu'il obtient est le PDF de la pièce PUBLIÉE, donc pas celle du
// script.json local si on vient de l'éditer ; le fichier présent est servi tel
// quel et jamais revalidé, et lancer `python3 scripts/build_script_pdf.py` à la
// main reste la façon de voir ses propres modifications (sa sortie prend
// simplement la place du téléchargement).
const SCRIPT_PDF = resolve(ROOT, "data", "script.pdf");

// L'URL du site publié, déduite du remote git : c'est le pendant de
// `githubUploadUrl()` (src/shared/data.js), qui déduit l'URL de dépôt de l'URL
// de la page, et il couvre les deux mêmes formes de site Pages, projet
// (owner.github.io/repo) et racine (le dépôt s'appelle owner.github.io).
function publishedPdfUrl() {
  const run = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const remote = run.status === 0 ? run.stdout.trim() : "";
  // Les deux écritures d'un remote GitHub : SSH (git@github.com:owner/repo.git)
  // et HTTPS (https://github.com/owner/repo).
  const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  const owner = m[1].toLowerCase();
  const repo = m[2];
  const host = `https://${owner}.github.io`;
  return repo.toLowerCase() === `${owner}.github.io`
    ? `${host}/data/script.pdf`
    : `${host}/${repo}/data/script.pdf`;
}

// Un seul téléchargement par session, en vol ou déjà terminé : on garde la
// promesse. Un échec (Pages pas encore déployé, pas de réseau, fork sans site)
// n'est donc pas retenté, sinon chaque ouverture de l'Avancement attendrait un
// timeout ; le message dit la sortie de secours.
let pdfFetch = null;

function ensureScriptPdf() {
  if (fs.existsSync(SCRIPT_PDF)) return null;
  if (!pdfFetch) pdfFetch = fetchScriptPdf();
  return pdfFetch;
}

async function fetchScriptPdf() {
  const url = publishedPdfUrl();
  // Le message désigne la PAGE et le fichier, jamais le libellé du bouton : celui-ci
  // vit dans les catalogues (`dashboard.pdf`), donc le recopier ici ferait mentir le
  // serveur de dev au premier renommage, et il n'est de toute façon écrit qu'en
  // français alors que la page se lit dans deux langues.
  const fallback =
    " Le téléchargement du PDF de l'Avancement rendra un 404 ;" +
    " `python3 scripts/build_script_pdf.py` écrit le fichier en local.";
  if (!url) {
    console.warn(`  data/script.pdf : aucun remote GitHub d'où le télécharger.${fallback}`);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    // La signature et pas le seul code de retour : un site déployé sans PDF
    // (les deux étapes LaTeX de build.yml sont en `continue-on-error`) répond sa
    // page 404, et on ne veut pas écrire du HTML dans un fichier .pdf.
    if (!body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("la réponse n'est pas un PDF");
    }
    // Écriture puis rename : une requête concurrente ne peut pas tomber sur un
    // fichier à moitié écrit (`existsSync` suffirait à la laisser passer).
    const tmp = `${SCRIPT_PDF}.part`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, SCRIPT_PDF);
    console.log(`  data/script.pdf téléchargé depuis ${url} (${Math.round(body.length / 1024)} Ko)`);
  } catch (err) {
    console.warn(`  data/script.pdf introuvable sur ${url} (${err.message}).${fallback}`);
  }
}

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
    // donc pris au site publié par `ensureScriptPdf` puis servi comme en prod.
    ".pdf": "application/pdf",
  };
  return {
    name: "serve-repo-data",
    configureServer(server) {
      // Asynchrone pour le seul `await` de `ensureScriptPdf` : tout le reste est
      // synchrone, et cette fonction n'a aucun rejet à propager (le
      // téléchargement attrape ses propres erreurs et laisse le 404 se produire).
      server.middlewares.use(async (req, res, next) => {
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
        // Le seul fichier que le dépôt ne porte pas : on le prend au site
        // publié avant de répondre, cf. `ensureScriptPdf`.
        if (file === SCRIPT_PDF) await ensureScriptPdf();
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        // Une réponse HEAD n'a pas de corps. Plus rien ne sonde ces URLs ainsi
        // (le bouton du PDF le faisait), mais un serveur qui répond à GET doit
        // répondre à HEAD, et sans cette branche la requête retomberait sur le
        // repli SPA de Vite, qui rend 200 avec index.html.
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
        stats: resolve(ROOT, "stats.html"),
        dashboard: resolve(ROOT, "dashboard.html"),
      },
    },
  },
});
