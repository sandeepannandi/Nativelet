/* Rigid-body dice on a felt tray. Pure TypeScript, no dependencies, shared by
   the React Native component, the web preview and the tests.

   Units: one die edge = 1. y is up, the felt is y = 0. Each die is a unit-mass
   cube (isotropic inertia I = m a^2 / 6). Contacts are the eight corners against
   the felt and the rail walls, and corners against the other dice, resolved with
   sequential impulses (restitution, Coulomb friction, rolling resistance) on a
   fixed 1/360 s step. */

export type V3 = [number, number, number];
export type Q4 = [number, number, number, number]; // w, x, y, z

export type Die = {
  p: V3;
  q: Q4;
  v: V3;
  w: V3;
  rest: number; // seconds spent nearly still
  asleep: boolean;
  held: boolean;
};

export type DiceWorld = {
  dice: Die[];
  halfX: number;
  halfZ: number;
  clock: number;
  seed: number;
  settledFor: number;
  /** Hardest felt or rail hit since the host last read and cleared it (normal impulse, for haptics). */
  impact: number;
};

export type DiceOptions = {
  gravity: number;
  floorRestitution: number;
  wallRestitution: number;
  floorFriction: number;
  wallFriction: number;
  dieFriction: number;
  dieRestitution: number;
  rolling: number;
};

export const DICE_DEFAULTS: DiceOptions = {
  gravity: 95,
  floorRestitution: 0.34,
  wallRestitution: 0.5,
  floorFriction: 0.5,
  wallFriction: 0.3,
  dieFriction: 0.4,
  dieRestitution: 0.4,
  rolling: 0.9,
};

export const STEP = 1 / 360;
const SKIN = 0.02; // contact skin so exactly-touching faces still register
const INV_I = 6; // 1 / (m a^2 / 6) with m = a = 1

/* Face values: local +y 1, -y 6, +x 3, -x 4, +z 2, -z 5 (opposites add to 7). */
export const FACE_AXES: { axis: 0 | 1 | 2; sign: 1 | -1; value: number }[] = [
  { axis: 1, sign: 1, value: 1 },
  { axis: 1, sign: -1, value: 6 },
  { axis: 0, sign: 1, value: 3 },
  { axis: 0, sign: -1, value: 4 },
  { axis: 2, sign: 1, value: 2 },
  { axis: 2, sign: -1, value: 5 },
];

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function qMul(a: Q4, b: Q4): Q4 {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function qNorm(q: Q4): Q4 {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qAxisAngle(axis: V3, angle: number): Q4 {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2) / l;
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** Row-major 3x3 rotation matrix of a unit quaternion. */
export function qMat(q: Q4): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const CORNERS: V3[] = [];
for (let i = 0; i < 8; i++) CORNERS.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]);

