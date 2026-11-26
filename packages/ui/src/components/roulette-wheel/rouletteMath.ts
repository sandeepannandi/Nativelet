/* Roulette wheel physics. Pure TypeScript, no React, so the Skia component, the web
   preview and the tests all run the same simulation.

   Plane: x to the right, y towards the viewer (angles grow clockwise seen from above).
   Units: the wheel bowl has radius 1.

   The ball is a point mass rolling on a height profile H(r), so the pull towards the
   middle is -g H'(r) and a circular orbit appears by itself when v^2 / r = g H'(r). The
   wheel is a rotating frame with its own friction. Between the two sit:
   - the ball track, a curved wall, so a faster ball climbs and a slowing ball spirals in,
   - a shelf with eight fixed diamond deflectors that the ball hits as it drops,
   - the rotor cone that drags the ball towards the wheel's own velocity,
   - 37 pockets split by thin frets that turn with the wheel, with hops in the third
     dimension (height z) so a ball can leap a fret or settle after a few bounces. */

export const POCKETS = 37;
export const DELTA = (Math.PI * 2) / POCKETS;
/** European single-zero order, clockwise. */
export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type PocketColor = "red" | "black" | "green";
export const colorOf = (n: number): PocketColor => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

/* ---------- geometry ---------- */
export const BALL_R = 0.029;
export const WALL_R = 0.985;
export const TRACK_IN = 0.84;
export const SHELF_IN = 0.74;
export const POCKET_OUT = 0.62;
export const POCKET_IN = 0.39;
export const FRET_H = 0.02;
export const FRET_T = 0.004;
export const DEFLECTOR_COUNT = 8;
export const DEFLECTOR_R = 0.79;
export const DEFLECTOR_H = 0.045;
const DEFL_RADIAL = 0.06;
const DEFL_TANG = 0.034;

const G = 24.5;
const G_Z = 17;
const STEP = 1 / 480;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* The height profile was tuned on an older, smaller pocket ring. Stretch it onto the current
   radii so the track, shelf and pockets keep their feel while the pockets and ball get bigger. */
const MAP_NEW = [0, 0.39, 0.62, 0.74, 0.84, 0.985, 1.1];
const MAP_OLD = [0, 0.315, 0.475, 0.6, 0.7, 0.985, 1.1];
function oldR(r: number): number {
  for (let i = 1; i < MAP_NEW.length; i++) {
    if (r <= MAP_NEW[i]) return MAP_OLD[i - 1] + ((r - MAP_NEW[i - 1]) / (MAP_NEW[i] - MAP_NEW[i - 1])) * (MAP_OLD[i] - MAP_OLD[i - 1]);
  }
  return r - 1.1 + 1.1;
}
function slopeOld(r: number): number {
  if (r >= 0.7) {
    const s = Math.min(1, (r - 0.7) / 0.28);
    return 0.18 + 2.4 * s * s + (r > 0.98 ? (r - 0.98) * 40 : 0);
  }
  if (r >= 0.58) return 0.18 + 0.12 * smooth(0.64, 0.58, r);
  if (r >= 0.37) return 0.3;
  return 0.3 - 2.7 * smooth(0.37, 0.32, r);
}
/** dH/dr: how steeply the surface rises going outwards. */
export function slope(r: number): number {
  return slopeOld(oldR(r));
}

const H_STEP = 0.005;
const H_TAB: number[] = (() => {
  const n = Math.round(1.1 / H_STEP) + 1;
  const h = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) h[i] = h[i - 1] + 0.5 * (slope((i - 1) * H_STEP) + slope(i * H_STEP)) * H_STEP;
  const min = Math.min(...h);
  return h.map((v) => v - min);
})();
/** Surface height at radius r (lowest point of the pocket floor is 0). */
export function height(r: number): number {
  const f = Math.max(0, Math.min(H_TAB.length - 1.001, r / H_STEP));
  const i = Math.floor(f);
  return H_TAB[i] + (H_TAB[i + 1] - H_TAB[i]) * (f - i);
}

