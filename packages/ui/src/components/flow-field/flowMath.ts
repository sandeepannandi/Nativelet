// Pure 2D flow-field physics for the Flow Field. Every function is a
// worklet so Reanimated can step the simulation on the UI thread; plain JS
// (tests, web preview) ignores the tag. Deterministic: the permutation
// table, spawn positions, sizes and lifespans all come from a seeded
// generator, so tests, native and web agree.
//
// Model: tracer particles advected through a divergence-free velocity
// field - the curl of a drifting two-octave Perlin potential - so the
// ambient motion swirls the way a real fluid does instead of jittering.
// Particles carry momentum (an exponential relaxation toward the local
// field, which is inertia), and the fingertip is a moving impulse paddle:
// it shoves fluid along its own velocity, sheds a rim vortex at its edge
// and pushes a little pressure ahead of itself. Trails are velocity
// streaks: a particle's tail is its own displacement over a short window,
// so fast comets stretch and slow ones shrink to dots, like a
// long-exposure photograph of plankton.

export const FLOW_W = 320;
export const FLOW_H = 380;
export const FLOW_COUNT = 1400;

export type FlowOptions = {
  scale: number;      // noise frequency, per px (feature size ~ 1/scale)
  speed: number;      // ambient field speed ceiling, px/s
  calm: number;       // field magnitude floor for smooth normalisation
  response: number;   // velocity relaxation toward the field, 1/s (inertia)
  eps: number;        // curl finite-difference radius, px
  push: number;       // paddle gain: accel per (px/s) of finger speed
  swirl: number;      // rim vortex gain (per px of rim distance)
  press: number;      // outward pressure gain ahead of the fingertip
  radius: number;     // fingertip influence radius, px
  maxSpeed: number;   // hard speed cap, px/s
  lifeMin: number;    // shortest particle lifespan, s
  lifeSpan: number;   // random extra lifespan, s
};

export const FLOW_DEFAULTS: FlowOptions = {
  scale: 0.0105,
  speed: 46,
  calm: 0.006,
  response: 2.4,
  eps: 1.6,
  push: 20,
  swirl: 0.55,
  press: 0.2,
  radius: 96,
  maxSpeed: 260,
  lifeMin: 7,
  lifeSpan: 9,
};

export type FlowState = {
  n: number;
  t: number;
  rng: number;
  perm: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  pdown: number;
  px: number;   // pointer position
  py: number;
  plx: number;  // pointer position last frame
  ply: number;
  pvx: number;  // smoothed pointer velocity, px/s
  pvy: number;
  fv: Float32Array; // scratch pair for the field lookup
  settled: boolean;
};

const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0];
const GRAD_Y = [1, 1, -1, -1, 0, 0, 1, -1];