function mulMat(m: number[], v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

export function cornerOffsets(m: number[]): V3[] {
  return CORNERS.map((c) => mulMat(m, c));
}

export function createDie(p: V3, q: Q4 = [1, 0, 0, 0]): Die {
  return { p: [...p] as V3, q, v: [0, 0, 0], w: [0, 0, 0], rest: 0, asleep: false, held: false };
}

export function createWorld(count: number, halfX = 3.4, halfZ = 4.4, seed = 1): DiceWorld {
  const dice: Die[] = [];
  const rng = mulberry(seed);
  for (let i = 0; i < count; i++) {
    const a = rng() * 6.283;
    const q = qNorm([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const d = createDie([(i - (count - 1) / 2) * 1.5, 0.5, halfZ * 0.35 + (rng() - 0.5) * 0.4], q);
    // Start flat: snap to a random face up.
    d.q = qAxisAngle([0, 1, 0], a);
    dice.push(d);
  }
  return { dice, halfX, halfZ, clock: 0, seed, settledFor: 0, impact: 0 };
}

/** Throw every die from a hand position with a given launch velocity. */
export function throwDice(world: DiceWorld, from: V3, vel: V3, spinScale = 1, seed?: number) {
  const rng = mulberry(seed ?? (world.seed = (world.seed * 1664525 + 1013904223) >>> 0));
  world.dice.forEach((d, i) => {
    const off = (i - (world.dice.length - 1) / 2) * 0.95;
    d.p = [from[0] + off, from[1] + (rng() - 0.5) * 0.3, from[2] + (rng() - 0.5) * 0.6];
    d.q = qNorm([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const jitter = 0.85 + rng() * 0.3;
    d.v = [vel[0] * jitter + (rng() - 0.5) * 1.6, vel[1], vel[2] * jitter + (rng() - 0.5) * 1.6];
    const sp = (14 + rng() * 16) * spinScale;
    const ax: V3 = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
    const l = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    // Spin about an axis roughly across the throw, like a real wrist flick.
    d.w = [(ax[0] / l) * sp + vel[2] * 0.5, (ax[1] / l) * sp * 0.4, (ax[2] / l) * sp - vel[0] * 0.5];
    d.rest = 0;
    d.asleep = false;
    d.held = false;
  });
  world.settledFor = 0;
}

type Body = Die;

function pointVel(b: Body, r: V3): V3 {
  const c = cross(b.w, r);
  return [b.v[0] + c[0], b.v[1] + c[1], b.v[2] + c[2]];
}

function angularTerm(r: V3, n: V3): number {
  const rn = cross(r, n);
  const c = cross([rn[0] * INV_I, rn[1] * INV_I, rn[2] * INV_I], r);
  return dot(n, c);
}

function applyImpulse(b: Body, r: V3, j: V3) {
  b.v[0] += j[0];
  b.v[1] += j[1];
  b.v[2] += j[2];
  const t = cross(r, j);
  b.w[0] += t[0] * INV_I;
  b.w[1] += t[1] * INV_I;
  b.w[2] += t[2] * INV_I;
}

/** One contact between body A (at offset rA) and optionally body B. n points from B (or the wall) toward A. */
function resolveContact(
  A: Body, rA: V3, B: Body | null, rB: V3 | null, n: V3, restitution: number, mu: number, approach: number,
) {
  const uA = pointVel(A, rA);
  const uB = B && rB ? pointVel(B, rB) : ([0, 0, 0] as V3);
  const u: V3 = [uA[0] - uB[0], uA[1] - uB[1], uA[2] - uB[2]];
  const un = dot(u, n);
  if (un >= 0) return 0;
  let denom = 1 + angularTerm(rA, n);
  if (B && rB) denom += 1 + angularTerm(rB, n);
  const e = approach < -1.2 ? restitution : 0;
  const jn = (-(1 + e) * un) / denom;
  const imp: V3 = [n[0] * jn, n[1] * jn, n[2] * jn];
  applyImpulse(A, rA, imp);
  if (B && rB) applyImpulse(B, rB, [-imp[0], -imp[1], -imp[2]]);
  // Friction on the post-impulse tangential velocity.
  const uA2 = pointVel(A, rA);
  const uB2 = B && rB ? pointVel(B, rB) : ([0, 0, 0] as V3);
  let t: V3 = [uA2[0] - uB2[0], uA2[1] - uB2[1], uA2[2] - uB2[2]];
  const tn = dot(t, n);
  t = [t[0] - n[0] * tn, t[1] - n[1] * tn, t[2] - n[2] * tn];
  const tl = Math.hypot(t[0], t[1], t[2]);
  if (tl > 1e-6) {
    const td: V3 = [t[0] / tl, t[1] / tl, t[2] / tl];
    let dt = 1 + angularTerm(rA, td);
    if (B && rB) dt += 1 + angularTerm(rB, td);
    const jt = Math.min(tl / dt, mu * jn);
    const fi: V3 = [-td[0] * jt, -td[1] * jt, -td[2] * jt];
    applyImpulse(A, rA, fi);
    if (B && rB) applyImpulse(B, rB, [-fi[0], -fi[1], -fi[2]]);
  }
  return jn;
}

export type Contacts = { floor: boolean };

/** Which face is up, 1 to 6, and how flat it lies (1 = perfectly level). */
export function topFace(d: Die): { value: number; flat: number; axis: V3 } {
  const m = qMat(d.q);
  let best = -2;
  let value = 1;
  let axis: V3 = [0, 1, 0];
  for (const f of FACE_AXES) {
    const a: V3 = [m[f.axis] * f.sign, m[3 + f.axis] * f.sign, m[6 + f.axis] * f.sign];
    if (a[1] > best) {
      best = a[1];
      value = f.value;
      axis = a;
    }
  }
  return { value, flat: best, axis };
}

export function stepDice(world: DiceWorld, dt: number, opts: DiceOptions = DICE_DEFAULTS) {
  let rem = dt;
  while (rem > 1e-9) {
    const h = Math.min(STEP, rem);
    rem -= h;
    substep(world, h, opts);
  }
}

function substep(world: DiceWorld, h: number, o: DiceOptions) {
  const { dice, halfX, halfZ } = world;
  world.clock += h;
  const mats: number[][] = [];
  for (const d of dice) {
    if (d.held || d.asleep) {
      mats.push(qMat(d.q));
      continue;
    }
    d.v[1] -= o.gravity * h;
    // Light air drag.
    const drag = 1 - 0.05 * h;
    d.v[0] *= drag; d.v[1] *= drag; d.v[2] *= drag;
    d.p[0] += d.v[0] * h;
    d.p[1] += d.v[1] * h;
    d.p[2] += d.v[2] * h;
    const wl = Math.hypot(d.w[0], d.w[1], d.w[2]);
    if (wl > 1e-9) {
      const dq = qAxisAngle(d.w, wl * h);
      d.q = qNorm(qMul(dq, d.q));
    }
    mats.push(qMat(d.q));
  }
  const grounded = dice.map(() => false);
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i];
      if (d.held || d.asleep) continue;
      const offs = cornerOffsets(mats[i]);
      for (let c = 0; c < 8; c++) {
        const r = offs[c];
        const px = d.p[0] + r[0], py = d.p[1] + r[1], pz = d.p[2] + r[2];
        if (py < 0) {
          const approach = pointVel(d, r)[1];
          world.impact = Math.max(world.impact, resolveContact(d, r, null, null, [0, 1, 0], o.floorRestitution, o.floorFriction, approach));
          d.p[1] -= py * 0.5;
          grounded[i] = true;
        }
        if (px < -halfX) {
          const approach = pointVel(d, r)[0];
          world.impact = Math.max(world.impact, resolveContact(d, r, null, null, [1, 0, 0], o.wallRestitution, o.wallFriction, approach));
          d.p[0] += (-halfX - px) * 0.5;
        } else if (px > halfX) {
          const approach = -pointVel(d, r)[0];
          world.impact = Math.max(world.impact, resolveContact(d, r, null, null, [-1, 0, 0], o.wallRestitution, o.wallFriction, approach));
          d.p[0] -= (px - halfX) * 0.5;
        }
        if (pz < -halfZ) {
          const approach = pointVel(d, r)[2];
          world.impact = Math.max(world.impact, resolveContact(d, r, null, null, [0, 0, 1], o.wallRestitution, o.wallFriction, approach));
          d.p[2] += (-halfZ - pz) * 0.5;
        } else if (pz > halfZ) {
          const approach = -pointVel(d, r)[2];
          world.impact = Math.max(world.impact, resolveContact(d, r, null, null, [0, 0, -1], o.wallRestitution, o.wallFriction, approach));
          d.p[2] -= (pz - halfZ) * 0.5;
        }
      }
    }
    // Dice against dice: corners of one inside the other.
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const A = dice[i], B = dice[j];
        if (A.held || B.held) continue;
        const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], dz = B.p[2] - A.p[2];
        if (dx * dx + dy * dy + dz * dz > 3.1) continue;
        if (dieDie(A, mats[i], B, mats[j], o) | dieDie(B, mats[j], A, mats[i], o)) { grounded[i] = true; grounded[j] = true; }
      }
    }
  }
  // Rolling resistance and sleep.
  for (let i = 0; i < dice.length; i++) {
    const d = dice[i];
    if (d.held || d.asleep) continue;
    if (grounded[i]) {
      const k = 1 - o.rolling * h;
      d.w[0] *= k; d.w[1] *= 1 - o.rolling * 1.6 * h; d.w[2] *= k;
      d.v[0] *= 1 - 0.35 * h; d.v[2] *= 1 - 0.35 * h;
    }
    const sp = Math.hypot(d.v[0], d.v[1], d.v[2]);
    const sw = Math.hypot(d.w[0], d.w[1], d.w[2]);
    if (grounded[i] && sp < 0.35 && sw < 0.9) {
      d.rest += h;
      const tf = topFace(d);
      if (tf.flat < 0.9995 && d.rest > 0.08) {
        // A cube cannot stay balanced on an edge: gently tip it toward the nearest flat face.
        const t = cross(tf.axis, [0, 1, 0]);
        const g = 45 * h; d.w[0] += t[0] * g; d.w[1] += t[1] * g; d.w[2] += t[2] * g;
      } else if (d.rest > 0.22 && !overlapsOther(dice, i)) {
        d.asleep = true;
        d.v = [0, 0, 0];
        d.w = [0, 0, 0];
        d.p[1] = 0.5;
        // Align exactly flat so it does not creep.
        const m = qMat(d.q);
        void m;
      }
    } else {
      d.rest = 0;
    }
  }
  // Wake a sleeper that gets hit.
  for (let i = 0; i < dice.length; i++) {
    if (!dice[i].asleep) continue;
    for (let j = 0; j < dice.length; j++) {
      if (i === j || dice[j].asleep || dice[j].held) continue;
      const dx = dice[j].p[0] - dice[i].p[0], dy = dice[j].p[1] - dice[i].p[1], dz = dice[j].p[2] - dice[i].p[2];
      if (dx * dx + dy * dy + dz * dz < 1.9 && Math.hypot(dice[j].v[0], dice[j].v[1], dice[j].v[2]) > 1.2) dice[i].asleep = false;
    }
  }
  world.settledFor = dice.every((d) => d.asleep || d.held) ? world.settledFor + h : 0;
}

