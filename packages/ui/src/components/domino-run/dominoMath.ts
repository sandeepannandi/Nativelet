// Pure model for Domino Run. A chain of dominoes stands along a path on a
// wooden table. Each domino is a rigid box that can only rotate about the
// bottom edge it is tipping over: gravity torque comes from the centre of
// mass passing that edge, so a standing domino rocked gently settles back
// and one pushed past its balance angle falls. Contacts are resolved in the
// floor plane between every pair of nearby dominoes, not just path
// neighbours: both bodies are projected into the falling domino's vertical
// plane as hinged boxes, overlaps are clamped positionally and the collision
// impulse splits their contact-point velocities. Resting contact therefore
// holds: a toppled run ends as a leaning pile, each domino propped on the
// next, instead of everyone sinking flat. Sliding, spin and side collisions
// are left out on purpose. Native and web draw the same marks from domScene.

export const DOM_W = 360;
export const DOM_H = 440;
export const FLOOR_Y = 400;
export const SQ = 0.8;
export const SHEAR = 0.2;
export const DH = 64;
export const DT = 12;
export const DW = 30;
export const SPACING = 30;
export const MAX_DOMINOS = 48;
export const TH_MAX = Math.PI / 2 - 0.03;
const G = 2200;
const INERTIA = (DH * DH + DT * DT) / 3;
const STEP = 1 / 240;
const FLICK = 2.6;
const ROCK_LOSS = 0.35;
const BALANCE = Math.atan2(DT, DH);
const FU0 = 30, FU1 = 290, FV0 = 16, FV1 = 270;

export type DomPoint = { x: number; y: number };
export type Domino = { s: number; th: number; om: number; top: number; bot: number; held: boolean; zz?: number };
export type Dust = { fu: number; fv: number; h: number; vx: number; vy: number; vh: number; life: number };
export type DominoSim = {
  path: DomPoint[];
  cum: number[];
  len: number;
  doms: Domino[];
  dust: Dust[];
  grab: number;
  drawing: boolean;
  draw: DomPoint[];
  downAt: number;
  moved: number;
  time: number;
};

export type DomMark = {
  path: string;
  color?: string;
  stroke?: number;
  cap?: 'round';
  alpha?: number;
  grad?: { x0: number; y0: number; x1: number; y1: number; stops: [number, string][] };
};

// ---- projection ----------------------------------------------------------

/** Floor point (fu along the table, fv away from the viewer, h up) to screen. */
export function project(fu: number, fv: number, h: number): DomPoint {
  return { x: fu + fv * SHEAR, y: FLOOR_Y - fv * SQ - h };
}

/** Screen point back to the floor at height 0. */
export function unproject(x: number, y: number): DomPoint {
  const fv = (FLOOR_Y - y) / SQ;
  return { x: x - fv * SHEAR, y: fv };
}

const clampFloor = (p: DomPoint): DomPoint => ({
  x: Math.max(FU0, Math.min(FU1, p.x)),
  y: Math.max(FV0, Math.min(FV1, p.y)),
});

// ---- path ----------------------------------------------------------------

function rebuild(s: DominoSim) {
  const cum = [0];
  for (let i = 1; i < s.path.length; i++) {
    const a = s.path[i - 1], b = s.path[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  s.cum = cum;
  s.len = cum[cum.length - 1] || 0;
}

/** Replace the path and re-lay the run. */
export function setPath(s: DominoSim, pts: DomPoint[]) {
  s.path = pts.slice();
  rebuild(s);
  placeDominoes(s);
}

/** Point and unit tangent at arc length a along the path. */
export function pathAt(s: DominoSim, a: number): { x: number; y: number; tx: number; ty: number } {
  const n = s.path.length;
  if (n === 0) return { x: 0, y: 0, tx: 1, ty: 0 };
  if (n === 1 || s.len <= 0) return { x: s.path[0].x, y: s.path[0].y, tx: 1, ty: 0 };
  a = Math.max(0, Math.min(s.len, a));
  let lo = 0, hi = s.cum.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (s.cum[mid] <= a) lo = mid; else hi = mid; }
  const p = s.path[lo], q = s.path[hi];
  const seg = s.cum[hi] - s.cum[lo] || 1;
  const t = (a - s.cum[lo]) / seg;
  const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, tx: (q.x - p.x) / d, ty: (q.y - p.y) / d };
}

