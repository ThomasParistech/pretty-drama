import { useEffect, useState } from "react";
import { fetchManifest, MANIFEST_ERROR_MESSAGE } from "./data.js";

// Le seul chargeur de manifest, partagé par l'Enregistrement, la Répétition,
// la Répartition et l'Avancement, pour que le comportement de chargement et
// d'erreur (et sa formulation française) ne puisse pas dériver d'une page à
// l'autre.
export default function useManifest() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then((m) => !cancelled && setManifest(m))
      .catch(() => !cancelled && setError(MANIFEST_ERROR_MESSAGE));
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, error };
}
