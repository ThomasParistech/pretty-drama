import { useEffect, useRef, useState, useCallback } from "react";

// The container does not matter, the Action transcoding everything to mp3.
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return ""; // let the browser choose its default
}

export function extensionForMimeType(mimeType: string | null | undefined): string {
  if (!mimeType) return "webm";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

// start(lineId), stop() resolves with the Blob, one line at a time. The stream is reused
// across takes so permission is asked once; release() turns the mic-in-use indicator off.
export default function useRecorder() {
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  // A CODE and not a sentence, see `start` below.
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsed(0);
  }, []);

  // Only the preview's Web Audio graph: the analyser never touches the mic's tracks.
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

  const start = useCallback(async (lineId: string) => {
    setError(null);
    try {
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
      // Realigned on the clock at every tick, so background-tab throttling cannot drift it.
      const startedAt = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      // A tap off the mic, never connected to the output (no feedback howl), and optional.
      try {
        // `webkitAudioContext` for older Safari, declared in shared/types.ts.
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
      // A CODE: this module runs under `node --test` and must never import locale.ts, which
      // reads URL, storage and navigator on import. The page translates it.
      setError("mic");
      throw err;
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise<{ blob: Blob; mimeType: string } | null>((resolve) => {
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
