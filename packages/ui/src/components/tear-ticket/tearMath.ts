/*
  Tear-off ticket physics. No rendering and no React, so the Skia component, the Canvas2D web preview and the
  tests all run the same code.

  The perforation is a row of NT ties (paper bridges between slits). The stub is pulled by a handle (where the
  finger holds it). The free part of the stub is a strip of paper that bends about the first unbroken tie (the
  hinge): the strip keeps its length, the opening angle psi grows from zero at the hinge over LB points to the
  full angle further along. The finger fixes that angle (the handle must sit under the finger), and the same
  angle is the tension on the hinge tie. A tie breaks when the opening angle at the hinge passes its own strength
  (each one is a little different), the hinge moves one tie on, and the arm gets longer, so the same finger
  position now gives a smaller angle: a tear runs only as far as the pull can open it. Break rate is capped, so
  a yank still reads as a rip. Once the last tie goes the stub is a rigid body: it follows the finger on a
  spring, and after release it falls like paper (drag, flutter, a soft landing) and slides to rest.

  Everything is in the ticket's own pixel frame (TW x TH). The torn edge is a single curve shared by both
  halves, so the two always fit back together.
*/

export const TW = 340;
export const TH = 392;
export const X0 = 70;
export const PL = 200;
export const YP = 244;
export const HS = 80;
export const TOPY = 36;
export const BOTY = YP + HS;
export const PITCH = 6.25;
export const SLIT = 4;
export const NT = 32;
export const LB = 26;
/** Resting spot of the stub centre once it has fallen. */
export const REST_X = 170;
export const REST_Y = 336;

export type TearEvent = "grab" | "tick" | "detach" | "land" | "settle";

export type Body = {
  x: number;
  y: number;
  ang: number;
  vx: number;
  vy: number;
  w: number;
  z: number;
  vz: number;
};

export type TearWorld = {
  seed: number;
  dir: 1 | -1;
  broken: number;
  thr: number[];
  /** Signed size of the torn bridge k, in pixels: how far the fracture runs past the perforation line. */
  tooth: number[];
  jag: number[][];
  fiber: number[];
  psi: number;
  psiV: number;
  psiPeak: number;
  psiRest: number;
  held: boolean;
  g: { a: number; sx: number };
  off: { x: number; y: number };
  finger: { x: number; y: number };
  fingerV: { x: number; y: number };
  budget: number;
  mode: "attached" | "free";
  beta: number;
  body: Body;
  phase: number;
  t: number;
  rest: boolean;
  slowRate: number;
  auto: { t: number; released: boolean } | null;
  events: TearEvent[];
  tickStrength: number;
  reduced: boolean;
};

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

export function createWorld(seed = 3): TearWorld {
  const r = rng(seed * 7919 + 13);
  const thr: number[] = [];
  const tooth: number[] = [];
  const jag: number[][] = [];
  const fiber: number[] = [];
  for (let k = 0; k < NT; k++) {
    thr.push(k === 0 ? 0.62 : 0.26 + 0.18 * r() + (r() < 0.12 ? 0.12 : 0));
    const sign = r() < 0.5 ? -1 : 1;
    tooth.push(sign * (0.5 + 1.9 * r()));
    jag.push([0.25 + 0.75 * r(), 0.15 + 0.85 * r(), 0.25 + 0.75 * r(), 0.1 + 0.8 * r()]);
    fiber.push(0.5 + 1.9 * r());
  }
  return {
    seed,
    dir: 1,
    broken: 0,
    thr,
    tooth,
    jag,
    fiber,
    psi: 0,
    psiV: 0,
    psiPeak: 0,
    psiRest: 0,
    held: false,
    g: { a: 20, sx: 36 },
    off: { x: 0, y: 0 },
    finger: { x: 0, y: 0 },
    fingerV: { x: 0, y: 0 },
    budget: 3,
    mode: "attached",
    beta: 0,
    body: { x: X0 + PL / 2, y: YP + HS / 2, ang: 0, vx: 0, vy: 0, w: 0, z: 0, vz: 0 },
    phase: seed * 1.7,
    t: 0,
    rest: false,
    slowRate: 1,
    auto: null,
    events: [],
    tickStrength: 0,
    reduced: false,
  };
}

/* ---------- the bent strip ---------- */

/** Hinge position along the perforation, measured from the start end. */
export function hingeA(w: TearWorld): number {
  const k = Math.min(w.broken, NT - 1);
  return k * PITCH + SLIT + (PITCH - SLIT) / 2;
}

