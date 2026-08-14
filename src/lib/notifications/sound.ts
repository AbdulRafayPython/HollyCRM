/**
 * Synthesizes the authentic WhatsApp Web incoming message double-chime
 * using Web Audio API (zero external assets needed, 100% reliable offline).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays the signature WhatsApp message chime.
 * @param volume Scale from 0.0 to 1.0 (default: 0.8)
 */
export function playWhatsAppChime(volume = 0.8) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume * 0.7)), ctx.currentTime);
    gainNode.connect(ctx.destination);

    // Tone 1: High crisp pop (880 Hz / A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.7, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc1.connect(gain1);
    gain1.connect(gainNode);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.1);

    // Tone 2: Warm cheerful harmonic chime (1174.66 Hz / D6) shortly after
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.07);
    gain2.gain.setValueAtTime(0.001, ctx.currentTime);
    gain2.gain.setValueAtTime(0.9, ctx.currentTime + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc2.connect(gain2);
    gain2.connect(gainNode);
    osc2.start(ctx.currentTime + 0.07);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio context was blocked by user gesture restrictions or not supported
  }
}
