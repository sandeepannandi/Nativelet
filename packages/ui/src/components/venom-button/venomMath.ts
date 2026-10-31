// Nativelet Venom Button. MIT: retain the accompanying LICENSE.
// Pure interaction state for the venom button: a glossy black pill whose
// tendrils reach toward a finger, lunge and wrap it when it comes close, then
// stretch, snap and melt back when it leaves, while the pill wobbles and
// throws up a few spikes. No React and no Skia: the native control, the
// Canvas2D web preview and the unit tests all step the same state, so every
// surface draws the same frame.

export const VENOM_W = 360;
export const VENOM_H = 300;
export const PILL_W = 210;
export const PILL_H = 62;
export const PILL_R = PILL_H / 2;
export const PILL_CX = VENOM_W / 2;
export const PILL_CY = 150;
/** Thick strands; the same number of fine hairs interleave them. */
export const STRAND_COUNT = 7;
/** Edge distance where tendrils start reaching. */
export const SENSE = 150;
/** Edge distance where they lunge at the finger. */
export const GRAB = 92;
/** Edge distance where a grabbed hold tears loose. */
export const TEAR = 150;
/** Goo circles per strand. */
export const CHAIN = 15;
export const BASE_R = 4.5;
export const TIP_R = 1.4;
export const HAIR_BASE_R = 2.1;
export const HAIR_TIP_R = 0.8;
export const BULB_R = 4;
/** How far the pill stretches toward a held finger. */
export const MAX_PULL = 16;
/** Input layers clamp the finger this far inside the stage so stretched goo stays visible. */
export const FINGER_MARGIN = 22;
/** Clamp a raw input point into the stage. Used by the native control and the web preview. */
export function clampFinger(x: number, y: number): Vec {
  "worklet";
  return {
    x: clamp(x, FINGER_MARGIN, VENOM_W - FINGER_MARGIN),
    y: clamp(y, FINGER_MARGIN, VENOM_H - FINGER_MARGIN),
  };
}

export type Vec = { x: number; y: number };
export type Mode = "idle" | "sense" | "grab" | "snap";
export type VenomEvent = "sense" | "grab" | "release" | "press";
export type Strand = { tip: Vec; vel: Vec };
export type Spike = { ang: number; r: number; vr: number; age: number };
export type Venom = {
  reduced: boolean;
  time: number;
  down: boolean;
  finger: Vec;
  downAt: number;
  downPos: Vec;
  mode: Mode;
  strands: Strand[];
  pillOff: Vec;
  pillVel: Vec;
  squash: number;
  squashVel: number;
  spikes: Spike[];
  events: VenomEvent[];
  acc: number;
};

