// Pure combustion model for Burn Dismiss. A postcard ignites where the
// finger lands: a noise-warped burn front creeps outward, paper chars behind
// it and is eaten away, embers rise on turbulent air and ash flutters down.
// Holding the finger feeds the fire; Restore runs the same front backward
// because every cell's burn level is a pure function of the sim clock:
// burn_i(t) = clamp((t - igniteT_i) * rate_i, 0, 1). No Math.random anywhere:
// a seeded generator keeps web, native and tests in agreement frame for
// frame. Every function is a worklet so the sim can run on either thread.

export type BurnConfig = {
  cols: number;
  rows: number;
  /** Card size in px. */
  width: number;
  height: number;
};

export const BURN_DEFAULTS = {
  /** Seconds for one cell to burn through, before the fuel multiplier. */
  burnTime: 1.15,
  /** Heat a burning neighbour pumps into a cell per second per unit burn. */
  spreadRate: 75,
  /** Burn level a cell must pass before it heats its neighbours. */
  spreadAfter: 0.05,
  /** Diagonal neighbours heat at this fraction of the edge neighbours. */
  diagSpread: 0.55,
  /** Heat at which a cell ignites. */
  igniteAtHeat: 1,
  /** Fire climbs: upward spread multiplier / downward multiplier. */
  upDraft: 1.5,
  downDraft: 0.65,
  /** Finger heat injection per second inside the hold radius. */
  injectRate: 16,
  /** Hold radius, px. */
  holdRadius: 15,
  /** Instantly lit core under a fresh touch, px. */
  sparkRadius: 3,
  /** Restore plays the clock backward at this multiple of forward speed. */
  restoreSpeed: 2.1,
  /** Ember spawn probability per frontier cell per second. */
  emberRate: 0.09,
  /** Ash spawn probability per freshly charred cell per second. */
  ashRate: 0.10,
  maxEmbers: 170,
  maxAsh: 90,
  /** Fixed timestep ceiling for the sim. */
  fixedDt: 1 / 90,
};

export type BurnOptions = typeof BURN_DEFAULTS;

/** Ember slot stride: x, y, vx, vy, life, maxLife, size, seed. */
export const EMBER_STRIDE = 8;
/** Ash slot stride: x, y, vx, vy, life, maxLife, size, rot, spin, seed. */
export const ASH_STRIDE = 10;

export type BurnState = {
  /** Clock the whole burn is a function of, seconds. */
  clock: number;
  /** Per cell: ignition time on the clock, -1 while unburnt. Row-major. */
  igniteT: Float32Array;
  /** Per cell: burn-through rate locked in at ignition. */
  rate: Float32Array;
  /** Per cell: accumulated heat toward ignition. */
  heat: Float32Array;
  /** Per cell: paper fuel multiplier from low-frequency noise, fixed. */
  fuel: Float32Array;
  /** Ember slots, EMBER_STRIDE floats each. */
  embers: Float32Array;
  emberCount: number;
  /** Ash slots, ASH_STRIDE floats each. */
  ash: Float32Array;
  ashCount: number;
  /** 0 idle, 1 burning, 2 restoring. */
  mode: number;
  /** Seeded PRNG state. */
  seed: number;
  /** Held finger, in px; active gates heat injection. */
  px: number;
  py: number;
  holding: number;
  /** Book-keeping for spawn throttling and statistics. */
  burnt: number;
  minIgniteT: number;
  /** Scratch for heat spreading, so no step allocates. */
  scratch: Float32Array;
};

export function hash01(i: number, s: number): number {
  'worklet';
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rand(s: BurnState): number {
  'worklet';
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) | 0;
  return ((s.seed >>> 9) & 0x7fffff) / 8388608;
}

function vnoise(x: number, y: number, seed: number): number {
  'worklet';
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash01(xi * 7919 + yi * 104729, seed);
  const b = hash01((xi + 1) * 7919 + yi * 104729, seed);
  const c = hash01(xi * 7919 + (yi + 1) * 104729, seed);
  const d = hash01((xi + 1) * 7919 + (yi + 1) * 104729, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise, 4 octaves, ~0..1. */
export function fbm2(x: number, y: number, seed: number): number {
  'worklet';
  let v = 0;
  let amp = 0.5;
  let fx = x;
  let fy = y;
  for (let o = 0; o < 4; o++) {
    v += amp * vnoise(fx, fy, seed + o * 131);
    fx *= 2.03;
    fy *= 2.03;
    amp *= 0.5;
  }
  return v;
}

export function createBurn(cfg: BurnConfig, opts: BurnOptions, seed = 20261124): BurnState {
  'worklet';
  const n = cfg.cols * cfg.rows;
  const fuel = new Float32Array(n);
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      // Low-frequency paper grain: some patches burn faster than others.
      fuel[r * cfg.cols + c] = 0.82 + 0.55 * fbm2(c * 0.09, r * 0.09, seed);
    }
  }
  const igniteT = new Float32Array(n);
  igniteT.fill(-1);
  return {
    clock: 0,
    igniteT,
    rate: new Float32Array(n),
    heat: new Float32Array(n),
    fuel,
    embers: new Float32Array(opts.maxEmbers * EMBER_STRIDE),
    emberCount: 0,
    ash: new Float32Array(opts.maxAsh * ASH_STRIDE),
    ashCount: 0,
    mode: 0,
    seed: seed ^ 0x5bd1e995,
    px: 0,
    py: 0,
    holding: 0,
    burnt: 0,
    minIgniteT: -1,
    scratch: new Float32Array(n),
  };
}

