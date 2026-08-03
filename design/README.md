# Livraison design : l'icône de la marque

Ce dossier n'est pas construit et n'est servi par personne : c'est la **référence**
des deux masques de PrettyDrama, gardée pour qu'on puisse comparer le dessin
intégré à celui qui a été livré. Il tenait avant dans une archive
`Drama rehearsal tool icons.zip` à la racine du dépôt, qu'un zip rendait
inconsultable et indifférenciable d'un oubli ; les deux SVG font 7 ko de texte,
donc un `git diff` y a un sens.

## Les deux fichiers

- `drama-wine.svg` (variante 5A) : masques en vin `#8C2338`, aplats d'intérieur
  en crème `#FAF3EC`, sans jeton, pour un usage direct sur le fond de page.
- `drama-token.svg` (variante 5D) : le même dessin posé dans le jeton sable
  `#F6E7DC`.

## Ce que le dépôt en a fait

`drama-wine.svg` est la source de `MasksIcon` (`src/shared/icons.tsx`) : ses 8
tracés et leurs `transform` y sont repris tels quels, **et ne se redessinent
pas**. Deux écarts assumés, qui ne touchent aucune forme : les remplissages
passent en `currentColor` et `var(--page-mark-soft)` pour que la marque suive le
système des sceaux au lieu de figer des hex, et le `viewBox` est recadré au carré
(`37.5 36 262 262`), l'encre étant décentrée dans la boîte d'origine. Les mêmes
tracés servent aux favicons des deux accueils (`index.html`, `respo.html`).
`drama-token.svg` n'est pas intégré en tant que fichier : c'est son accord vin
sur sable que `theme.css` étend aux trois pages de la troupe, et c'est aussi
celui des favicons de la marque et de leur `apple-touch-icon.png`, comme la
livraison le recommandait (« Favicon : utiliser `drama-token.svg` »).

Donc la marche à suivre de la section suivante ne décrit **pas** l'intégration
réelle : les tracés sont inlinés dans un composant React, il n'y a pas de balise
`<img>` vers ces fichiers, et rien ne les copie dans `dist/`. Elle est gardée
pour la livraison, pas pour être appliquée.

## Notes de la livraison

Recopiées verbatim de l'archive, tirets cadratins de la livraison compris (la
convention du dépôt les proscrit, mais un document reçu ne se réécrit pas).

> # PrettyDrama — icône de titre
>
> Deux fichiers, dessin identique à la référence fournie (tracés non modifiés : seuls le fond
> carré et les couleurs ont changé). Optimisés : 9,4 ko -> ~3,5 ko chacun.
>
> - `icons/drama-wine.svg` — variante **5A** : masques en vin (#8C2338), intérieur crème (#FAF3EC).
>   Pour un usage sans jeton, directement sur le fond crème de la page.
> - `icons/drama-token.svg` — variante **5D** : le même dessin posé dans le jeton sable (#F6E7DC).
>   Remplacement direct de l'icône actuelle du header, même encombrement.
>
> ## Notes d'implémentation
>
> - viewBox `0 0 329 345` (un peu plus haut que large) : contraindre la **hauteur** et laisser la
>   largeur libre, ou fixer width/height égaux avec `object-fit: contain` — jamais d'étirement.
> - Icône décorative : garder `alt=""`, le mot « PrettyDrama » porte déjà le nom.
> - Favicon : utiliser `drama-token.svg`, le jeton plein reste lisible à 16 px.
> - Les intérieurs des masques sont des **aplats opaques** (crème / sable), pas de transparence.
>   Si le fond de page change, mettre à jour ces valeurs dans le fichier (attributs `fill`).
> - Aucune dépendance, aucun `<style>`, aucun id : les fichiers peuvent être inlinés tels quels.
>
> ## Couleurs
>
> | Rôle | Hex |
> | --- | --- |
> | Vin — trait, mot-vedette | `#8C2338` |
> | Crème — fond de page, intérieur 5A | `#FAF3EC` |
> | Sable — jeton, intérieur 5D | `#F6E7DC` |
