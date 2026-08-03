import { useEffect, useRef, useCallback } from "react";
import { DEFAULT_LOCALE } from "../shared/i18n.ts";

// Our locales are bare ("fr") and no installed voice ever is, so without this table the
// exact-match branch below is dead code and any variant wins (fr-CA on a French play).
const REGIONAL: Record<string, string> = { fr: "fr-fr", en: "en-gb" };

// Contract: speak(text, onEnd) fires onEnd asynchronously, exactly once, even with no
// SpeechSynthesis (a reading-paced timer stands in), so the caller's advance loop never
// recurses synchronously through a scene. `language` is the PLAY's, not the reader's.
export default function useTts(language: string) {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang = REGIONAL[language] ?? REGIONAL[DEFAULT_LOCALE];
  const prefix = language || DEFAULT_LOCALE;

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Exact regional match, then any voice of the language (en-US on an English play is
      // right), then the browser's default.
      voiceRef.current =
        voices.find((v) => v.lang.toLowerCase().replace("_", "-") === lang) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
        null;
    };
    pickVoice();
    // Chrome loads voices asynchronously.
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, [lang, prefix]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  // iOS/Safari: prime once INSIDE a user gesture, or the first TTS line from a callback
  // fails silently (no onend, no onerror) and playback freezes.
  const unlock = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    } catch {
      /* no synthesiser available: the timed fallback takes over */
    }
  }, []);

  const speak = useCallback(
    (text: string, onEnd: () => void) => {
      cancel();
      if (!("speechSynthesis" in window)) {
        // Silent reading-paced advance; the text stays on screen.
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          onEnd();
        }, Math.max(2000, text.length * 80));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      if (voiceRef.current) utterance.voice = voiceRef.current;
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          // setTimeout(0) because some browsers fire error synchronously from speak().
          setTimeout(onEnd, 0);
        }
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [cancel, lang]
  );

  return { speak, cancel, unlock };
}
