import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, extname, relative, isAbsolute, sep } from "path";
import { spawnSync } from "child_process";
import fs from "fs";
// Le motif des identifiants de pièce, importé et jamais recopié : c'est lui qui
// rend sûre la construction des chemins ci-dessous (il n'accepte ni point ni barre
// oblique, donc aucun dossier ne peut sortir de `plays/`).
import { SAFE_PLAY_ID } from "./src/shared/plays.js";

const ROOT = __dirname;

// Les sept pages d'une pièce, une par gabarit de `pages/`. Chaque pièce reçoit les
// sept, écrites dans son dossier : c'est ce qui fait qu'une page lit `data/…` et
// écrit `./rehearsal.html` en chemin RELATIF, sans jamais savoir dans quelle pièce
// elle tourne. Les deux pages RACINE (le sélecteur de pièce et la gestion des
// pièces) ne sont pas là-dedans : elles n'appartiennent à aucune pièce.
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

// Instancie les gabarits dans le dossier de chaque pièce, en dev comme au build.
//
// Appelé au moment de la CONFIG et pas dans un hook de plugin : `rollupOptions.input`
// doit citer des fichiers qui existent déjà sur le disque, et le serveur de dev ne
// sert un `.html` que s'il est là. Un seul chemin de code pour les deux commandes,
// donc aucun piège d'ordonnancement.
//
// Le fichier n'est réécrit que s'il a changé : en dev, Vite surveille ces `.html`,
// et les réécrire à l'identique à chaque démarrage n'apporterait rien. Une pièce
// créée pendant qu'un serveur de dev tourne demande donc de le relancer, ce qui est
// sans conséquence pour la troupe (une pièce se crée sur le site publié).
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

// Les entrées du build : les deux pages racine, puis les sept pages de chaque pièce.
// Les modules JS étant les mêmes d'une pièce à l'autre, Rollup n'en émet qu'un jeu de
// chunks, partagé par toutes : une pièce de plus ne coûte que sept fichiers HTML.
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

// plays/<id>/data/script.pdf est DÉRIVÉ du script de la pièce, gitignoré, et
// construit par build.yml juste avant de déployer : il n'est donc nulle part dans le
// dépôt, il n'existe que sur le SITE PUBLIÉ. Or le bouton de l'Avancement le propose
// toujours, il n'est pas optionnel (cf. `ScriptPdfLink`), donc le serveur de dev
// va le chercher là où il est plutôt que de le recompiler : un téléchargement,
// une fois, à la première requête, posé dans le dossier de la pièce (où il reste
// gitignoré) pour que les requêtes et les sessions suivantes le servent depuis le
// disque.
//
// Le dev n'a ainsi besoin d'aucune distribution LaTeX pour voir le bouton
// marcher. Ce qu'il obtient est le PDF de la pièce PUBLIÉE, donc pas celle du
// script.json local si on vient de l'éditer ; le fichier présent est servi tel
// quel et jamais revalidé, et lancer `python3 scripts/build_script_pdf.py` à la
// main reste la façon de voir ses propres modifications (sa sortie prend
// simplement la place du téléchargement).
function scriptPdfPath(playId) {
  return resolve(ROOT, "plays", playId, "data", "script.pdf");
}

// L'URL du site publié, déduite du remote git : c'est le pendant de
// `githubUploadUrl()` (src/shared/data.js), qui déduit l'URL de dépôt de l'URL
// de la page, et il couvre les deux mêmes formes de site Pages, projet
// (owner.github.io/repo) et racine (le dépôt s'appelle owner.github.io).
function publishedSiteUrl() {
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
  return repo.toLowerCase() === `${owner}.github.io` ? host : `${host}/${repo}`;
}

// Un seul téléchargement par pièce et par session, en vol ou déjà terminé : on garde
// la promesse. Un échec (Pages pas encore déployé, pas de réseau, fork sans site)
// n'est donc pas retenté, sinon chaque ouverture de l'Avancement attendrait un
// timeout ; le message dit la sortie de secours. Une entrée par pièce, chacune ayant
// son PDF : sans ça, la première pièce ouverte aurait décidé pour les autres.
const pdfFetches = new Map();

