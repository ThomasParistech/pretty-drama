# PrettyDrama : répétez votre pièce avec vos vraies voix

Un site web gratuit pour votre troupe de théâtre : chaque acteur enregistre ses
répliques avec sa vraie voix, et tout le monde peut ensuite **répéter « à
l'italienne »** depuis son téléphone ou son ordinateur. La pièce se joue toute
seule, et vous dites vos répliques au bon moment.

**Aucune installation, aucun logiciel : tout se passe dans le navigateur.**

## Les adresses de ce site

<!-- prettydrama:site https://exemple.github.io/les-troubadours/ -->

| Adresse | Pour qui |
|---------|----------|
| <https://exemple.github.io/les-troubadours/> | **la troupe** : elle y choisit une pièce, puis Répétition, Enregistrement ou Répartition. C'est ce lien que vous partagez. |
| <https://exemple.github.io/les-troubadours/respo.html> | **vous** : la gestion des pièces, et les cinq pages de chacune. **Mettez-le en favori**, rien n'y mène depuis l'autre adresse. |
| <https://exemple.github.io/les-troubadours/plays/dev/respo.html> | **le banc d'essai** : une pièce de démonstration absente de la liste, pour regarder le site fonctionner sans toucher à la vôtre. |

Ces adresses s'écrivent toutes seules : chaque mise en ligne les réinscrit ici. Dans
une copie toute neuve du modèle, elles désignent encore le site d'origine jusqu'à la
première mise en ligne (étape 3 ci-dessous). En cas de doute,
[**Settings → Pages**](../../settings/pages) redonne la première.

<!--
  Maintainer note, in English like the rest of the repo. Every link into GitHub in
  this file is RELATIVE and starts with `../../`, and that is the whole trick: a root
  README is rendered as if it sat at `/<owner>/<repo>/blob/<branch>/README.md`, so
  `../../x` resolves to `/<owner>/<repo>/x`. The link therefore points at the reader's
  OWN copy, in a file that is copied verbatim by "Use this template" and cannot know
  either half of that address. Absolute links would send every troupe to this
  repository instead of theirs. `../../` is the exact depth; `../` or `../../../`
  land somewhere else and are what scripts/tests/test_readme.py checks. What no test
  can check is that the TARGET is a route GitHub really serves: it cannot be reached
  from CI, and a link at a dead path renders exactly like a live one. Verified by hand,
  once, on a real repository. `/deployments/<environment>` is one of the dead ones.
  Only github.com resolves these: read elsewhere, they are dead. Accepted, the README
  is read on GitHub.

  The site addresses just above are the other half, and they are absolute because they
  are meant to be COPIED (into a WhatsApp message, a bookmark), not clicked from here.
  A relative link cannot do that. They are rewritten after every deployment by
  ci/update_readme_urls.py, which substitutes the address recorded in the
  `prettydrama:site` marker throughout this file: the three rows follow because each
  one starts with it. Add a fourth and it follows too, for free. The `plays/dev/` row
  is the one that can rot on its own: a troupe that deletes the test bench keeps the
  link. Left in anyway, the fork that does that is the fork that reads this comment.
-->


---

## Les cinq pages d'une pièce

Le site peut héberger plusieurs pièces : on en choisit une en arrivant, puis on
travaille dedans avec ces cinq pages.

| Page | Pour qui | Ce qu'on y fait |
|------|----------|-----------------|
| **Répétition** | Toute la troupe | Choisir sa scène et son personnage, masquer ses répliques, avancer réplique par réplique. Les répliques pas encore enregistrées sont lues par une voix de synthèse en attendant. |
| **Enregistrement** | Les acteurs | Choisir son personnage, enregistrer ses répliques, télécharger un fichier `voix-xxx.zip` (`voices-xxx.zip` en anglais) et l'envoyer au responsable (mail, WhatsApp, clé USB, comme vous voulez). |
| **Répartition** | Toute la troupe | Voir comment la parole se partage : la part des mots et des répliques de chaque personnage, et une chronologie du dialogue où chaque carré est un mot, coloré par celui qui le prononce. |
| **Édition** | Le responsable | Saisir et corriger la pièce : personnages, actes, scènes, répliques. |
| **Avancement** | Le responsable | Voir qui a enregistré quoi, déposer les voix reçues, mettre à jour le script, et lire le journal des derniers dépôts. |

Les acteurs n'ont **besoin d'aucun compte** : ils ouvrent le lien du site, c'est tout.

Si vous modifiez le texte d'une réplique déjà enregistrée, elle passe
automatiquement « À refaire » chez l'acteur concerné. Un simple changement de
ponctuation ou de majuscules ne compte pas.

---

## Installation (une seule fois, ~5 minutes)

À faire par **une seule personne** de la troupe (le ou la « responsable »), avec
un compte GitHub gratuit.

1. **Créez votre copie du site.** En haut de cette page : **« Use this template »**
   → **« Create a new repository »**, donnez-lui le nom de votre troupe
   (par exemple `les-troubadours`), puis **« Create repository »**.
2. **Activez la publication.** Dans **votre** dépôt :
   [**Settings → Pages**](../../settings/pages) → sous **« Source »**, choisissez
   **GitHub Actions**. C'est la seule étape que personne ne peut faire à votre
   place : GitHub l'interdit aux automates.
3. **Lancez la première mise en ligne.** [**Actions → build**](../../actions/workflows/build.yml)
   → **« Run workflow »**, et comptez deux minutes. Le site part en ligne, et son
   adresse s'inscrit toute seule en haut de ce README. Si l'étape 2 a été oubliée, le
   **build** s'arrête en rouge au bout de quelques secondes et affiche la marche à
   suivre (en anglais) : rien n'est cassé, rien n'est perdu, il reste à activer la
   publication puis à relancer.
