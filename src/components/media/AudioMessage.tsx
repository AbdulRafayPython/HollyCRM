"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { clockTime } from "@/lib/media";

const BAR_COUNT = 44;
const SPEEDS = [1, 1.5, 2] as const;

/**
 * Decoded amplitude peaks, keyed by message id.
 *
 * Signed URLs are re-minted roughly hourly, so the URL is not a stable key —
 * the message is. Peaks survive re-signing and re-mounts (collapsing the panel,
 * scrolling the thread) so a voice note is decoded at most once per session.
 */
const peakCache = new Map<string, number[]>();

/**
 * Voice-note player.
 *
 * The waveform is decoded from the actual audio, not drawn from a hash — a fake
 * waveform gives an agent false information about where the speech is when they
 * are scrubbing to re-hear a date or a room count. Decoding is deferred to first
 * play so opening a thread with twenty voice notes doesn't fetch twenty files;
 * until then the bar strip renders flat and still seeks correctly.
 */
export default function AudioMessage({
  messageId,
  url,
  onBrand = false,
}: {
  messageId: string;
  url: string | null;
  /** Rendered inside the violet outbound bubble — invert the palette. */
  onBrand?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [peaks, setPeaks] = useState<number[] | null>(peakCache.get(messageId) ?? null);
  const [failed, setFailed] = useState(false);

  // Only one voice note should ever be audible. Pausing every other <audio> on
  // play is cruder than a shared context but survives any tree shape.
  useEffect(() => {
    if (!playing) return;
    const el = audioRef.current;
    document.querySelectorAll("audio").forEach((other) => {
      if (other !== el) other.pause();
    });
  }, [playing]);

  async function decodePeaks() {
    if (!url || peakCache.has(messageId)) return;
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(buf);
      const channel = decoded.getChannelData(0);
      const step = Math.floor(channel.length / BAR_COUNT) || 1;

      const raw: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        const start = i * step;
        for (let j = start; j < start + step && j < channel.length; j++) sum += channel[j] * channel[j];
        raw.push(Math.sqrt(sum / step)); // RMS reads closer to perceived loudness than peak
      }
      const max = Math.max(...raw, 0.0001);
      const norm = raw.map((v) => Math.max(0.12, v / max));

      peakCache.set(messageId, norm);
      setPeaks(norm);
      ctx.close();

      // The recorded-WebM duration bug (below) also hides here: the decoded
      // buffer knows the real length even when the element reports Infinity.
      if (!Number.isFinite(duration) || duration === 0) setDuration(decoded.duration);
    } catch {
      // Undecodable (an exotic codec, or a URL that expired mid-flight) — the
      // element may still play it, so leave the flat strip rather than erroring.
    }
  }

  function toggle() {
    const el = audioRef.current;
    if (!el || !url) return;
    if (el.paused) {
      void decodePeaks();
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }

  function seekTo(ratio: number) {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    el.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
    setCurrent(el.currentTime);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = duration > 0 ? current / duration : 0;
  const bars = peaks ?? new Array(BAR_COUNT).fill(0.34);

  const accent = onBrand ? "bg-white" : "bg-brand";
  const idle = onBrand ? "bg-white/30" : "bg-edge-strong";
  const muted = onBrand ? "text-white/70" : "text-muted";

  return (
    <div className="flex min-w-[15rem] max-w-full items-center gap-2.5">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          // MediaRecorder WebM carries no duration in its header, so the element
          // reports Infinity until it has seen the end of the stream. Seeking
          // far past the end forces it to resolve — a long-standing Chrome bug.
          if (Number.isFinite(d)) {
            setDuration(d);
          } else {
            const el = e.currentTarget;
            const onSeeked = () => {
              setDuration(Number.isFinite(el.duration) ? el.duration : 0);
              el.currentTime = 0;
              el.removeEventListener("seeked", onSeeked);
            };
            el.addEventListener("seeked", onSeeked);
            el.currentTime = 1e101;
          }
        }}
      />

      <button
        type="button"
        onClick={toggle}
        disabled={!url || failed}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-150 ease-swift disabled:opacity-40 ${
          onBrand ? "bg-white text-brand hover:bg-white/90" : "bg-brand text-white hover:bg-brand-dark"
        }`}
      >
        <Icon name={playing ? "pause" : "play"} size={16} fill={!playing} />
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
          aria-valuetext={clockTime(current)}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - box.left) / box.width);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekTo(progress + 0.05);
            else if (e.key === "ArrowLeft") seekTo(progress - 0.05);
            else return;
            e.preventDefault();
          }}
          className="flex h-8 cursor-pointer items-center gap-[2px] outline-none"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${Math.round(h * 100)}%` }}
              className={`min-h-[3px] flex-1 rounded-full transition-colors duration-100 ${
                i / BAR_COUNT <= progress ? accent : idle
              }`}
            />
          ))}
        </div>

        <div className={`flex items-center gap-2 text-caption ${muted}`}>
          <span className="tabular-nums">
            {clockTime(current)}
            {duration > 0 && ` / ${clockTime(duration)}`}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            className={`rounded px-1 font-medium transition-colors duration-150 ${
              onBrand ? "hover:bg-white/15" : "hover:bg-surface"
            }`}
            title="Playback speed"
          >
            {speed}×
          </button>
          {url && (
            <a
              href={url}
              download
              className={`ml-auto rounded p-0.5 transition-colors duration-150 ${
                onBrand ? "hover:bg-white/15" : "hover:bg-surface"
              }`}
              title="Download"
            >
              <Icon name="download" size={12} />
            </a>
          )}
        </div>

        {failed && <p className="text-caption text-danger">Audio unavailable — try reloading.</p>}
      </div>
    </div>
  );
}
