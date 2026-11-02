// Pure 2D filament model for the Plasma Globe. Every function is a
// worklet so Reanimated can step it on the UI thread; plain JS (tests,
// web preview) ignores the tag. Deterministic: every angle, kink and
// flicker comes from a seeded generator, so tests, native and web agree.
//
// This is a visual model of electrical filaments, not a plasma or
// electrostatics solver. Nine "bolts" run from a centre electrode to a
// point on the glass. Left alone, each end wanders around the glass and
// now and then re-strikes somewhere new. A touch pulls most ends toward
// the finger (a couple stay free, as in a real globe) and they follow
// the drag; release lets them drift apart again. Each bolt is a
// noise-displaced polyline that is re-rolled about 14 times a second and
// blended between rolls, with three short side branches that flicker
// and re-form more slowly.

export const PG_W = 340;
export const PG_H = 380;
export const GL_CX = 170;
export const GL_CY = 160;
export const GL_R = 136;
export const PG_BOLTS = 9;
export const PG_SEG = 14;       // segments per main bolt
export const PG_BR = 3;         // branches per bolt
export const PG_BSEG = 6;       // segments per branch
const ELECTRODE_R = 8;
const GLASS_LIMIT = 0.965;      // keep every point inside the glass

const JAG_N = PG_SEG + 1;
const BJ_N = PG_BSEG + 1;
const FLICK = 0.07;             // seconds between jag re-rolls
const BRANCH_ROLL = 0.30;       // seconds between branch re-rolls

export type PlasmaState = {
  rng: number;
  t: number;
  flickT: number;
  branchT: number;
  ang: Float32Array;
  angVel: Float32Array;
  reach: Float32Array;
  reachTarget: Float32Array;
  weight: Float32Array;     // how strongly each bolt is drawn to a finger
  spreadX: Float32Array;    // where around the fingertip each bolt lands
  spreadY: Float32Array;
  tipX: Float32Array;
  tipY: Float32Array;
  jagA: Float32Array;
  jagB: Float32Array;
  bpA: Float32Array;        // branch params (u, angle, length) per branch
  bpB: Float32Array;
  bjA: Float32Array;
  bjB: Float32Array;
  main: Float32Array;       // x0,y0,x1,y1 per main segment
  branches: Float32Array;   // x0,y0,x1,y1 per branch segment
  pdown: number;
  px: number;               // finger position in canvas px
  py: number;
  attract: number;          // smoothed 0..1 pull toward the finger
  flash: number;            // release flash, decays
  glow: number;             // overall brightness flicker, ~0.7..1
  pulse: number;            // electrode pulse, 0..1
  scratchX: Float32Array;   // build scratch, reused every frame
  scratchY: Float32Array;
};

function rand01(s: PlasmaState) {
  'worklet';
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  'worklet';
  return t * t * (3 - 2 * t);
}

