# PrettyDrama : répétez votre pièce avec vos vraies voix

Un site web gratuit pour votre troupe de théâtre: chaque acteur enregistre ses
répliques avec sa vraie voix, et tout le monde peut ensuite **répéter « à
l'italienne »** depuis son téléphone ou son ordinateur. La pièce se joue toute
seule, et vous dites vos répliques au bon moment.

**Aucune installation, aucun logiciel: tout se passe dans le navigateur.**

## Liens

- [Le site de la troupe](https://thomasparistech.github.io/pretty-drama/) <!-- ref: SITE_HOME -->
  elle y choisit une pièce, puis Répétition, Enregistrement ou Répartition.
  C'est ce lien que vous partagez.
- [La gestion des pièces](https://thomasparistech.github.io/pretty-drama/respo.html) <!-- ref: SITE_RESPO -->
  pour vous : les pièces, et les cinq pages de chacune. **Mettez-le en favori**,
  rien n'y mène depuis l'autre adresse.

Ces deux adresses s'écrivent toutes seules : chaque mise en ligne les réinscrit
ici. Elles pointent sur `example.com` tant que le site n'a pas été publié une
première fois.

<!--
  Maintainer note, in English like the rest of the repo. The links above are the
  only ones this repository rewrites, and the `ref:` comment after each is how:
  GitHub renders it as nothing, and ci/update_readme_urls.py replaces the TARGET of
  every link carrying a ref it knows, leaving the display text (French, ours) and
  everything outside the parentheses untouched. The ref names the destination page,
  not the current value, so there is nothing to keep in step: running it again just
  computes the same address.

  Adding a link is two steps and no cleverness: write it with a new `SITE_…` ref,
  add that ref to PATHS in the script. A `SITE_…` ref missing from PATHS stops the
  run rather than silently never updating; a ref outside the `SITE_` namespace is
  not this script's and is left alone.

  Only link pages that exist in EVERY copy. This prose is written once and never
  regenerated, so a page a fork can delete (the `plays/<id>/` test bench, a given
  play) would leave a link into a 404 in every README that inherited it.
-->


## Licence

PrettyDrama Voices est un logiciel libre, publié sous licence
[MIT](LICENSE) : vous pouvez le forker, le modifier et le réutiliser
librement, y compris pour un usage commercial, à condition de conserver la
mention de copyright et le texte de la licence.

Copyright (c) 2026 Thomas Rouch.

Les fichiers de votre troupe (scripts et voix
enregistrées) vous appartiennent: la licence ne couvre que le code de l'outil.
