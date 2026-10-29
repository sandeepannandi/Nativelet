// Nativelet Voice Recorder. MIT: retain the accompanying LICENSE.
//
// Pure state machine + simulated audio model for a chat voice-recording
// bar. No React, no Skia: the native component, the Canvas2D web preview
// and the unit tests all step the same state, so every surface draws the
// same frame for the same input.
//
// Geometry: one light chat bar near the bottom of the canvas, a round mic
// button at its right end, and a lock capsule floating above the mic. The
// message thread above the bar is owned by the caller (Example / preview),
// fed by the "send" event's duration and samples.

export const REC_W = 360;
export const REC_H = 152; // bar row + lock capsule zone above it
export const BAR_X = 8;
export const BAR_Y = REC_H - 68;
export const BAR_W = REC_W - 16;
export const BAR_H = 60;
export const MIC_R = 22;
export const MIC_CX = BAR_X + BAR_W - MIC_R - 8;
export const MIC_CY = BAR_Y + BAR_H / 2;
export const LOCK_W = 44;
export const LOCK_H = 66;
export const LOCK_CX = MIC_CX;
export const LOCK_CY = 40;

export const DOT_X = BAR_X + 26; // record dot center
export const TIMER_X = BAR_X + 44; // timer left edge (text drawn by caller)
export const WAVE_X0 = BAR_X + 104; // waveform span
export const WAVE_X1 = MIC_CX - MIC_R - 12;
export const WAVE_CY = MIC_CY;
export const BAR_COUNT = 34;
export const BAR_SAMPLE_S = 0.09;

export const PRESS_DELAY_S = 0.22; // hold this long to start recording
export const CANCEL_DISTANCE = 120; // px dragged left for a full cancel
export const LOCK_DISTANCE = 76; // px dragged up to lock
export const MAX_SECONDS = 120; // recordings cap here and auto-send
export const SEND_ANIM_S = 0.5;
export const CANCEL_ANIM_S = 0.42;

export const clamp01 = (v: number) => {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
};
export const lerp = (a: number, b: number, f: number) => {
  'worklet';
  return a + (b - a) * f;
};
export const smooth = (f: number) => {
  'worklet';
  return f * f * (3 - 2 * f);
};

