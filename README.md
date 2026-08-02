# PrettyDrama : répétez votre pièce avec vos vraies voix

Un site web gratuit pour votre troupe de théâtre: chaque acteur enregistre ses
répliques avec sa vraie voix, et tout le monde peut ensuite **répéter « à
l'italienne »** depuis son téléphone ou son ordinateur. La pièce se joue toute
seule, et vous dites vos répliques au bon moment.

**Aucune installation, aucun logiciel: tout se passe dans le navigateur.**

## Créer votre première pièce

[**Créer une pièce**](../../new/main?filename=uploads/_new-play/nouvelle-piece.txt&value=%0A---%0ARemplacez%20la%20premi%C3%A8re%20ligne%20par%20le%20titre%20de%20votre%20pi%C3%A8ce%2C%20puis%20validez.%20Elle%20sera%20en%20ligne%20dans%20quelques%20minutes.%0A)
ouvre une page GitHub où le fichier est déjà préparé. Écrivez le titre de votre pièce
sur la première ligne, puis validez avec le bouton vert. Quelques minutes plus tard,
la pièce est en ligne et le site est publié.

C'est exactement le geste que vous referez ensuite depuis la page de gestion, avec la
tuile « Nouvelle pièce ».


<!--
  Maintainer note, in English like the rest of the repo. This file NEVER carries the
  site's address, and no workflow writes into it. The address is not knowable before a
  deployment (both halves of <owner>.github.io/<repo>/ change when the template is
  copied), and GitHub already shows it in two places the coordinator owns: Settings >
  Pages, always live, and the About panel once they tick "Use your GitHub Pages
  website", which is a snapshot into the repo's `homepage` field and goes dead on a
  rename. Worth naming both. A third copy HERE bought nothing and cost a bot commit in
  every troupe's history, a contents: write on build.yml, and a rewriting script with
  its own test suite. All three are gone.

  Every link into GitHub in this file is RELATIVE and climbs exactly `../../`: a root
  README renders at /<owner>/<repo>/blob/<branch>/README.md, so `../../x` names the
  reader's OWN repository without knowing either half of the address, while an absolute
  one sends every troupe to the template. Only routes GitHub really serves:
  /deployments/<environment> is NOT one (measured 404), and a relative link at a dead
  path renders exactly like a live one, which no test can reach from CI.
  test_readme.py checks the depth, the absence of a branch name outside /new/ and
  /upload/ (the two routes that require a real one), and that no absolute link names a
  repository sub-page.
-->


## Licence

PrettyDrama Voices est un logiciel libre, publié sous licence
[MIT](LICENSE): vous pouvez le forker, le modifier et le réutiliser
librement, y compris pour un usage commercial, à condition de conserver la
mention de copyright et le texte de la licence.

Copyright (c) 2026 Thomas Rouch.

Les fichiers de votre troupe (scripts et voix
enregistrées) vous appartiennent: la licence ne couvre que le code de l'outil.
