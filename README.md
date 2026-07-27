# 🎭 PrettyDrama — répétez votre pièce avec vos vraies voix

Un site web gratuit pour votre troupe de théâtre : chaque acteur enregistre ses répliques
avec sa vraie voix, et tout le monde peut ensuite **répéter « à l'italienne »** depuis son
téléphone ou son ordinateur — la pièce se joue toute seule, et vous dites vos répliques
au bon moment.

**Aucune installation, aucun logiciel : tout se passe dans le navigateur.**

---

## 📶 État du site

<!-- BUILD_STATUS_START -->
✅ **Dernier traitement réussi** — tout est en ligne.

_Mis à jour le 27/07/2026 16:28 UTC._
<!-- BUILD_STATUS_END -->

---

## ⬆️ Raccourcis — déposer sur GitHub

> Les deux boutons du quotidien. Chacun ouvre l'écran de dépôt de **votre** dépôt :
> glissez le fichier dans la zone, puis cliquez sur **« Commit changes »**.
> (Aucun dossier à chercher ; laissez le message de commit proposé par GitHub.)

### 🎙️ &nbsp; [Déposer des voix reçues (`voix-xxx.zip`) →](../../upload/master/uploads/voix)

### ✍️ &nbsp; [Mettre à jour le script de la pièce (`script.json`) →](../../upload/master/data)

---

## 🚀 Installation (une seule fois, ~5 minutes)

> À faire par **une seule personne** de la troupe (le ou la « responsable »).
> Il faut juste un compte GitHub (gratuit) — celui avec lequel vous lisez cette page.

### 1. Créez votre copie du site

En haut de cette page, cliquez sur le bouton vert **« Use this template »** →
**« Create a new repository »**. Donnez-lui le nom de votre troupe (par exemple
`les-troubadours`) et cliquez sur **« Create repository »**.

### 2. Activez la publication du site

Dans **votre** nouveau dépôt :

1. Cliquez sur l'onglet **⚙️ Settings** (en haut).
2. Dans le menu de gauche, cliquez sur **Pages**.
3. Sous **« Build and deployment » → « Source »**, choisissez **GitHub Actions**.

C'est le seul réglage à faire. Quelques minutes plus tard, votre site est en ligne à
l'adresse indiquée sur cette même page **Settings → Pages** (quelque chose comme
`https://votre-nom.github.io/les-troubadours/`).

> 💡 Si rien ne se passe : allez dans l'onglet **Actions**, cliquez sur **build** à gauche,
> puis sur le bouton **« Run workflow »**.

### 3. Saisissez votre pièce

1. Ouvrez votre site, puis la page **✍️ Éditeur**.
2. Ajoutez vos personnages dans le panneau de gauche.
3. Tapez les répliques (la touche **Entrée** crée la réplique suivante), choisissez qui
   parle avec le menu déroulant de chaque réplique.
4. Quand vous avez fini : cliquez sur **« ⬇ Télécharger le script »**. Un fichier
   `script.json` arrive dans vos téléchargements.
5. Utilisez le raccourci **[✍️ Mettre à jour le script de la pièce](../../upload/master/data)**
   (en haut de cette page) : **glissez-déposez** le fichier `script.json`, puis cliquez sur
   **« Commit changes »**. (Le fichier remplace l'ancien — c'est normal.)

Le site se met à jour tout seul en quelques minutes.

### 4. Partagez l'adresse du site avec les acteurs

Envoyez-leur simplement le lien du site. Ils n'ont **besoin d'aucun compte** : ils ouvrent
la page **🎙️ Enregistrement**, choisissent leur personnage, enregistrent leurs répliques,
puis téléchargent un fichier `voix-xxx.zip` qu'ils vous envoient **comme ils veulent**
(mail, WhatsApp, clé USB…).

### 5. Déposez les voix reçues

À chaque fichier `voix-xxx.zip` reçu : utilisez le raccourci
**[🎙️ Déposer des voix reçues](../../upload/master/uploads/voix)**
(en haut de cette page), **glissez-déposez** le ou les ZIP, puis **« Commit changes »**.

