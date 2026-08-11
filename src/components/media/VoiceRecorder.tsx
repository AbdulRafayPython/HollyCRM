"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { clockTime, pickRecorderMime } from "@/lib/media";

const BAR_COUNT = 32;
/** WhatsApp caps voice notes well above this; the limit here is agent attention. */
const MAX_SECONDS = 300;

type Phase = "idle" | "recording" | "sending";

/**
 * Records a voice note in the composer and hands the blob to the caller.
 *
 * Deliberately not push-to-talk: an agent reading a rate sheet while they talk
 * would lose the recording the moment the pointer moved. Click to start, then
 * an explicit send or discard — with the discard as the destructive-looking
 * control, because the expensive mistake is losing a recording, not sending one.
 */
export default function VoiceRecorder({
  onSend,
  onActiveChange,
  disabled = false,
}: {
  onSend: (blob: Blob, mime: string, seconds: number) => Promise<void>;
  /** Lets the composer collapse the text field while a take is in progress. */
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(new Array(BAR_COUNT).fill(0.1));
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardedRef = useRef(false);
  // onstop closes over the state value from the render that created the
  // recorder — always 0. The duration has to come from a ref.
  const secondsRef = useRef(0);

  /* A live mic must never outlive the component — unmounting mid-recording
     otherwise leaves the browser's recording indicator on indefinitely. */
  useEffect(() => teardown, []);

  useEffect(() => {
    onActiveChange?.(phase !== "idle");
  }, [phase, onActiveChange]);

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    rafRef.current = null;
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function start() {
    setError(null);
    const mime = pickRecorderMime();
    if (!mime) {
      setError("This browser cannot record audio.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Voice-note hygiene: a hotel sales floor is noisy and the customer
        // hears everything the raw track picks up.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone blocked — allow access in the browser's address bar.");
      return;
    }

    streamRef.current = stream;
    discardedRef.current = false;
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const elapsed = secondsRef.current;
      teardown();
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      if (discardedRef.current || blob.size === 0) {
        setPhase("idle");
        return;
      }
      setPhase("sending");
      try {
        await onSend(blob, mime, elapsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send the voice message.");
      }
      setPhase("idle");
    };

    recorder.start(250);
    setPhase("recording");

    tickRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) stop();
    }, 1000);

    // Live level meter — real RMS off the input, so an agent can see the mic is
    // actually picking them up before they send thirty seconds of silence.
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevels((prev) => [...prev.slice(1), Math.min(1, Math.max(0.08, rms * 3))]);
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function discard() {
    discardedRef.current = true;
    stop();
    setPhase("idle");
    teardown();
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          title="Record a voice message"
          className="btn-ghost p-2 disabled:opacity-40"
        >
          <Icon name="mic" size={18} />
        </button>
        {error && <span className="sr-only">{error}</span>}
      </div>
    );
  }

  const sending = phase === "sending";

  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg bg-danger-soft px-2 py-1.5">
      <button
        type="button"
        onClick={discard}
        disabled={sending}
        title="Discard recording"
        className="rounded p-1.5 text-danger transition-colors duration-150 ease-swift hover:bg-danger/10 disabled:opacity-40"
      >
        <Icon name="trash" size={16} />
      </button>

      <span className="flex items-center gap-1.5 text-caption font-medium tabular-nums text-danger-dark">
        <span className={`h-2 w-2 rounded-full bg-danger ${sending ? "" : "animate-pulse"}`} />
        {clockTime(seconds)}
      </span>

      <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px]">
        {levels.map((v, i) => (
          <span
            key={i}
            style={{ height: `${Math.round(v * 100)}%` }}
            className="min-h-[2px] flex-1 rounded-full bg-danger/40"
          />
        ))}
      </div>

      {error && <span className="max-w-[14rem] truncate text-caption text-danger">{error}</span>}

      <button
        type="button"
        onClick={stop}
        disabled={sending}
        className="btn-primary px-3 py-1.5 text-caption disabled:opacity-60"
        title="Send voice message"
      >
        {sending ? "Sending…" : <Icon name="send" size={14} />}
      </button>
    </div>
  );
}
