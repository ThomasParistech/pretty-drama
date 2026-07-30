import { useEffect, useState } from "react";
import { fetchManifest } from "./data.js";
import { t } from "./locale.js";

// The only manifest loader, shared by the Recording, Rehearsal, Speaking share
// and Progress pages, so that neither the loading behaviour nor the wording of
// the error can drift from one page to another.
//
// The message is read here rather than in data.js because that module is covered
// by `node --test` and must not import locale.js, which touches `window`.
export default function useManifest() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then((m) => !cancelled && setManifest(m))
      .catch(() => !cancelled && setError(t("common.manifestError")));
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, error };
}
