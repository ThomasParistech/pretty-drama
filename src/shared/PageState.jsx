import React from "react";
import PageHeader from "./PageHeader.jsx";
import { t } from "./locale.js";

// Écran plein-page d'attente ou de blocage (manifest/script pas encore
// chargé, erreur, navigateur incompatible…), partagé par toutes les pages :
// bandeau de marque + un mot dans une carte (`.page-notice`, theme.css).
// LES DEUX ÉTATS prennent la carte, l'attente comme le message : ce sont deux
// moments du même écran, et le second succède presque toujours au premier, donc
// une carte qui n'arriverait qu'ensuite se lirait comme un changement de page.
// `.loading-state` ne fait plus qu'adoucir l'encre par-dessus.
// `error` peut être une chaîne ou du JSX ; `className` s'ajoute à la carte
// (ex. "load-error" côté éditeur, qui l'élargit pour ses paragraphes).
export default function PageState({
  page,
  title,
  error = null,
  // A default parameter, so it is evaluated per call and picks up the locale
  // rather than freezing a string at module load.
  loading = t("common.loadingPlay"),
  className = "",
}) {
  return (
    <>
      <PageHeader page={page} title={title} />
      {error != null ? (
        <div className={`page-notice ${className}`.trim()}>{error}</div>
      ) : (
        <div className="page-notice loading-state">{loading}</div>
      )}
    </>
  );
}
