import { useEffect, useRef, useCallback } from "react";
import { DEFAULT_LOCALE } from "../shared/i18n.js";

// The preferred regional voice for each play language. No installed voice carries
// a bare tag, so without this table the exact preference would never be of any
// use and any variant would win.
const REGIONAL = { fr: "fr-fr", en: "en-gb" };

// Browser TTS fallback (SpeechSynthesis) for lines whose real clip is not
// (yet) available. v1 used offline TTS; this is new code.
//
// Contract: speak(text, onEnd) ALWAYS fires onEnd asynchronously, exactly
// once. When SpeechSynthesis is unavailable, a reading-paced timer stands in
// (~80 ms per character), so the caller's advance loop stays timed instead of
// recursing synchronously through the whole scene.
//
// `language` is the language of the PLAY, not the reader's UI locale, and the
// distinction is the whole point: this voice stands in for an actor speaking a
// line, so it must pronounce the text in the language the text is written in. An
// English reader of a French play still hears French. Until script.json carried
// its own `language`, this was pinned to fr-FR and read every play with a French
// voice, which is unusable for anyone who forks the project.
export default function useTts(language) {
  const voiceRef = useRef(null);
  const timerRef = useRef(null);
  // A BCP 47 tag for the synthesiser. Our locales are bare ("fr"), and no installed
  // voice ever is, so a bare tag alone would make the exact-match branch below
  // dead code and let any regional voice win: a fr-CA voice could take a French
  // play where the old code explicitly preferred fr-FR. Hence a regional default
  // per language, still falling back to the prefix when it is not installed.
  const lang = REGIONAL[language] ?? REGIONAL[DEFAULT_LOCALE];
  const prefix = language || DEFAULT_LOCALE;

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // An exact regional match first (fr-FR, en-GB…), then any voice of the
      // language, then none at all and the browser uses its default. Matching on
      // the prefix matters: a machine may only have en-US installed for a play
      // written in English, and that voice is right.
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

  // iOS/Safari mobile: speechSynthesis is only allowed to speak if it has been
  // primed at least once INSIDE a user gesture. Without that, the 1st TTS line
  // triggered from a callback (the end of an mp3, a timer) fails silently (neither
  // onend nor onerror) and playback stays frozen. To be called from the Play
  // click, like the creation of the AudioContext.
  const unlock = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    } catch {
      /* no synthesiser available: the timed fallback takes over */
    }
  }, []);

  // speak(text, onEnd): onEnd fires once, asynchronously, whether the
  // utterance ends, errors, or TTS is unsupported (timed fallback).
  const speak = useCallback(
    (text, onEnd) => {
      cancel();
      if (!("speechSynthesis" in window)) {
        // Silent reading-paced advance (text stays visible on screen).
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
          // setTimeout(0) so onEnd is asynchronous even if the browser fires
          // an error event synchronously from speak().
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
