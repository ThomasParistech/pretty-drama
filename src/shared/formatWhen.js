import { fmt } from "./locale.js";

// The date of an upload, year included (a log is read back months later, and two
// rehearsal seasons go through the same days). Returns null on an unreadable
// timestamp, rather than showing "Invalid Date".
//
// `fmt.dateTime` replaces two `toLocale*` calls pinned to "fr-FR" and the linking
// word "à" that joined them: a locale's format carries its own separator (a comma
// in English), so there was nothing to translate, only to stop writing it by hand.
//
// Shared since two pages date an upload: a play's Progress log, and each play's
// card on the management page, where the date of the last upload acts as a sign of
// life. A module of its own and not a function of `data.js`: that one is covered by
// `node --test` and cannot import `locale.js`, which reads the URL, the storage and
// the navigator as soon as it is imported.
export default function formatWhen(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return fmt.dateTime(then);
}
