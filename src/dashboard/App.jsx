import React, { useEffect, useState } from "react";
import PageMark from "../shared/PageMark.jsx";
import PlayHeader from "../shared/PlayHeader.jsx";
import PageState from "../shared/PageState.jsx";
import useManifest from "../shared/useManifest.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";
import { fmt, t } from "../shared/locale.js";
import { pageLabelKey } from "../shared/pages.js";
import T from "../shared/T.jsx";
import { CheckIcon, CrossIcon, DownloadIcon, WarnIcon } from "../shared/icons.jsx";
import { githubUploadUrl, slugify } from "../shared/data.js";
import "./dashboard.css";

// Pure read of data/manifest.json: recording progress per character, so the
// respo knows who to chase.
export default function App() {
  const { manifest, error: loadError } = useManifest();
  if (loadError) {
    return <PageState page="dashboard" error={loadError} />;
  }
  if (!manifest) {
    return <PageState page="dashboard" />;
  }
  return <Dashboard manifest={manifest} />;
}

// Le journal garde une trentaine de dépôts (MAX_RUNS côté Python), chacun
// pouvant porter plusieurs fichiers : de quoi dépasser la soixantaine de lignes.
// Le tableau défilant les tient, ce plafond n'est qu'un garde-fou.
const JOURNAL_ROWS = 60;

// Libellé du type, hors du tableau : le sceau le porte à l'écran, le mot ne sert
// plus qu'à l'infobulle et aux lecteurs d'écran. Les trois clés sont celles que
// `kind_of` (process_uploads.py) écrit dans le journal, donc elles restent en
// français : c'est de la DONNÉE, pas du texte d'interface, et le mot affiché vit
// dans les catalogues.
const KIND_LABEL_KEY = {
  voix: "dashboard.kind.voix",
  script: "dashboard.kind.script",
  inconnu: "dashboard.kind.inconnu",
};

// Les fichiers d'un dépôt, normalisés : le manifest peut venir d'une version
// antérieure du format, ou avoir été bricolé à la main comme script.json.
function filesOf(run) {
  const files = run && Array.isArray(run.files) ? run.files : [];
  return files
    .filter((f) => f && typeof f.file === "string")
    .map((f) => ({
      file: f.file,
      kind: f.kind === "voix" || f.kind === "script" ? f.kind : "inconnu",
      error: typeof f.error === "string" ? f.error : null,
      clips: Number.isFinite(f.clips) ? f.clips : 0,
    }));
}

// Le détail d'une ligne, optionnel : le badge et le statut disent déjà
// l'essentiel. Un script réussi n'a donc rien à ajouter (son nom de fichier ne
// dit rien) ; une voix nomme son ZIP et compte ses répliques ; un échec nomme le
// fichier et donne son motif, le seul texte qui vienne de l'Action.
function detailOf(row) {
  if (row.error) {
    return (
      <T
        k="dashboard.journal.detailError"
        p={{ file: <code>{row.file}</code>, reason: row.error }}
      />
    );
  }
  if (row.kind === "script") return null;
  // Le nom du fichier est un PARAMÈTRE et pas un fragment posé avant le
  // décompte : juxtaposés dans le JSX, leur ordre et l'espace qui les sépare
  // étaient figés dans le composant.
  return (
    <T
      k="dashboard.journal.detailVoices"
      p={{
        file: <code>{row.file}</code>,
        count: t("common.lineCount", { count: row.clips }),
      }}
    />
  );
}

// La date d'une ligne du journal, année comprise (un journal se relit des mois
// plus tard, et deux saisons de répétitions passent par les mêmes jours). Rend
// null sur un horodatage illisible, plutôt que d'afficher « Invalid Date ».
//
// `fmt.dateTime` remplace deux `toLocale*` figés sur « fr-FR » et le mot de
// liaison « à » qui les joignait : le format d'une locale porte son propre
// séparateur (une virgule en anglais), donc il n'y avait rien à traduire, juste
// à cesser de l'écrire à la main.
function formatWhen(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return fmt.dateTime(then);
}

function okCount(lines) {
  return lines.filter((l) => l.status === "ok").length;
}

// Une seule échelle de statut pour toute la grille : cases, noms, scènes, actes.
function statusClass(ok, total) {
  if (total === 0) return "empty";
  return ok < total ? "todo" : "done";
}

