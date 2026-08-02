import { fmt } from "./locale.js";

// Date of an upload, null on an unreadable timestamp rather than "Invalid Date".
// Its own module and not part of data.js: that one is under `node --test` and must
// not import locale.js (reads URL, storage and navigator on import).
export default function formatWhen(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return fmt.dateTime(then);
}