/** Arc length of the polyline point nearest to a floor point. */
export function nearestArc(s: DominoSim, p: DomPoint): number {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < s.path.length; i++) {
    const a = s.path[i - 1], b = s.path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1e-9;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < bestD) { bestD = d; best = s.cum[i - 1] + Math.sqrt(l2) * t; }
  }
  return best;
}

let pipSeed = 11;
const pipRnd = () => (pipSeed = (pipSeed * 16807) % 2147483647) / 2147483647;

/** Lay dominoes every SPACING along the current path, replacing the old run. */
export function placeDominoes(s: DominoSim) {
  s.doms = [];
  if (s.len < SPACING * 1.5) return;
  const count = Math.min(MAX_DOMINOS, Math.floor((s.len - SPACING * 0.4) / SPACING));
  for (let i = 0; i < count; i++) {
    s.doms.push({ s: SPACING * 0.4 + i * SPACING, th: 0, om: 0, top: 1 + Math.floor(pipRnd() * 6), bot: 1 + Math.floor(pipRnd() * 6), held: false, zz: 0 });
  }
  s.doms.sort((a, b) => a.s - b.s);
}

/** The default arrangement: an inward spiral with an even, natural curvature. */
export function spiralPath(): DomPoint[] {
  const pts: DomPoint[] = [];
  const cu = 148, cv = 140, turns = 1.6, end = turns * 2 * Math.PI;
  const r0 = 108, r1 = 52;
  let prev: DomPoint | null = null;
  for (let i = 0; i <= 340; i++) {
    const a = (i / 340) * end;
    const r = r0 + (r1 - r0) * (a / end);
    const p = { x: cu + r * Math.cos(a + Math.PI / 2), y: cv + r * Math.sin(a + Math.PI / 2) };
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 1.5) { pts.push(p); prev = p; }
  }
  return pts;
}

export function createDominoRun(): DominoSim {
  const s: DominoSim = { path: [], cum: [0], len: 0, doms: [], dust: [], grab: -1, drawing: false, draw: [], downAt: 0, moved: 0, time: 0 };
  s.path = spiralPath();
  rebuild(s);
  placeDominoes(s);
  return s;
}

// ---- input ---------------------------------------------------------------

function bodyEnds(s: DominoSim, d: Domino): { base: DomPoint; tip: DomPoint } {
  const p = pathAt(s, d.s);
  const c = Math.cos(d.th), sn = Math.sin(d.th);
  // Body centre sits half a thickness behind the leading edge.
  const fwd = (a: number, h: number) => a * c + h * sn;
  const up = (a: number, h: number) => h * c - a * sn;
  const b = project(p.x + p.tx * fwd(-DT / 2, 0), p.y + p.ty * fwd(-DT / 2, 0), up(-DT / 2, 0));
  const t = project(p.x + p.tx * fwd(-DT / 2, DH), p.y + p.ty * fwd(-DT / 2, DH), up(-DT / 2, DH));
  return { base: b, tip: t };
}