function overlapsOther(dice: Die[], i: number): boolean {
  for (let j = 0; j < dice.length; j++) {
    if (j === i) continue;
    const dx = dice[j].p[0] - dice[i].p[0], dy = dice[j].p[1] - dice[i].p[1], dz = dice[j].p[2] - dice[i].p[2];
    if (Math.abs(dy) < 0.9 && Math.hypot(dx, dz) < 0.97) return true;
  }
  return false;
}

function dieDie(A: Die, mA: number[], B: Die, mB: number[], o: DiceOptions): number {
  const offs = cornerOffsets(mA);
  let deepest = 0;
  let dn: V3 | null = null;
  const lcY = mB[1] * (A.p[0] - B.p[0]) + mB[4] * (A.p[1] - B.p[1]) + mB[7] * (A.p[2] - B.p[2]);
  {
    // Centre of A inside B (corner tests alone miss near-coincident cubes): shove them apart.
    const cw: V3 = [A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]];
    const lc: V3 = [
      mB[0] * cw[0] + mB[3] * cw[1] + mB[6] * cw[2],
      mB[1] * cw[0] + mB[4] * cw[1] + mB[7] * cw[2],
      mB[2] * cw[0] + mB[5] * cw[1] + mB[8] * cw[2],
    ];
    if (Math.abs(lc[0]) < 0.5 && Math.abs(lc[1]) < 0.5 && Math.abs(lc[2]) < 0.5) {
      // Prefer separating sideways: dice on the felt cannot go down.
      let k = 0, dk = 1 - Math.abs(lc[0]);
      for (let a = 1; a < 3; a++) {
        const d2 = 1 - Math.abs(lc[a]) + (a === 1 ? 0.6 : 0);
        if (d2 < dk) { dk = d2; k = a; }
      }
      const sg = lc[k] >= 0 ? 1 : -1;
      deepest = 1 - Math.abs(lc[k]);
      dn = [mB[k] * sg, mB[3 + k] * sg, mB[6 + k] * sg];
      A.asleep = false; B.asleep = false; A.rest = 0; B.rest = 0;
    }
  }
  for (let c = 0; c < 8; c++) {
    const r = offs[c];
    const wp: V3 = [A.p[0] + r[0] - B.p[0], A.p[1] + r[1] - B.p[1], A.p[2] + r[2] - B.p[2]];
    // Into B's local frame (transpose of its rotation).
    const l: V3 = [
      mB[0] * wp[0] + mB[3] * wp[1] + mB[6] * wp[2],
      mB[1] * wp[0] + mB[4] * wp[1] + mB[7] * wp[2],
      mB[2] * wp[0] + mB[5] * wp[1] + mB[8] * wp[2],
    ];
    const ax = Math.abs(l[0]), ay = Math.abs(l[1]), az = Math.abs(l[2]);
    const H = 0.5 + SKIN;
    if (ax >= H || ay >= H || az >= H) continue;
    let k = 0;
    let depth = H - ax;
    if (H - az < depth) { k = 2; depth = H - az; }
    // Vertical separation only when A's centre really is above or below B (stacking);
    // two dice side by side on the felt share a height and must slide apart sideways.
    if (Math.abs(lcY) > 0.62 && H - ay < depth) { k = 1; depth = H - ay; }
    const s = l[k] >= 0 ? 1 : -1;
    const n: V3 = [mB[k] * s, mB[3 + k] * s, mB[6 + k] * s];
    const rB: V3 = [wp[0], wp[1], wp[2]];
    const approach = dot(
      [pointVel(A, r)[0] - pointVel(B, rB)[0], pointVel(A, r)[1] - pointVel(B, rB)[1], pointVel(A, r)[2] - pointVel(B, rB)[2]],
      n,
    );
    resolveContact(A, r, B, rB, n, o.dieRestitution, o.dieFriction, approach);
    if (depth - SKIN > deepest) { deepest = depth - SKIN; dn = n; }
    if (approach < -0.6) {
      // A real knock wakes a sleeping die; gentle touching does not.
      A.asleep = false;
      B.asleep = false;
      A.rest = 0;
      B.rest = 0;
    }
  }
  if (dn) {
    // Separate along the deepest contact once, so overlapped dice never sleep inside each other.
    if (deepest > 0.06) { A.asleep = false; B.asleep = false; A.rest = 0; B.rest = 0; }
    const push = deepest * 0.5;
    A.p[0] += dn[0] * push; A.p[1] += dn[1] * push; A.p[2] += dn[2] * push;
    B.p[0] -= dn[0] * push; B.p[1] -= dn[1] * push; B.p[2] -= dn[2] * push;
    return 1;
  }
  return 0;
}