/** Burn level of a cell on the reversible clock. */
export function burnAt(sim: BurnState, i: number): number {
  'worklet';
  const t0 = sim.igniteT[i];
  if (t0 < 0) return 0;
  const b = (sim.clock - t0) * sim.rate[i];
  return b < 0 ? 0 : b > 1 ? 1 : b;
}

function igniteCell(sim: BurnState, cfg: BurnConfig, c: number, r: number, opts: BurnOptions) {
  'worklet';
  const i = r * cfg.cols + c;
  if (sim.igniteT[i] >= 0) return;
  sim.igniteT[i] = sim.clock;
  sim.rate[i] = (0.9 + 0.2 * hash01(i, 77)) / (opts.burnTime * sim.fuel[i]);
  if (sim.minIgniteT < 0) sim.minIgniteT = sim.clock;
  sim.mode = 1;
}

/** Touch down or drag: light the core at once and prime a heat ring. */
export function burnPointerDown(sim: BurnState, cfg: BurnConfig, x: number, y: number, opts: BurnOptions) {
  'worklet';
  // A fresh touch after a partial restore drops the un-burnt future, so the
  // new fire spreads by heat like any other.
  if (sim.mode === 2 || sim.mode === 0) {
    const n = cfg.cols * cfg.rows;
    for (let i = 0; i < n; i++) {
      if (sim.igniteT[i] >= 0 && sim.igniteT[i] > sim.clock) {
        sim.igniteT[i] = -1;
        sim.rate[i] = 0;
        sim.heat[i] = 0;
      }
    }
    if (sim.mode === 2) sim.mode = 1;
  }
  sim.px = x;
  sim.py = y;
  sim.holding = 1;
  const cw = cfg.width / cfg.cols;
  const ch = cfg.height / cfg.rows;
  const cc = Math.floor(x / cw);
  const cr = Math.floor(y / ch);
  const spark = Math.max(1, Math.round(opts.sparkRadius / cw));
  for (let dr = -spark; dr <= spark; dr++) {
    for (let dc = -spark; dc <= spark; dc++) {
      const c = cc + dc;
      const r = cr + dr;
      if (c < 0 || r < 0 || c >= cfg.cols || r >= cfg.rows) continue;
      igniteCell(sim, cfg, c, r, opts);
    }
  }
  const ring = Math.ceil(opts.holdRadius / cw);
  for (let dr = -ring; dr <= ring; dr++) {
    for (let dc = -ring; dc <= ring; dc++) {
      const c = cc + dc;
      const r = cr + dr;
      if (c < 0 || r < 0 || c >= cfg.cols || r >= cfg.rows) continue;
      const d = Math.hypot(dc * cw, dr * ch);
      if (d < opts.holdRadius) {
        const i = r * cfg.cols + c;
        sim.heat[i] = Math.max(sim.heat[i], 0.55 * (1 - d / opts.holdRadius));
      }
    }
  }
}

export function burnPointerMove(sim: BurnState, x: number, y: number) {
  'worklet';
  sim.px = x;
  sim.py = y;
}

export function burnPointerUp(sim: BurnState) {
  'worklet';
  sim.holding = 0;
}

/** Begin restoring the card: the clock runs backward from the burn's peak. */
export function startRestore(sim: BurnState) {
  'worklet';
  if (sim.mode === 1 && sim.burnt >= 0) sim.mode = 2;
  sim.holding = 0;
}

export function burntFraction(sim: BurnState): number {
  'worklet';
  return sim.burnt / sim.igniteT.length;
}

function spawnEmber(sim: BurnState, x: number, y: number, opts: BurnOptions) {
  'worklet';
  if (sim.emberCount >= opts.maxEmbers) return;
  const i = sim.emberCount * EMBER_STRIDE;
  sim.emberCount += 1;
  const e = sim.embers;
  e[i] = x;
  e[i + 1] = y;
  e[i + 2] = (rand(sim) - 0.5) * 14;
  e[i + 3] = -18 - rand(sim) * 42;
  e[i + 4] = 0;
  e[i + 5] = 1.1 + rand(sim) * 1.2;
  e[i + 6] = 1.1 + rand(sim) * 1.6;
  e[i + 7] = rand(sim) * 100;
}

