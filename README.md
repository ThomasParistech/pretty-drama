# PrettyDrama : répétez votre pièce avec vos vraies voix

Un site web gratuit pour votre troupe de théâtre : chaque acteur enregistre ses
répliques avec sa vraie voix, et tout le monde peut ensuite **répéter « à
l'italienne »** depuis son téléphone ou son ordinateur. La pièce se joue toute
seule, et vous dites vos répliques au bon moment.

**Aucune installation, aucun logiciel : tout se passe dans le navigateur.**

---

## Les cinq pages du site

| Page | Pour qui | Ce qu'on y fait |
|------|----------|-----------------|
| **Répétition** | Toute la troupe | Choisir sa scène et son personnage, masquer ses répliques, avancer réplique par réplique. Les répliques pas encore enregistrées sont lues par une voix de synthèse en attendant. |
| **Enregistrement** | Les acteurs | Choisir son personnage, enregistrer ses répliques, télécharger un fichier `voix-xxx.zip` et l'envoyer au responsable (mail, WhatsApp, clé USB, comme vous voulez). |
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
2. **Activez la publication.** Dans **votre** dépôt : onglet **Settings** →
   **Pages** → sous **« Source »**, choisissez **GitHub Actions**.
   Si rien ne se passe : onglet **Actions** → **build** → **« Run workflow »**.
3. **Notez vos deux adresses**, indiquées sur **Settings → Pages** :

   | Adresse | Pour qui |
   |---------|----------|
   | `…github.io/les-troubadours/` | la troupe : Répétition et Enregistrement. C'est ce lien que vous partagez. |
   | `…github.io/les-troubadours/respo` | vous : les quatre pages. **Mettez-le en favori**, rien n'y mène depuis l'autre accueil. |

C'est fini : le site est en ligne, avec une pièce d'exemple que vous allez
remplacer par la vôtre.

---

## Au quotidien

Tout se passe sur **votre accueil** (`…/respo`) : vous n'avez plus jamais
besoin de revenir sur cette page GitHub.

Tout se dépose au même endroit : le bouton **« Déposer des voix ou le script de
la pièce »**, en haut de la page **Avancement**. Glissez vos fichiers dans la
zone, cliquez sur **« Commit changes »**, et c'est fini. Le site reconnaît
chaque fichier tout seul.

**Écrire ou corriger la pièce** (page Édition)
1. Ajoutez vos personnages, tapez les répliques (la touche **Entrée** crée la
   suivante), choisissez qui parle.
2. Cliquez sur le bouton de téléchargement (la flèche vers le bas, en haut à
   droite) : un fichier `script.json` arrive dans vos téléchargements. Il reste
   éteint tant que vous n'avez rien modifié.
3. Déposez-le avec le bouton ci-dessus.

**Publier les voix reçues** (page Avancement) : déposez le ou les fichiers
`voix-xxx.zip` reçus, avec le même bouton.

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
l'onglet **Actions** de votre dépôt (le site, lui, continue de fonctionner avec
sa version précédente).

---

## Licence

PrettyDrama Voices est un logiciel libre, publié sous licence
[MIT](LICENSE) : vous pouvez le forker, le modifier et le réutiliser
librement, y compris pour un usage commercial, à condition de conserver la
mention de copyright et le texte de la licence.

Copyright (c) 2026 Thomas Rouch.

Les fichiers de votre troupe (`data/script.json`, `clips/`, les voix
enregistrées) vous appartiennent : la licence ne couvre que le code de l'outil.
