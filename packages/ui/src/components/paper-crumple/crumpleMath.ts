// Pure geometry and physics for Paper Crumple. Every function is a worklet so
// Reanimated can run it on the UI thread; plain JS (tests, web preview)
// ignores the tag. Deterministic: the crease set comes from a seeded
// generator, so tests, native and web agree.
//
// Model (an approximation, not a cloth or fracture simulation): a sheet is a
// triangle mesh. Crumpling wraps the sheet onto a ball the way a hand does,
// edges folding around to the far pole, and roughens it with a field of
// sharp creases (a sum of |distance to a random line| ridges and valleys, so
// creases cross and meet like real ones). The sheet never un-creases fully:
// the deepest crumple it has reached ("memory") leaves faint permanent
// creases when it is smoothed back out. Facets are shaded flat by their own
// normal and by how deep in a valley they sit, which is what makes crumpled
// paper read as paper.

export const CR_W = 340;
export const CR_H = 400;
export const CR_GX = 40;
export const CR_GY = 52;
export const CR_NV = (CR_GX + 1) * (CR_GY + 1);
export const CR_NT = CR_GX * CR_GY * 2;
export const CR_SHEET_W = 232;
export const CR_SHEET_H = 304;
export const CR_BALL_R = 70;
export const CR_LEVELS = 10;
export const CR_LAYERS = 3;
export const CR_BUCKETS = CR_LAYERS * 2 * CR_LEVELS;
const HALF_DIAG = Math.sqrt((CR_SHEET_W / 2) ** 2 + (CR_SHEET_H / 2) ** 2);

export type CrumpleState = {
  c: number;          // visual crumple 0 (flat) .. 1 (ball)
  target: number;     // where c is easing to
  mem: number;        // deepest crumple reached; leaves faint creases
  bx: number;
  by: number;
  vx: number;
  vy: number;
  rot: Float64Array;  // 3x3 rotation of the ball (rolling)
  mode: number;       // 0 idle, 1 crumpling drag, 2 holding the ball, 3 pinching
  startC: number;
  startD: number;
  gx: number;
  gy: number;
  lastX: number;
  lastY: number;
  lastT: number;
  downT: number;
  downX: number;
  downY: number;
  moved: number;
  lastTapT: number;
  pinchC: number;
  bounces: number;
  crease: Float64Array; // nx, ny, offset, amplitude per crease
  fx: Float64Array;     // flat vertex x (sheet px, centered)
  fy: Float64Array;
  zn: Float64Array;     // normalised crease height, -1..1
  qx: Float64Array;     // rotated 3D position, relative to the ball centre
  qy: Float64Array;
  qz: Float64Array;
  sx: Float64Array;     // screen position
  sy: Float64Array;
  bucket: Uint8Array;   // per-triangle draw bucket
  order: Int32Array;    // triangle ids grouped by bucket
  bstart: Int32Array;   // order[bstart[b] .. bstart[b+1]) is bucket b
  rank: Float64Array;   // per-triangle depth, for tests
};