export function diceValues(world: DiceWorld): number[] {
  return world.dice.map((d) => topFace(d).value);
}

export function allSettled(world: DiceWorld): boolean {
  return world.dice.every((d) => d.asleep) && world.settledFor > 0.15;
}

export function kineticEnergy(world: DiceWorld): number {
  let e = 0;
  for (const d of world.dice) {
    e += 0.5 * (d.v[0] ** 2 + d.v[1] ** 2 + d.v[2] ** 2) + 0.5 * (1 / INV_I) * (d.w[0] ** 2 + d.w[1] ** 2 + d.w[2] ** 2);
  }
  return e;
}

/* ---------- picking up and throwing ---------- */

/** Lift every die into the hand. The caller then moves them with moveHeld. */
export function grabDice(world: DiceWorld, seed = 1) {
  const rng = mulberry(seed);
  for (const d of world.dice) {
    d.held = true;
    d.asleep = false;
    d.rest = 0;
    d.v = [0, 0, 0];
    d.w = [(rng() - 0.5) * 9, (rng() - 0.5) * 9, (rng() - 0.5) * 9];
  }
}

/** Carry the held dice toward a hand position; measures the hand velocity for the throw. */
export function moveHeld(world: DiceWorld, target: V3, dt: number) {
  const n = world.dice.length;
  world.dice.forEach((d, i) => {
    if (!d.held) return;
    const off = (i - (n - 1) / 2) * 1.15;
    const want: V3 = [
      Math.max(-world.halfX + 0.8, Math.min(world.halfX - 0.8, target[0] + off)),
      target[1],
      Math.max(-world.halfZ + 0.8, Math.min(world.halfZ - 0.8, target[2])),
    ];
    const k = Math.min(1, dt * 16);
    const nx = d.p[0] + (want[0] - d.p[0]) * k;
    const ny = d.p[1] + (want[1] - d.p[1]) * k;
    const nz = d.p[2] + (want[2] - d.p[2]) * k;
    const inv = dt > 1e-6 ? 1 / dt : 0;
    // Smoothed hand velocity.
    d.v = [
      d.v[0] * 0.7 + ((nx - d.p[0]) * inv) * 0.3,
      d.v[1] * 0.7 + ((ny - d.p[1]) * inv) * 0.3,
      d.v[2] * 0.7 + ((nz - d.p[2]) * inv) * 0.3,
    ];
    d.p = [nx, ny, nz];
    const wl = Math.hypot(d.w[0], d.w[1], d.w[2]);
    if (wl > 1e-9) d.q = qNorm(qMul(qAxisAngle(d.w, wl * dt), d.q));
  });
}

/** Let go: each die leaves with the hand velocity plus a flick of spin. Returns the launch speed. */
export function releaseDice(world: DiceWorld, seed = 1): number {
  const rng = mulberry(seed);
  let speed = 0;
  for (const d of world.dice) {
    if (!d.held) continue;
    d.held = false;
    d.asleep = false;
    d.rest = 0;
    let vx = d.v[0], vy = d.v[1], vz = d.v[2];
    const l = Math.hypot(vx, vy, vz);
    const cap = 30;
    if (l > cap) { vx *= cap / l; vy *= cap / l; vz *= cap / l; }
    d.v = [vx, vy, vz];
    speed = Math.max(speed, Math.hypot(vx, vz));
    const sp = 10 + Math.hypot(vx, vz) * 0.7;
    d.w = [vz * 0.55 + (rng() - 0.5) * sp * 0.5, (rng() - 0.5) * sp * 0.5, -vx * 0.55 + (rng() - 0.5) * sp * 0.5];
  }
  world.settledFor = 0;
  return speed;
}
