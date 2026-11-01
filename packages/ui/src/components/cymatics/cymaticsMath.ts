// Pure 2D cymatics physics for the Cymatics plate. Every function is a
// worklet so Reanimated can step the simulation on the UI thread; plain
// JS (tests, web preview) ignores the tag. Deterministic: spawn
// positions, grain sizes and every vibration kick come from a seeded
// generator, so tests, native and web agree.
//
// Model: a square steel plate driven at one pure frequency at a time.
// The plate's surface displacement follows the classic Chladni equation
// g(x,y) = cos(m*pi*x)cos(n*pi*y) + r*cos(n*pi*x)cos(m*pi*y) on the unit
// square, where (m, n) picks the resonance mode and r blends the two
// degenerate orientations of the same mode (a real plate rings in a mix
// of both). Sand grains bounce where the surface moves (|g| large) and
// migrate down the amplitude gradient until they reach the nodal lines
// where the plate does not move at all - the same reason real sand
// collects into Chladni figures. Modal fields are sampled once on a
// GRID x GRID lattice (exact equation, grid sampling) and grains look up
// amplitude and its gradient bilinearly, so thousands of grains cost a
// few multiply-adds each instead of trigonometry per grain per frame.

export const CYM_W = 340;
export const CYM_H = 380;
export const PLATE_X = 14;
export const PLATE_Y = 14;
export const PLATE_S = 312;
export const CYM_COUNT = 4200;
export const GRID = 72;

export type CymMode = { m: number; n: number; hz: number };

// Thin-plate law: resonance frequency grows with sqrt(m^4 + n^4). The
// sequence is ordered by that law, so one sweep climbs the real mode
// ladder: 107 Hz up to 1.14 kHz.
const hzOf = (m: number, n: number) => Math.round(26 * Math.sqrt(m * m * m * m + n * n * n * n));
const MODE_PAIRS: [number, number][] = [
  [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 6],
];
export const CYM_MODES: CymMode[] = MODE_PAIRS.map(([m, n]) => ({ m, n, hz: hzOf(m, n) }));
export const CYM_MODE_COUNT = CYM_MODES.length;

export type CymOptions = {
  drift: number;     // top migration speed toward nodal lines, plate/s
  response: number;  // velocity relaxation toward migration, 1/s
  jitter0: number;   // baseline grain liveliness, plate/s impulse
  jitter1: number;   // extra kick per unit of vibration amplitude
  exciteKick: number; // per-unit retune energy fed back as kicks
  exciteDecay: number; // 1/s
  scatter: number;   // tap impulse, plate/s
  maxSpeed: number;  // hard speed cap, plate/s
};

export const CYM_DEFAULTS: CymOptions = {
  drift: 0.21,
  response: 5.5,
  jitter0: 0.004,
  jitter1: 0.055,
  exciteKick: 0.16,
  exciteDecay: 2.6,
  scatter: 1.05,
  maxSpeed: 1.15,
};

export type CymState = {
  n: number;
  rng: number;
  t: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  size: Float32Array;
  u: number;          // continuous mode position, [0, CYM_MODE_COUNT - 1]
  r: number;          // degenerate-mode mix, [-1, 1]
  lastU: number;
  lastR: number;
  excite: number;     // undissipated retune energy
  modeA: Float32Array; // CYM_MODE_COUNT grids: cos(m*pi*x)cos(n*pi*y)
  modeB: Float32Array; // and the degenerate partner cos(n*pi*x)cos(m*pi*y)
  amp: Float32Array;  // blended signed field, GRID*GRID
  gx: Float32Array;   // its gradient (per unit plate)
  gy: Float32Array;
  pdown: number;
  px: number;
  py: number;
  plx: number;
  ply: number;
  moved: number;      // accumulated drag this touch, for tap detection
  settled: boolean;
};

