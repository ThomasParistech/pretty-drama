import React from "react";
import PageHeader from "./PageHeader.jsx";

// Écran plein-page d'attente ou de blocage (manifest/script pas encore
// chargé, erreur, navigateur incompatible…), partagé par toutes les pages :
// bandeau de marque + message. `error` peut être une chaîne ou du JSX ;
// `className` s'ajoute au bloc d'erreur (ex. "load-error" côté éditeur).
export default function PageState({
  page,
  title,
  error = null,
  loading = "Chargement de la pièce…",
  className = "",
}) {
  return (
    <>
      <PageHeader page={page} title={title} />
      {error != null ? (
        <div className={`empty-state ${className}`.trim()}>{error}</div>
      ) : (
        <div className="loading-state">{loading}</div>
      )}
    </>
  );
}