function ensureScriptPdf(playId) {
  if (fs.existsSync(scriptPdfPath(playId))) return null;
  if (!pdfFetches.has(playId)) pdfFetches.set(playId, fetchScriptPdf(playId));
  return pdfFetches.get(playId);
}

async function fetchScriptPdf(playId) {
  const site = publishedSiteUrl();
  const url = site && `${site}/plays/${playId}/data/script.pdf`;
  // Le message désigne la PAGE et le fichier, jamais le libellé du bouton : celui-ci
  // vit dans les catalogues (`dashboard.pdf`), donc le recopier ici ferait mentir le
  // serveur de dev au premier renommage, et il n'est de toute façon écrit qu'en
  // français alors que la page se lit dans deux langues.
  const fallback =
    " Le téléchargement du PDF de l'Avancement rendra un 404 ;" +
    " `python3 scripts/build_script_pdf.py` écrit le fichier en local.";
  const label = `plays/${playId}/data/script.pdf`;
  if (!url) {
    console.warn(`  ${label} : aucun remote GitHub d'où le télécharger.${fallback}`);
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
    const target = scriptPdfPath(playId);
    const tmp = `${target}.part`;
    fs.mkdirSync(resolve(target, ".."), { recursive: true });
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, target);
    console.log(`  ${label} téléchargé depuis ${url} (${Math.round(body.length / 1024)} Ko)`);
  } catch (err) {
    console.warn(`  ${label} introuvable sur ${url} (${err.message}).${fallback}`);
  }
}

// In production, the GitHub Action copies data/ and every play folder into dist/.
// In dev, this middleware serves them straight from the repo so every page
// can fetch "data/manifest.json?t=..." etc. with the same relative URLs.
// It also returns a REAL 404 for missing files — without it, Vite's SPA
// fallback answers 200 with index.html and the pages misdiagnose the error.
//
// Deux formes d'URL, et c'est tout le découpage du site : les données d'une PIÈCE
// (`/plays/<id>/data/…`, `/plays/<id>/clips/…`), et celles de la RACINE
// (`/data/plays.json`, `/data/history.json`), qui ne parlent d'aucune pièce en
// particulier.
function serveRepoData() {
  const types = {
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    // Le script.pdf d'une pièce, que le bouton de son Avancement télécharge :
    // gitignoré, donc pris au site publié par `ensureScriptPdf` puis servi comme en
    // prod.
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
        const play = pathname.match(/^\/plays\/([^/]+)\/(data|clips)\/(.+)$/);
        const root = pathname.match(/^\/(data)\/(.+)$/);
        if (!play && !root) return next();
        // L'identifiant est validé AVANT de servir à construire un chemin, comme
        // partout ailleurs dans le projet : le motif n'accepte ni point ni barre
        // oblique, ce qui est ce qui rend la concaténation sûre.
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
        // Le seul fichier que le dépôt ne porte pas : on le prend au site
        // publié avant de répondre, cf. `ensureScriptPdf`.
        if (play && file === scriptPdfPath(play[1])) await ensureScriptPdf(play[1]);
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

// Vite n'annonce qu'une URL (« Local: … »), or il y a DEUX entrées : le sélecteur de
// pièce des acteurs à la racine et la gestion des pièces sur respo.html. On complète
// donc sa liste d'URLs, en dev comme en preview, pour ne pas avoir à retenir le
// chemin de la page cachée.
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

// Les gabarits sont instanciés ICI, à la lecture de la config : les entrées du build
// doivent citer des fichiers qui existent, et le serveur de dev ne sert que ce qui
// est sur le disque. Un seul chemin de code pour `dev`, `build` et `preview`.
const PLAY_IDS = writePlayPages();

export default defineConfig({
  // Relative base so the site works at https://<user>.github.io/<any-repo-name>/
  // et à n'importe quelle profondeur : c'est ce qui fait qu'une page de pièce, deux
  // niveaux plus bas, référence ses assets en `../../assets/…` sans rien savoir.
  base: "./",
  plugins: [react(), serveRepoData(), printHomeUrls()],
  build: {
    rollupOptions: {
      input: buildInputs(PLAY_IDS),
    },
  },
});
