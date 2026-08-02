import { useEffect, useState } from "react";
import { fetchManifest } from "./data.js";
import { t } from "./locale.js";

// The only manifest loader (Recording, Rehearsal, share, Progress).
// The message is read here, not in data.js: that module is under `node --test` and
// must not import locale.js.
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