C'est tout ! Le site s'occupe du reste automatiquement : il nettoie le son, met les voix
en ligne et met à jour la page **📊 Avancement**. Le fichier ZIP disparaît du dossier une
fois traité — c'est normal.

> Un acteur peut envoyer plusieurs ZIP au fil du temps (même partiels) : chaque nouvel
> enregistrement remplace simplement l'ancien pour la même réplique.

---

## 📖 La vie de la troupe ensuite

| Page | Qui | Pour quoi faire |
|------|-----|-----------------|
| **🎭 Répétition** | Tout le monde | Répéter : choisir sa scène, son personnage, masquer ses répliques, avancer réplique par réplique. Les répliques pas encore enregistrées sont lues par une voix de synthèse en attendant. |
| **🎙️ Enregistrement** | Les acteurs | Enregistrer ses répliques et télécharger son ZIP. |
| **📊 Avancement** | Le responsable | Voir qui a fini, qui doit s'y mettre, et quelles répliques sont « à refaire » parce que le texte a changé. |
| **✍️ Éditeur** | Le responsable | Corriger le texte au fil des répétitions (puis re-télécharger `script.json` et le redéposer dans `data/`). |

**Si vous modifiez le texte d'une réplique déjà enregistrée**, elle passera automatiquement
« À refaire » chez l'acteur concerné. Un simple changement de ponctuation ou de majuscules
ne compte pas.

**En cas de problème** (fichier abîmé, mauvais dépôt…), une **issue** s'ouvre
automatiquement dans l'onglet **Issues** de votre dépôt avec la marche à suivre, et
l'« État du site » en haut de cette page l'indique.

---

## 🔧 Pour les curieux et les développeurs

- Site statique **React + Vite** (4 pages : éditeur, enregistrement, répétition, avancement),
  hébergé sur **GitHub Pages**.
- Le traitement des voix (découpage des silences, normalisation du volume, conversion mp3)
  est fait par une **GitHub Action** (Python + ffmpeg) : voir `.github/workflows/build.yml`
  et `scripts/`.
- La source de vérité est `data/script.json` (produite par l'éditeur). L'Action génère
  `data/manifest.json`, seul fichier lu par les pages.
- Les identifiants de répliques et de personnages sont des **UUID** générés par l'éditeur,
  jamais réutilisés. Le navigateur stocke le **texte brut** au moment de l'enregistrement ;
  la normalisation (qui décide du statut « À refaire ») n'existe qu'à **un seul endroit** :
  `scripts/normalize.py`, appliquée aux deux côtés de la comparaison dans l'Action.
### Développement local

```bash
npm install
npm run dev        # toutes les pages en hot-reload
python -m unittest discover -s scripts/tests   # tests Python (normalisation + statuts)
```

Chaque écran a sa propre page (app Vite multi-pages) :

| Écran | URL en dev |
|-------|------------|
| 🏠 Accueil | `http://localhost:5173/` |
| ✍️ Éditeur | `http://localhost:5173/editor.html` |
| 🎙️ Enregistrement | `http://localhost:5173/recorder.html` |
| 🎭 Répétition | `http://localhost:5173/rehearsal.html` |
| 📊 Avancement | `http://localhost:5173/dashboard.html` |

Bon à savoir :

- En dev, `data/` et `clips/` sont servis **directement depuis le repo** (middleware
  `serveRepoData` dans `vite.config.js`) : modifiez `data/script.json` ou
  `data/manifest.json` à la main pour tester différents états, sans étape de build.
- Le micro fonctionne sur `localhost` sans HTTPS : la page Enregistrement est
  testable en dev.
- Pour tester le **build de prod** (ce que GitHub Pages servira) : en prod c'est
  l'Action qui copie `data/` et `clips/` dans `dist/`, donc il faut le faire à la main :

  ```bash
  npm run build && cp -r data clips dist/ && npm run preview
  ```