export function formatClock(seconds: number): string {
  'worklet';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Deterministic 1D value noise, hashed per integer cell, so native and web
// agree on every sample without sharing a random source.
function cellNoise(n: number, seed: number): number {
  'worklet';
  let x = (n | 0) * 2654435761 + seed * 40503;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Simulated voice level, 0..1. A syllable train (140 ms cells, smoothed)
// gated by a slow phrase envelope so the waveform breathes like speech:
// bursts, gaps, emphasis. Continuous in t. This is not microphone input.
export function levelAt(t: number, seed = 7): number {
  'worklet';
  if (t <= 0) return 0.08;
  const cell = t / 0.14;
  const i = Math.floor(cell);
  const f = smooth(cell - i);
  const a = cellNoise(i, seed);
  const b = cellNoise(i + 1, seed);
  const syllable = lerp(a, b, f);
  const gate = clamp01(0.62 + 0.42 * Math.sin(t * 1.9 + Math.sin(t * 0.63) * 2.2));
  const jitter = 0.82 + 0.18 * Math.sin(t * 43 + syllable * 11);
  return clamp01(0.06 + syllable * gate * jitter * 0.96);
}

export type RecorderPhase = "idle" | "pressing" | "recording" | "locked" | "cancelling" | "sending";

export type RecorderEvent =
  | { type: "start" }
  | { type: "lock" }
  | { type: "cancel"; seconds: number }
  | { type: "send"; seconds: number; samples: number[] };

export type RecorderState = {
  phase: RecorderPhase;
  t: number; // total sim seconds, always advancing
  pressAt: number; // t of the current press start, -1 when none
  recAt: number; // t when the current recording started
  seconds: number; // length of the current recording
  cancel: number; // 0..1 slide-to-cancel fill
  lock: number; // 0..1 drag-to-lock fill
  bars: number[]; // visible waveform ring, newest last, length BAR_COUNT
  levels: number[]; // every sample of the current recording, for the message
  lastSample: number; // recording-time of the last pushed sample
  anim: number; // 0..1 progress of the cancelling/sending morph
  micScale: number; // springed mic scale
  micVel: number;
  lockPop: number; // springed capsule scale on lock
  lockPopVel: number;
  events: RecorderEvent[];
  reduced: boolean;
  seed: number;
};

export function createRecorder(seed = 7): RecorderState {
  'worklet';
  return {
    phase: "idle",
    t: 0,
    pressAt: -1,
    recAt: 0,
    seconds: 0,
    cancel: 0,
    lock: 0,
    bars: new Array(BAR_COUNT).fill(0.07),
    levels: [],
    lastSample: 0,
    anim: 0,
    micScale: 1,
    micVel: 0,
    lockPop: 0,
    lockPopVel: 0,
    events: [],
    reduced: false,
    seed,
  };
}

function spring(x: number, v: number, target: number, dt: number, k: number, c: number): [number, number] {
  'worklet';
  const nv = (v + (target - x) * k * dt) * Math.exp(-c * dt);
  return [x + nv * dt, nv];
}

// Finger goes down on the mic. From idle only; locked recordings are ended
// through the on-bar Send and Cancel controls, not by touching the bar.
export function recorderPressStart(s: RecorderState): void {
  'worklet';
  if (s.phase !== "idle") return;
  s.phase = "pressing";
  s.pressAt = s.t;
  s.cancel = 0;
  s.lock = 0;
}

// dx/dy are the finger's displacement from the press point. The dominant
// axis wins: further left fills cancel, further up fills lock. Crossing the
// lock distance locks immediately, mid-gesture, like the chat apps do.
export function recorderPressMove(s: RecorderState, dx: number, dy: number): void {
  'worklet';
  if (s.phase !== "pressing" && s.phase !== "recording") return;
  if (-dy > -dx) {
    s.lock = clamp01(-dy / LOCK_DISTANCE);
    s.cancel = clamp01(s.cancel - 0.12);
  } else {
    s.cancel = clamp01(-dx / CANCEL_DISTANCE);
    s.lock = clamp01(s.lock - 0.12);
  }
  if (s.phase === "recording" && s.lock >= 1) lockRecording(s);
}

function lockRecording(s: RecorderState): void {
  'worklet';
  s.phase = "locked";
  s.lockPop = 0.6;
  s.lockPopVel = 0;
  s.events.push({ type: "lock" });
}

// Finger lifts. Before the press delay this is a tap: start a locked
// recording so the flow has a no-drag path (keyboard and screen-reader
// friendly). During recording, a full cancel discards, otherwise the take
// is sent with its duration and the samples that were on screen.
export function recorderPressEnd(s: RecorderState): void {
  'worklet';
  if (s.phase === "pressing") {
    // Tap: begin recording already locked.
    s.phase = "locked";
    s.recAt = s.t;
    s.seconds = 0;
    s.levels = [];
    s.lastSample = 0;
    s.bars = new Array(BAR_COUNT).fill(0.07);
    s.lockPop = 0.6;
    s.lockPopVel = 0;
    s.events.push({ type: "start" }, { type: "lock" });
    return;
  }
  if (s.phase !== "recording") return;
  if (s.cancel >= 1) cancelRecording(s);
  else sendRecording(s);
}

export function recorderLockedSend(s: RecorderState): void {
  'worklet';
  if (s.phase === "locked") sendRecording(s);
}

export function recorderLockedCancel(s: RecorderState): void {
  'worklet';
  if (s.phase === "locked") cancelRecording(s);
}

function sendRecording(s: RecorderState): void {
  'worklet';
  s.phase = "sending";
  s.anim = 0;
  s.events.push({ type: "send", seconds: s.seconds, samples: s.levels.slice() });
}

function cancelRecording(s: RecorderState): void {
  'worklet';
  s.phase = "cancelling";
  s.anim = 0;
  s.events.push({ type: "cancel", seconds: s.seconds });
}

function resetToIdle(s: RecorderState): void {
  'worklet';
  s.phase = "idle";
  s.cancel = 0;
  s.lock = 0;
  s.anim = 0;
  s.seconds = 0;
  s.levels = [];
  s.bars = new Array(BAR_COUNT).fill(0.07);
}

// Advance the sim. The caller passes real dt (already scaled for slow
// motion). With reduced motion the morphs finish instantly but the data
// path (sampling, timer, events) is unchanged.
export function stepRecorder(s: RecorderState, dt: number): void {
  'worklet';
  s.t += dt;

  if (s.phase === "pressing" && s.t - s.pressAt >= PRESS_DELAY_S) {
    s.phase = "recording";
    s.recAt = s.t;
    s.seconds = 0;
    s.levels = [];
    s.lastSample = 0;
    s.bars = new Array(BAR_COUNT).fill(0.07);
    s.events.push({ type: "start" });
  }

  if (s.phase === "recording" || s.phase === "locked") {
    s.seconds = s.t - s.recAt;
    while (s.seconds - s.lastSample >= BAR_SAMPLE_S) {
      s.lastSample += BAR_SAMPLE_S;
      const level = levelAt(s.lastSample, s.seed);
      s.levels.push(level);
      s.bars.push(level);
      if (s.bars.length > BAR_COUNT) s.bars.shift();
    }
    if (s.seconds >= MAX_SECONDS) sendRecording(s);
  }

  if (s.phase === "cancelling" || s.phase === "sending") {
    s.anim += dt / (s.phase === "sending" ? SEND_ANIM_S : CANCEL_ANIM_S);
    if (s.anim >= 1 || s.reduced) resetToIdle(s);
  }

  // Mic springs up while recording and settles back after. The lock capsule
  // pops once on lock. Reduced motion: no overshoot, land on target.
  const micTarget = s.phase === "recording" || s.phase === "locked" ? 1.22 : 1;
  if (s.reduced) {
    s.micScale = micTarget;
    s.micVel = 0;
    s.lockPop = 0;
    s.lockPopVel = 0;
  } else {
    [s.micScale, s.micVel] = spring(s.micScale, s.micVel, micTarget, dt, 240, 15);
    [s.lockPop, s.lockPopVel] = spring(s.lockPop, s.lockPopVel, 0, dt, 160, 13);
  }
}

// Waveform bar segment for drawing: i runs 0 (oldest) to BAR_COUNT-1
// (newest). Heights ease in from the newest edge so fresh audio "grows".
export function barSegment(s: RecorderState, i: number): { x: number; y0: number; y1: number; level: number } {
  'worklet';
  const slot = (WAVE_X1 - WAVE_X0) / BAR_COUNT;
  const x = WAVE_X0 + slot * (i + 0.5);
  let level = s.bars[i] ?? 0.07;
  if (s.phase === "cancelling" || s.phase === "sending") level *= 1 - clamp01(s.anim);
  const half = 2 + level * 13;
  return { x, y0: WAVE_CY - half, y1: WAVE_CY + half, level };
}

// Horizontal drift applied to the waveform while cancelling: the take
// slides away to the left and flushes red (tint alpha returned too).
export function cancelWash(s: RecorderState): { dx: number; alpha: number } {
  'worklet';
  if (s.phase !== "cancelling") return { dx: 0, alpha: 0 };
  const f = clamp01(s.anim);
  return { dx: -f * 90, alpha: f * 0.5 };
}
