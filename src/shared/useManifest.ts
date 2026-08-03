import { useEffect, useState } from "react";
import { fetchManifest } from "./data.ts";
import { t } from "./locale.ts";
import type { Manifest } from "./types.ts";

// The only manifest loader (Recording, Rehearsal, share, Progress).
// The message is read here, not in data.ts: that module is under `node --test` and
// must not import locale.ts.
export default function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

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