function nearDomino(s: DominoSim, x: number, y: number): number {
  let best = -1, bestD = 17;
  for (let i = 0; i < s.doms.length; i++) {
    const { base, tip } = bodyEnds(s, s.doms[i]);
    const dx = tip.x - base.x, dy = tip.y - base.y;
    const l2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - base.x) * dx + (y - base.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (base.x + dx * t), y - (base.y + dy * t));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Press at a screen point: grab a domino near it, else start drawing a path. */
export function domTouch(s: DominoSim, x: number, y: number): 'grab' | 'draw' | 'none' {
  s.downAt = s.time;
  s.moved = 0;
  const i = nearDomino(s, x, y);
  if (i >= 0) {
    s.grab = i;
    s.doms[i].held = true;
    s.doms[i].th = 0;
    s.doms[i].om = 0;
    s.doms[i].zz = 0;
    return 'grab';
  }
  const p = clampFloor(unproject(x, y));
  s.drawing = true;
  s.draw = [p];
  return 'draw';
}

export function domMove(s: DominoSim, x: number, y: number) {
  if (s.drawing) {
    const p = clampFloor(unproject(x, y));
    const last = s.draw[s.draw.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d >= 4) { s.draw.push(p); s.moved += d; }
    return;
  }
  if (s.grab < 0) return;
  const p = clampFloor(unproject(x, y));
  const d = s.doms[s.grab];
  const a = nearestArc(s, p);
  const prev = s.doms[s.grab - 1], next = s.doms[s.grab + 1];
  const lo = prev ? prev.s + DT + 2 : 0;
  const hi = next ? next.s - DT - 2 : s.len;
  const ns = Math.max(lo, Math.min(hi, a));
  s.moved += Math.abs(ns - d.s);
  d.s = ns;
  while (s.grab > 0 && s.doms[s.grab - 1].s > d.s) { const t = s.doms[s.grab - 1]; s.doms[s.grab - 1] = d; s.doms[s.grab] = t; s.grab--; }
  while (s.grab < s.doms.length - 1 && s.doms[s.grab + 1].s < d.s) { const t = s.doms[s.grab + 1]; s.doms[s.grab + 1] = d; s.doms[s.grab] = t; s.grab++; }
}

export function domRelease(s: DominoSim) {
  if (s.drawing) {
    s.drawing = false;
    // A deliberate stroke replaces the run; a short accidental drag keeps it.
    if (s.draw.length > 1 && s.moved > 60) {
      let len = 0;
      for (let i = 1; i < s.draw.length; i++) len += Math.hypot(s.draw[i].x - s.draw[i - 1].x, s.draw[i].y - s.draw[i - 1].y);
      if (len >= SPACING * 2) setPath(s, s.draw);
    }
    s.draw = [];
    return;
  }
  if (s.grab >= 0) {
    const d = s.doms[s.grab];
    d.held = false;
    // A tap is a flick: little movement and a quick release tips the domino over.
    if (s.moved < 12 && s.time - s.downAt < 0.5) d.om = FLICK;
    s.grab = -1;
  }
}

/** Tip the first standing domino (buttons and keyboard). */
export function pushFirst(s: DominoSim): boolean {
  for (const d of s.doms) if (d.th < BALANCE) { d.om = FLICK; return true; }
  return false;
}

/** Stand every domino back up where it lies. */
export function standUp(s: DominoSim) {
  for (const d of s.doms) { d.th = 0; d.om = 0; d.zz = 0; }
  s.dust = [];
}

export function allSettled(s: DominoSim): boolean {
  // Leaning piles rest at intermediate angles, so settled means no motion.
  return s.doms.every(d => Math.abs(d.om) < 0.06);
}

export function fallenCount(s: DominoSim): number {
  return s.doms.filter(d => d.th > BALANCE * 2).length;
}

// ---- physics -------------------------------------------------------------

// Per-substep pose cache (floor position and heading of each base).
const PX: number[] = [], PY: number[] = [], TX: number[] = [], TY: number[] = [];

/** Corners of a hinged box in its fall plane: pivot at (0,0), tip angle f. */
function boxCorners(f: number, out: number[]) {
  const sf = Math.sin(f), cf = Math.cos(f);
  // u = (sf, cf) up the face, m = (-cf, sf) backwards; the box spans u x m.
  out[0] = 0; out[1] = 0;
  out[2] = DH * sf; out[3] = DH * cf;
  out[4] = DH * sf - DT * cf; out[5] = DH * cf + DT * sf;
  out[6] = -DT * cf; out[7] = DT * sf;
}

const A_CORN: number[] = new Array(8).fill(0), B_CORN: number[] = new Array(8).fill(0);

/**
 * Overlap of two fall-plane boxes: A pivoting at (0,0) with tip fa, B
 * pivoting at (g,0) and leaning at fb. Returns null when separate, else the
 * penetration depth, the separating axis oriented from A toward B, and a
 * witness point near the contact.
 */
function boxContact(fa: number, g: number, fb: number): { dep: number; nx: number; ny: number; wx: number; wy: number } | null {
  boxCorners(fa, A_CORN);
  boxCorners(fb, B_CORN);
  for (let k = 0; k < 8; k += 2) B_CORN[k] += g;
  const sa = Math.sin(fa), ca = Math.cos(fa), sb = Math.sin(fb), cb = Math.cos(fb);
  const axes = [sa, ca, -ca, sa, sb, cb, -cb, sb];
  let dep = Infinity, nx = 0, ny = 0;
  let hit = true;
  for (let k = 0; k < 8; k += 2) {
    let ax = axes[k], ay = axes[k + 1];
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const pa = A_CORN[i] * ax + A_CORN[i + 1] * ay;
      if (pa < minA) minA = pa;
      if (pa > maxA) maxA = pa;
      const pb = B_CORN[i] * ax + B_CORN[i + 1] * ay;
      if (pb < minB) minB = pb;
      if (pb > maxB) maxB = pb;
    }
    const ov = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (ov <= 0) { hit = false; break; }
    if (ov < dep) {
      dep = ov;
      if (g * ax < 0) { ax = -ax; ay = -ay; }
      nx = ax; ny = ay;
    }
  }
  if (!hit) return null;
  // Witness: average of the corners of each box inside the other.
  let wx = 0, wy = 0, n = 0;
  const inside = (px: number, py: number, sin: number, cos: number, ox: number) => {
    const qx = px - ox, qy = py;
    const cu = qx * sin + qy * cos, cm = qx * -cos + qy * sin;
    return cu >= -0.5 && cu <= DH + 0.5 && cm >= -0.5 && cm <= DT + 0.5;
  };
  for (let i = 0; i < 8; i += 2) {
    if (inside(A_CORN[i], A_CORN[i + 1], sb, cb, g)) { wx += A_CORN[i]; wy += A_CORN[i + 1]; n++; }
    if (inside(B_CORN[i], B_CORN[i + 1], sa, ca, 0)) { wx += B_CORN[i]; wy += B_CORN[i + 1]; n++; }
  }
  if (n === 0) return null;
  return { dep, nx, ny, wx: wx / n, wy: wy / n };
}