function rand01(s: CymState) {
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

const G2 = GRID * GRID;

export function createCymatics(
  opts: CymOptions = CYM_DEFAULTS,
  n: number = CYM_COUNT,
  seed = 20261101,
  settled = false,
  u0 = 2,
): CymState {
  const s: CymState = {
    n,
    rng: (seed ^ 0x9e3779b9) | 0,
    t: 0,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    size: new Float32Array(n),
    u: u0,
    r: -1,
    lastU: -1,
    lastR: 99,
    excite: 0,
    modeA: new Float32Array(CYM_MODE_COUNT * G2),
    modeB: new Float32Array(CYM_MODE_COUNT * G2),
    amp: new Float32Array(G2),
    gx: new Float32Array(G2),
    gy: new Float32Array(G2),
    pdown: 0,
    px: 0.5, py: 0.5, plx: 0.5, ply: 0.5,
    moved: 0,
    settled: false,
  };
  // Sample the exact Chladni equation per mode, once.
  for (let k = 0; k < CYM_MODE_COUNT; k++) {
    const m = CYM_MODES[k].m;
    const nn = CYM_MODES[k].n;
    const base = k * G2;
    for (let j = 0; j < GRID; j++) {
      const yy = j / (GRID - 1);
      for (let i = 0; i < GRID; i++) {
        const xx = i / (GRID - 1);
        s.modeA[base + j * GRID + i] = Math.cos(m * Math.PI * xx) * Math.cos(nn * Math.PI * yy);
        s.modeB[base + j * GRID + i] = Math.cos(nn * Math.PI * xx) * Math.cos(m * Math.PI * yy);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    s.x[i] = rand01(s);
    s.y[i] = rand01(s);
    s.vx[i] = 0;
    s.vy[i] = 0;
    const r2 = rand01(s);
    s.size[i] = 1.1 + r2 * r2 * 1.5;
  }
  cymRecomputeField(s);
  if (settled) {
    // A still picture for Reduce Motion: run the plate long enough that
    // the figure is fully formed.
    for (let f = 0; f < 900; f++) stepCymatics(s, 1 / 60, opts);
    s.settled = true;
  }
  return s;
}

// Blend the two bracketing mode fields with the degenerate mix, then
// derive the gradient by central differences. Runs only when the tuning
// actually changed, so a still plate costs nothing.
export function cymRecomputeField(s: CymState) {
  'worklet';
  if (s.u === s.lastU && s.r === s.lastR) return;
  s.lastU = s.u;
  s.lastR = s.r;
  let ia = Math.floor(s.u);
  if (ia < 0) ia = 0;
  if (ia > CYM_MODE_COUNT - 2) ia = CYM_MODE_COUNT - 2;
  const ib = ia + 1;
  const t = smooth(s.u - ia);
  const ba = ia * G2;
  const bb = ib * G2;
  const r = s.r;
  for (let c = 0; c < G2; c++) {
    s.amp[c] =
      (1 - t) * (s.modeA[ba + c] + r * s.modeB[ba + c]) +
      t * (s.modeA[bb + c] + r * s.modeB[bb + c]);
  }
  const h = 1 / (GRID - 1);
  for (let j = 0; j < GRID; j++) {
    const row = j * GRID;
    for (let i = 0; i < GRID; i++) {
      const il = i > 0 ? i - 1 : i;
      const ir = i < GRID - 1 ? i + 1 : i;
      const ju = j > 0 ? j - 1 : j;
      const jd = j < GRID - 1 ? j + 1 : j;
      s.gx[row + i] = (s.amp[row + ir] - s.amp[row + il]) / ((ir - il) * h);
      s.gy[row + i] = (s.amp[jd * GRID + i] - s.amp[ju * GRID + i]) / ((jd - ju) * h);
    }
  }
}

function bilinear(g: Float32Array, x: number, y: number) {
  'worklet';
  let fx = x * (GRID - 1);
  let fy = y * (GRID - 1);
  if (fx < 0) fx = 0; else if (fx > GRID - 1.001) fx = GRID - 1.001;
  if (fy < 0) fy = 0; else if (fy > GRID - 1.001) fy = GRID - 1.001;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const c00 = g[j * GRID + i];
  const c10 = g[j * GRID + i + 1];
  const c01 = g[(j + 1) * GRID + i];
  const c11 = g[(j + 1) * GRID + i + 1];
  return (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty;
}

// Pointer feed in normalized plate coordinates, called once per frame
// with the latest position. Horizontal drag sweeps the drive frequency
// (a full plate width climbs the whole mode ladder); vertical drag blends
// the degenerate orientation mix. A held-still finger changes nothing and
// injects no energy, the way a real steady bow keeps the figure stable.
export function cymPointer(s: CymState, x: number, y: number, down: boolean) {
  'worklet';
  if (down && !s.pdown) {
    s.plx = x;
    s.ply = y;
    s.moved = 0;
  }
  if (down && s.pdown) {
    const dx = x - s.plx;
    const dy = y - s.ply;
    s.moved += Math.abs(dx) + Math.abs(dy);
    const du = dx * (CYM_MODE_COUNT - 1) * 1.12;
    const dr = dy * 2.6;
    if (du !== 0 || dr !== 0) {
      let u = s.u + du;
      if (u < 0) u = 0; else if (u > CYM_MODE_COUNT - 1) u = CYM_MODE_COUNT - 1;
      let r = s.r + dr;
      if (r < -1) r = -1; else if (r > 1) r = 1;
      s.excite += Math.abs(u - s.u) * 1.1 + Math.abs(r - s.r) * 0.4;
      s.u = u;
      s.r = r;
    }
    s.plx = x;
    s.ply = y;
  }
  s.px = x;
  s.py = y;
  s.pdown = down ? 1 : 0;
}

// A tap: the whole plate gets one sharp kick. Grains jump off the nodal
// lines (farther where the plate vibrates hardest), then the figure
// reforms. Called from the frame callback when the pointer flags a tap.
export function cymScatter(s: CymState, opts?: CymOptions) {
  'worklet';
  const o = opts === undefined ? CYM_DEFAULTS : opts;
  for (let i = 0; i < s.n; i++) {
    const a = Math.abs(bilinear(s.amp, s.x[i], s.y[i]));
    const mag = o.scatter * (0.45 + 0.55 * Math.min(1, a));
    const ang = rand01(s) * 6.283185307179586;
    const q = 0.5 + rand01(s);
    s.vx[i] += Math.cos(ang) * mag * q;
    s.vy[i] += Math.sin(ang) * mag * q;
  }
}

export function stepCymatics(s: CymState, dt: number, opts?: CymOptions) {
  'worklet';
  const o = opts === undefined ? CYM_DEFAULTS : opts;
  if (dt <= 0) return;
  const step = Math.min(dt, 0.05);
  s.t += step;
  cymRecomputeField(s);
  const rl = 1 - Math.exp(-o.response * step);
  const jscale = step * 60;
  const ex = s.excite;
  for (let i = 0; i < s.n; i++) {
    let x = s.x[i];
    let y = s.y[i];
    let vx = s.vx[i];
    let vy = s.vy[i];
    const amp = bilinear(s.amp, x, y);
    const gx = bilinear(s.gx, x, y);
    const gy = bilinear(s.gy, x, y);
    const a = amp < 0 ? -amp : amp;
    const gmag = Math.sqrt(gx * gx + gy * gy) + 1e-5;
    // Migration: grains walk down the vibration-amplitude slope, faster
    // where the plate rings harder. Near a nodal line both the slope walk
    // and the kicks die out, so grains come to rest on the figure.
    const sgn = amp >= 0 ? 1 : -1;
    const walk = o.drift * Math.min(1, a * 1.35);
    const tvx = (-sgn * gx / gmag) * walk;
    const tvy = (-sgn * gy / gmag) * walk;
    vx += (tvx - vx) * rl;
    vy += (tvy - vy) * rl;
    // Vibration: random kicks that grow with local amplitude, plus the
    // not-yet-dissipated energy of the last retune.
    const j = (o.jitter0 + o.jitter1 * a + o.exciteKick * ex) * jscale;
    vx += (rand01(s) - 0.5) * 2 * j;
    vy += (rand01(s) - 0.5) * 2 * j;
    const m2 = vx * vx + vy * vy;
    if (m2 > o.maxSpeed * o.maxSpeed) {
      const k = o.maxSpeed / Math.sqrt(m2);
      vx *= k;
      vy *= k;
    }
    x += vx * step;
    y += vy * step;
    // The rim: grains bounce off the plate edge with a deadened rebound.
    if (x < 0) { x = -x; vx = Math.abs(vx) * 0.4; } else if (x > 1) { x = 2 - x; vx = -Math.abs(vx) * 0.4; }
    if (y < 0) { y = -y; vy = Math.abs(vy) * 0.4; } else if (y > 1) { y = 2 - y; vy = -Math.abs(vy) * 0.4; }
    s.x[i] = x;
    s.y[i] = y;
    s.vx[i] = vx;
    s.vy[i] = vy;
  }
  s.excite *= Math.exp(-o.exciteDecay * step);
  if (s.excite < 1e-4) s.excite = 0;
}

/* ---- readouts ---- */

// Drive frequency in Hz, interpolated along the mode ladder.
export function cymHz(s: CymState) {
  'worklet';
  let ia = Math.floor(s.u);
  if (ia < 0) ia = 0;
  if (ia > CYM_MODE_COUNT - 2) ia = CYM_MODE_COUNT - 2;
  const t = smooth(s.u - ia);
  return Math.round(CYM_MODES[ia].hz * (1 - t) + CYM_MODES[ia + 1].hz * t);
}

// The nearest discrete mode pair, for the "Plate m,n" label.
export function cymModePair(s: CymState): [number, number] {
  'worklet';
  let k = Math.round(s.u);
  if (k < 0) k = 0;
  if (k > CYM_MODE_COUNT - 1) k = CYM_MODE_COUNT - 1;
  return [CYM_MODES[k].m, CYM_MODES[k].n];
}

/* ---- measurement helpers (tests, previews) ---- */

export function cymMeanAmp(s: CymState) {
  'worklet';
  let sum = 0;
  for (let i = 0; i < s.n; i++) sum += Math.abs(bilinear(s.amp, s.x[i], s.y[i]));
  return sum / s.n;
}

// Fraction of grains sitting close to a nodal line.
export function cymFracSettled(s: CymState, thr = 0.18) {
  'worklet';
  let c = 0;
  for (let i = 0; i < s.n; i++) {
    if (Math.abs(bilinear(s.amp, s.x[i], s.y[i])) < thr) c++;
  }
  return c / s.n;
}

export function cymAvgSpeed(s: CymState) {
  'worklet';
  let sum = 0;
  for (let i = 0; i < s.n; i++) sum += Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
  return sum / s.n;
}

export function cymMaxSpeed(s: CymState) {
  'worklet';
  let m = 0;
  for (let i = 0; i < s.n; i++) {
    const v = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
    if (v > m) m = v;
  }
  return m;
}

// Grains outside the unit plate; should always be zero.
export function cymEscaped(s: CymState) {
  'worklet';
  let bad = 0;
  for (let i = 0; i < s.n; i++) {
    const x = s.x[i];
    const y = s.y[i];
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) bad++;
  }
  return bad;
}