function wrapAngle(a: number) {
  'worklet';
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function copyInto(dst: Float32Array, src: Float32Array) {
  'worklet';
  for (let i = 0; i < dst.length; i++) dst[i] = src[i];
}

function rollJag(s: PlasmaState, arr: Float32Array) {
  'worklet';
  for (let i = 0; i < arr.length; i++) arr[i] = rand01(s) * 2 - 1;
}

function rollBranches(s: PlasmaState, arr: Float32Array) {
  'worklet';
  for (let i = 0; i < PG_BOLTS; i++) {
    for (let j = 0; j < PG_BR; j++) {
      const o = (i * PG_BR + j) * 3;
      const side = j % 2 === 0 ? 1 : -1;
      if (j === 2) {
        // The fan branch: short and steep, pinned near the tip on touch.
        arr[o] = 0.55 + rand01(s) * 0.3;
        arr[o + 1] = (rand01(s) < 0.5 ? -1 : 1) * (0.6 + rand01(s) * 0.8);
        arr[o + 2] = 0.08 + rand01(s) * 0.09;
      } else {
        arr[o] = 0.25 + rand01(s) * 0.55;
        arr[o + 1] = side * (0.45 + rand01(s) * 0.55);
        arr[o + 2] = 0.15 + rand01(s) * 0.18;
      }
    }
  }
}

export function createPlasma(seed = 20261102, settled = false): PlasmaState {
  const s: PlasmaState = {
    rng: (seed ^ 0x9e3779b9) | 0,
    t: 0, flickT: 0, branchT: 0,
    ang: new Float32Array(PG_BOLTS),
    angVel: new Float32Array(PG_BOLTS),
    reach: new Float32Array(PG_BOLTS),
    reachTarget: new Float32Array(PG_BOLTS),
    weight: new Float32Array(PG_BOLTS),
    spreadX: new Float32Array(PG_BOLTS),
    spreadY: new Float32Array(PG_BOLTS),
    tipX: new Float32Array(PG_BOLTS),
    tipY: new Float32Array(PG_BOLTS),
    jagA: new Float32Array(PG_BOLTS * JAG_N),
    jagB: new Float32Array(PG_BOLTS * JAG_N),
    bpA: new Float32Array(PG_BOLTS * PG_BR * 3),
    bpB: new Float32Array(PG_BOLTS * PG_BR * 3),
    bjA: new Float32Array(PG_BOLTS * PG_BR * BJ_N),
    bjB: new Float32Array(PG_BOLTS * PG_BR * BJ_N),
    main: new Float32Array(PG_BOLTS * PG_SEG * 4),
    branches: new Float32Array(PG_BOLTS * PG_BR * PG_BSEG * 4),
    pdown: 0, px: GL_CX, py: GL_CY,
    attract: 0, flash: 0, glow: 1, pulse: 0,
    scratchX: new Float32Array(JAG_N),
    scratchY: new Float32Array(JAG_N),
  };
  for (let i = 0; i < PG_BOLTS; i++) {
    s.ang[i] = (i / PG_BOLTS) * Math.PI * 2 + (rand01(s) - 0.5) * 0.5;
    s.angVel[i] = (rand01(s) - 0.5) * 1.2;
    s.reachTarget[i] = 0.62 + rand01(s) * 0.36;
    s.reach[i] = s.reachTarget[i];
    // Two bolts in nine stay free of the finger.
    s.weight[i] = i % 4 === 3 ? 0.0 : 1;
    s.spreadX[i] = 0;
    s.spreadY[i] = 0;
    const r = GL_R * s.reach[i];
    s.tipX[i] = GL_CX + Math.cos(s.ang[i]) * r;
    s.tipY[i] = GL_CY + Math.sin(s.ang[i]) * r;
  }
  rollJag(s, s.jagB);
  rollBranches(s, s.bpB);
  rollJag(s, s.bjB);
  copyInto(s.jagA, s.jagB); copyInto(s.bpA, s.bpB); copyInto(s.bjA, s.bjB);
  rollJag(s, s.jagB);
  rollBranches(s, s.bpB);
  rollJag(s, s.bjB);
  stepPlasma(s, 1 / 60, 1);
  if (settled) for (let k = 0; k < 40; k++) stepPlasma(s, 1 / 60, 1);
  return s;
}

// Finger input in canvas px. A new touch re-rolls where each bolt lands
// around the fingertip.
export function plasmaPointer(s: PlasmaState, x: number, y: number, down: boolean) {
  'worklet';
  if (down && s.pdown === 0) {
    for (let i = 0; i < PG_BOLTS; i++) {
      const a = rand01(s) * Math.PI * 2;
      const r = Math.sqrt(rand01(s)) * 9;
      s.spreadX[i] = Math.cos(a) * r;
      s.spreadY[i] = Math.sin(a) * r;
    }
  }
  if (!down && s.pdown === 1) {
    // Release: every end keeps its place, then wanders off with a kick.
    for (let i = 0; i < PG_BOLTS; i++) {
      s.ang[i] = Math.atan2(s.tipY[i] - GL_CY, s.tipX[i] - GL_CX);
      const dr = Math.hypot(s.tipX[i] - GL_CX, s.tipY[i] - GL_CY) / GL_R;
      s.reach[i] = dr;
      s.reachTarget[i] = 0.62 + rand01(s) * 0.36;
      const sign = rand01(s) < 0.5 ? -1 : 1;
      s.angVel[i] = sign * (1.3 + rand01(s) * 1.5);
    }
    s.flash = 1;
  }
  s.pdown = down ? 1 : 0;
  s.px = x;
  s.py = y;
}

// Declared before buildPlasma on purpose: worklets capture helpers when
// they are defined, so a helper declared later would be undefined.
function clampGlass(x: number, y: number, out: { x: number; y: number }) {
  'worklet';
  const dx = x - GL_CX;
  const dy = y - GL_CY;
  const d = Math.hypot(dx, dy);
  const lim = GL_R * GLASS_LIMIT;
  if (d > lim) {
    out.x = GL_CX + (dx / d) * lim;
    out.y = GL_CY + (dy / d) * lim;
  } else {
    out.x = x;
    out.y = y;
  }
}

function buildPlasma(s: PlasmaState, ease: number) {
  'worklet';
  const f = smooth(Math.min(1, s.flickT / FLICK));
  const fb = smooth(Math.min(1, s.branchT / BRANCH_ROLL));
  const p = { x: 0, y: 0 };
  const px = s.scratchX;
  const py = s.scratchY;
  for (let i = 0; i < PG_BOLTS; i++) {
    const mixI = ease * s.weight[i];
    const ph = i * 1.7;
    const x0 = GL_CX;
    const y0 = GL_CY;
    const dxT = s.tipX[i] - x0;
    const dyT = s.tipY[i] - y0;
    const L = Math.max(1, Math.hypot(dxT, dyT));
    const dx = dxT / L;
    const dy = dyT / L;
    const nx = -dy;
    const ny = dx;
    const start = ELECTRODE_R * 0.6;
    const len = L - start;
    const wave = 1 - 0.5 * mixI;
    const jagAmp = 0.05 + 0.03 * s.flash;
    for (let k = 0; k <= PG_SEG; k++) {
      const u = k / PG_SEG;
      const env = Math.pow(Math.sin(Math.PI * u), 0.7);
      const jag = s.jagA[i * JAG_N + k] * (1 - f) + s.jagB[i * JAG_N + k] * f;
      const o = L * env * wave * (
        0.06 * Math.sin(u * 7 + s.t * 4.1 + ph) +
        0.035 * Math.sin(u * 13 - s.t * 6.3 + ph * 1.9) +
        jagAmp * jag
      );
      clampGlass(x0 + dx * (start + len * u) + nx * o, y0 + dy * (start + len * u) + ny * o, p);
      px[k] = p.x;
      py[k] = p.y;
    }
    // The last point is the glass end of the bolt exactly.
    px[PG_SEG] = s.tipX[i];
    py[PG_SEG] = s.tipY[i];
    for (let k = 0; k < PG_SEG; k++) {
      const o = (i * PG_SEG + k) * 4;
      s.main[o] = px[k];
      s.main[o + 1] = py[k];
      s.main[o + 2] = px[k + 1];
      s.main[o + 3] = py[k + 1];
    }
    // Branches grow off points on the main bolt.
    for (let j = 0; j < PG_BR; j++) {
      const bo = (i * PG_BR + j) * 3;
      let u = s.bpA[bo] * (1 - fb) + s.bpB[bo] * fb;
      const ang = s.bpA[bo + 1] * (1 - fb) + s.bpB[bo + 1] * fb;
      let bl = (s.bpA[bo + 2] * (1 - fb) + s.bpB[bo + 2] * fb) * L;
      if (j === 2) {
        u = u + (0.92 - u) * mixI;
        bl *= 1 + 0.5 * mixI;
      }
      const idx = Math.min(PG_SEG - 1, Math.max(1, Math.round(u * PG_SEG)));
      const ax = px[idx];
      const ay = py[idx];
      // Direction of the bolt at the anchor, rotated by the branch angle.
      const tx = px[idx + 1] - px[idx - 1];
      const ty = py[idx + 1] - py[idx - 1];
      const tl = Math.max(1e-3, Math.hypot(tx, ty));
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const bx = (tx / tl) * ca - (ty / tl) * sa;
      const by = (tx / tl) * sa + (ty / tl) * ca;
      const bnx = -by;
      const bny = bx;
      let lx = ax;
      let ly = ay;
      for (let k = 1; k <= PG_BSEG; k++) {
        const bu = k / PG_BSEG;
        const jag = s.bjA[(i * PG_BR + j) * BJ_N + k] * (1 - f) + s.bjB[(i * PG_BR + j) * BJ_N + k] * f;
        const o = bl * 0.16 * jag * Math.sin(Math.PI * bu * 0.9);
        clampGlass(ax + bx * bl * bu + bnx * o, ay + by * bl * bu + bny * o, p);
        const so = ((i * PG_BR + j) * PG_BSEG + (k - 1)) * 4;
        s.branches[so] = lx;
        s.branches[so + 1] = ly;
        s.branches[so + 2] = p.x;
        s.branches[so + 3] = p.y;
        lx = p.x;
        ly = p.y;
      }
    }
  }
}

export function stepPlasma(s: PlasmaState, dt: number, _unused: number) {
  'worklet';
  if (dt <= 0) return;
  s.t += dt;
  s.flickT += dt;
  s.branchT += dt;
  const target = s.pdown;
  s.attract += (target - s.attract) * (1 - Math.exp(-dt * (target ? 9 : 4)));
  s.flash *= Math.exp(-dt * 2.4);

  // Re-roll flicker, shifting B to A so the shape blends continuously.
  while (s.flickT >= FLICK) {
    s.flickT -= FLICK;
    copyInto(s.jagA, s.jagB);
    rollJag(s, s.jagB);
    copyInto(s.bjA, s.bjB);
    rollJag(s, s.bjB);
  }
  while (s.branchT >= BRANCH_ROLL) {
    s.branchT -= BRANCH_ROLL;
    copyInto(s.bpA, s.bpB);
    rollBranches(s, s.bpB);
  }

  const touch = { x: 0, y: 0 };
  clampGlass(s.px, s.py, touch);
  const ease = smooth(Math.min(1, Math.max(0, s.attract)));
  const rate = 1 - Math.exp(-dt * 14);

  for (let i = 0; i < PG_BOLTS; i++) {
    // Wander: a random walk in angular speed, plus occasional re-strikes.
    s.angVel[i] += (rand01(s) - 0.5) * dt * 9;
    s.angVel[i] *= Math.exp(-dt * 0.9);
    if (s.angVel[i] > 2.4) s.angVel[i] = 2.4;
    else if (s.angVel[i] < -2.4) s.angVel[i] = -2.4;
    s.ang[i] = wrapAngle(s.ang[i] + s.angVel[i] * dt);
    if (rand01(s) < dt * 0.35) {
      s.ang[i] = wrapAngle(s.ang[i] + (rand01(s) - 0.5) * 2.4);
      s.reachTarget[i] = 0.62 + rand01(s) * 0.36;
    }
    // Free bolts keep apart so the globe fills out.
    for (let j = 0; j < PG_BOLTS; j++) {
      if (j === i) continue;
      const d = wrapAngle(s.ang[i] - s.ang[j]);
      const ad = Math.abs(d);
      if (ad < 0.55) s.ang[i] = wrapAngle(s.ang[i] + (d >= 0 ? 1 : -1) * (0.55 - ad) * dt * 1.4);
    }
    s.reach[i] += (s.reachTarget[i] - s.reach[i]) * (1 - Math.exp(-dt * 2));

    const wr = GL_R * s.reach[i];
    const wx = GL_CX + Math.cos(s.ang[i]) * wr;
    const wy = GL_CY + Math.sin(s.ang[i]) * wr;
    const mix = ease * s.weight[i];
    const spread = 9 * ease;
    const fx = touch.x + s.spreadX[i] * (spread / 9);
    const fy = touch.y + s.spreadY[i] * (spread / 9);
    const dx = wx + (fx - wx) * mix;
    const dy = wy + (fy - wy) * mix;
    s.tipX[i] += (dx - s.tipX[i]) * rate;
    s.tipY[i] += (dy - s.tipY[i]) * rate;
    const c = { x: 0, y: 0 };
    clampGlass(s.tipX[i], s.tipY[i], c);
    s.tipX[i] = c.x;
    s.tipY[i] = c.y;
  }

  s.pulse = 0.5 + 0.5 * Math.sin(s.t * 9.4) * Math.sin(s.t * 3.1);
  s.glow = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(s.t * 23.0) * Math.sin(s.t * 7.3)) + 0.25 * s.flash;
  if (s.glow > 1.15) s.glow = 1.15;
  buildPlasma(s, ease);
}


// ---- measurements used by tests and the emulator checks ----

export function plasmaMeanTipDist(s: PlasmaState, x: number, y: number, freeToo = false) {
  'worklet';
  let sum = 0;
  let n = 0;
  for (let i = 0; i < PG_BOLTS; i++) {
    if (!freeToo && s.weight[i] === 0) continue;
    sum += Math.hypot(s.tipX[i] - x, s.tipY[i] - y);
    n++;
  }
  return n ? sum / n : 0;
}

export function plasmaOutside(s: PlasmaState) {
  'worklet';
  const lim = GL_R + 0.5;
  let bad = 0;
  const check = (arr: Float32Array) => {
    for (let i = 0; i < arr.length; i += 2) {
      const x = arr[i];
      const y = arr[i + 1];
      if (!(x === x) || !(y === y) || Math.hypot(x - GL_CX, y - GL_CY) > lim) bad++;
    }
  };
  check(s.main);
  check(s.branches);
  return bad;
}