/* ---------- state ---------- */
export type Phase = "idle" | "track" | "shelf" | "rotor" | "pocket" | "settled";
export type Ball = {
  x: number; y: number; vx: number; vy: number; z: number; vz: number;
  live: boolean; locked: boolean; lockRel: number; lockR: number; settleT: number;
};
export type RouletteWorld = {
  t: number;
  theta: number;
  omega: number;
  ball: Ball;
  phase: Phase;
  result: number | null;
  rng: number;
  /** Peak impact strength (0 to 1) since last read, reset by the caller. */
  impact: number;
  /** Events since last read, for haptics. */
  events: ("launch" | "drop" | "deflector" | "fret" | "settle")[];
  hits: number;
  trail: number[];
};

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rand(w: RouletteWorld): number {
  w.rng = (w.rng + 0x6d2b79f5) >>> 0;
  let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createWorld(seed = 7): RouletteWorld {
  return {
    t: 0, theta: 0.4, omega: -0.35,
    ball: { x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, live: false, locked: false, lockRel: 0, lockR: 0.36, settleT: 0 },
    phase: "idle", result: null, rng: seed, impact: 0, events: [], hits: 0, trail: [],
  };
}

export const MIN_SPEED = 5.6;
export const MAX_SPEED = 8;
export const DEFAULT_SPEED = 6.6;

/** Spin the wheel and send the ball clockwise round the track. speed is the ball's rim speed in bowl radii per second. */
export function launch(w: RouletteWorld, speed = DEFAULT_SPEED, seed?: number): void {
  if (seed !== undefined) w.rng = seed >>> 0;
  const v = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
  w.omega = -(4.0 + rand(w) * 0.7);
  const phi = -2.3 + rand(w) * 0.5;
  const r = 0.955;
  const b = w.ball;
  b.x = r * Math.cos(phi); b.y = r * Math.sin(phi);
  b.vx = -Math.sin(phi) * v; b.vy = Math.cos(phi) * v;
  b.z = 0; b.vz = 0;
  b.live = true; b.locked = false; b.settleT = 0;
  w.phase = "track"; w.result = null; w.hits = 0; w.trail = [];
  w.events.push("launch");
}

export function pocketAt(theta: number, phi: number): number {
  let rel = (phi - theta) % (Math.PI * 2);
  if (rel < 0) rel += Math.PI * 2;
  return Math.min(POCKETS - 1, Math.floor(rel / DELTA));
}
export const numberAt = (idx: number) => ORDER[((idx % POCKETS) + POCKETS) % POCKETS];

export function deflectorPolys(): number[][][] {
  const out: number[][][] = [];
  for (let k = 0; k < DEFLECTOR_COUNT; k++) {
    const a = (k + 0.5) * ((Math.PI * 2) / DEFLECTOR_COUNT);
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts: number[][] = [];
    for (const [dr, dt] of [[DEFL_RADIAL, 0], [0, DEFL_TANG], [-DEFL_RADIAL, 0], [0, -DEFL_TANG]]) {
      const rr = DEFLECTOR_R + dr;
      pts.push([rr * ca - dt * sa, rr * sa + dt * ca]);
    }
    out.push(pts);
  }
  return out;
}
const DEFLECTORS = deflectorPolys();

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return [ax + dx * t, ay + dy * t];
}

/** Bounce the ball off a point obstacle moving with velocity (ux, uy). */
function bounce(w: RouletteWorld, qx: number, qy: number, ux: number, uy: number, rad: number, e: number, kind: "deflector" | "fret"): boolean {
  const b = w.ball;
  let nx = b.x - qx, ny = b.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= rad || d < 1e-9) return false;
  nx /= d; ny /= d;
  b.x = qx + nx * rad; b.y = qy + ny * rad;
  const rvx = b.vx - ux, rvy = b.vy - uy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return true;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  // a little friction along the contact, and a hop proportional to how hard it struck
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  b.vx -= 0.08 * vt * tx; b.vy -= 0.08 * vt * ty;
  const hit = -vn;
  if (hit > 0.15) {
    const kick = hit * (kind === "deflector" ? 0.55 : 0.4) * (0.55 + 0.9 * rand(w));
    b.vz = Math.max(b.vz, kick);
    w.hits += 1;
    w.impact = Math.max(w.impact, Math.min(1, hit / 5));
    w.events.push(kind);
  }
  return true;
}

