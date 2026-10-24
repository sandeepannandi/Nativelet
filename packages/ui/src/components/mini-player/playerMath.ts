// Nativelet Mini Player. MIT: retain the accompanying LICENSE.
// Pure helpers shared by the native component (Reanimated) and the web preview
// (Framer Motion). "t" is the morph position: 0 = collapsed mini bar, 1 = expanded player.

export const FLICK_VELOCITY = 0.004; // t units per ms
const PROJECTION_MS = 120; // how far ahead the finger's momentum is projected
const RESISTANCE = 0.25;

export function clamp01(value: number) {
  'worklet';
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function lerp(from: number, to: number, t: number) {
  'worklet';
  return from + (to - from) * t;
}

/** Finger travel to morph position. Past either end the surface resists instead of stopping dead. */
export function dragProgress(start: number, delta: number, range: number) {
  'worklet';
  if (range <= 0 || !Number.isFinite(delta)) return clamp01(start);
  const raw = start + delta / range;
  if (raw > 1) return 1 + (raw - 1) * RESISTANCE;
  if (raw < 0) return raw * RESISTANCE;
  return raw;
}

/** Picks where a released surface settles. `velocity` is t units per ms, positive = expanding. */
export function resolveTarget(progress: number, velocity: number) {
  'worklet';
  const t = clamp01(progress);
  const v = Number.isFinite(velocity) ? velocity : 0;
  if (v >= FLICK_VELOCITY) return 1;
  if (v <= -FLICK_VELOCITY) return 0;
  return t + v * PROJECTION_MS >= 0.5 ? 1 : 0;
}

/** Mini bar content fades out through the first half of the morph. */
export function collapseFade(t: number) {
  'worklet';
  return clamp01(1 - clamp01(t) / 0.45);
}

/** Expanded controls fade in through the second half of the morph. */
export function expandFade(t: number) {
  'worklet';
  return clamp01((clamp01(t) - 0.55) / 0.35);
}

export function backdropOpacity(t: number) {
  'worklet';
  return clamp01(t) * 0.45;
}

/** The page behind the player sinks a little as the player takes over. */
export function contentScale(t: number) {
  'worklet';
  return lerp(1, 0.93, clamp01(t));
}

/** Hero artwork edge: width-bound on phones, height-bound on short stages. */
export function artSize(width: number, height: number) {
  'worklet';
  const byWidth = (Number.isFinite(width) ? width : 0) - 72;
  const byHeight = (Number.isFinite(height) ? height : 0) * 0.40;
  return Math.max(140, Math.min(byWidth, byHeight));
}

export function formatClock(seconds: number) {
  'worklet';
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** Deterministic 32-bit hash so native and web draw the same waveform for a track. */
export function hashSeed(text: string) {
  'worklet';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `count` bar amplitudes in [0.18, 1], identical on every platform for the same seed text. */
export function waveformBars(seedText: string, count: number) {
  'worklet';
  let state = hashSeed(seedText) || 1;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const a = state / 4294967296;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const b = state / 4294967296;
    const envelope = 0.45 + 0.55 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    bars.push(Math.min(1, 0.18 + envelope * (0.35 * a + 0.65 * b)));
  }
  return bars;
}
