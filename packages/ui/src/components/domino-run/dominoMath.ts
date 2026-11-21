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
// Perspective camera: FOCAL is the viewer's distance in front of the table
// edge, HORIZON the screen y the floor converges to, SQ the floor's drop per
// unit of depth before perspective scaling. Anything at fv = 0 projects
// exactly as before (k = 1), so the front edge is unchanged.
export const FOCAL = 340;
export const HORIZON = 244;
export const SQ = 1.0;
const CAM_CX = DOM_W / 2;
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
export type Domino = { s: number; th: number; om: number; top: number; bot: number; held: boolean; zz?: number; pose?: { x: number; y: number; tx: number; ty: number } };
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
  const k = FOCAL / (FOCAL + fv);
  return { x: CAM_CX + (fu - CAM_CX) * k, y: HORIZON + (FLOOR_Y - HORIZON - fv * SQ - h) * k };
}

/** Screen point back to the floor at height 0. */
export function unproject(x: number, y: number): DomPoint {
  const fv = FOCAL * (FLOOR_Y - y) / (y - HORIZON + FOCAL * SQ);
  return { x: CAM_CX + (x - CAM_CX) * (FOCAL + fv) / FOCAL, y: fv };
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

// A domino dragged off the path keeps a free pose; everything else follows
// the path. Physics, contacts and rendering all read the pose through here,
// so a repositioned piece still collides with the rest of the run.
function poseOf(s: DominoSim, d: Domino): { x: number; y: number; tx: number; ty: number } {
  return d.pose ?? pathAt(s, d.s);
}

// ---- input ---------------------------------------------------------------

function bodyEnds(s: DominoSim, d: Domino): { base: DomPoint; tip: DomPoint } {
  const p = poseOf(s, d);
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
  // Free placement: the piece follows the pointer anywhere on the table and
  // keeps its heading, so it can be set somewhere new instead of only
  // sliding along the path. Contacts stay live while it moves.
  const p = clampFloor(unproject(x, y));
  const d = s.doms[s.grab];
  const cur = poseOf(s, d);
  s.moved += Math.hypot(p.x - cur.x, p.y - cur.y);
  d.pose = { x: p.x, y: p.y, tx: cur.tx, ty: cur.ty };
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
    // Dropped near the path: adopt the local tangent so the piece rejoins the
    // run. Dropped away from it: keep the dragged pose; the wave still reaches
    // it only through real collisions.
    if (d.pose) {
      const pp = pathAt(s, nearestArc(s, d.pose));
      if (Math.hypot(pp.x - d.pose.x, pp.y - d.pose.y) < 16) { d.pose.tx = pp.tx; d.pose.ty = pp.ty; }
      // A free drop can land inside a standing piece, and solids cannot rest
      // interpenetrating: slide the piece straight out of any rest overlap
      // (up to 30 units) so it lands beside the piece it was dropped on.
      if (Math.abs(d.th) < 0.02) {
        const overlaps = (x: number, y: number) => {
          const A = obbOf(x, y, d.pose!.tx, d.pose!.ty, 0);
          for (const e of s.doms) {
            if (e === d) continue;
            const ep = poseOf(s, e);
            if (Math.abs(ep.x - x) > 90 || Math.abs(ep.y - y) > 90) continue;
            if (obbOverlap(A, obbOf(ep.x, ep.y, ep.tx, ep.ty, e.th))) return ep;
          }
          return null;
        };
        const into = overlaps(d.pose.x, d.pose.y);
        if (into) {
          let nx = d.pose.x - into.x, ny = d.pose.y - into.y;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl; ny /= nl;
          for (let k = 1; k <= 15; k++) {
            if (!overlaps(d.pose.x + nx * 2 * k, d.pose.y + ny * 2 * k)) {
              d.pose.x += nx * 2 * k; d.pose.y += ny * 2 * k;
              break;
            }
          }
        }
      }
    }
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
function inContact(s: DominoSim, d: Domino): boolean {
  const p = poseOf(s, d);
  const A = obbOf(p.x, p.y, p.tx, p.ty, d.th);
  for (const e of s.doms) {
    if (e === d) continue;
    const ep = poseOf(s, e);
    if (Math.abs(ep.x - p.x) > 90 || Math.abs(ep.y - p.y) > 90) continue;
    if (obbOverlap(A, obbOf(ep.x, ep.y, ep.tx, ep.ty, e.th))) return true;
  }
  return false;
}

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
// Full 3D oriented boxes for pairs too skewed for the fall-plane contact: a
// domino can be dragged to any heading, and the wave must rest on it (or
// topple it) instead of passing through.
type ObBox = { c: [number, number, number]; u: [number, number, number][]; e: number[] };
function obbOf(x: number, y: number, tx: number, ty: number, th: number): ObBox {
  const c = Math.cos(th), sn = Math.sin(th);
  const u1: [number, number, number] = [tx * sn, ty * sn, c];   // along the slab
  const u2: [number, number, number] = [tx * c, ty * c, -sn];  // thickness
  const u3: [number, number, number] = [-ty, tx, 0];           // across the width
  return { c: [x + u1[0] * DH / 2 - u2[0] * DT / 2, y + u1[1] * DH / 2 - u2[1] * DT / 2, u1[2] * DH / 2 - u2[2] * DT / 2], u: [u1, u2, u3], e: [DH / 2, DT / 2, DW / 2] };
}
function obbOverlap(A: ObBox, B: ObBox): boolean {
  // 15-axis separating axis test in (fu, fv, h) space.
  const R: number[][] = [], AbsR: number[][] = [];
  for (let i = 0; i < 3; i++) {
    R.push([]); AbsR.push([]);
    for (let j = 0; j < 3; j++) {
      const r = A.u[i][0] * B.u[j][0] + A.u[i][1] * B.u[j][1] + A.u[i][2] * B.u[j][2];
      R[i][j] = r; AbsR[i][j] = Math.abs(r) + 1e-5;
    }
  }
  const t = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  const tA = [0, 1, 2].map(i => t[0] * A.u[i][0] + t[1] * A.u[i][1] + t[2] * A.u[i][2]);
  for (let i = 0; i < 3; i++) {
    if (Math.abs(tA[i]) > A.e[i] + B.e[0] * AbsR[i][0] + B.e[1] * AbsR[i][1] + B.e[2] * AbsR[i][2]) return false;
  }
  for (let j = 0; j < 3; j++) {
    const tB = t[0] * B.u[j][0] + t[1] * B.u[j][1] + t[2] * B.u[j][2];
    if (Math.abs(tB) > B.e[j] + A.e[0] * AbsR[0][j] + A.e[1] * AbsR[1][j] + A.e[2] * AbsR[2][j]) return false;
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const ra = A.e[(i + 1) % 3] * AbsR[(i + 2) % 3][j] + A.e[(i + 2) % 3] * AbsR[(i + 1) % 3][j];
    const rb = B.e[(j + 1) % 3] * AbsR[i][(j + 2) % 3] + B.e[(j + 2) % 3] * AbsR[i][(j + 1) % 3];
    if (Math.abs(tA[(i + 2) % 3] * R[(i + 1) % 3][j] - tA[(i + 1) % 3] * R[(i + 2) % 3][j]) > ra + rb) return false;
  }
  return true;
}

// Skewed-heading contact: the faller clamps onto the obstacle's 3D box at the
// angle where they first touch and rests there; a hard side hit on a standing
// piece topples it along the strike direction.
function clampOnBox(s: DominoSim, i: number, j: number) {
  const a = s.doms[i], b = s.doms[j];
  if (a.held) return;
  const sign = a.th >= 0 ? 1 : -1;
  if (Math.abs(a.th) <= 0.001) return;
  const B = obbOf(PX[j], PY[j], TX[j], TY[j], b.th);
  const hit = (m: number) => obbOverlap(obbOf(PX[i], PY[i], TX[i], TY[i], sign * m), B);
  if (!hit(Math.abs(a.th))) return;
  // Already rotating out of the box: separating, not a collision. Without
  // this, a piece struck into a topple gets clamped back by the striker's box
  // (and the upright-overlap hold below would zero it every step).
  if (!hit(Math.abs(a.th) + 0.02)) return;
  if (hit(0)) {
    // A moving piece that already overlaps at rest is sliding past (a
    // broadside strike rolls the victim along the striker's face): snapping
    // it back to upright is worse than the brief touch, so let it slide.
    if (Math.abs(a.om) > 0.4) return;
    a.om = 0; return; // dropped into overlap: hold, never tunnel
  }
  let lo = 0, hi = Math.abs(a.th);
  for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (hit(mid)) hi = mid; else lo = mid; }
  const speed = Math.abs(a.om);
  a.th = sign * hi;
  const struck = speed > 1.2 && !b.held && Math.abs(b.th) < BALANCE;
  if (struck) {
    // Hard hit on a standing piece: it yields, so the striker follows through
    // with part of its momentum instead of bouncing off a wall (a dead stop
    // below the balance angle let it rock back upright).
    a.om = sign * Math.max(Math.abs(a.om) * 0.4, 0.6);
  } else if (!b.held && Math.abs(b.om) > 0.3) {
    // The other piece is already toppling out of the way: follow it without
    // bouncing; the positional clamp above keeps the face out of the box.
  } else {
    a.om *= -0.12;
    if (Math.abs(a.om) < 0.35) a.om = 0;
  }
  if (struck) {
    // Side-struck while standing: it topples along its own length, away from
    // the striker. No forced reorientation: turning the slab to the strike
    // direction can jam it into its neighbour's space.
    const bp = poseOf(s, b);
    const away = (bp.x - PX[i]) * bp.tx + (bp.y - PY[i]) * bp.ty >= 0 ? 1 : -1;
    b.th = away * 0.03; b.om = away * Math.min(3.5, speed * 0.75); // seed past the rock detector
    b.zz = -150; // no dozing while it climbs past its balance angle
  }
}

function contact(s: DominoSim, i: number, j: number) {
  const a = s.doms[i], b = s.doms[j];
  const sign = a.th >= 0 ? 1 : -1;
  const fa = sign * a.th;
  if (fa <= 0.001) return;
  // j in i's fall plane.
  const tx = sign * TX[i], ty = sign * TY[i];
  let cosphi = TX[i] * TX[j] + TY[i] * TY[j];
  if (cosphi < 0.5) { clampOnBox(s, i, j); return; } // skewed headings: 3D box contact
  const relx = (PX[j] - PX[i]) * tx + (PY[j] - PY[i]) * ty;
  const lat = Math.abs((PX[j] - PX[i]) * -ty + (PY[j] - PY[i]) * tx);
  if (relx < DT * 0.4 || relx > DH + DT + 4 || lat > DW - 2) return;
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
    const p = poseOf(s, s.doms[i]);
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
      // Leaning into a neighbour below the balance angle is not a rest state:
      // stay awake so the restoring torque and contact clamp walk it back out
      // instead of freezing mid-lean with the boxes interpenetrating.
      else if (Math.abs(d.th) > 0.02 && inContact(s, d)) d.zz = 0;
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
          const p = poseOf(s, d);
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
  const backY = project(0, FV1 + 22, 0).y;
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
    const p = poseOf(s, d);
    const c = Math.cos(d.th), sn = Math.sin(d.th);
    // Corners keep their world (fu, fv, h) so faces can be depth-sorted along
    // the actual view ray; screen-y sorting inverts leaning piles.
    const pt3 = (a: number, w: number, h: number): { fu: number; fv: number; h: number } => {
      const fwd = a * c + h * sn, up = h * c - a * sn;
      return { fu: p.x + p.tx * (fwd + DT / 2) + -p.ty * w, fv: p.y + p.ty * (fwd + DT / 2) + p.tx * w, h: up };
    };
    const pt = (a: number, w: number, h: number): DomPoint => {
      const q = pt3(a, w, h);
      return project(q.fu, q.fv, q.h);
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
    const c3 = {
      fbl: pt3(-DT, -H_, 0), fbr: pt3(-DT, H_, 0), ftl: pt3(-DT, -H_, DH), ftr: pt3(-DT, H_, DH),
      bbl: pt3(0, -H_, 0), bbr: pt3(0, H_, 0), btl: pt3(0, -H_, DH), btr: pt3(0, H_, DH),
    };
    // View-ray depth of the raised camera: farther away and lower sorts
    // farther back. A fallen domino occludes the one it rests on whichever
    // way it fell.
    const depthOf3 = (cs: { fu: number; fv: number; h: number }[]) =>
      cs.reduce((acc, q) => acc + (q.fv - SQ * q.h), 0) / cs.length;
    const scr = (q: { fu: number; fv: number; h: number }) => project(q.fu, q.fv, q.h);
    const face4 = (cs: { fu: number; fv: number; h: number }[], kind: 'wide' | 'end' | 'top', a: number, bias = 0) =>
      faces.push({ pts: cs.map(scr), depth: depthOf3(cs) + bias, kind, domino: d, a });
    face4([c3.fbl, c3.fbr, c3.ftr, c3.ftl], 'wide', -DT);
    face4([c3.bbr, c3.bbl, c3.btl, c3.btr], 'wide', 0);
    face4([c3.fbr, c3.bbr, c3.btr, c3.ftr], 'end', -1);
    face4([c3.bbl, c3.fbl, c3.ftl, c3.btl], 'end', -2);
    face4([c3.ftl, c3.ftr, c3.btr, c3.btl], 'top', -3, -0.4);
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
      const d = f.domino, p = poseOf(s, d);
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
