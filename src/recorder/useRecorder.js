import { useEffect, useRef, useState, useCallback } from "react";

// MediaRecorder output differs per browser (webm/opus on Chrome/Firefox,
// mp4/aac on Safari). We do NOT care: the GitHub Action transcodes everything
// to mp3 with ffmpeg. We only pick a supported container and a matching
// file extension for the ZIP.
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return ""; // let the browser choose its default
}

export function extensionForMimeType(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

// One-shot in-memory recorder: start(lineId), then stop() resolves with the
// recorded Blob. A single line records at a time.
//
// The mic stream is reused across takes (so the browser asks permission
// once per session), but release() stops the tracks: call it when the
// recording session is over (ZIP downloaded, component unmounted) so the
// browser's mic-in-use indicator turns off.
export default function useRecorder() {
  const [recordingLineId, setRecordingLineId] = useState(null);
  const [error, setError] = useState(null);
  // Elapsed seconds of the current take (0 outside a recording): feeds the
  // displayed timer, which makes it plain that recording is under way.
  const [elapsed, setElapsed] = useState(0);
  // AnalyserNode wired to the mic during the take: used to draw the live
  // oscilloscope. null outside a recording.
  const [analyser, setAnalyser] = useState(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsed(0);
  }, []);

  // Tears down the preview's Web Audio graph (the analyser never touches the
  // mic's tracks: the capture stays driven by the MediaRecorder).
  const stopAnalyser = useCallback(() => {
    setAnalyser(null);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const release = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Stop capturing (and the timer + preview) when the page unmounts.
  useEffect(
    () => () => {
      stopTimer();
      stopAnalyser();
      release();
    },
    [release, stopTimer, stopAnalyser]
  );

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async (lineId) => {
    setError(null);
    try {
      // Reuse the stream across takes so the browser asks permission once.
      if (!streamRef.current || !streamRef.current.active) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingLineId(lineId);
      // Live timer: realigned on the clock at every tick (robust to the
      // throttling of background tabs).
      const startedAt = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      // Preview of the audio profile: wires an analyser as a tap off the mic
      // (never connected to the output, hence no feedback howl). Optional: if Web
      // Audio is missing, we record all the same, without the preview.
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(streamRef.current);
          const node = ctx.createAnalyser();
          node.fftSize = 1024;
          node.smoothingTimeConstant = 0.8;
          source.connect(node);
          audioCtxRef.current = ctx;
          setAnalyser(node);
        }
      } catch {
        /* preview unavailable: of no consequence for the capture */
      }
    } catch (err) {
      // A CODE and not a sentence: this module is covered by `node --test`
      // (useRecorder.test.js holds the contract of the audio extension), so it
      // must import nothing that touches the DOM, and `locale.js` reads the URL,
      // the storage and the browser as soon as it is imported. The page
      // translates this code.
      setError("mic");
      throw err;
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      stopTimer();
      stopAnalyser();
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecordingLineId(null);
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "";
        const blob = new Blob(chunksRef.current, mimeType ? { type: mimeType } : undefined);
        setRecordingLineId(null);
        resolve({ blob, mimeType });
      };
      recorder.stop();
    });
  }, [stopTimer, stopAnalyser]);

  return { supported, recordingLineId, elapsed, analyser, error, start, stop, release };
}