4. **Notez vos adresses.** Le **build** de l'étape 3 les affiche en haut de son
   compte rendu, et vient de les écrire tout en haut de ce README :
   [remontez-y](#les-adresses-de-ce-site). Partagez la première avec la troupe,
   gardez la deuxième en favori.

C'est fini : le site est en ligne, avec une pièce d'exemple que vous allez
remplacer par la vôtre.

### Plusieurs pièces

Le site en héberge autant que vous voulez, et **chaque pièce est indépendante** :
ses pages, ses voix, ses dépôts et son journal lui appartiennent. On choisit la
pièce en entrant, et une fois dedans le reste n'existe plus.

Pour en créer une : sur votre page de gestion, la tuile **« Nouvelle pièce »** (le
**+** en pointillés, à la suite des pièces) ouvre une petite fenêtre. Donnez
le titre et cliquez sur **« Créer la pièce »**. GitHub s'ouvre avec le fichier déjà
prêt (il ne contient que le titre), vous n'avez qu'à confirmer l'enregistrement avec
le bouton vert en bas de la page. La pièce apparaît quelques minutes plus tard, prête
à être écrite dans l'Édition.

Pour en supprimer une, c'est le seul geste qui demande de passer par GitHub : sur
votre dépôt, ouvrez le dossier `plays/`, puis celui de la pièce, et supprimez-le.
Quelques minutes plus tard la pièce a disparu de la liste.

Si votre site tournait déjà avec une seule pièce avant cette version, lancez une
fois `python3 scripts/migrate_to_plays.py <nom-de-la-piece>` (par exemple
`transport-de-femmes`) et commitez le résultat : votre pièce descend dans son
propre dossier, sans rien perdre.

---

## Au quotidien

Tout se passe sur **votre accueil** (`…/respo.html`) : vous n'avez plus jamais
besoin de revenir sur cette page GitHub.

Chaque fichier part de la page qui le concerne, **pièce par pièce**, et les deux
gestes se ressemblent : une tuile blanche, une phrase qui nomme le fichier, puis la
page de dépôt de GitHub où vous glissez le fichier avant de confirmer avec le
bouton vert en bas de la page. Le site reconnaît chaque fichier tout seul.

C'est la tuile de la pièce qui décide à quelle pièce le dépôt appartient : un
fichier déposé depuis la mauvaise pièce est refusé et vous le dit, plutôt que
d'écrire les voix d'une pièce par-dessus une autre.

**Écrire ou corriger la pièce** (page Édition)
1. Ajoutez vos personnages, tapez les répliques (la touche **Entrée** crée la
   suivante), choisissez qui parle.
2. Cliquez sur **« Mettre à jour le script de la pièce »**, en haut à droite. La
   tuile reste éteinte tant que vous n'avez rien modifié. Une fenêtre annonce ce
   qui va se passer, puis **« Continuer »** télécharge le `script.json` et ouvre
   GitHub : glissez-y le fichier et confirmez.

**Publier les voix reçues** (page Avancement) : la tuile **« Déposer les voix
(ZIP) »**, sous le titre de la pièce concernée. Déposez-y le ou les fichiers
`voix-xxx.zip` reçus (seule l'extension compte, pas le nom).

Dans les deux cas le site se met à jour tout seul en quelques minutes : il
nettoie le son, met les voix en ligne, prend en compte le nouveau texte et
rafraîchit l'Avancement. Les fichiers disparaissent du dossier une fois traités,
c'est normal. Un acteur peut envoyer plusieurs ZIP au fil du temps, même
partiels : chaque nouvel enregistrement remplace simplement l'ancien pour la
même réplique.

**Suivre** (page Avancement) : le tableau dit qui a fini et ce qui reste à faire
ou à refaire. En bas de page, le journal donne une ligne par fichier déposé,
avec sa date, une pastille verte ou orange selon que le fichier est passé ou
non, le sceau de son type (micro pour les voix, plume pour le script) et, pour
les voix, le nombre de répliques publiées. Une ligne en échec dit aussi
pourquoi : pour un ZIP abîmé pendant l'envoi, il n'y a rien à réparer, demandez
simplement une nouvelle prise à l'acteur ; pour un script refusé, la pièce en
ligne n'a pas changé, re-téléchargez-le depuis l'Édition et redéposez-le. Si
aucune nouvelle ligne n'apparaît quelques minutes après un dépôt, allez voir
[l'onglet **Actions**](../../actions) de votre dépôt (le site, lui, continue de
fonctionner avec sa version précédente).

**Tout republier** : [**Actions → build**](../../actions/workflows/build.yml) →
**« Run workflow »**. Le
site entier est reconstruit et remis en ligne à partir de ce que contient le
dépôt, sans rien envoyer et sans rien perdre. C'est le même bouton qu'à
l'installation, et c'est la réponse à « le site n'a pas l'air à jour » : à
utiliser aussi après avoir activé la publication en retard, ou après une
modification faite à la main sur GitHub.

---

## Licence

PrettyDrama Voices est un logiciel libre, publié sous licence
[MIT](LICENSE) : vous pouvez le forker, le modifier et le réutiliser
librement, y compris pour un usage commercial, à condition de conserver la
mention de copyright et le texte de la licence.

Copyright (c) 2026 Thomas Rouch.

Les fichiers de votre troupe (tout ce qui vit sous `plays/`, scripts et voix
enregistrées) vous appartiennent : la licence ne couvre que le code de l'outil.