function rng(seed: number) {
  'worklet';
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, k: number) {
  'worklet';
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Cellular distance F2 - F1: zero on cell borders, rising toward each seed.
// Used as relief it gives faceted cells separated by sharp creases.
function worleyRidge(x: number, y: number, size: number, k: number) {
  'worklet';
  const gx = x / size;
  const gy = y / size;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  let f1 = 1e9;
  let f2 = 1e9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ix = cx + i;
      const iy = cy + j;
      const px = ix + 0.15 + hash2(ix, iy, k) * 0.7;
      const py = iy + 0.15 + hash2(ix, iy, k + 101) * 0.7;
      const d = Math.sqrt((gx - px) * (gx - px) + (gy - py) * (gy - py));
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}

export function createCrumple(seed = 20261026): CrumpleState {
  'worklet';
  const k0 = (seed % 9973) + 1;
  const crease = new Float64Array(1);
  const fx = new Float64Array(CR_NV);
  const fy = new Float64Array(CR_NV);
  const zn = new Float64Array(CR_NV);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= CR_GY; j++) {
    for (let i = 0; i <= CR_GX; i++) {
      const v = j * (CR_GX + 1) + i;
      const X = (i / CR_GX - 0.5) * CR_SHEET_W;
      const Y = (j / CR_GY - 0.5) * CR_SHEET_H;
      fx[v] = X;
      fy[v] = Y;
      const z = worleyRidge(X + 500, Y + 500, 74, k0) * 1.0
        + worleyRidge(X + 500, Y + 500, 42, k0 + 7) * 0.62
        + worleyRidge(X + 500, Y + 500, 25, k0 + 13) * 0.34;
      zn[v] = z;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
  }
  const mid = (lo + hi) / 2;
  const half = Math.max(1e-6, (hi - lo) / 2);
  for (let v = 0; v < CR_NV; v++) zn[v] = -(zn[v] - mid) / half;
  const rot = new Float64Array(9);
  rot[0] = 1;
  rot[4] = 1;
  rot[8] = 1;
  return {
    c: 0, target: 0, mem: 0, bx: CR_W / 2, by: CR_H / 2, vx: 0, vy: 0, rot, mode: 0,
    startC: 0, startD: 0, gx: 0, gy: 0, lastX: 0, lastY: 0, lastT: 0, downT: 0, downX: 0, downY: 0,
    moved: 0, lastTapT: -1e9, pinchC: 0, bounces: 0,
    crease, fx, fy, zn,
    qx: new Float64Array(CR_NV), qy: new Float64Array(CR_NV), qz: new Float64Array(CR_NV),
    sx: new Float64Array(CR_NV), sy: new Float64Array(CR_NV),
    bucket: new Uint8Array(CR_NT), order: new Int32Array(CR_NT), bstart: new Int32Array(CR_BUCKETS + 1), rank: new Float64Array(CR_NT),
  };
}

function clamp(v: number, a: number, b: number) {
  'worklet';
  return v < a ? a : v > b ? b : v;
}

function renorm(m: Float64Array) {
  'worklet';
  // Gram-Schmidt on the rows so repeated small rotations never drift.
  let l = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
  m[0] /= l; m[1] /= l; m[2] /= l;
  const d = m[0] * m[3] + m[1] * m[4] + m[2] * m[5];
  m[3] -= d * m[0]; m[4] -= d * m[1]; m[5] -= d * m[2];
  l = Math.sqrt(m[3] * m[3] + m[4] * m[4] + m[5] * m[5]);
  m[3] /= l; m[4] /= l; m[5] /= l;
  m[6] = m[1] * m[5] - m[2] * m[4];
  m[7] = m[2] * m[3] - m[0] * m[5];
  m[8] = m[0] * m[4] - m[1] * m[3];
}

function rollBy(m: Float64Array, ax: number, ay: number, angle: number) {
  'worklet';
  // Rotate every row of m about the in-plane axis (ax, ay, 0) by `angle`.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r00 = c + ax * ax * t, r01 = ax * ay * t, r02 = ay * s;
  const r10 = ax * ay * t, r11 = c + ay * ay * t, r12 = -ax * s;
  const r20 = -ay * s, r21 = ax * s, r22 = c;
  for (let row = 0; row < 3; row++) {
    const x = m[row * 3], y = m[row * 3 + 1], z = m[row * 3 + 2];
    m[row * 3] = x * r00 + y * r10 + z * r20;
    m[row * 3 + 1] = x * r01 + y * r11 + z * r21;
    m[row * 3 + 2] = x * r02 + y * r12 + z * r22;
  }
  renorm(m);
}

function relaxRotation(m: Float64Array, k: number) {
  'worklet';
  m[0] += (1 - m[0]) * k; m[1] += (0 - m[1]) * k; m[2] += (0 - m[2]) * k;
  m[3] += (0 - m[3]) * k; m[4] += (1 - m[4]) * k; m[5] += (0 - m[5]) * k;
  renorm(m);
}

const LX = -0.5;
const LY = -0.62;
const LZ = 0.6;

/** Rebuild vertex positions, per-triangle shading and draw buckets. */
export function buildCrumple(s: CrumpleState) {
  'worklet';
  const w = s.c * s.c * (3 - 2 * s.c);
  const amp = 24 * Math.pow(s.c, 0.7) * (1 - 0.4 * w) + s.mem * (1 - s.c) * 2.2;
  const m = s.rot;
  for (let v = 0; v < CR_NV; v++) {
    const X = s.fx[v];
    const Y = s.fy[v];
    const r = Math.sqrt(X * X + Y * Y);
    const rho = Math.min(1, r / HALF_DIAG);
    const theta = rho * Math.PI * 0.97;
    const phi = Math.atan2(Y, X);
    const st = Math.sin(theta);
    const dx = st * Math.cos(phi);
    const dy = st * Math.sin(phi);
    const dz = Math.cos(theta);
    // Flat position blended into the wrapped ball.
    let px = X + (CR_BALL_R * dx - X) * w;
    let py = Y + (CR_BALL_R * dy - Y) * w;
    let pz = CR_BALL_R * dz * w;
    // Displace along the blended normal: the crease relief.
    let nx = dx * w;
    let ny = dy * w;
    let nz = 1 - w + dz * w;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const h = s.zn[v] * amp;
    px += nx * h;
    py += ny * h;
    pz += nz * h;
    // Rolling rotation only applies once the sheet has become a ball.
    const x = m[0] * px + m[1] * py + m[2] * pz;
    const y = m[3] * px + m[4] * py + m[5] * pz;
    const z = m[6] * px + m[7] * py + m[8] * pz;
    s.qx[v] = x;
    s.qy[v] = y;
    s.qz[v] = z;
    const persp = 1 + z * 0.0016;
    s.sx[v] = s.bx + x * persp;
    s.sy[v] = s.by + y * persp;
  }
  const cav = 0.2 * w + 0.06 * s.mem * (1 - s.c);
  const deepSplit = CR_BALL_R * 0.3;
  let t = 0;
  for (let j = 0; j < CR_GY; j++) {
    for (let i = 0; i < CR_GX; i++) {
      const a = j * (CR_GX + 1) + i;
      const b = a + 1;
      const c = a + CR_GX + 1;
      const d = c + 1;
      const ruled = j % 6 === 0 ? 1 : 0;
      for (let h = 0; h < 2; h++) {
        // Two triangles per quad: (a,b,c) and (b,d,c).
        const ia = h === 0 ? a : b;
        const ib = h === 0 ? b : d;
        const ic = c;
        const ux = s.qx[ib] - s.qx[ia], uy = s.qy[ib] - s.qy[ia], uz = s.qz[ib] - s.qz[ia];
        const vx = s.qx[ic] - s.qx[ia], vy = s.qy[ic] - s.qy[ia], vz = s.qz[ic] - s.qz[ia];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const lam = Math.min(1, Math.abs(nx * LX + ny * LY + nz * LZ) / 0.6);
        const zAvg = (s.zn[ia] + s.zn[ib] + s.zn[ic]) / 3;
        const ao = 1 - cav * Math.max(0, -zAvg) * 1.6;
        const tone = clamp((0.1 + 0.9 * Math.pow(lam, 1.9)) * ao, 0, 1);
        const level = Math.min(CR_LEVELS - 1, Math.round(tone * (CR_LEVELS - 1)));
        const depth = (s.qz[ia] + s.qz[ib] + s.qz[ic]) / 3;
        const layer = depth < -deepSplit ? 0 : depth < deepSplit ? 1 : 2;
        s.bucket[t] = layer * 2 * CR_LEVELS + ruled * CR_LEVELS + level;
        s.rank[t] = depth;
        t++;
      }
    }
  }
  // Counting sort: triangle ids grouped by bucket so each Skia path only
  // walks its own triangles.
  for (let b = 0; b <= CR_BUCKETS; b++) s.bstart[b] = 0;
  for (let q = 0; q < CR_NT; q++) s.bstart[s.bucket[q] + 1]++;
  for (let b = 0; b < CR_BUCKETS; b++) s.bstart[b + 1] += s.bstart[b];
  const fill = s.bstart.slice(0, CR_BUCKETS);
  for (let q = 0; q < CR_NT; q++) s.order[fill[s.bucket[q]]++] = q;
}

/** Vertex indices of triangle t, written into out[0..2]. */
export function triVerts(t: number, out: Int32Array | number[]) {
  'worklet';
  const q = t >> 1;
  const i = q % CR_GX;
  const j = (q - i) / CR_GX;
  const a = j * (CR_GX + 1) + i;
  if ((t & 1) === 0) {
    out[0] = a; out[1] = a + 1; out[2] = a + CR_GX + 1;
  } else {
    out[0] = a + 1; out[1] = a + CR_GX + 2; out[2] = a + CR_GX + 1;
  }
}

export function crumpleDown(s: CrumpleState, x: number, y: number, t: number) {
  'worklet';
  const d = Math.sqrt((x - s.bx) ** 2 + (y - s.by) ** 2);
  s.downT = t; s.downX = x; s.downY = y; s.lastX = x; s.lastY = y; s.lastT = t; s.moved = 0;
  if (s.c >= 0.9) {
    if (d < CR_BALL_R * 1.6) {
      s.mode = 2;
      s.gx = s.bx - x; s.gy = s.by - y; s.vx = 0; s.vy = 0;
    } else {
      s.mode = 0;
    }
  } else {
    s.mode = 1;
    s.startC = s.c;
    s.startD = d;
  }
}

export function crumpleMove(s: CrumpleState, x: number, y: number, t: number) {
  'worklet';
  s.moved = Math.max(s.moved, Math.sqrt((x - s.downX) ** 2 + (y - s.downY) ** 2));
  if (s.mode === 1) {
    const d = Math.sqrt((x - s.bx) ** 2 + (y - s.by) ** 2);
    s.target = clamp(s.startC + (s.startD - d) / 110, 0, 1);
    if (s.target > 0.97) s.target = 1;
  } else if (s.mode === 2) {
    const dt = Math.max(0.004, (t - s.lastT) / 1000);
    const nx = clamp(x + s.gx, CR_BALL_R, CR_W - CR_BALL_R);
    const ny = clamp(y + s.gy, CR_BALL_R, CR_H - CR_BALL_R);
    const ivx = (nx - s.bx) / dt;
    const ivy = (ny - s.by) / dt;
    s.vx = s.vx * 0.55 + ivx * 0.45;
    s.vy = s.vy * 0.55 + ivy * 0.45;
    const ax = (nx - s.bx);
    const ay = (ny - s.by);
    const dist = Math.sqrt(ax * ax + ay * ay);
    if (dist > 0.01) rollBy(s.rot, -ay / dist, ax / dist, dist / CR_BALL_R);
    s.bx = nx;
    s.by = ny;
  }
  s.lastX = x; s.lastY = y; s.lastT = t;
}

// Declared before crumpleUp: worklet closures capture by value at module
// load, so a later declaration would arrive as undefined on the UI thread.
export function crumpleSmooth(s: CrumpleState) {
  'worklet';
  s.target = 0;
  s.vx = 0;
  s.vy = 0;
}

export function crumpleUp(s: CrumpleState, t: number) {
  'worklet';
  const tap = s.moved < 10 && t - s.downT < 260;
  if (tap && s.c >= 0.9) {
    // Double tap on the ball smooths it back out.
    if (t - s.lastTapT < 480) {
      crumpleSmooth(s);
      s.lastTapT = -1e9;
    } else {
      s.lastTapT = t;
    }
  }
  if (s.mode === 1) {
    if (s.c >= 0.68 || s.target >= 0.68) s.target = 1;
    else s.target = s.c;
  } else if (s.mode === 2) {
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    // A held-still release must not toss: stale velocity decays with the hold.
    if (t - s.lastT > 90 || sp < 120) {
      s.vx = 0; s.vy = 0;
    } else if (sp > 1500) {
      s.vx *= 1500 / sp; s.vy *= 1500 / sp;
    }
  }
  s.mode = 0;
}

export function crumplePinch(s: CrumpleState, scale: number, active: boolean) {
  'worklet';
  if (!active) {
    if (s.mode === 3) {
      s.target = s.target >= 0.78 ? 1 : s.target;
      s.mode = 0;
    }
    return;
  }
  if (s.mode !== 3) {
    s.mode = 3;
    s.pinchC = s.c;
  }
  // Pinch in (scale < 1) crumples, pinch out (scale > 1) opens it.
  s.target = clamp(s.pinchC + (1 - scale) * 1.7, 0, 1);
}

export function stepCrumple(s: CrumpleState, dt: number) {
  'worklet';
  const k = s.mode === 0 ? 7.5 : 16;
  s.c += (s.target - s.c) * (1 - Math.exp(-k * dt));
  if (Math.abs(s.target - s.c) < 0.0007) s.c = s.target;
  if (s.c > s.mem) s.mem = s.c;
  if (s.c >= 0.9) {
    if (s.mode !== 2) {
      s.bx += s.vx * dt;
      s.by += s.vy * dt;
      const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (sp > 0.5) {
        rollBy(s.rot, -s.vy / sp, s.vx / sp, (sp * dt) / CR_BALL_R);
      }
      const lo = CR_BALL_R;
      if (s.bx < lo) { s.bx = lo; s.vx = Math.abs(s.vx) * 0.55; s.bounces++; }
      if (s.bx > CR_W - lo) { s.bx = CR_W - lo; s.vx = -Math.abs(s.vx) * 0.55; s.bounces++; }
      if (s.by < lo) { s.by = lo; s.vy = Math.abs(s.vy) * 0.55; s.bounces++; }
      if (s.by > CR_H - lo) { s.by = CR_H - lo; s.vy = -Math.abs(s.vy) * 0.55; s.bounces++; }
      const drag = Math.exp(-1.15 * dt);
      s.vx *= drag;
      s.vy *= drag;
      if (sp < 6) { s.vx = 0; s.vy = 0; }
    }
  } else {
    // The sheet recentres and the ball's roll relaxes as it opens.
    const kk = 1 - Math.exp(-9 * dt);
    if (s.mode !== 1 && s.mode !== 3) {
      s.bx += (CR_W / 2 - s.bx) * kk;
      s.by += (CR_H / 2 - s.by) * kk;
    }
    s.vx = 0; s.vy = 0;
    relaxRotation(s.rot, kk);
  }
}

/** Test helpers. */
export function crumpleBounds(s: CrumpleState) {
  'worklet';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < CR_NV; v++) {
    if (s.sx[v] < x0) x0 = s.sx[v];
    if (s.sx[v] > x1) x1 = s.sx[v];
    if (s.sy[v] < y0) y0 = s.sy[v];
    if (s.sy[v] > y1) y1 = s.sy[v];
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}