export const worldX = (dir: 1 | -1, a: number) => X0 + (dir > 0 ? a : PL - a);

export type Curve = { ah: number; dir: 1 | -1; phi: number; cx: Float32Array; cy: Float32Array; psi: Float32Array; n: number };

export function psiAt(phi: number, s: number): number {
  return phi * smooth(s / LB);
}

/** Centre line of the bent strip, one sample per pixel from the hinge towards the start end. */
export function buildCurve(ah: number, dir: 1 | -1, phi: number, cx = new Float32Array(PL + 2), cy = new Float32Array(PL + 2), psi = new Float32Array(PL + 2)): Curve {
  const n = Math.ceil(ah) + 1;
  let x = worldX(dir, ah);
  let y = YP;
  cx[0] = x;
  cy[0] = y;
  psi[0] = 0;
  for (let i = 1; i <= n; i++) {
    const p = psiAt(phi, i - 0.5);
    x += -dir * Math.cos(p);
    y += Math.sin(p);
    cx[i] = x;
    cy[i] = y;
    psi[i] = psiAt(phi, i);
  }
  return { ah, dir, phi, cx, cy, psi, n };
}

/** Where a point of the stub (a along the perforation from the start end, sx down from it) is on the bent strip. */
export function mapBent(c: Curve, a: number, sx: number, out: { x: number; y: number }) {
  const s = c.ah - a;
  if (s <= 0) {
    out.x = worldX(c.dir, a);
    out.y = YP + sx;
    return out;
  }
  const i = Math.min(Math.floor(s), c.n - 1);
  const f = Math.min(1, s - i);
  const i1 = Math.min(i + 1, c.n);
  const px = c.cx[i] + (c.cx[i1] - c.cx[i]) * f;
  const py = c.cy[i] + (c.cy[i1] - c.cy[i]) * f;
  const p = c.psi[i] + (c.psi[i1] - c.psi[i]) * f;
  out.x = px + c.dir * Math.sin(p) * sx;
  out.y = py + Math.cos(p) * sx;
  return out;
}

/** The handle, as it would sit with the strip flat. */
function handleRest(w: TearWorld) {
  return { x: worldX(w.dir, w.g.a), y: YP + w.g.sx };
}

const tmp = { x: 0, y: 0 };
const scratch = { cx: new Float32Array(PL + 2), cy: new Float32Array(PL + 2), psi: new Float32Array(PL + 2) };