function Dashboard({ manifest }) {
  // Flat list of scene columns, keeping the act grouping for the header row.
  const scenes = manifest.acts.flatMap((act, actIndex) =>
    act.scenes.map((scene, sceneIndex) => ({
      key: `${actIndex}-${sceneIndex}`,
      // Le libellé complet pour l'infobulle, et le seul NUMÉRO dans l'en-tête de
      // colonne, qui est étroit. Plus de regex pour extraire ce numéro d'un
      // titre : le rang le donne directement (`sceneNumber` a disparu avec les
      // titres stockés).
      act: actLabel(t, actIndex),
      label: String(sceneIndex + 1),
      title: sceneLabel(t, sceneIndex),
      lines: scene.lines,
      total: scene.lines.length,
      ok: okCount(scene.lines),
    }))
  );

  // Act header cells, with their own aggregate status (all scenes of the act).
  const actCols = manifest.acts
    .map((act, i) => {
      const lines = act.scenes.flatMap((scene) => scene.lines);
      return {
        key: i,
        title: actLabel(t, i),
        span: act.scenes.length,
        total: lines.length,
        ok: okCount(lines),
      };
    })
    .filter((act) => act.span > 0);

  const rows = manifest.characters.map((c) => {
    const cells = scenes.map((scene) => {
      const lines = scene.lines.filter((l) => l.characterId === c.id);
      return { total: lines.length, ok: okCount(lines) };
    });
    return {
      character: c,
      cells,
      total: cells.reduce((sum, cell) => sum + cell.total, 0),
      ok: cells.reduce((sum, cell) => sum + cell.ok, 0),
    };
  });

  // Lines pointing at no (known) character: they inflate the totals but
  // belong to nobody and NOBODY can record them — surface them loudly so the
  // respo fixes the script instead of chasing a phantom "41/42".
  const knownIds = new Set(manifest.characters.map((c) => c.id));
  const orphanLines = manifest.lines.filter(
    (l) => l.characterId == null || !knownIds.has(l.characterId)
  );

  // Journal des dépôts : absent d'un manifest reconstruit avant son existence.
  const runs = Array.isArray(manifest.history) ? manifest.history : [];

  return (
    <>
      {/* Sa phrase compacte et rien d'autre (pas de `hint`) : la page n'a aucun
          réglage, mais son bandeau se déplie comme les trois autres (il porte le
          retour à l'accueil), et déplier pour ne trouver qu'un lien faisait
          vide. Elle dit à quoi sert la page, jamais comment lire la grille (ça,
          c'est le rôle de `.dash-legend`, sous le tableau) ni comment déposer
          (la carte de dépôt est juste en dessous, elle se lit seule). */}
      <PlayHeader page="dashboard" title={manifest.title || t("common.untitledPlay")} />
      <div className="container">
        <div className="dash-actions">
          <UploadLinks />
          <ScriptPdfLink title={manifest.title || ""} />
        </div>

        {orphanLines.length > 0 && (
          <div className="dash-orphans card">
            <WarnIcon />
            {/* Le décompte en gras est un PARAMÈTRE : découper la phrase autour du
                <strong> figerait l'ordre des mots français dans le composant. */}
            <T
              k="dashboard.orphans"
              p={{
                count: (
                  <strong>
                    {t("dashboard.orphans.count", { count: orphanLines.length })}
                  </strong>
                ),
                page: t(pageLabelKey("editor")),
              }}
            />
            <ul>
              {orphanLines.map((l) => (
                <li key={l.id}>
                  {/* Le couple acte + scène par la clé partagée `common.actScene`,
                      comme la portée de la Répartition : le séparateur est un fait
                      de langue, il était un « · » écrit dans le JSX ici et une
                      virgule là-bas, sur le même site. */}
                  <span className="dash-pending-loc">
                    {t("common.actScene", {
                      act: actLabel(t, l.actIndex),
                      scene: sceneLabel(t, l.sceneIndex),
                    })}
                  </span>{" "}
                  <span className="dash-pending-text">{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length === 0 || scenes.length === 0 ? (
          <div className="empty-state">{t("common.noCharacters", { page: t(pageLabelKey("editor")) })}</div>
        ) : (
          <ProgressTable acts={actCols} scenes={scenes} rows={rows} />
        )}

        <p className="dash-legend">{t("dashboard.legend")}</p>

        <Journal runs={runs} />
      </div>
    </>
  );
}

// Journal des dépôts : le SEUL retour du respo sur ce que la GitHub Action a
// fait de ses fichiers (il ne lit ni les logs de la CI ni les issues). Les
// entrées viennent de data/history.json, recopié dans le manifest.
//
// UNE LIGNE PAR FICHIER, pas par dépôt : chaque fichier a son propre sort (un
// ZIP abîmé au milieu de trois bons n'empêche pas les autres), donc chaque ligne
// porte son statut. La date se répète pour les fichiers déposés ensemble, ce qui
// les regroupe visuellement sans avoir à les imbriquer.
//
// Le tableau reste affiché même vide (une ligne d'explication à la place des
// dépôts) : c'est le seul canal de retour du projet, donc le respo doit savoir
// qu'il existe et où le regarder AVANT son premier dépôt, sinon un échec le
// trouverait devant une page qui n'a jamais rien promis.
function Journal({ runs }) {
  const all = runs.flatMap((run) => filesOf(run).map((file) => ({ ...file, at: run.at })));
  const rows = all.slice(0, JOURNAL_ROWS);
  // Le plafond est un garde-fou, mais il ne doit pas couper en silence : c'est
  // le seul canal de retour du projet, et un tableau qui s'arrête sans le dire
  // se lit comme « il n'y a rien de plus », y compris pour un dépôt raté qui
  // vient de sortir par le bas.
  const hidden = all.length - rows.length;
  return (
    <section className="dash-journal">
      <h2>{t("dashboard.journal.title")}</h2>
      {/* Le conteneur défile, jamais la page : le journal garde une trentaine de
          dépôts, il ne doit pas allonger l'Avancement sans fin. Comme la grille
          au-dessus, c'est donc une région nommée et focalisable : il défile sur
          les deux axes et ne contient rien de focalisable, donc sans `tabIndex`
          il ne se parcourrait ni au clavier ni au lecteur d'écran. */}
      <div
        className="dash-journal-wrap"
        tabIndex={0}
        role="region"
        aria-label={t("dashboard.journal.region")}
      >
        <table className="dash-journal-table">
          <thead>
            <tr>
              <th>{t("dashboard.journal.date")}</th>
              <th>{t("dashboard.journal.status")}</th>
              <th>{t("dashboard.journal.type")}</th>
              <th>{t("dashboard.journal.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="dash-journal-empty" colSpan={4}>
                  {t("dashboard.journal.empty")}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={`${row.at}-${row.file}-${i}`}>
                <td className="dash-journal-when">{formatWhen(row.at) || t("dashboard.journal.unknownDate")}</td>
                <td>
                  <Status failed={Boolean(row.error)} />
                </td>
                <td>
                  <KindMark kind={row.kind} />
                </td>
                <td className="dash-journal-detail">{detailOf(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="dash-journal-more">{t("dashboard.journal.more", { count: hidden })}</p>
      )}
    </section>
  );
}

// Statut au seul dessin, dans les mêmes vert et ambre que la grille au-dessus.
// Il emprunte la pastille des sceaux (`page-mark`) pour que les deux colonnes
// d'icônes du tableau soient de la même famille, avec les teintes de statut à la
// place d'une couleur de page. Le mot passe en `aria-label` : la colonne est
// trop étroite pour lui, mais un lecteur d'écran ne doit pas se retrouver devant
// une cellule muette.
function Status({ failed }) {
  const label = t(failed ? "dashboard.journal.failed" : "dashboard.journal.ok");
  return (
    <span
      className={`page-mark dash-journal-mark ${failed ? "ko" : "ok"}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {failed ? <CrossIcon /> : <CheckIcon />}
    </span>
  );
}

// Le type de dépôt porté par le sceau de la page qui produit ce fichier : le
// micro de l'Enregistrement pour les voix, la plume de l'Édition pour le script.
// Ce sont les deux mêmes sceaux que le bouton de dépôt en haut de page, donc
// l'association se lit sans légende. Un fichier ni ZIP ni script n'est
// revendiqué par aucune page : pastille neutre, sans couleur de page.
function KindMark({ kind }) {
  const label = t(KIND_LABEL_KEY[kind] ?? KIND_LABEL_KEY.inconnu);
  if (kind === "inconnu") {
    return (
      <span className="page-mark dash-journal-mark unknown" role="img" aria-label={label} title={label}>
        ?
      </span>
    );
  }
  const page = kind === "script" ? "editor" : "recorder";
  // `label` explicite : dans cette colonne le sceau dit le TYPE de fichier, pas
  // la page dont il porte les couleurs.
  return (
    <span title={label}>
      <PageMark page={page} className="dash-journal-mark" label={label} />
    </span>
  );
}

// Le geste quotidien du respo : glisser un fichier reçu (ZIP de voix) ou produit
// (script.json de la page Édition) dans l'écran de dépôt GitHub de SON dépôt.
// Un seul bouton parce qu'il n'y a qu'un dossier, `uploads/` : l'Action déduit
// le type de l'extension. Deux cartes vers la même URL se liraient comme deux
// destinations différentes.
// Ce qu'on dépose se lit donc dans le libellé, pas dans le choix du bouton : les
// deux sceaux encadrent le texte (le micro de l'Enregistrement à gauche, la
// plume de l'Édition à droite) et les deux mots portent la couleur de leur page.
// « Déposer » reste en noir : c'est le geste, il n'appartient à aucune des deux.
// L'extension attendue est dite entre parenthèses dans le libellé même, plutôt
// qu'en exemples de noms de fichiers sur une deuxième ligne : c'est l'extension
// seule qui décide du traitement (`kind_of`), et le bouton tient sur une ligne.
// Masqué hors github.io (dev local, domaine perso) où l'URL est indevinable.
function UploadLinks() {
  const url = githubUploadUrl();
  if (!url) return null;
  // Pas de conteneur ici : les deux cartes de la page partagent `.dash-actions`,
  // qui les aligne sur la même largeur (cf. dashboard.css).
  return (
    <a className="dash-upload card lift-hover" href={url} target="_blank" rel="noreferrer">
      <PageMark page="recorder" className="dash-upload-mark" />
      {/* Les deux mots colorés sont des PARAMÈTRES : chacun porte la couleur de sa
          page, et la phrase garde l'ordre des mots de sa langue. L'ancien JSX était
          six fragments dans quatre spans imbriqués, où l'ordre comptait. */}
      <span className="dash-upload-text">
        <T
          k="dashboard.upload"
          p={{
            voices: (
              <span className="dash-upload-word page-recorder">
                {t("dashboard.upload.voices")}{" "}
                <span className="dash-upload-format">(ZIP)</span>
              </span>
            ),
            script: (
              <span className="dash-upload-word page-editor">
                {t("dashboard.upload.script")}{" "}
                <span className="dash-upload-format">(JSON)</span>
              </span>
            ),
          }}
        />
      </span>
      <PageMark page="editor" className="dash-upload-mark" />
    </a>
  );
}

// Le script de la pièce mis en page pour l'impression, construit à chaque
// déploiement par scripts/build_script_pdf.py depuis le MÊME script.json que le
// site (donc jamais un brouillon de l'éditeur : ce qui n'a pas été déposé n'est
// pas dedans).
//
// Sur l'Avancement et pas sur un accueil, parce que c'est au respo de décider
// quelle version fait foi et quand la distribuer. Le fichier reste servi à une
// URL publique du site : c'est la même discrétion que respo.html, pas un verrou.
//
// `.btn.primary`, le bouton de téléchargement du site : le même que le ZIP des
// prises (Enregistrement) et que le script (Édition). Un téléchargement se
// présente pareil partout, et l'aplat d'accent le sépare franchement de la
// carte de dépôt juste au-dessus, qui est l'autre geste de la page (aller
// déposer sur GitHub) et n'a aucune raison de lui ressembler.
//
// Pas de sceau ici, contrairement à la carte de dépôt : la plume y désigne le
// script.json qu'on DÉPOSE, la reprendre pour un PDF qu'on TÉLÉCHARGE ferait
// lire deux gestes opposés sous la même pastille. La flèche du téléchargement
// dit tout.
//
// « la pièce à imprimer » et non « le script de la pièce » : la carte de dépôt
// juste au-dessus dit déjà « script de la pièce (JSON) », et deux libellés
// partageant leur groupe de mots ne se distinguaient plus que par l'acronyme.
// Or PDF est le seul des trois (ZIP, JSON, PDF) qu'un respo lit sans y penser :
// on ne peut pas faire porter la différence à celui qu'il ne connaît pas.
// « à imprimer » dit l'usage, et le mot « script » reste au dépôt, où il
// désigne le fichier de travail.
const SCRIPT_PDF_HREF = "data/script.pdf";

function ScriptPdfLink({ title }) {
  // Le PDF est gitignoré et produit par DEUX étapes `continue-on-error` de
  // build.yml : il manque dès que l'install LaTeX ou la compilation échoue, sur
  // une pièce jamais saisie, et en dev tant qu'on n'a pas lancé le script à la
  // main. On sonde donc avant de proposer le bouton, exactement comme
  // `githubUploadUrl()` masque la carte de dépôt plutôt que de forger un 404 :
  // dans le seul canal de retour du respo, un téléchargement qui rend une page
  // d'erreur renommée « transport-de-femmes.pdf » est bien pire que pas de
  // bouton du tout, parce qu'il se croit réussi.
  //
  // `null` = pas encore su, et on n'affiche rien : le bouton apparaît un instant
  // après la page, il ne disparaît JAMAIS sous la souris. `HEAD` parce qu'on ne
  // veut que le code de retour, pas 150 ko de PDF à chaque ouverture.
  const [ready, setReady] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(SCRIPT_PDF_HREF, { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setReady(res.ok);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) return null;

  // Le repli du slug est OBLIGATOIRE et se choisit par appelant : « ??? » est un
  // titre non vide dont il ne reste rien après nettoyage, et le repli d'un
  // personnage (l'usage d'origine de slugify) n'a aucun sens sur un PDF de
  // pièce. Il vient du catalogue, comme tout nom de fichier téléchargé.
  const name = slugify(title, t("dashboard.pdfSlug"));
  return (
    // `download` renomme au passage : le respo reçoit « transport-de-femmes.pdf »
    // et pas « script.pdf », qui ne dit rien une fois dans le dossier des
    // téléchargements.
    <a
      className="btn primary dash-script-btn lift-hover"
      href={SCRIPT_PDF_HREF}
      download={`${name}.pdf`}
    >
      <DownloadIcon />
      <span>
        <T
          k="dashboard.pdf"
          p={{ format: <span className="dash-script-format">(PDF)</span> }}
        />
      </span>
    </a>
  );
}

// Characters × scenes grid: "recorded / total" ratio in each cell. Acts,
// scene numbers and character names carry the same ambre/vert tint as the
// cells, so a whole row, column or act reads as done at a glance.
//
// La colonne des noms est figée (CSS), le reste défile dans le conteneur : une
// pièce à quinze scènes ne tient sur aucun téléphone, et une case « 2/5 » sans
// son nom ne dit rien. Le conteneur défilant est donc une région nommée et
// focalisable : il ne contient aucun élément focalisable, donc sans `tabIndex`
// il ne se parcourrait ni au clavier ni au lecteur d'écran.
function ProgressTable({ acts, scenes, rows }) {
  return (
    <div
      className="dash-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={t("dashboard.table")}
    >
      <table className="dash-table">
        <thead>
          <tr>
            <th className="dash-corner" />
            {acts.map((act) => (
              <th
                key={act.key}
                className={`dash-act ${statusClass(act.ok, act.total)}`}
                colSpan={act.span}
              >
                {act.title}
              </th>
            ))}
          </tr>
          <tr>
            <th className="dash-corner" />
            {scenes.map((scene) => (
              <th
                key={scene.key}
                title={t("common.actScene", { act: scene.act, scene: scene.title })}
                className={`dash-scene ${statusClass(scene.ok, scene.total)}`}
              >
                {scene.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.character.id}>
              {/* Le nom est enveloppé pour pouvoir être coupé quand la place
                  manque (la colonne est figée, elle prend sur les scènes) ;
                  le `title` le rend alors en entier. */}
              <th
                className={`dash-name ${statusClass(row.ok, row.total)}`}
                title={row.character.name}
              >
                <span className="dash-name-text truncate">{row.character.name}</span>
              </th>
              {row.cells.map((cell, i) =>
                // Pas de réplique dans cette scène : case vide, sans marqueur.
                cell.total === 0 ? (
                  <td key={scenes[i].key} className="empty" />
                ) : (
                  <td key={scenes[i].key} className={statusClass(cell.ok, cell.total)}>
                    {/* Deux éléments et pas une chaîne : les deux nombres n'ont
                        pas la même graisse (l'enregistré ressort du total). Chacun
                        passe par `fmt.number`, le formateur des nombres écrits
                        seuls, hors de toute phrase. */}
                    <span className="dash-cell-ok">{fmt.number(cell.ok)}</span>
                    <span className="dash-cell-total">/{fmt.number(cell.total)}</span>
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