export function clamp(v: number, lo: number, hi: number) {
  "worklet";
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}
export function clamp01(v: number) {
  "worklet";
  return clamp(v, 0, 1);
}
/** Deterministic 0..1 hash so every surface places the same tendril. */
export function hash(i: number, salt: number) {
  "worklet";
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/** Pill edge point toward angle ang. The pill is a wide rounded rect; an
 * ellipse is close enough for tendril roots, and the goo closes the gap. */
export function edgePoint(ang: number): Vec {
  "worklet";
  return { x: PILL_CX + Math.cos(ang) * (PILL_W / 2), y: PILL_CY + Math.sin(ang) * PILL_R };
}
function insidePill(p: Vec) {
  "worklet";
  const dx = (p.x - PILL_CX) / (PILL_W / 2), dy = (p.y - PILL_CY) / PILL_R;
  return dx * dx + dy * dy < 1;
}
function dist(a: Vec, b: Vec) {
  "worklet";
  return Math.hypot(a.x - b.x, a.y - b.y);
}
/** Distance from a point to the pill edge along its own direction. */
export function edgeDist(p: Vec) {
  "worklet";
  if (insidePill(p)) return 0;
  const ang = Math.atan2(p.y - PILL_CY, p.x - PILL_CX);
  return dist(p, edgePoint(ang));
}
/** Strand i roots at this angle on the pill edge, fanned around the finger. */
export function anchorAng(finger: Vec, i: number) {
  "worklet";
  const base = Math.atan2(finger.y - PILL_CY, finger.x - PILL_CX);
  const hair = i % 2 === 1;
  const k = Math.floor(i / 2);
  const spread = hair ? 1.25 : 0.85;
  const t = STRAND_COUNT < 2 ? 0 : k / (STRAND_COUNT - 1) - 0.5;
  return base + t * spread + (hash(i, 5) - 0.5) * 0.18;
}
export function anchorOf(finger: Vec, i: number): Vec {
  "worklet";
  return edgePoint(anchorAng(finger, i));
}
export function isHair(i: number) {
  "worklet";
  return i % 2 === 1;
}

export function createVenom(reduced = false): Venom {
  const finger = { x: PILL_CX, y: PILL_CY };
  const strands: Strand[] = [];
  for (let i = 0; i < STRAND_COUNT * 2; i++) strands.push({ tip: anchorOf(finger, i), vel: { x: 0, y: 0 } });
  return {
    reduced, time: 0, down: false, finger, downAt: 0, downPos: finger, mode: "idle",
    strands, pillOff: { x: 0, y: 0 }, pillVel: { x: 0, y: 0 },
    squash: 1, squashVel: 0, spikes: [], events: [], acc: 0,
  };
}

function springTo(pos: Vec, vel: Vec, target: Vec, k: number, c: number, h: number) {
  "worklet";
  vel.x += ((target.x - pos.x) * k - vel.x * c) * h;
  vel.y += ((target.y - pos.y) * k - vel.y * c) * h;
  pos.x += vel.x * h;
  pos.y += vel.y * h;
}

function spawnSpikes(s: Venom, toward: Vec) {
  const base = Math.atan2(toward.y - PILL_CY, toward.x - PILL_CX);
  const n = 3 + Math.floor(hash(Math.round(s.time * 60), 3) * 3);
  for (let j = 0; j < n; j++) {
    s.spikes.push({ ang: base + (hash(j, s.time * 13 + 1) - 0.5) * 2.2, r: 2, vr: 110 + 60 * hash(j, 9), age: 0 });
  }
}

export function pointerDown(v: Venom, x: number, y: number): Venom {
  const s = v;
  s.down = true;
  s.finger = { x, y };
  s.downPos = { x, y };
  s.downAt = s.time;
  const d = edgeDist(s.finger);
  if (d <= GRAB) {
    if (s.mode !== "grab") s.events.push("grab");
    s.mode = "grab";
  } else if (d <= SENSE) {
    if (s.mode !== "sense" && s.mode !== "grab") s.events.push("sense");
    if (s.mode !== "grab") s.mode = "sense";
  }
  return s;
}

export function pointerMove(v: Venom, x: number, y: number): Venom {
  const s = v;
  if (!s.down) return s;
  s.finger = { x, y };
  const d = edgeDist(s.finger);
  if (s.mode === "grab" && d > TEAR) {
    // Pulled too far: the hold tears loose, the tendrils snap back.
    s.mode = "snap";
    s.events.push("release");
    s.squashVel += 2.2;
    spawnSpikes(s, s.finger);
  } else if (s.mode !== "grab" && d <= GRAB) {
    s.mode = "grab";
    s.events.push("grab");
  } else if (s.mode === "idle" && d <= SENSE) {
    s.mode = "sense";
    s.events.push("sense");
  }
  return s;
}

export function pointerUp(v: Venom): Venom {
  const s = v;
  if (!s.down) return s;
  const tap = insidePill(s.downPos) && insidePill(s.finger) && s.time - s.downAt < 0.35;
  s.down = false;
  if (tap && s.mode !== "snap") {
    s.events.push("press");
    s.squashVel -= 2.0;
    s.mode = "snap";
    return s;
  }
  if (s.mode === "grab" || s.mode === "sense") {
    s.mode = "snap";
    s.events.push("release");
    s.squashVel += 2.2;
    spawnSpikes(s, s.finger);
  }
  return s;
}

export function isAnimating(s: Venom) {
  "worklet";
  if (s.reduced) return false;
  if (s.mode !== "idle" || s.spikes.length > 0) return true;
  if (Math.abs(s.squashVel) > 0.4 || Math.abs(s.squash - 1) > 0.004) return true;
  if (Math.hypot(s.pillVel.x, s.pillVel.y) > 3 || Math.hypot(s.pillOff.x, s.pillOff.y) > 0.4) return true;
  for (const st of s.strands) if (Math.hypot(st.vel.x, st.vel.y) > 3) return true;
  return false;
}

export function stepVenom(v: Venom, dt: number): Venom {
  const s = v;
  s.acc = Math.min(0.25, s.acc + dt);
  const h = 1 / 240;
  while (s.acc >= h) {
    s.acc -= h;
    s.time += h;
    if (s.reduced) {
      for (let i = 0; i < s.strands.length; i++) {
        const a = anchorOf(s.finger, i);
        const st = s.strands[i];
        st.tip = s.mode === "grab" ? { ...s.finger } : a;
        st.vel = { x: 0, y: 0 };
      }
      s.pillOff = { x: 0, y: 0 };
      s.pillVel = { x: 0, y: 0 };
      s.squash = 1;
      s.squashVel = 0;
      s.spikes = [];
      if (!s.down && s.mode !== "idle") s.mode = "idle";
      continue;
    }
    for (let i = 0; i < s.strands.length; i++) {
      const st = s.strands[i];
      const hair = isHair(i);
      const a = anchorOf(s.finger, i);
      if (s.mode === "grab") {
        // Wrapped: the tip orbits the fingertip slowly, thicker strands wider.
        const dir = Math.atan2(s.finger.y - a.y, s.finger.x - a.x);
        const wob = (hair ? 4 : 8) * Math.sin(s.time * 3.1 + i * 1.7);
        const target = { x: s.finger.x + Math.cos(dir + Math.PI / 2) * wob, y: s.finger.y + Math.sin(dir + Math.PI / 2) * wob };
        springTo(st.tip, st.vel, target, 260, 18, h);
      } else if (s.mode === "sense") {
        const d = edgeDist(s.finger);
        const reach = clamp01((SENSE - d) / (SENSE - GRAB));
        const len = dist(a, s.finger) * (0.45 + 0.55 * reach) * (0.55 + 0.45 * hash(i, 1));
        const dir = Math.atan2(s.finger.y - a.y, s.finger.x - a.x);
        const target = { x: a.x + Math.cos(dir) * len, y: a.y + Math.sin(dir) * len };
        springTo(st.tip, st.vel, target, 90 + 60 * reach, 12, h);
      } else {
        // Snap or idle: home to the root. Snap is stiffer so the tip overshoots.
        const snap = s.mode === "snap";
        springTo(st.tip, st.vel, a, snap ? 320 : 200, snap ? 9 : 16, h);
      }
    }
    // The pill stretches toward a held finger and springs back after.
    const pullTarget = s.mode === "grab"
      ? (() => { const d = Math.max(1, edgeDist(s.finger)); const ang = Math.atan2(s.finger.y - PILL_CY, s.finger.x - PILL_CX); const m = Math.min(d * 0.16, MAX_PULL); return { x: Math.cos(ang) * m, y: Math.sin(ang) * m }; })()
      : { x: 0, y: 0 };
    springTo(s.pillOff, s.pillVel, pullTarget, 150, 13, h);
    // Squash wobble: a little stretch while held, an overshoot pop on release.
    const rest = s.mode === "grab" ? 1.05 : 1;
    s.squashVel += ((rest - s.squash) * 180 - s.squashVel * 11) * h;
    s.squash += s.squashVel * h;
    // Spikes pop out and melt back.
    for (const sp of s.spikes) {
      sp.age += h;
      sp.vr += (-sp.r * 260 - sp.vr * 7) * h;
      sp.r = Math.max(0, sp.r + sp.vr * h);
    }
    s.spikes = s.spikes.filter((sp) => !(sp.age > 0.25 && sp.r < 0.6));
    if (s.mode === "snap") {
      let settled = true;
      for (let i = 0; i < s.strands.length; i++) {
        const st = s.strands[i];
        if (dist(st.tip, anchorOf(s.finger, i)) > 2.5 || Math.hypot(st.vel.x, st.vel.y) > 12) { settled = false; break; }
      }
      if (settled) s.mode = "idle";
    }
  }
  return s;
}

/** Goo colour matrix: alpha' = gain * alpha - cut. Shared recipe with the
 * other gooey components, duplicated so this folder copies on its own. */
export function gooMatrix(gain = 24, cut = 11) {
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, gain, -cut];
}