/** Opening angle at which the handle sits under the finger, for a handle already on the free strip. */
function solvePhi(w: TearWorld, target: { x: number; y: number }): number {
  const ah = hingeA(w);
  const err = (phi: number) => {
    const c = buildCurve(ah, w.dir, phi, scratch.cx, scratch.cy, scratch.psi);
    mapBent(c, w.g.a, w.g.sx, tmp);
    return Math.hypot(tmp.x - target.x, tmp.y - target.y);
  };
  let best = 0;
  let bestErr = err(0);
  for (let k = 1; k <= 62; k++) {
    const e = err(k * 0.045);
    if (e < bestErr) {
      bestErr = e;
      best = k * 0.045;
    }
  }
  let lo = Math.max(0, best - 0.045);
  let hi = Math.min(2.8, best + 0.045);
  for (let i = 0; i < 7; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (err(m1) < err(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

/**
  Opening angle the finger asks for at the current hinge. A handle already on the free strip must sit under the
  finger, which fixes the angle. Before the tear has reached the handle, pulling out by d at a distance L along
  the perforation peels it open by about atan(d / L).
*/
export function tension(w: TearWorld): number {
  const ah = hingeA(w);
  const tx = w.finger.x - w.off.x;
  const ty = w.finger.y - w.off.y;
  if (ah - w.g.a >= LB) {
    // angle of the finger about the hinge, measured from where the handle lies with the strip flat
    const hx = worldX(w.dir, ah);
    const g0x = worldX(w.dir, w.g.a) - hx;
    const g0y = w.g.sx;
    const u1x = tx - hx;
    const u1y = ty - YP;
    return -w.dir * Math.atan2(g0x * u1y - g0y * u1x, g0x * u1x + g0y * u1y);
  }
  const out = ty - (YP + w.g.sx);
  const along = Math.max(Math.abs(w.g.a - ah), 14);
  return out > 0 ? Math.atan2(out, along) : 0;
}

/* ---------- the free stub ---------- */

export function mapRigid(b: Body, dir: 1 | -1, a: number, sx: number, out: { x: number; y: number }) {
  const ox = dir * (a - PL / 2);
  const oy = sx - HS / 2;
  const c = Math.cos(b.ang);
  const s = Math.sin(b.ang);
  const k = 1 + b.z / 420;
  out.x = b.x + k * (ox * c - oy * s);
  out.y = b.y + k * (ox * s + oy * c);
  return out;
}

/** Where a stub point is right now, bent, rigid or the blend between them. */
export function mapPoint(w: TearWorld, c: Curve | null, a: number, sx: number, out: { x: number; y: number }) {
  if (w.mode === "attached") return c ? mapBent(c, a, sx, out) : out;
  if (w.beta >= 1 || !c) return mapRigid(w.body, w.dir, a, sx, out);
  mapBent(c, a, sx, out);
  const bx = out.x;
  const by = out.y;
  mapRigid(w.body, w.dir, a, sx, out);
  out.x = bx + (out.x - bx) * w.beta;
  out.y = by + (out.y - by) * w.beta;
  return out;
}

export function currentCurve(w: TearWorld): Curve {
  return buildCurve(hingeA(w), w.dir, w.psi);
}

/* ---------- input ---------- */

/** Touch down. Returns whether the stub was caught. */
export function grab(w: TearWorld, x: number, y: number): boolean {
  if (w.auto) return false;
  if (w.mode === "free") {
    if (w.rest || w.body.z < 4) {
      // pick the stub up from where it lies
      let best = 1e9;
      let ba = PL / 2;
      let bs = HS / 2;
      for (let a = 10; a <= PL - 10; a += 20) {
        for (const sx of [10, 40, 70]) {
          mapRigid(w.body, w.dir, a, sx, tmp);
          const d = Math.hypot(tmp.x - x, tmp.y - y);
          if (d < best) {
            best = d;
            ba = a;
            bs = sx;
          }
        }
      }
      if (best > 56) return false;
      mapRigid(w.body, w.dir, ba, bs, tmp);
      w.g = { a: ba, sx: bs };
      w.off = { x: x - tmp.x, y: y - tmp.y };
      w.held = true;
      w.rest = false;
      w.finger = { x, y };
      w.fingerV = { x: 0, y: 0 };
      w.events.push("grab");
      return true;
    }
    return false;
  }
  if (w.broken === 0 && w.psi < 0.02) {
    const inX = x > X0 - 26 && x < X0 + PL + 26;
    const inY = y > YP - 8 && y < BOTY + 30;
    if (!inX || !inY) return false;
    w.dir = x < X0 + PL / 2 ? 1 : -1;
    const a = clamp(w.dir > 0 ? x - X0 : X0 + PL - x, 4, PL - 4);
    const sx = clamp(y - YP, 6, HS - 6);
    w.g = { a, sx };
    w.off = { x: 0, y: 0 };
  } else {
    const c = currentCurve(w);
    let best = 1e9;
    let ba = 10;
    let bs = 40;
    for (let a = 6; a <= PL - 6; a += 10) {
      for (const sx of [10, 40, 70]) {
        mapBent(c, a, sx, tmp);
        const d = Math.hypot(tmp.x - x, tmp.y - y);
        if (d < best) {
          best = d;
          ba = a;
          bs = sx;
        }
      }
    }
    if (best > 52) return false;
    mapBent(c, ba, bs, tmp);
    w.g = { a: ba, sx: bs };
    w.off = { x: x - tmp.x, y: y - tmp.y };
    if (ba > hingeA(w) - 1) {
      // the handle is still on the part that has not torn: hold the nearest free spot instead
      w.g = { a: Math.max(4, hingeA(w) - 6), sx: bs };
      mapBent(c, w.g.a, w.g.sx, tmp);
      w.off = { x: x - tmp.x, y: y - tmp.y };
    }
  }
  w.held = true;
  w.psiPeak = w.psi;
  w.finger = { x, y };
  w.fingerV = { x: 0, y: 0 };
  w.events.push("grab");
  return true;
}

export function drag(w: TearWorld, x: number, y: number, dt = 1 / 60) {
  if (!w.held || w.auto) return;
  const k = Math.min(1, dt / 0.03 + 0.2);
  w.fingerV.x += ((x - w.finger.x) / Math.max(dt, 1 / 240) - w.fingerV.x) * k;
  w.fingerV.y += ((y - w.finger.y) / Math.max(dt, 1 / 240) - w.fingerV.y) * k;
  w.finger.x = x;
  w.finger.y = y;
}

export function release(w: TearWorld) {
  if (!w.held) return;
  w.held = false;
  if (w.mode === "attached") {
    const p = w.psiPeak;
    w.psiRest = p > 0.25 ? Math.min(p * 0.5, 1.1) : p * 0.25;
  } else {
    const b = w.body;
    b.vx = clamp(w.fingerV.x * 0.5, -420, 420);
    b.vy = clamp(w.fingerV.y * 0.5, -420, 420);
    b.vz = 0;
    w.rest = false;
  }
}

/** Tear it for the user: a scripted pull from the start corner. */
export function startAuto(w: TearWorld) {
  if (w.held || w.auto || w.mode !== "attached" || w.broken > 0) return false;
  w.dir = 1;
  w.g = { a: 18, sx: 38 };
  w.off = { x: 0, y: 0 };
  const g = handleRest(w);
  w.finger = { x: g.x, y: g.y };
  w.held = true;
  w.psiPeak = 0;
  w.auto = { t: 0, released: false };
  w.events.push("grab");
  return true;
}

const AUTO_TIME = 1.25;
function autoFinger(w: TearWorld) {
  const t = w.auto!.t / AUTO_TIME;
  const e = t * t * (3 - 2 * t);
  const g = handleRest(w);
  w.finger.x = g.x + w.dir * (6 + 58 * e);
  w.finger.y = g.y + 18 + 112 * e;
}

/* ---------- time ---------- */

const emit = (w: TearWorld, e: TearEvent) => w.events.push(e);

function detach(w: TearWorld) {
  // Hand the bent strip to the rigid body: same place and tilt, then blend.
  const c = currentCurve(w);
  mapBent(c, PL / 2, HS / 2, tmp);
  const s = c.ah - PL / 2;
  const i = Math.min(Math.max(0, Math.floor(s)), c.n);
  const ang = -w.dir * (s > 0 ? c.psi[i] : 0);
  w.mode = "free";
  w.beta = 0;
  w.body = { x: tmp.x, y: tmp.y, ang, vx: 0, vy: 0, w: 0, z: 10, vz: 0 };
  emit(w, "detach");
}

function breakTies(w: TearWorld, dt: number) {
  w.budget = Math.min(3.2, w.budget + dt * 150 * w.slowRate);
  let guard = 0;
  while (w.budget >= 1 && w.broken < NT && guard++ < 6) {
    const T = tension(w);
    if (T <= w.thr[w.broken]) break;
    w.budget -= 1;
    w.broken += 1;
    w.tickStrength = clamp((T - w.thr[w.broken - 1]) * 3 + 0.3, 0.3, 1);
    emit(w, "tick");
    if (w.broken >= NT) {
      detach(w);
      break;
    }
  }
}

function stepAttached(w: TearWorld, dt: number) {
  let target: number;
  if (w.held) {
    breakTies(w, dt);
    if (w.mode !== "attached") return;
    const ah = hingeA(w);
    const T = tension(w);
    target =
      ah - w.g.a >= LB
        ? solvePhi(w, { x: w.finger.x - w.off.x, y: w.finger.y - w.off.y })
        : clamp(T, 0, w.thr[Math.min(w.broken, NT - 1)]);
    target = clamp(target, 0, 2.8);
    w.psiPeak = Math.max(w.psiPeak, target);
  } else {
    target = w.psiRest;
  }
  const om = 34;
  const zeta = w.held ? 0.8 : 0.55;
  const acc = om * om * (target - w.psi) - 2 * zeta * om * w.psiV;
  w.psiV += acc * dt;
  w.psi += w.psiV * dt;
  if (w.psi < 0) {
    w.psi = 0;
    w.psiV = Math.max(0, w.psiV) * -0.2;
  }
}

function stepFree(w: TearWorld, dt: number) {
  const b = w.body;
  w.beta = Math.min(1, w.beta + dt / 0.16);
  w.phase += dt;
  if (w.held) {
    // a spring at the handle pulls the stub to the finger; the stub turns about its own centre
    mapRigid(b, w.dir, w.g.a, w.g.sx, tmp);
    const px = tmp.x;
    const py = tmp.y;
    const rx = px - b.x;
    const ry = py - b.y;
    const gvx = b.vx - b.w * ry;
    const gvy = b.vy + b.w * rx;
    const fx = 900 * (w.finger.x - w.off.x - px) - 54 * gvx;
    const fy = 900 * (w.finger.y - w.off.y - py) - 54 * gvy;
    b.vx += fx * dt;
    b.vy += fy * dt;
    b.w += ((rx * fy - ry * fx) / 3866) * dt;
    b.w *= Math.exp(-3 * dt);
    b.z += (16 - b.z) * Math.min(1, dt * 8);
    b.vz = 0;
  } else if (b.z > 0 || b.vz !== 0) {
    // paper falls slowly: drag caps the speed, and the sheet slips sideways as it tips
    b.vz -= 900 * dt;
    const drag = Math.exp(-4.2 * dt);
    b.vz *= drag;
    const sway = Math.sin(w.phase * 9.5);
    const lift = 0.5 + Math.min(1.2, Math.abs(b.vz) / 70);
    b.vx += sway * 150 * lift * dt;
    b.vy += Math.cos(w.phase * 7.1) * 60 * lift * dt;
    b.w += Math.cos(w.phase * 9.5) * 5.2 * lift * dt;
    b.vx *= Math.exp(-1.1 * dt);
    b.vy *= Math.exp(-1.1 * dt);
    b.w *= Math.exp(-0.9 * dt);
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      const hit = Math.abs(b.vz);
      b.vz = hit > 40 ? hit * 0.12 : 0;
      b.vx *= 0.55;
      b.vy *= 0.55;
      b.w *= 0.5;
      emit(w, "land");
    }
  } else {
    // on the table: sliding friction
    const sp = Math.hypot(b.vx, b.vy);
    const fr = Math.exp(-(sp > 18 ? 4.5 : 9) * dt);
    b.vx *= fr;
    b.vy *= fr;
    b.w *= Math.exp(-7 * dt);
    if (sp < 2.5 && Math.abs(b.w) < 0.04 && !w.rest) {
      b.vx = b.vy = b.w = 0;
      w.rest = true;
      emit(w, "settle");
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.ang += b.w * dt;
  // keep it on the table
  const mx = 104;
  if (b.x < mx) {
    b.x = mx;
    b.vx = Math.abs(b.vx) * 0.3;
  }
  if (b.x > TW - mx) {
    b.x = TW - mx;
    b.vx = -Math.abs(b.vx) * 0.3;
  }
  if (b.y < TOPY + 40) {
    b.y = TOPY + 40;
    b.vy = Math.abs(b.vy) * 0.3;
  }
  if (b.y > TH - 50) {
    b.y = TH - 50;
    b.vy = -Math.abs(b.vy) * 0.3;
  }
}

/** Advance by dt seconds (fixed internal steps of 1/240 s). */
export function advance(w: TearWorld, dt: number) {
  let left = Math.min(dt, 0.1);
  while (left > 1e-6) {
    const h = Math.min(1 / 240, left);
    left -= h;
    w.t += h;
    if (w.auto) {
      const au = w.auto;
      if (!au.released) {
        au.t += h * w.slowRate;
        autoFinger(w);
        if (w.mode === "free" || au.t >= AUTO_TIME + 0.15) {
          au.released = true;
          if (w.mode === "free") {
            w.fingerV = { x: 30, y: 60 };
          }
          release(w);
        }
      }
      if (au.released && w.mode === "free" && !w.held) w.auto = null;
      if (au.released && w.mode === "attached" && !w.held) w.auto = null;
    }
    if (w.mode === "attached") stepAttached(w, h);
    else stepFree(w, h);
  }
}

/** Reduced motion: put the result in place without the motion. */
export function settleNow(w: TearWorld) {
  if (w.mode !== "free") return;
  w.held = false;
  w.beta = 1;
  w.body = { x: REST_X, y: REST_Y, ang: 0.07, vx: 0, vy: 0, w: 0, z: 0, vz: 0 };
  w.rest = true;
}

/** Run a held pull to its end for tests and reduced motion. */
export function fullTear(w: TearWorld) {
  if (!startAuto(w)) return;
  let guard = 0;
  while ((w.auto || (w.mode === "free" && !w.rest)) && guard++ < 200000) advance(w, 1 / 60);
}

export function reset(w: TearWorld, seed?: number): TearWorld {
  return createWorld(seed ?? w.seed + 1);
}

export function isTorn(w: TearWorld) {
  return w.mode === "free";
}

/** Torn-edge height at a position along the perforation: positive runs into the stub, negative into the ticket. */
export function fracture(w: TearWorld, k: number, u: number): number {
  const j = w.jag[k];
  const r = w.tooth[k];
  const x = Math.min(1, Math.max(0, u)) * 4;
  const idx = Math.min(3, Math.floor(x));
  const f = x - idx;
  const ctrl = [0, j[0] * r, j[1] * r * 0.5, j[2] * r, 0];
  return ctrl[idx] + (ctrl[idx + 1] - ctrl[idx]) * f;
}
