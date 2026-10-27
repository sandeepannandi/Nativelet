// Fracture geometry for Glass Shatter. Pure functions, no React Native imports.
// The pane breaks the way tempered and annealed glass cracks around an impact:
// radial spokes and concentric rings of sites near the hit, fewer and larger
// pieces further away. Each shard is a convex Voronoi cell of those sites.

export type Vec = { x: number; y: number };
export type Shard = {
  /** Convex polygon, counter-clockwise, in pane coordinates (the intact position). */
  poly: Vec[];
  /** Centroid of the polygon in pane coordinates. */
  cx: number;
  cy: number;
  /** Polygon area. */
  area: number;
  /** Distance from the impact point to the centroid. */
  dist: number;
};

export function mulberry32(seed: number): () => number {
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

/** Clip a convex polygon to the half-plane {p : (p - m) . n <= 0}. Sutherland-Hodgman. */
export function clipHalfPlane(poly: Vec[], mx: number, my: number, nx: number, ny: number): Vec[] {
  'worklet';
  const out: Vec[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = (a.x - mx) * nx + (a.y - my) * ny;
    const db = (b.x - mx) * nx + (b.y - my) * ny;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function polyArea(p: Vec[]): number {
  'worklet';
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polyCentroid(p: Vec[]): Vec {
  'worklet';
  let cx = 0;
  let cy = 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const c = a.x * b.y - b.x * a.y;
    s += c;
    cx += (a.x + b.x) * c;
    cy += (a.y + b.y) * c;
  }
  if (Math.abs(s) < 1e-9) return { x: p[0].x, y: p[0].y };
  return { x: cx / (3 * s), y: cy / (3 * s) };
}

export type FractureOptions = {
  /** Pane width and height in points. */
  width: number;
  height: number;
  /** Impact point in pane coordinates. */
  hitX: number;
  hitY: number;
  /** Seed for the jitter, so the same hit always breaks the same way. */
  seed?: number;
  /** Approximate shard count (the pattern lands within about 15% of it). */
  target?: number;
};

/** Sites: a dense core at the hit, rings that thin out, plus a sparse far field. */
export function fractureSites(o: FractureOptions): Vec[] {
  'worklet';
  const rnd = mulberry32(o.seed ?? 1);
  const target = o.target ?? 110;
  const sites: Vec[] = [{ x: o.hitX, y: o.hitY }];
  const reach = Math.hypot(Math.max(o.hitX, o.width - o.hitX), Math.max(o.hitY, o.height - o.hitY));
  // Radii grow geometrically, so pieces near the hit are small.
  const growth = 1.42;
  const r0 = reach * 0.045;
  let r = r0;
  let ring = 0;
  while (r < reach * 1.02 && sites.length < target * 1.6) {
    // Spoke count grows with radius slower than circumference: bigger far pieces.
    const spokes = Math.max(5, Math.round(6 + ring * 2.2));
    const phase = rnd() * Math.PI * 2;
    for (let k = 0; k < spokes; k++) {
      const ang = phase + (k / spokes) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / spokes) * 0.55;
      const rr = r * (0.86 + rnd() * 0.3);
      const x = o.hitX + Math.cos(ang) * rr;
      const y = o.hitY + Math.sin(ang) * rr;
      if (x > -reach * 0.05 && x < o.width * 1.05 && y > -reach * 0.05 && y < o.height * 1.05) sites.push({ x, y });
    }
    r *= growth;
    ring++;
  }
  // Fill the far field up to the target with jittered samples (rejection by min distance).
  const minD = Math.sqrt((o.width * o.height) / Math.max(target, 20)) * 0.55;
  let tries = 0;
  while (sites.length < target && tries < 4000) {
    tries++;
    const x = rnd() * o.width;
    const y = rnd() * o.height;
    let ok = true;
    for (const s of sites) {
      if ((s.x - x) ** 2 + (s.y - y) ** 2 < minD * minD) {
        ok = false;
        break;
      }
    }
    if (ok) sites.push({ x, y });
  }
  return sites;
}

/** Voronoi cells of `sites`, clipped to the pane rectangle. Drops slivers. */
export function fracturePane(o: FractureOptions): Shard[] {
  'worklet';
  const sites = fractureSites(o);
  const rect: Vec[] = [
    { x: 0, y: 0 },
    { x: o.width, y: 0 },
    { x: o.width, y: o.height },
    { x: 0, y: o.height },
  ];
  const shards: Shard[] = [];
  const minArea = (o.width * o.height) / 4000;
  for (let i = 0; i < sites.length; i++) {
    let poly = rect;
    const si = sites[i];
    for (let j = 0; j < sites.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const sj = sites[j];
      const nx = sj.x - si.x;
      const ny = sj.y - si.y;
      const mx = (si.x + sj.x) / 2;
      const my = (si.y + sj.y) / 2;
      poly = clipHalfPlane(poly, mx, my, nx, ny);
    }
    if (poly.length < 3) continue;
    const area = polyArea(poly);
    if (area < minArea) continue;
    const c = polyCentroid(poly);
    shards.push({ poly, cx: c.x, cy: c.y, area, dist: Math.hypot(c.x - o.hitX, c.y - o.hitY) });
  }
  return shards;
}

export type Body = {
  /** Centroid position and rotation. */
  x: number; y: number; a: number;
  vx: number; vy: number; w: number;
  invM: number; invI: number;
  /** Visual polygon relative to the centroid (counter-clockwise). */
  local: Vec[];
  /** Collision polygon: the visual one shrunk a hair, so touching cells start separated. */
  hull: Vec[];
  /** Cached world-space hull. */
  wx: number[]; wy: number[];
  /** Pane position of the centroid before the break. */
  homeX: number; homeY: number;
  radius: number;
  sleep: number;
  asleep: boolean;
  /** Still hanging in the frame: acts as a fixed obstacle until the crack reaches it. */
  held: boolean;
  releaseAt: number;
  kx: number; ky: number; kw: number;
  /** Fell out of the frame; no longer simulated or drawn. */
  gone: boolean;
};

export type World = {
  bodies: Body[];
  width: number;
  height: number;
  gravity: number;
  time: number;
  hit: Vec;
  /** Peak per-frame penetration seen, a diagnostic. */
  maxPen: number;
  contacts: number;
  /** Bodies sorted by left edge for the sweep. */
  order: Body[];
};

const SHRINK = 1.2;
const CRACK_SPEED = 780;

export function updateWorldHull(b: Body) {
  'worklet';
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  for (let i = 0; i < b.hull.length; i++) {
    const p = b.hull[i];
    b.wx[i] = b.x + p.x * c - p.y * s;
    b.wy[i] = b.y + p.x * s + p.y * c;
  }
}

export function createWorld(o: FractureOptions & { gravity?: number }): World {
  'worklet';
  const shards = fracturePane(o);
  const rnd = mulberry32((o.seed ?? 1) + 101);
  const bodies: Body[] = shards.map((s) => {
    const local = s.poly.map((p) => ({ x: p.x - s.cx, y: p.y - s.cy }));
    const hull = local.map((p) => {
      const d = Math.hypot(p.x, p.y) || 1;
      const k = Math.max(0, 1 - SHRINK / d);
      return { x: p.x * k, y: p.y * k };
    });
    const mass = s.area * 0.01;
    // Polar moment about the centroid for a polygon (density 0.01).
    let num = 0;
    let den = 0;
    for (let i = 0; i < local.length; i++) {
      const p = local[i];
      const q = local[(i + 1) % local.length];
      const c = Math.abs(p.x * q.y - q.x * p.y);
      num += c * (p.x * p.x + p.y * p.y + p.x * q.x + p.y * q.y + q.x * q.x + q.y * q.y);
      den += c;
    }
    const inertia = den > 0 ? (mass * num) / (6 * den) : mass;
    let radius = 0;
    for (const p of local) radius = Math.max(radius, Math.hypot(p.x, p.y));
    return {
      x: s.cx, y: s.cy, a: 0, vx: 0, vy: 0, w: 0,
      invM: 1 / mass, invI: 1 / Math.max(inertia, 1e-6),
      local, hull, wx: hull.map(() => 0), wy: hull.map(() => 0),
      homeX: s.cx, homeY: s.cy, radius, sleep: 0, asleep: false,
      held: true, releaseAt: 0, kx: 0, ky: 0, kw: 0, gone: false,
    };
  });
  const world: World = {
    bodies, width: o.width, height: o.height, gravity: o.gravity ?? 1500,
    time: 0, hit: { x: o.hitX, y: o.hitY }, maxPen: 0, contacts: 0, order: bodies.slice(),
  };
  // The blow: shards leave the impact point radially. Close pieces get a hard
  // shove, far pieces just drop and tip, with a little scatter.
  const reach = Math.hypot(o.width, o.height);
  for (const b of bodies) {
    const dx = b.x - o.hitX;
    const dy = b.y - o.hitY;
    const d = Math.hypot(dx, dy) || 1;
    const fall = Math.exp(-d / (reach * 0.22));
    const kick = 520 * fall + 40;
    b.kx = (dx / d) * kick * (0.8 + rnd() * 0.4);
    b.ky = (dy / d) * kick * (0.8 + rnd() * 0.4) - 90 * fall;
    b.kw = (rnd() - 0.5) * 9 * (0.25 + fall);
    // The crack runs outward from the hit; a cell lets go when it arrives.
    b.releaseAt = d / CRACK_SPEED + rnd() * 0.04;
    updateWorldHull(b);
  }
  return world;
}



type Contact = {
  a: Body; b: Body | null;
  nx: number; ny: number; // from a toward b (or out of the wall for b === null: pushes a)
  px: number; py: number; // world contact point
  pen: number;
  ra: Vec; rb: Vec;
  jn: number; jt: number;
  mn: number; mt: number;
  bias: number;
};

/** Best separating axis of A's edges against B. Returns [separation, edgeIndex]. */
function maxSeparation(A: Body, B: Body): [number, number] {
  'worklet';
  let best = -Infinity;
  let idx = 0;
  const n = A.wx.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let nx = A.wy[j] - A.wy[i];
    let ny = -(A.wx[j] - A.wx[i]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    let min = Infinity;
    for (let k = 0; k < B.wx.length; k++) {
      const d = (B.wx[k] - A.wx[i]) * nx + (B.wy[k] - A.wy[i]) * ny;
      if (d < min) min = d;
    }
    if (min > best) {
      best = min;
      idx = i;
    }
  }
  return [best, idx];
}

/** Polygon-polygon manifold by SAT and incident-edge clipping. Appends contacts. */
function collide(A: Body, B: Body, out: Contact[]) {
  'worklet';
  const [sepA, ia] = maxSeparation(A, B);
  if (sepA > 0) return;
  const [sepB, ib] = maxSeparation(B, A);
  if (sepB > 0) return;
  // Reference body owns the face with the shallowest penetration.
  let flip = false;
  let R = A;
  let I = B;
  let ri = ia;
  if (sepB > sepA + 1e-4) {
    flip = true;
    R = B;
    I = A;
    ri = ib;
  }
  const rn = R.wx.length;
  const r1x = R.wx[ri], r1y = R.wy[ri];
  const r2x = R.wx[(ri + 1) % rn], r2y = R.wy[(ri + 1) % rn];
  let tx = r2x - r1x, ty = r2y - r1y;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  const nx = ty, ny = -tx; // outward normal of the reference face
  // Incident edge: the edge of I most anti-parallel to the reference normal.
  const inn = I.wx.length;
  let ii = 0;
  let minDot = Infinity;
  for (let i = 0; i < inn; i++) {
    const j = (i + 1) % inn;
    let ex = I.wy[j] - I.wy[i];
    let ey = -(I.wx[j] - I.wx[i]);
    const l = Math.hypot(ex, ey) || 1;
    ex /= l; ey /= l;
    const d = ex * nx + ey * ny;
    if (d < minDot) { minDot = d; ii = i; }
  }
  let p1 = { x: I.wx[ii], y: I.wy[ii] };
  let p2 = { x: I.wx[(ii + 1) % inn], y: I.wy[(ii + 1) % inn] };
  // Clip the incident edge to the side planes of the reference edge.
  const clip = (a: Vec, b: Vec, dx: number, dy: number, off: number): [Vec, Vec] | null => {
    const da = a.x * dx + a.y * dy - off;
    const db = b.x * dx + b.y * dy - off;
    const pts: Vec[] = [];
    if (da <= 0) pts.push(a);
    if (db <= 0) pts.push(b);
    if (da * db < 0) {
      const t = da / (da - db);
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return pts.length < 2 ? null : [pts[0], pts[1]];
  };
  let c = clip(p1, p2, -tx, -ty, -(r1x * tx + r1y * ty));
  if (!c) return;
  c = clip(c[0], c[1], tx, ty, r2x * tx + r2y * ty);
  if (!c) return;
  const faceOff = r1x * nx + r1y * ny;
  // Contact normal points from A toward B.
  const cnx = flip ? -nx : nx;
  const cny = flip ? -ny : ny;
  for (const p of c) {
    const sep = p.x * nx + p.y * ny - faceOff;
    if (sep > 0) continue;
    out.push({
      a: A, b: B, nx: cnx, ny: cny, px: p.x, py: p.y, pen: -sep,
      ra: { x: p.x - A.x, y: p.y - A.y }, rb: { x: p.x - B.x, y: p.y - B.y },
      jn: 0, jt: 0, mn: 0, mt: 0, bias: 0,
    });
  }
}

const FRICTION = 0.5;
const RESTITUTION = 0.25;
const SLOP = 0.3;
const BAUMGARTE = 0.2;
const MAX_PUSH = 140;

function wallContacts(a: Body, W: number, H: number, out: Contact[]) {
  'worklet';
  for (let i = 0; i < a.wx.length; i++) {
    const x = a.wx[i], y = a.wy[i];
    // n points from the body into the wall.
    const push = (nx: number, ny: number, pen: number) =>
      out.push({
        a, b: null, nx, ny, px: x, py: y, pen,
        ra: { x: x - a.x, y: y - a.y }, rb: { x: 0, y: 0 },
        jn: 0, jt: 0, mn: 0, mt: 0, bias: 0,
      });
    if (y > H) push(0, 1, y - H);
    if (x < 0) push(-1, 0, -x);
    if (x > W) push(1, 0, x - W);
  }
}

function relVel(ct: Contact): [number, number] {
  'worklet';
  const { a, b } = ct;
  const vax = a.vx - a.w * ct.ra.y, vay = a.vy + a.w * ct.ra.x;
  if (!b) return [-vax, -vay];
  const vbx = b.vx - b.w * ct.rb.y, vby = b.vy + b.w * ct.rb.x;
  return [vbx - vax, vby - vay];
}

function prep(ct: Contact, dt: number) {
  'worklet';
  const { a, b } = ct;
  const nx = ct.nx, ny = ct.ny;
  const tx = -ny, ty = nx;
  const rnA = ct.ra.x * ny - ct.ra.y * nx;
  const rtA = ct.ra.x * ty - ct.ra.y * tx;
  let k = a.invM + a.invI * rnA * rnA;
  let kt = a.invM + a.invI * rtA * rtA;
  if (b) {
    const rnB = ct.rb.x * ny - ct.rb.y * nx;
    const rtB = ct.rb.x * ty - ct.rb.y * tx;
    k += b.invM + b.invI * rnB * rnB;
    kt += b.invM + b.invI * rtB * rtB;
  }
  ct.mn = k > 0 ? 1 / k : 0;
  ct.mt = kt > 0 ? 1 / kt : 0;
  const [rx, ry] = relVel(ct);
  const vn = rx * nx + ry * ny; // negative = closing
  const bounce = vn < -120 ? -RESTITUTION * vn : 0;
  const push = Math.min(MAX_PUSH, (BAUMGARTE * Math.max(ct.pen - SLOP, 0)) / dt);
  ct.bias = Math.max(bounce, push);
}

function applyImpulse(ct: Contact, jx: number, jy: number) {
  'worklet';
  const { a, b } = ct;
  a.vx -= a.invM * jx; a.vy -= a.invM * jy;
  a.w -= a.invI * (ct.ra.x * jy - ct.ra.y * jx);
  if (b) {
    b.vx += b.invM * jx; b.vy += b.invM * jy;
    b.w += b.invI * (ct.rb.x * jy - ct.rb.y * jx);
  }
}

function solve(ct: Contact) {
  'worklet';
  const nx = ct.nx, ny = ct.ny;
  const tx = -ny, ty = nx;
  let [rx, ry] = relVel(ct);
  let dj = ct.mn * (ct.bias - (rx * nx + ry * ny));
  const old = ct.jn;
  ct.jn = Math.max(old + dj, 0);
  dj = ct.jn - old;
  applyImpulse(ct, nx * dj, ny * dj);
  [rx, ry] = relVel(ct);
  let djt = -ct.mt * (rx * tx + ry * ty);
  const maxF = FRICTION * ct.jn;
  const oldT = ct.jt;
  ct.jt = Math.max(-maxF, Math.min(maxF, oldT + djt));
  djt = ct.jt - oldT;
  applyImpulse(ct, tx * djt, ty * djt);
}

const SUB = 3;
const FIXED = 1 / 180;
const SLEEP_V = 6;
const SLEEP_W = 0.25;
const SLEEP_T = 0.5;


function stepFixed(w: World, dt: number) {
  'worklet';
  const bodies = w.bodies;
  w.time += dt;
  for (const b of bodies) {
    if (b.gone) continue;
    if (b.held && w.time >= b.releaseAt) {
      b.held = false;
      b.vx = b.kx; b.vy = b.ky; b.w = b.kw;
    }
    if (b.held || b.asleep) continue;
    b.vy += w.gravity * dt;
    // Air and spin damping keep the pile from ringing.
    b.vx *= 1 - 0.05 * dt;
    b.vy *= 1 - 0.05 * dt;
    b.w *= 1 - 0.35 * dt;
  }
  // Broadphase: sweep over bodies sorted by their left edge (insertion sort,
  // the order barely changes between steps), then bounding-circle test, then SAT.
  const contacts: Contact[] = [];
  const order = w.order;
  for (let i = 1; i < order.length; i++) {
    const v = order[i];
    const key = v.x - v.radius;
    let j = i - 1;
    while (j >= 0 && order[j].x - order[j].radius > key) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = v;
  }
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    if (a.gone) continue;
    const aMoving = !(a.asleep || a.held);
    const aRight = a.x + a.radius;
    for (let j = i + 1; j < order.length; j++) {
      const b = order[j];
      if (b.x - b.radius > aRight) break;
      if (b.gone) continue;
      if (!aMoving && (b.asleep || b.held)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.radius + b.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      collide(a, b, contacts);
    }
  }
  w.contacts = contacts.length;
  for (const ct of contacts) {
    // A moving body touching a sleeper wakes it.
    if (ct.b && !ct.a.held && !ct.b.held && (ct.a.asleep !== ct.b.asleep)) {
      const m = ct.a.asleep ? ct.b : ct.a;
      if (m.vx * m.vx + m.vy * m.vy > 40 * 40) { ct.a.asleep = false; ct.b.asleep = false; ct.a.sleep = ct.b.sleep = 0; }
    }
    prep(ct, dt);
    if (ct.pen > w.maxPen) w.maxPen = ct.pen;
  }
  // Sleepers act as heavy anchors (no inverse mass) so a resting pile holds still.
  const anchored: Body[] = [];
  const am: number[] = [];
  const ai: number[] = [];
  for (const b of bodies) if (!b.gone && (b.asleep || b.held)) { anchored.push(b); am.push(b.invM); ai.push(b.invI); b.invM = 0; b.invI = 0; }
  for (let it = 0; it < 14; it++) for (const ct of contacts) solve(ct);
  for (let q = 0; q < anchored.length; q++) { anchored[q].invM = am[q]; anchored[q].invI = ai[q]; }
  for (const b of bodies) {
    if (b.gone || b.held || b.asleep) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.w * dt;
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 < SLEEP_V * SLEEP_V && Math.abs(b.w) < SLEEP_W) {
      b.sleep += dt;
      if (b.sleep > SLEEP_T) { b.asleep = true; b.vx = b.vy = b.w = 0; }
    } else b.sleep = 0;
    updateWorldHull(b);
    if (b.y - b.radius > w.height + 60 || b.x + b.radius < -w.width * 0.6 || b.x - b.radius > w.width * 1.6) b.gone = true;
  }
}

export function stepWorld(w: World, dtFrame: number) {
  'worklet';
  let remaining = Math.min(dtFrame, 1 / 20);
  while (remaining > 1e-6) {
    const dt = Math.min(FIXED * SUB / SUB, remaining);
    remaining -= dt;
    stepFixed(w, dt);
  }
}

export function allAsleep(w: World): boolean {
  'worklet';
  for (const b of w.bodies) if (!b.gone && !b.asleep) return false;
  return true;
}

/** Refraction: a glass edge tilting in its fall shifts the picture behind it. Not ray tracing: a tilt-driven
 * offset of the texture lookup, a visual approximation of a thin pane bending light. */
export function shardRefraction(b: Body, out: number[]) {
  'worklet';
  const k = b.held ? 0 : 1;
  const wob = b.a * 1.7 + b.homeX * 0.031 + b.homeY * 0.017;
  out[0] = Math.sin(wob) * 7 * k;
  out[1] = Math.cos(wob * 0.8 + 1.3) * 7 * k;
}

/** Glint brightness 0..1 from the shard's current angle, a fixed light from the upper left. */
export function shardGlint(b: Body): number {
  'worklet';
  const g = 0.5 + 0.5 * Math.sin(b.a * 2.3 + b.homeX * 0.05 + b.homeY * 0.03);
  return g * g;
}