export type GooCircle = { x: number; y: number; r: number };
/** The goo circles that draw one strand: a tapered chain from root to tip,
 * bowed sideways, plus a bulb on the fingertip while grabbed. */
export function strandCircles(s: Venom, i: number): GooCircle[] {
  "worklet";
  const st = s.strands[i];
  const hair = isHair(i);
  const a = anchorOf(s.finger, i);
  const baseR = hair ? HAIR_BASE_R : BASE_R;
  const tipR = hair ? HAIR_TIP_R : TIP_R;
  const len = dist(a, st.tip);
  const bow = (hash(i, 2) - 0.5) * 16 * clamp01(len / 60);
  const dir = Math.atan2(st.tip.y - a.y, st.tip.x - a.x);
  const px = Math.cos(dir + Math.PI / 2), py = Math.sin(dir + Math.PI / 2);
  const out: GooCircle[] = [];
  for (let k = 0; k < CHAIN; k++) {
    const t = k / (CHAIN - 1);
    const bend = Math.sin(Math.PI * t) * bow;
    out.push({
      x: a.x + (st.tip.x - a.x) * t + px * bend,
      y: a.y + (st.tip.y - a.y) * t + py * bend,
      r: baseR + (tipR - baseR) * Math.pow(t, 0.85),
    });
  }
  if (s.mode === "grab") out.push({ x: st.tip.x, y: st.tip.y, r: hair ? 4 : BULB_R });
  return out;
}
/** Root circles that join a strand to the pill in the goo pass; the rest of
 * the strand draws as a crisp ribbon so thin tips survive the goo threshold. */