function spawnDust(s: DominoSim, fu: number, fv: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = pipRnd() * Math.PI * 2, sp = 14 + pipRnd() * 30;
    s.dust.push({ fu, fv, h: Math.max(2, h), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.4, vh: 22 + pipRnd() * 40, life: 0.45 + pipRnd() * 0.25 });
  }
}

/** True when some neighbour still props up domino d (probe past the lean). */
function supported(s: DominoSim, d: Domino): boolean {
  const i = s.doms.indexOf(d);
  if (i < 0) return false;
  const sign = d.th >= 0 ? 1 : -1;
  const fa = sign * d.th + 0.04;
  const tx = sign * TX[i], ty = sign * TY[i];
  for (let j = 0; j < s.doms.length; j++) {
    if (j === i) continue;
    const dx = PX[j] - PX[i], dy = PY[j] - PY[i];
    if (dx * dx + dy * dy > (DH + DT + 4) * (DH + DT + 4)) continue;
    const relx = dx * tx + dy * ty;
    const lat = Math.abs(dx * -ty + dy * tx);
    if (relx < DT * 0.4 || relx > DH + DT + 4 || lat > DW - 2) continue;
    const cosphi = TX[i] * TX[j] + TY[i] * TY[j];
    if (cosphi < 0.5) continue;
    const fb = sign * s.doms[j].th * cosphi;
    if (boxContact(fa, relx, fb)) return true;
  }
  return false;
}

/**
 * Contact of domino i falling toward domino j, in i's vertical fall plane.
 * j's lean away from i is its tip projected onto i's heading. Overlap is
 * clamped out positionally and the surviving closing speed is split by an
 * impulse at the witness point, so a leaning pile keeps transmitting force
 * instead of every domino sinking flat through the one it rests on.
 */