function rand01(s: FlowState) {
  'worklet';
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function fade(t: number) {
  'worklet';
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Classic 2D gradient (Perlin) noise over a seeded permutation table.
function noise2(perm: Uint8Array, x: number, y: number) {
  'worklet';
  const X = Math.floor(x);
  const Y = Math.floor(y);
  const xf = x - X;
  const yf = y - Y;
  const xi = X & 255;
  const yi = Y & 255;
  const u = fade(xf);
  const v = fade(yf);
  const aa = perm[perm[xi] + yi] & 7;
  const ab = perm[perm[xi] + yi + 1] & 7;
  const ba = perm[perm[xi + 1] + yi] & 7;
  const bb = perm[perm[xi + 1] + yi + 1] & 7;
  const g00 = GRAD_X[aa] * xf + GRAD_Y[aa] * yf;
  const g10 = GRAD_X[ba] * (xf - 1) + GRAD_Y[ba] * yf;
  const g01 = GRAD_X[ab] * xf + GRAD_Y[ab] * (yf - 1);
  const g11 = GRAD_X[bb] * (xf - 1) + GRAD_Y[bb] * (yf - 1);
  const x1 = g00 + u * (g10 - g00);
  const x2 = g01 + u * (g11 - g01);
  return x1 + v * (x2 - x1);
}

// The stream potential: two octaves drifting at different velocities, so
// the current pattern evolves slowly instead of sliding as one sheet.
function potential(s: FlowState, opts: FlowOptions, x: number, y: number) {
  'worklet';
  const sc = opts.scale;
  const a = noise2(s.perm, x * sc + s.t * 0.055, y * sc + s.t * 0.021);
  const b = noise2(s.perm, x * sc * 2.13 + 31.7 - s.t * 0.038, y * sc * 2.13 + 11.3 + s.t * 0.047);
  return a + 0.5 * b;
}

// Ambient field velocity at a point: the curl of the potential (which is
// exactly divergence-free), magnitude eased toward opts.speed so flat
// spots in the potential stay slow instead of snapping to full speed.
export function fieldVelocity(s: FlowState, opts: FlowOptions, x: number, y: number, out: Float32Array, oi: number) {
  'worklet';
  const e = opts.eps;
  const vx = (potential(s, opts, x, y + e) - potential(s, opts, x, y - e)) / (2 * e);
  const vy = -(potential(s, opts, x + e, y) - potential(s, opts, x - e, y)) / (2 * e);
  const m = Math.sqrt(vx * vx + vy * vy);
  const k = opts.speed / Math.sqrt(m * m + opts.calm * opts.calm);
  out[oi] = vx * k;
  out[oi + 1] = vy * k;
}

function respawn(s: FlowState, i: number, opts: FlowOptions) {
  'worklet';
  s.x[i] = rand01(s) * FLOW_W;
  s.y[i] = rand01(s) * FLOW_H;
  // Born at rest: the streak grows from a dot as the field picks the
  // particle up, so births never pop in with a full-length tail.
  s.vx[i] = 0;
  s.vy[i] = 0;
  s.age[i] = 0;
  s.life[i] = opts.lifeMin + rand01(s) * opts.lifeSpan;
}

export function createFlow(opts: FlowOptions = FLOW_DEFAULTS, n: number = FLOW_COUNT, seed = 20261025, settled = false): FlowState {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let r = seed | 0;
  const next = () => {
    r = (r + 0x6d2b79f5) | 0;
    let t = r;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const s: FlowState = {
    n,
    t: 0,
    rng: (seed ^ 0x9e3779b9) | 0,
    perm,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    age: new Float32Array(n),
    life: new Float32Array(n),
    size: new Float32Array(n),
    pdown: 0,
    px: 0, py: 0, plx: 0, ply: 0, pvx: 0, pvy: 0,
    fv: new Float32Array(2),
    settled: false,
  };
  for (let i = 0; i < n; i++) {
    s.x[i] = rand01(s) * FLOW_W;
    s.y[i] = rand01(s) * FLOW_H;
    s.vx[i] = 0;
    s.vy[i] = 0;
    // Stagger deaths so respawns never pulse in waves.
    s.life[i] = opts.lifeMin + rand01(s) * opts.lifeSpan;
    s.age[i] = rand01(s) * s.life[i];
    const r2 = rand01(s);
    s.size[i] = 1.2 + r2 * r2 * 1.6;
  }
  if (settled) {
    // A still picture for Reduce Motion: run the current long enough that
    // every particle rides the field and carries a readable streak.
    for (let f = 0; f < 180; f++) stepFlowFrame(s, 1 / 60, opts);
    s.settled = true;
  }
  return s;
}

// Pointer feed, called once per frame with the latest position. The
// paddle velocity is derived frame to frame and smoothed, so a held-still
// finger stops pushing instead of injecting phantom energy.
export function flowPointer(s: FlowState, x: number, y: number, down: boolean) {
  'worklet';
  if (down && !s.pdown) {
    s.plx = x;
    s.ply = y;
    s.pvx = 0;
    s.pvy = 0;
  }
  s.px = x;
  s.py = y;
  s.pdown = down ? 1 : 0;
}

export function stepFlowFrame(s: FlowState, dt: number, opts: FlowOptions = FLOW_DEFAULTS) {
  'worklet';
  if (dt <= 0) return;
  const step = Math.min(dt, 0.05);
  s.t += step;
  if (s.pdown) {
    const rvx = (s.px - s.plx) / step;
    const rvy = (s.py - s.ply) / step;
    s.pvx += (rvx - s.pvx) * 0.55;
    s.pvy += (rvy - s.pvy) * 0.55;
    s.plx = s.px;
    s.ply = s.py;
  } else {
    const decay = Math.exp(-step * 5);
    s.pvx *= decay;
    s.pvy *= decay;
  }
  const pspd = Math.sqrt(s.pvx * s.pvx + s.pvy * s.pvy);
  const sigma = opts.radius * 0.5;
  const inv2s2 = 1 / (2 * sigma * sigma);
  const relax = 1 - Math.exp(-opts.response * step);
  const M = 10;
  const wrapW = FLOW_W + 2 * M;
  const wrapH = FLOW_H + 2 * M;
  for (let i = 0; i < s.n; i++) {
    let x = s.x[i];
    let y = s.y[i];
    let vx = s.vx[i];
    let vy = s.vy[i];
    fieldVelocity(s, opts, x, y, s.fv, 0);
    vx += (s.fv[0] - vx) * relax;
    vy += (s.fv[1] - vy) * relax;
    if (s.pdown && pspd > 1) {
      const dx = x - s.px;
      const dy = y - s.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < opts.radius * opts.radius) {
        const g = Math.exp(-d2 * inv2s2);
        const d = Math.sqrt(d2) + 1e-4;
        // Along-track shove, rim vortex and a little outward pressure -
        // a moving paddle, not a magic attractor.
        const ax = (s.pvx * opts.push + (-dy / d) * s.pvy * pspd * opts.swirl * 0.02 + (dx / d) * pspd * opts.press) * g;
        const ay = (s.pvy * opts.push + (dx / d) * s.pvx * pspd * opts.swirl * 0.02 + (dy / d) * pspd * opts.press) * g;
        vx += ax * step;
        vy += ay * step;
      }
    }
    const m2 = vx * vx + vy * vy;
    if (m2 > opts.maxSpeed * opts.maxSpeed) {
      const k = opts.maxSpeed / Math.sqrt(m2);
      vx *= k;
      vy *= k;
    }
    x += vx * step;
    y += vy * step;
    if (x < -M) x += wrapW; else if (x > FLOW_W + M) x -= wrapW;
    if (y < -M) y += wrapH; else if (y > FLOW_H + M) y -= wrapH;
    s.age[i] += step;
    if (s.age[i] > s.life[i] || !Number.isFinite(x) || !Number.isFinite(y)) {
      respawn(s, i, opts);
    } else {
      s.x[i] = x;
      s.y[i] = y;
      s.vx[i] = vx;
      s.vy[i] = vy;
    }
  }
}

/* ---- measurement helpers (tests, previews) ---- */

export function flowAvgSpeed(s: FlowState) {
  'worklet';
  let sum = 0;
  for (let i = 0; i < s.n; i++) sum += Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
  return sum / s.n;
}

export function flowMaxSpeed(s: FlowState) {
  'worklet';
  let m = 0;
  for (let i = 0; i < s.n; i++) {
    const v = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
    if (v > m) m = v;
  }
  return m;
}

// Particles outside the wrapped torus margin; should always be zero.
export function flowEscaped(s: FlowState) {
  'worklet';
  const M = 10;
  let bad = 0;
  for (let i = 0; i < s.n; i++) {
    const x = s.x[i];
    const y = s.y[i];
    if (!(x >= -M && x <= FLOW_W + M && y >= -M && y <= FLOW_H + M)) bad++;
  }
  return bad;
}

// Mean |cosine| between a particle's velocity and the local field - how
// well the tracers ride the current (1 is perfectly locked on).
export function flowFieldLock(s: FlowState, opts: FlowOptions = FLOW_DEFAULTS) {
  'worklet';
  const out = new Float32Array(2);
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < s.n; i += 10) {
    const v = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
    if (v < 3) continue;
    fieldVelocity(s, opts, s.x[i], s.y[i], out, 0);
    const fv = Math.sqrt(out[0] * out[0] + out[1] * out[1]);
    if (fv < 1) continue;
    sum += (s.vx[i] * out[0] + s.vy[i] * out[1]) / (v * fv);
    counted++;
  }
  return counted ? sum / counted : 1;
}

// Numeric divergence of the ambient field over a coarse grid, normalised
// by the mean field speed. Curl noise is exactly divergence-free, so this
// should stay at the finite-difference noise floor.
export function flowDivergence(s: FlowState, opts: FlowOptions = FLOW_DEFAULTS) {
  'worklet';
  const a = new Float32Array(2);
  const b = new Float32Array(2);
  const h = 2;
  let div = 0;
  let spd = 0;
  let cells = 0;
  for (let gy = 40; gy < FLOW_H; gy += 60) {
    for (let gx = 40; gx < FLOW_W; gx += 60) {
      fieldVelocity(s, opts, gx + h, gy, a, 0);
      fieldVelocity(s, opts, gx - h, gy, b, 0);
      const dvx = (a[0] - b[0]) / (2 * h);
      fieldVelocity(s, opts, gx, gy + h, a, 0);
      fieldVelocity(s, opts, gx, gy - h, b, 0);
      const dvy = (a[1] - b[1]) / (2 * h);
      fieldVelocity(s, opts, gx, gy, a, 0);
      div += Math.abs(dvx + dvy);
      spd += Math.sqrt(a[0] * a[0] + a[1] * a[1]);
      cells++;
    }
  }
  return div / (spd + 1e-6);
}