export const GOO_ROOT = 5;
/** A tapered ribbon polygon for one strand: left edge out, right edge back.
 * Drawn crisp (no blur) so every filament keeps its full length and taper. */
export function strandRibbon(s: Venom, i: number): Vec[] {
  "worklet";
  const cs = strandCircles(s, i);
  const n = cs.length;
  const pts: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const p = cs[k];
    const q = cs[Math.min(n - 1, k + 1)];
    const d = Math.max(0.001, dist(p, q));
    const px = (-(q.y - p.y) / d) * p.r, py = ((q.x - p.x) / d) * p.r;
    pts.push({ x: p.x + px, y: p.y + py });
  }
  for (let k = n - 1; k >= 0; k--) {
    const p = cs[k];
    const q = cs[Math.max(0, k - 1)];
    const d = Math.max(0.001, dist(p, q));
    const px = (-(q.y - p.y) / d) * p.r, py = ((q.x - p.x) / d) * p.r;
    pts.push({ x: p.x - px, y: p.y - py });
  }
  return pts;
}
/** The goo circles that draw every live spike: short tapers off the pill edge. */
export function spikeCircles(s: Venom): GooCircle[] {
  "worklet";
  const out: GooCircle[] = [];
  for (const sp of s.spikes) {
    const a = edgePoint(sp.ang);
    for (let k = 0; k < 3; k++) {
      const t = (k + 1) / 3;
      out.push({ x: a.x + Math.cos(sp.ang) * sp.r * t * 0.9, y: a.y + Math.sin(sp.ang) * sp.r * t * 0.9, r: sp.r * (0.34 - 0.1 * k) });
    }
  }
  return out;
}
/** Pill geometry for one frame, with the elastic pull and squash applied. */
export function pillFrame(s: Venom) {
  "worklet";
  return { cx: PILL_CX + s.pillOff.x, cy: PILL_CY + s.pillOff.y, rx: (PILL_W / 2) * s.squash, ry: PILL_R / s.squash };
}
/** Events raised since the last drain, for haptics. */
export function drainEvents(s: Venom): VenomEvent[] {
  const out = s.events;
  s.events = [];
  return out;
}