function contact(s: DominoSim, i: number, j: number) {
  const a = s.doms[i], b = s.doms[j];
  const sign = a.th >= 0 ? 1 : -1;
  const fa = sign * a.th;
  if (fa <= 0.001) return;
  // j in i's fall plane.
  const tx = sign * TX[i], ty = sign * TY[i];
  const relx = (PX[j] - PX[i]) * tx + (PY[j] - PY[i]) * ty;
  const lat = Math.abs((PX[j] - PX[i]) * -ty + (PY[j] - PY[i]) * tx);
  if (relx < DT * 0.4 || relx > DH + DT + 4 || lat > DW - 2) return;
  let cosphi = TX[i] * TX[j] + TY[i] * TY[j];
  if (cosphi < 0.5) return; // headings too skewed for a face contact
  const fb = sign * b.th * cosphi;
  const c = boxContact(fa, relx, fb);
  if (!c) return;
  // Positional clamp: rotate a back out of the overlap along the contact axis.
  const rpa = c.wy * c.nx - c.wx * c.ny;
  if (Math.abs(rpa) > 4) {
    let dth = -c.dep / rpa;
    dth = Math.max(-0.06, Math.min(0.06, dth)) * 0.7;
    a.th += sign * dth;
  }
  // Velocity: split the closing speed at the witness point.
  const rpb = c.wy * c.nx - (c.wx - relx) * c.ny;
  const closing = sign * a.om * rpa - sign * b.om * cosphi * rpb;
  if (closing <= 0) return;
  let asleep = !b.held && (b.zz ?? 0) >= 30;
  const ia = rpa * rpa / INERTIA;
  let ib = b.held || asleep ? 0 : (rpb * rpb) / INERTIA;
  let jimp = closing / (ia + ib || 1);
  if (asleep && Math.abs(jimp * rpb / INERTIA) > 0.4) {
    // A hard knock wakes the sleeper and lands as a normal collision.
    b.zz = 0; asleep = false;
    ib = (rpb * rpb) / INERTIA;
    jimp = closing / (ia + ib || 1);
  }
  a.om -= sign * jimp * rpa / INERTIA;
  if (!b.held && !asleep) b.om += sign * jimp * rpb / (INERTIA * cosphi);
  if (Math.abs(jimp * rpa) > 900 && s.dust.length < 60) {
    spawnDust(s, PX[i] + tx * c.wx, PY[i] + ty * c.wx, c.wy, 4);
  }
}

function substep(s: DominoSim, h: number, reduce: boolean) {
  const n = s.doms.length;
  for (let i = 0; i < n; i++) {
    const p = pathAt(s, s.doms[i].s);
    PX[i] = p.x; PY[i] = p.y; TX[i] = p.tx; TY[i] = p.ty;
  }
  for (const d of s.doms) {
    if (d.held) continue;
    // Static balance: untouched standing dominoes stay exactly still.
    if (Math.abs(d.th) < 0.02 && Math.abs(d.om) < 0.05) { d.th = 0; d.om = 0; continue; }
    // A domino that has been nearly still for a while sleeps; it wakes when
    // knocked (contact impulse) or when whatever it leaned on moves away.
    if ((d.zz ?? 0) >= 30) {
      d.om = 0;
      if (Math.abs(d.th) > BALANCE && Math.abs(d.th) < TH_MAX - 0.02 && !supported(s, d)) d.zz = 0;
      else continue;
    }
    const prevSign = d.th >= 0 ? 1 : -1;
    const pivot = d.th >= 0 ? 1 : -1;
    // Horizontal distance from the pivot edge to the centre of mass; gravity
    // torque is G times that distance, signed so it grows the tip angle.
    const com = (DH / 2) * Math.sin(Math.abs(d.th)) - (DT / 2) * Math.cos(d.th);
    const torque = G * com * pivot;
    d.om += (torque / INERTIA) * h;
    d.om *= Math.exp(-0.25 * h);
    d.th += d.om * h;
    const nowSign = d.th >= 0 ? 1 : -1;
    if (nowSign !== prevSign) d.om *= ROCK_LOSS; // a rock lands on the other edge
    if (d.th >= TH_MAX) {
      d.th = TH_MAX;
      if (d.om > 0) {
        if (d.om > 1.6 && !reduce) {
          const p = pathAt(s, d.s);
          spawnDust(s, p.x + p.tx * DH * 0.8, p.y + p.ty * DH * 0.8, 2, 5);
        }
        d.om *= -0.12;
        if (Math.abs(d.om) < 0.35) d.om = 0;
      }
    }
    if (d.th <= -TH_MAX) {
      d.th = -TH_MAX;
      if (d.om < 0) { d.om *= -0.12; if (Math.abs(d.om) < 0.35) d.om = 0; }
    }
  }
  // Contacts between every nearby pair, a few relaxation passes so a leaning
  // pile shares the load down the chain.
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < n; i++) {
      const a = s.doms[i];
      if (Math.abs(a.th) < 0.02 && Math.abs(a.om) < 0.05) continue;
      if ((a.zz ?? 0) >= 30) continue;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = PX[j] - PX[i], dy = PY[j] - PY[i];
        if (dx * dx + dy * dy > (DH + DT + 4) * (DH + DT + 4)) continue;
        contact(s, i, j);
      }
    }
  }
  for (const d of s.doms) {
    if (d.th >= TH_MAX && Math.abs(d.om) < 0.08) d.om = 0;
    // Only leaning or moving dominoes can sleep; standing ones stay live.
    if (d.held || Math.abs(d.th) < 0.02 || Math.abs(d.om) >= 0.25) d.zz = 0;
    else d.zz = Math.min(1000, (d.zz ?? 0) + 1);
  }
  for (let i = s.dust.length - 1; i >= 0; i--) {
    const p = s.dust[i];
    p.vh -= G * 0.5 * h;
    p.fu += p.vx * h; p.fv += p.vy * h; p.h += p.vh * h;
    p.life -= h;
    if (p.life <= 0 || p.h < 0) s.dust.splice(i, 1);
  }
}