/** One fixed physics step. */
export function step(w: RouletteWorld, dt: number): void {
  w.t += dt;
  // The wheel: bearing friction plus viscous drag. It never reverses.
  if (w.omega !== 0) {
    const s = Math.sign(w.omega);
    const mag = Math.abs(w.omega) - (0.035 + 0.045 * Math.abs(w.omega)) * dt;
    w.omega = mag <= 0.002 ? 0 : s * mag;
  }
  w.theta += w.omega * dt;
  const b = w.ball;
  if (!b.live) return;

  if (b.locked) {
    const phi = w.theta + b.lockRel;
    b.x = b.lockR * Math.cos(phi); b.y = b.lockR * Math.sin(phi);
    b.vx = -w.omega * b.y; b.vy = w.omega * b.x;
    return;
  }

  let r = Math.hypot(b.x, b.y) || 1e-9;
  const airborne = b.z > 1e-4 || b.vz > 0;
  const ux = -w.omega * b.y, uy = w.omega * b.x;
  let ax = 0, ay = 0;
  const sp = Math.hypot(b.vx, b.vy);
  if (!airborne) {
    const pull = -G * slope(r);
    ax += (pull * b.x) / r; ay += (pull * b.y) / r;
    // rolling resistance and air drag
    const roll = 0.07 / Math.max(sp, 0.08);
    ax -= b.vx * (0.045 + roll); ay -= b.vy * (0.045 + roll);
    if (r < SHELF_IN) {
      const k = 1.0 * smooth(SHELF_IN, SHELF_IN - 0.05, r);
      ax -= k * (b.vx - ux); ay -= k * (b.vy - uy);
    }
  } else {
    ax -= b.vx * 0.12; ay -= b.vy * 0.12;
    // wheel surface still pulls on the ball in flight through the pocket walls only: none
  }
  b.vx += ax * dt; b.vy += ay * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;

  // vertical hops
  if (airborne) {
    b.vz -= G_Z * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -0.12) {
        b.vz = -b.vz * 0.32;
        // landing on the moving rotor grips it a little
        if (r < SHELF_IN) { b.vx += (ux - b.vx) * 0.15; b.vy += (uy - b.vy) * 0.15; }
        w.impact = Math.max(w.impact, Math.min(1, -b.vz / 2));
      } else b.vz = 0;
    }
  }

  r = Math.hypot(b.x, b.y) || 1e-9;
  // outer wall
  if (r > WALL_R) {
    const nx = b.x / r, ny = b.y / r;
    b.x = nx * WALL_R; b.y = ny * WALL_R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) { b.vx -= 1.25 * vn * nx; b.vy -= 1.25 * vn * ny; }
  }
  // turret base: the ball can never reach the middle
  if (r < POCKET_IN + 0.01) {
    const nx = b.x / r, ny = b.y / r;
    const lim = POCKET_IN + 0.01;
    b.x = nx * lim; b.y = ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; }
    r = lim;
  }

  // deflectors (fixed to the bowl)
  if (r > DEFLECTOR_R - 0.1 && r < DEFLECTOR_R + 0.1 && b.z < DEFLECTOR_H) {
    for (const poly of DEFLECTORS) {
      const n = poly.length;
      let bestD = 1e9, qx = 0, qy = 0;
      for (let i = 0; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n];
        const [cx, cy] = closestOnSegment(b.x, b.y, p[0], p[1], q[0], q[1]);
        const d = Math.hypot(b.x - cx, b.y - cy);
        if (d < bestD) { bestD = d; qx = cx; qy = cy; }
      }
      if (bestD < BALL_R) { bounce(w, qx, qy, 0, 0, BALL_R, 0.62, "deflector"); break; }
    }
  }

  // frets (turn with the wheel), only when the ball is low enough to meet them
  if (r < POCKET_OUT + 0.03 && r > POCKET_IN - 0.02 && b.z < FRET_H + 0.004) {
    const phi = Math.atan2(b.y, b.x);
    let rel = (phi - w.theta) % (Math.PI * 2);
    if (rel < 0) rel += Math.PI * 2;
    const i0 = Math.floor(rel / DELTA);
    for (let k = -1; k <= 2; k++) {
      const psi = w.theta + (i0 + k) * DELTA;
      const c = Math.cos(psi), s = Math.sin(psi);
      const [qx, qy] = closestOnSegment(b.x, b.y, POCKET_IN * c, POCKET_IN * s, POCKET_OUT * c, POCKET_OUT * s);
      const uqx = -w.omega * qy, uqy = w.omega * qx;
      bounce(w, qx, qy, uqx, uqy, BALL_R + FRET_T, 0.56, "fret");
    }
  }

  // phase and settling
  r = Math.hypot(b.x, b.y);
  const prev = w.phase;
  if (r > TRACK_IN) w.phase = "track";
  else if (r > SHELF_IN) w.phase = "shelf";
  else if (r > POCKET_OUT) w.phase = "rotor";
  else w.phase = "pocket";
  if (prev === "track" && w.phase !== "track") w.events.push("drop");
  if (w.phase === "pocket" && b.z <= 1e-4) {
    const rvx = b.vx - (-w.omega * b.y), rvy = b.vy - w.omega * b.x;
    if (Math.hypot(rvx, rvy) < 0.07) b.settleT += dt; else b.settleT = 0;
    if (b.settleT > 0.4) {
      b.locked = true; b.vz = 0; b.z = 0;
      const phi = Math.atan2(b.y, b.x);
      b.lockRel = phi - w.theta; b.lockR = r;
      w.result = numberAt(pocketAt(w.theta, phi));
      w.phase = "settled";
      w.events.push("settle");
    }
  } else b.settleT = 0;
  if (Math.floor(w.t / 0.03) !== Math.floor((w.t - dt) / 0.03)) {
    w.trail.push(b.x, b.y);
    if (w.trail.length > 24) w.trail.splice(0, 2);
  }
}

/** Advance by dt seconds using fixed sub-steps. */
export function advance(w: RouletteWorld, dt: number): void {
  let left = Math.min(dt, 0.25);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    step(w, h);
    left -= h;
  }
}

/** Run until the ball has settled (or maxT seconds pass). Used for Reduce Motion and tests. */
export function simulateToRest(w: RouletteWorld, maxT = 90): void {
  let t = 0;
  while (t < maxT && w.ball.live && !w.ball.locked) {
    step(w, STEP);
    t += STEP;
  }
}

/** The ball's height above the pocket floor, for drawing: surface plus hop. */
export const ballHeight = (w: RouletteWorld): number => height(Math.hypot(w.ball.x, w.ball.y)) + w.ball.z;