function spawnAsh(sim: BurnState, x: number, y: number, opts: BurnOptions) {
  'worklet';
  if (sim.ashCount >= opts.maxAsh) return;
  const i = sim.ashCount * ASH_STRIDE;
  sim.ashCount += 1;
  const a = sim.ash;
  a[i] = x;
  a[i + 1] = y;
  a[i + 2] = (rand(sim) - 0.5) * 10;
  a[i + 3] = 6 + rand(sim) * 14;
  a[i + 4] = 0;
  a[i + 5] = 2.2 + rand(sim) * 1.8;
  a[i + 6] = 1.6 + rand(sim) * 2.2;
  a[i + 7] = rand(sim) * 6.28;
  a[i + 8] = (rand(sim) - 0.5) * 5;
  a[i + 9] = rand(sim) * 100;
}

function killEmber(sim: BurnState, slot: number) {
  'worklet';
  const last = sim.emberCount - 1;
  if (slot !== last) {
    sim.embers.copyWithin(slot * EMBER_STRIDE, last * EMBER_STRIDE, (last + 1) * EMBER_STRIDE);
  }
  sim.emberCount = last;
}

function killAsh(sim: BurnState, slot: number) {
  'worklet';
  const last = sim.ashCount - 1;
  if (slot !== last) {
    sim.ash.copyWithin(slot * ASH_STRIDE, last * ASH_STRIDE, (last + 1) * ASH_STRIDE);
  }
  sim.ashCount = last;
}

function stepParticles(sim: BurnState, cfg: BurnConfig, dt: number) {
  'worklet';
  const e = sim.embers;
  for (let s = 0; s < sim.emberCount; s++) {
    const i = s * EMBER_STRIDE;
    e[i + 4] += dt;
    if (e[i + 4] >= e[i + 5]) {
      killEmber(sim, s);
      s -= 1;
      continue;
    }
    // Turbulence: curl-ish drift from noise, buoyant rise, light drag.
    const t = sim.clock * 1.6 + e[i + 7];
    e[i + 2] += (vnoise(e[i] * 0.045 + t, e[i + 1] * 0.045, 911) - 0.5) * 130 * dt;
    e[i + 3] += (vnoise(e[i] * 0.045, e[i + 1] * 0.045 - t, 912) - 0.62) * 60 * dt;
    e[i + 2] *= 1 - 0.7 * dt;
    e[i + 3] *= 1 - 0.25 * dt;
    if (e[i + 3] < -70) e[i + 3] = -70;
    e[i] += e[i + 2] * dt;
    e[i + 1] += e[i + 3] * dt;
    if (e[i + 1] < -20) {
      killEmber(sim, s);
      s -= 1;
    }
  }
  const a = sim.ash;
  for (let s = 0; s < sim.ashCount; s++) {
    const i = s * ASH_STRIDE;
    a[i + 4] += dt;
    if (a[i + 4] >= a[i + 5] || a[i + 1] > cfg.height + 24) {
      killAsh(sim, s);
      s -= 1;
      continue;
    }
    // Flutter: side sway and tumbling fall.
    a[i + 7] += a[i + 8] * dt;
    a[i] += (a[i + 2] + Math.sin(a[i + 4] * 5 + a[i + 9]) * 9) * dt;
    a[i + 1] += a[i + 3] * (0.85 + 0.3 * Math.sin(a[i + 4] * 3 + a[i + 9])) * dt;
  }
}