export function stepDom(s: DominoSim, dt: number, reduce = false) {
  s.time += dt;
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    substep(s, h, reduce);
  }
}

// ---- drawing -------------------------------------------------------------

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

function circle(x: number, y: number, r: number): string {
  return `M${f2(x - r)} ${f2(y)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(x + r)} ${f2(y)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(x - r)} ${f2(y)}Z`;
}

function quad(pts: DomPoint[]): string {
  return `M${pts.map(p => `${f2(p.x)} ${f2(p.y)}`).join('L')}Z`;
}

const IVORY: [number, string][] = [[0, '#fbf5e6'], [0.5, '#f1e7d0'], [1, '#dccdb0']];
const IVORY_SIDE: [number, string][] = [[0, '#eee3c9'], [0.55, '#ddcfae'], [1, '#c6b492']];
const IVORY_TOP: [number, string][] = [[0, '#fdf8ec'], [1, '#ece1c8']];
const PIP = '#453c34';
const EDGE = 'rgba(88,66,44,0.30)';

// Standard die layouts on a 3x3 grid, cells indexed row then column.
const PIPS: number[][] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
];

function pipDots(value: number, face: (u: number, h: number) => DomPoint, marks: DomMark[]) {
  let dots = '';
  for (const cell of PIPS[value] || []) {
    const col = (cell % 3) - 1, row = Math.floor(cell / 3) - 1;
    const p = face(col * 8, row * 9);
    dots += circle(p.x, p.y, 2);
  }
  if (dots) marks.push({ path: dots, color: PIP, alpha: 0.92 });
}

type Face = { pts: DomPoint[]; depth: number; kind: 'top' | 'wide' | 'end' | 'bottom'; domino: Domino; a: number };

export function domScene(s: DominoSim): DomMark[] {
  const marks: DomMark[] = [];
  // Backdrop wall and the table it sits on.
  marks.push({ path: `M0 0L${DOM_W} 0L${DOM_W} ${FLOOR_Y}L0 ${FLOOR_Y}Z`, grad: { x0: 0, y0: 0, x1: 0, y1: FLOOR_Y, stops: [[0, '#f4efe4'], [0.62, '#ece4d1'], [1, '#e2d6bc']] } });
  const backY = FLOOR_Y - (FV1 + 22) * SQ;
  marks.push({ path: `M0 ${f2(backY)}L${DOM_W} ${f2(backY)}L${DOM_W} ${FLOOR_Y}L0 ${FLOOR_Y}Z`, grad: { x0: 0, y0: backY, x1: 0, y1: FLOOR_Y, stops: [[0, '#b3804e'], [0.55, '#9a6a3c'], [1, '#7e5229']] } });
  let planks = '';
  for (let i = 0; i < 6; i++) {
    const fv = FV0 + (i + 0.5) * ((FV1 - FV0) / 6);
    const a = project(FU0 - 26, fv, 0), b = project(FU1 + 34, fv, 0);
    planks += `M${f2(a.x)} ${f2(a.y)}L${f2(b.x)} ${f2(b.y)}`;
  }
  marks.push({ path: planks, color: 'rgba(84,52,26,0.16)', stroke: 1.1 });
  let grain = '';
  for (let i = 0; i < 22; i++) {
    pipSeed = 91 + i;
    const fv = FV0 + pipRnd() * (FV1 - FV0);
    const u = FU0 + pipRnd() * (FU1 - FU0 - 60);
    const a = project(u, fv, 0), b = project(u + 34 + pipRnd() * 40, fv + 2 - pipRnd() * 4, 0);
    grain += `M${f2(a.x)} ${f2(a.y)}L${f2(b.x)} ${f2(b.y)}`;
  }
  marks.push({ path: grain, color: 'rgba(70,42,20,0.08)', stroke: 1, cap: 'round' });
  // Table front edge.
  marks.push({ path: `M0 ${FLOOR_Y}L${DOM_W} ${FLOOR_Y}L${DOM_W} ${DOM_H}L0 ${DOM_H}Z`, grad: { x0: 0, y0: FLOOR_Y, x1: 0, y1: DOM_H, stops: [[0, '#6b4322'], [1, '#53311a']] } });
  marks.push({ path: `M0 ${FLOOR_Y}L${DOM_W} ${FLOOR_Y}`, color: 'rgba(255,240,214,0.5)', stroke: 1.2 });
  // The path being drawn, dashed.
  if (s.drawing && s.draw.length > 1) {
    let dash = '';
    for (let i = 1; i < s.draw.length; i++) {
      const a = project(s.draw[i - 1].x, s.draw[i - 1].y, 0), b = project(s.draw[i].x, s.draw[i].y, 0);
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.floor(d / 7));
      for (let k = 0; k < n; k += 2) {
        const t0 = k / n, t1 = Math.min(1, (k + 1) / n);
        dash += `M${f2(a.x + (b.x - a.x) * t0)} ${f2(a.y + (b.y - a.y) * t0)}L${f2(a.x + (b.x - a.x) * t1)} ${f2(a.y + (b.y - a.y) * t1)}`;
      }
    }
    marks.push({ path: dash, color: 'rgba(70,46,24,0.55)', stroke: 2, cap: 'round' });
  }
  // Shadows, then every visible face sorted back to front.
  const faces: Face[] = [];
  for (const d of s.doms) {
    const p = pathAt(s, d.s);
    const c = Math.cos(d.th), sn = Math.sin(d.th);
    const pt = (a: number, w: number, h: number): DomPoint => {
      const fwd = a * c + h * sn, up = h * c - a * sn;
      return project(p.x + p.tx * (fwd + DT / 2) + -p.ty * w, p.y + p.ty * (fwd + DT / 2) + p.tx * w, up);
    };
    // Cast shadow: base edge plus the top edge dropped to the floor and slid
    // away from the light, fading as the domino stands taller.
    const topFwd = DH * sn, topUp = DH * c;
    const shA = project(p.x + p.tx * (DT / 2) + p.ty * (DW / 2), p.y + p.ty * (DT / 2) - p.tx * (DW / 2), 0);
    const shB = project(p.x + p.tx * (DT / 2) - p.ty * (DW / 2), p.y + p.ty * (DT / 2) + p.tx * (DW / 2), 0);
    const off = { x: p.tx * topFwd * 0.45 + 7 * (0.3 + 0.7 * Math.max(0, topUp / DH)), y: p.ty * topFwd * 0.45 * SQ - 2 };
    const shC = { x: shB.x + off.x, y: shB.y + off.y }, shD = { x: shA.x + off.x, y: shA.y + off.y };
    marks.push({
      path: quad([shA, shB, shC, shD]),
      grad: { x0: (shA.x + shB.x) / 2, y0: (shA.y + shB.y) / 2, x1: (shC.x + shD.x) / 2, y1: (shC.y + shD.y) / 2, stops: [[0, `rgba(46,30,16,${(0.08 + 0.08 * c).toFixed(3)})`], [1, 'rgba(46,30,16,0)']] },
    });
    const H_ = DW / 2;
    const corners = {
      fbl: pt(-DT, -H_, 0), fbr: pt(-DT, H_, 0), ftl: pt(-DT, -H_, DH), ftr: pt(-DT, H_, DH),
      bbl: pt(0, -H_, 0), bbr: pt(0, H_, 0), btl: pt(0, -H_, DH), btr: pt(0, H_, DH),
    };
    const depthOf = (pts: DomPoint[]) => pts.reduce((a, q) => a + q.y, 0) / pts.length;
    faces.push({ pts: [corners.fbl, corners.fbr, corners.ftr, corners.ftl], depth: depthOf([corners.fbl, corners.fbr, corners.ftr, corners.ftl]), kind: 'wide', domino: d, a: -DT });
    faces.push({ pts: [corners.bbr, corners.bbl, corners.btl, corners.btr], depth: depthOf([corners.bbr, corners.bbl, corners.btl, corners.btr]), kind: 'wide', domino: d, a: 0 });
    faces.push({ pts: [corners.fbr, corners.bbr, corners.btr, corners.ftr], depth: depthOf([corners.fbr, corners.bbr, corners.btr, corners.ftr]), kind: 'end', domino: d, a: -1 });
    faces.push({ pts: [corners.bbl, corners.fbl, corners.ftl, corners.btl], depth: depthOf([corners.bbl, corners.fbl, corners.ftl, corners.btl]), kind: 'end', domino: d, a: -2 });
    faces.push({ pts: [corners.ftl, corners.ftr, corners.btr, corners.btl], depth: depthOf([corners.ftl, corners.ftr, corners.btr, corners.btl]) - 0.4, kind: 'top', domino: d, a: -3 });
  }
  const area2 = (q: DomPoint[]) => (q[1].x - q[0].x) * (q[3].y - q[0].y) - (q[3].x - q[0].x) * (q[1].y - q[0].y);
  const visible = faces.filter(f => area2(f.pts) < 0);
  visible.sort((a, b) => b.depth - a.depth || a.a - b.a);
  for (const f of visible) {
    const q = f.pts;
    const xmin = Math.min(q[0].x, q[1].x, q[2].x, q[3].x), xmax = Math.max(q[0].x, q[1].x, q[2].x, q[3].x);
    const ymin = Math.min(q[0].y, q[1].y, q[2].y, q[3].y), ymax = Math.max(q[0].y, q[1].y, q[2].y, q[3].y);
    const stops = f.kind === 'top' ? IVORY_TOP : f.kind === 'wide' ? IVORY : IVORY_SIDE;
    marks.push({ path: quad(q), grad: { x0: xmin, y0: ymin, x1: xmin + (xmax - xmin) * 0.7, y1: ymax, stops }, stroke: 0 });
    marks.push({ path: quad(q), color: EDGE, stroke: 1 });
    if (f.kind === 'wide') {
      // Face local frame: u across the width, h up; pips and the mid line ride
      // the same transform, so they stay glued while the domino falls.
      const d = f.domino, p = pathAt(s, d.s);
      const c = Math.cos(d.th), sn = Math.sin(d.th);
      const face = (u: number, h: number): DomPoint => {
        const fwd = (f.a) * c + h * sn, up = h * c - (f.a) * sn;
        return project(p.x + p.tx * (fwd + DT / 2) + -p.ty * u, p.y + p.ty * (fwd + DT / 2) + p.tx * u, up);
      };
      const l0 = face(-9.5, DH / 2), l1 = face(9.5, DH / 2);
      marks.push({ path: `M${f2(l0.x)} ${f2(l0.y)}L${f2(l1.x)} ${f2(l1.y)}`, color: 'rgba(110,92,66,0.55)', stroke: 1 });
      pipDots(d.top, (u, hh) => face(u, DH / 2 + 7 + hh + 7), marks);
      pipDots(d.bot, (u, hh) => face(u, 7 + hh + 7), marks);
    }
  }
  // Dust from hard knocks.
  for (const p of s.dust) {
    const q = project(p.fu, p.fv, p.h);
    marks.push({ path: circle(q.x, q.y, 1.4), color: '#cbb79a', alpha: Math.max(0, Math.min(0.4, p.life)) });
  }
  return marks;
}