/** One fixed step forward (or backward while restoring). */
function step(sim: BurnState, cfg: BurnConfig, dt: number, opts: BurnOptions) {
  'worklet';
  const n = cfg.cols * cfg.rows;
  const cw = cfg.width / cfg.cols;
  const ch = cfg.height / cfg.rows;

  if (sim.mode === 2) {
    // Restore: rewind the clock until nothing was ever lit.
    sim.clock -= dt * opts.restoreSpeed;
    if (sim.minIgniteT < 0 || sim.clock <= sim.minIgniteT) {
      sim.igniteT.fill(-1);
      sim.heat.fill(0);
      sim.clock = 0;
      sim.mode = 0;
      sim.burnt = 0;
      sim.minIgniteT = -1;
    } else {
      let burnt = 0;
      for (let i = 0; i < n; i++) if (burnAt(sim, i) >= 1) burnt += 1;
      sim.burnt = burnt;
    }
    stepParticles(sim, cfg, dt);
    return;
  }

  if (sim.mode !== 1) {
    stepParticles(sim, cfg, dt);
    return;
  }

  sim.clock += dt;

  // Held finger keeps feeding the fire.
  if (sim.holding === 1) {
    const cc = Math.floor(sim.px / cw);
    const cr = Math.floor(sim.py / ch);
    const ring = Math.ceil(opts.holdRadius / cw);
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        const c = cc + dc;
        const r = cr + dr;
        if (c < 0 || r < 0 || c >= cfg.cols || r >= cfg.rows) continue;
        const d = Math.hypot(dc * cw, dr * ch);
        if (d < opts.holdRadius) {
          const i = r * cfg.cols + c;
          sim.heat[i] += opts.injectRate * (1 - d / opts.holdRadius) * dt;
          if (sim.heat[i] >= opts.igniteAtHeat) igniteCell(sim, cfg, c, r, opts);
        }
      }
    }
  }

  // Front propagation: burning cells heat their 4-neighbours; fire climbs.
  const add = sim.scratch;
  let burnt = 0;
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const i = r * cfg.cols + c;
      const b = burnAt(sim, i);
      if (b >= 1) {
        burnt += 1;
        continue;
      }
      if (sim.igniteT[i] < 0 || b < opts.spreadAfter) continue;
      const feed = opts.spreadRate * (b - opts.spreadAfter) * dt;
      const diag = feed * opts.diagSpread;
      if (c > 0) add[i - 1] += feed;
      if (c < cfg.cols - 1) add[i + 1] += feed;
      if (r > 0) add[i - cfg.cols] += feed * opts.upDraft;
      if (r < cfg.rows - 1) add[i + cfg.cols] += feed * opts.downDraft;
      if (c > 0 && r > 0) add[i - cfg.cols - 1] += diag * opts.upDraft;
      if (c < cfg.cols - 1 && r > 0) add[i - cfg.cols + 1] += diag * opts.upDraft;
      if (c > 0 && r < cfg.rows - 1) add[i + cfg.cols - 1] += diag * opts.downDraft;
      if (c < cfg.cols - 1 && r < cfg.rows - 1) add[i + cfg.cols + 1] += diag * opts.downDraft;
    }
  }
  for (let i = 0; i < n; i++) {
    if (add[i] === 0) continue;
    if (sim.igniteT[i] >= 0) continue;
    sim.heat[i] += add[i];
    if (sim.heat[i] >= opts.igniteAtHeat) igniteCell(sim, cfg, i % cfg.cols, Math.floor(i / cfg.cols), opts);
    add[i] = 0;
  }
  sim.burnt = burnt;

  // Spawns from the live front and the freshly charred band.
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const i = r * cfg.cols + c;
      const b = burnAt(sim, i);
      if (b > 0.06 && b < 0.62 && rand(sim) < opts.emberRate * dt) {
        spawnEmber(sim, (c + 0.5) * cw, (r + 0.5) * ch, opts);
      } else if (b >= 0.7 && b < 1 && rand(sim) < opts.ashRate * dt) {
        spawnAsh(sim, (c + 0.5) * cw, (r + 0.5) * ch, opts);
      }
    }
  }
  stepParticles(sim, cfg, dt);
}

export function stepBurn(sim: BurnState, cfg: BurnConfig, dt: number, opts: BurnOptions) {
  'worklet';
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, opts.fixedDt);
    step(sim, cfg, h, opts);
    left -= h;
  }
}

/** Flicker for the glow band: per-cell noise breathing with the clock. */
export function flickerAt(sim: BurnState, cfg: BurnConfig, i: number): number {
  'worklet';
  return 0.7 + 0.3 * vnoise((i % cfg.cols) * 0.7 + sim.clock * 3.1, Math.floor(i / cfg.cols) * 0.7, 517);
}

/**
 * Pack the burn field for the shader/overlay: r = burn level, g = glow
 * flicker inside the burning band, b = ember-crack pulse in the char band.
 */
export function packBurn(sim: BurnState, cfg: BurnConfig, bytes: Uint8Array): Uint8Array {
  'worklet';
  const n = cfg.cols * cfg.rows;
  for (let i = 0; i < n; i++) {
    const b = burnAt(sim, i);
    const o = i * 4;
    bytes[o] = Math.round(b * 255);
    let g = 0;
    if (b > 0.02 && b < 0.5) {
      g = Math.round(255 * flickerAt(sim, cfg, i) * Math.min(1, (b - 0.02) / 0.08));
    }
    bytes[o + 1] = g;
    let crack = 0;
    if (b >= 0.5 && b < 0.98) {
      const p = vnoise((i % cfg.cols) * 1.7 + sim.clock * 0.6, Math.floor(i / cfg.cols) * 1.7, 913);
      crack = p > 0.78 ? Math.round(255 * (p - 0.78) * 3.2 * flickerAt(sim, cfg, i)) : 0;
    }
    bytes[o + 2] = crack;
    bytes[o + 3] = 255;
  }
  return bytes;
}
