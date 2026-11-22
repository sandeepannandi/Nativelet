// Pure model for Slingshot. A wooden Y-frame holds a rubber band with a leather
// pouch and a ball. Drag the pouch back to stretch the band; the band pulls
// toward the fork with a Hooke spring, so the launch speed grows with the pull.
// On release the ball rides the spring until the pouch passes the fork line,
// then flies as a projectile with gravity, bounces off walls, floor and the
// frame, and settles. The slack band overshoots and wobbles as a damped spring
// and its width thins as it stretches. A dotted aim path is predicted with the
// same integrator. Native and web draw the same marks from slScene.

export const SL_W = 360;
export const SL_H = 440;
export const FLOOR = 412;
export const BALL_R = 13;
export const ANCHOR = { x: 180, y: 290 };
export const TIP_L = { x: 138, y: 278 };
export const TIP_R = { x: 222, y: 278 };
export const MAX_PULL = 104;
export const MIN_PULL = 10;
export const G = 1400;
const OMEGA = 7.6; // band spring: a = -OMEGA^2 * stretch
const REST_WALL = 0.6, REST_FLOOR = 0.52, REST_FRAME = 0.4;

export type Pt = { x: number; y: number };
export type SlMark = {
  path: string;
  color?: string;
  stroke?: number;
  cap?: 'round';
  alpha?: number;
  grad?: { x0: number; y0: number; x1: number; y1: number; stops: [number, string][] };
};
export type SlSim = {
  p: Pt; v: Pt;
  mode: 'ready' | 'held' | 'pull' | 'flight' | 'rest';
  dir: Pt;            // unit vector from release point toward the fork
  q: Pt; qv: Pt;      // slack band midpoint and its velocity
  trail: Pt[];
  restT: number;      // seconds the ball has been resting
  fade: number;       // 0..1 ball opacity for reload
  shots: number;
  t: number;
};

const len = (x: number, y: number) => Math.hypot(x, y);

export function createSling(): SlSim {
  return { p: { ...ANCHOR }, v: { x: 0, y: 0 }, mode: 'ready', dir: { x: 0, y: -1 }, q: { ...ANCHOR }, qv: { x: 0, y: 0 }, trail: [], restT: 0, fade: 1, shots: 0, t: 0 };
}

/** Clamp a finger position to the allowed pull region: a disc below the fork. */
export function clampPull(x: number, y: number): Pt {
  let dx = x - ANCHOR.x, dy = Math.max(0, y - ANCHOR.y);
  const d = len(dx, dy);
  if (d > MAX_PULL) { dx *= MAX_PULL / d; dy *= MAX_PULL / d; }
  return { x: ANCHOR.x + dx, y: ANCHOR.y + dy };
}

export function pullAmount(s: SlSim): number { return len(s.p.x - ANCHOR.x, s.p.y - ANCHOR.y); }

export function slTouch(s: SlSim, x: number, y: number): 'grab' | 'none' {
  if (s.mode !== 'ready' && s.mode !== 'held') return 'none';
  const near = len(x - s.p.x, y - s.p.y) < 52 || len(x - ANCHOR.x, y - ANCHOR.y) < 52;
  if (!near) return 'none';
  s.mode = 'held';
  s.p = clampPull(x, y); s.v = { x: 0, y: 0 };
  return 'grab';
}

export function slMove(s: SlSim, x: number, y: number) {
  if (s.mode !== 'held') return;
  s.p = clampPull(x, y);
}

export function slRelease(s: SlSim) {
  if (s.mode !== 'held') return;
  const d = pullAmount(s);
  if (d < MIN_PULL) { s.mode = 'ready'; s.q = { ...s.p }; s.p = { ...ANCHOR }; s.qv = { x: 0, y: 0 }; return; }
  s.dir = { x: (ANCHOR.x - s.p.x) / d, y: (ANCHOR.y - s.p.y) / d };
  s.v = { x: 0, y: 0 };
  s.mode = 'pull';
  s.restT = 0;
  s.trail = [];
  s.shots++;
}

/** Fire a straight-up shot at a given pull (accessibility and keyboard). */
export function fireDefault(s: SlSim, pull = 78): boolean {
  if (s.mode !== 'ready' && s.mode !== 'held') return false;
  s.mode = 'held';
  s.p = { x: ANCHOR.x, y: ANCHOR.y + pull };
  slRelease(s);
  return true;
}

/** Put a fresh ball in the pouch. */
export function reload(s: SlSim) {
  s.mode = 'ready'; s.p = { ...ANCHOR }; s.v = { x: 0, y: 0 }; s.fade = 0; s.restT = 0; s.trail = []; s.qv = { x: 0, y: 0 }; s.q = { ...ANCHOR };
}

function frameCapsules(): [Pt, Pt, number][] {
  return [
    [{ x: 180, y: FLOOR }, { x: 180, y: 336 }, 9],
    [{ x: 180, y: 336 }, { x: TIP_L.x + 4, y: TIP_L.y + 12 }, 7],
    [{ x: 180, y: 336 }, { x: TIP_R.x - 4, y: TIP_R.y + 12 }, 7],
  ];
}

function collideFrame(p: Pt, v: Pt): boolean {
  let hit = false;
  for (const [a, b, r] of frameCapsules()) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
    const cx = a.x + abx * t, cy = a.y + aby * t;
    const dx = p.x - cx, dy = p.y - cy, d = len(dx, dy), min = r + BALL_R;
    if (d < min && d > 1e-6) {
      const nx = dx / d, ny = dy / d;
      p.x = cx + nx * min; p.y = cy + ny * min;
      const vn = v.x * nx + v.y * ny;
      if (vn < 0) { v.x -= (1 + REST_FRAME) * vn * nx; v.y -= (1 + REST_FRAME) * vn * ny; hit = true; }
      // The fork is a cup, not a shelf: a ball that comes to rest on it is shoved off to the side it leans toward.
      if (Math.abs(v.x) < 40 && ny < -0.5) v.x += (p.x >= 180 ? 1 : -1) * 55;
    }
  }
  return hit;
}

function flightStep(p: Pt, v: Pt, dt: number): 'floor' | 'wall' | 'frame' | null {
  v.y += G * dt;
  p.x += v.x * dt; p.y += v.y * dt;
  let ev: 'floor' | 'wall' | 'frame' | null = null;
  if (p.x < BALL_R) { p.x = BALL_R; if (v.x < 0) v.x *= -REST_WALL; ev = 'wall'; }
  if (p.x > SL_W - BALL_R) { p.x = SL_W - BALL_R; if (v.x > 0) v.x *= -REST_WALL; ev = 'wall'; }
  if (p.y < BALL_R) { p.y = BALL_R; if (v.y < 0) v.y *= -REST_WALL; ev = 'wall'; }
  if (p.y > FLOOR - BALL_R) {
    p.y = FLOOR - BALL_R;
    if (v.y > 0) { v.y *= -REST_FLOOR; if (Math.abs(v.y) < 60) v.y = 0; ev = 'floor'; }
    v.x *= 0.985;
  }
  if (collideFrame(p, v)) ev = 'frame';
  return ev;
}

/** Dotted aim path for the current held pull: same spring, then ballistic. */
export function predict(s: SlSim): Pt[] {
  const d = pullAmount(s);
  if (s.mode !== 'held' || d < MIN_PULL) return [];
  const p = { ...s.p }, v = { x: 0, y: 0 };
  const ux = (ANCHOR.x - p.x) / d, uy = (ANCHOR.y - p.y) / d;
  const h = 1 / 240;
  for (let i = 0; i < 400; i++) {
    const ax = -OMEGA * OMEGA * (p.x - ANCHOR.x), ay = -OMEGA * OMEGA * (p.y - ANCHOR.y) + G;
    v.x += ax * h; v.y += ay * h; p.x += v.x * h; p.y += v.y * h;
    if ((p.x - ANCHOR.x) * ux + (p.y - ANCHOR.y) * uy >= 0) break;
  }
  const out: Pt[] = [];
  let tNext = 0;
  for (let i = 0, t = 0; i < 360 && out.length < 16; i++, t += h) {
    v.y += G * h; p.x += v.x * h; p.y += v.y * h;
    if (p.y > FLOOR - BALL_R || p.x < 0 || p.x > SL_W) break;
    if (t >= tNext) { out.push({ x: p.x, y: p.y }); tNext += 0.055; }
  }
  return out;
}

export function stepSl(s: SlSim, dt: number, reduce = false) {
  const h = 1 / 240;
  let left = Math.min(dt, 0.05);
  while (left > 1e-9) {
    const k = Math.min(h, left); left -= k;
    s.t += k;
    // Slack band: damped spring around the fork. Always integrated so it wobbles after a shot.
    if (s.mode !== 'held' && s.mode !== 'pull') {
      const w = 24, z = reduce ? 0.6 : 0.1;
      const ax = -w * w * (s.q.x - ANCHOR.x) - 2 * z * w * s.qv.x, ay = -w * w * (s.q.y - ANCHOR.y) - 2 * z * w * s.qv.y;
      s.qv.x += ax * k; s.qv.y += ay * k; s.q.x += s.qv.x * k; s.q.y += s.qv.y * k;
    }
    if (s.mode === 'pull') {
      const ax = -OMEGA * OMEGA * (s.p.x - ANCHOR.x), ay = -OMEGA * OMEGA * (s.p.y - ANCHOR.y) + G;
      s.v.x += ax * k; s.v.y += ay * k; s.p.x += s.v.x * k; s.p.y += s.v.y * k;
      s.restT += k;
      // Too weak to lift the ball past the fork: it just settles back into the pouch.
      if (s.restT > 0.7) { s.mode = 'ready'; s.q = { x: s.p.x, y: s.p.y }; s.qv = { x: s.v.x * 0.3, y: s.v.y * 0.3 }; s.p = { ...ANCHOR }; s.v = { x: 0, y: 0 }; s.restT = 0; continue; }
      if ((s.p.x - ANCHOR.x) * s.dir.x + (s.p.y - ANCHOR.y) * s.dir.y >= 0) {
        s.mode = 'flight';
        s.q = { x: s.p.x, y: s.p.y }; s.qv = { x: s.v.x * 0.45, y: s.v.y * 0.45 };
      }
    } else if (s.mode === 'flight') {
      flightStep(s.p, s.v, k);
      if (s.p.y >= FLOOR - BALL_R - 0.5 && Math.abs(s.v.y) < 1 && Math.abs(s.v.x) < 14) { s.v.x = 0; s.v.y = 0; s.mode = 'rest'; s.restT = 0; }
    } else if (s.mode === 'rest') {
      s.restT += k;
    }
  }
  if ((s.mode === 'flight') && !reduce) {
    const last = s.trail[s.trail.length - 1];
    if (!last || len(last.x - s.p.x, last.y - s.p.y) > 9) { s.trail.push({ x: s.p.x, y: s.p.y }); if (s.trail.length > 34) s.trail.shift(); }
  }
  if (s.mode === 'rest' && s.restT > 1.6) reload(s);
  if (s.mode === 'ready' || s.mode === 'held' || s.mode === 'pull') s.fade = Math.min(1, s.fade + dt * 4);
}

const circle = (cx: number, cy: number, r: number) => `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const line = (a: Pt, b: Pt) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

/** Where the band is attached right now (the pouch or the slack midpoint). */
function bandPoint(s: SlSim): Pt {
  if (s.mode === 'held' || s.mode === 'pull') return s.p;
  if (s.mode === 'ready') return s.q;
  return s.q;
}

export function slScene(s: SlSim): SlMark[] {
  const m: SlMark[] = [];
  // ground
  m.push({ path: `M0 ${FLOOR}H${SL_W}V${SL_H}H0z`, grad: { x0: 0, y0: FLOOR, x1: 0, y1: SL_H, stops: [[0, '#d9d1c3'], [1, '#c9bfae']] } });
  m.push({ path: `M0 ${FLOOR}H${SL_W}`, color: '#b5a994', stroke: 2 });
  const ballOnGround = s.mode === 'rest' || (s.mode === 'flight' && s.p.y > FLOOR - 120);
  const bp = bandPoint(s);
  // wooden frame
  const wood = { x0: 160, y0: 0, x1: 200, y1: 0, stops: [[0, '#7a4f2e'], [0.45, '#b07a4a'], [1, '#6b4426']] as [number, string][] };
  m.push({ path: line({ x: 180, y: FLOOR }, { x: 180, y: 336 }), color: '#6b4426', stroke: 20, cap: 'round' });
  m.push({ path: line({ x: 180, y: FLOOR }, { x: 180, y: 336 }), color: '#b07a4a', stroke: 12, cap: 'round' });
  m.push({ path: line({ x: 176, y: FLOOR - 4 }, { x: 176, y: 340 }), color: '#d4a574', stroke: 3, cap: 'round', alpha: 0.7 });
  void wood;
  for (const tip of [TIP_L, TIP_R]) {
    m.push({ path: line({ x: 180, y: 336 }, { x: tip.x + (tip.x < 180 ? 4 : -4), y: tip.y + 12 }), color: '#6b4426', stroke: 17, cap: 'round' });
    m.push({ path: line({ x: 180, y: 336 }, { x: tip.x + (tip.x < 180 ? 4 : -4), y: tip.y + 12 }), color: '#b07a4a', stroke: 10, cap: 'round' });
    m.push({ path: circle(tip.x, tip.y, 7), color: '#3b2a1c' });
  }
  // aim dots
  if (s.mode === 'held') {
    const pts = predict(s);
    pts.forEach((p, i) => m.push({ path: circle(p.x, p.y, 3.4 - i * 0.12), color: '#31513b', alpha: 0.75 - i * 0.04 }));
  }
  // flight trail
  s.trail.forEach((p, i) => m.push({ path: circle(p.x, p.y, 2 + 3 * i / s.trail.length), color: '#31513b', alpha: 0.08 + 0.3 * i / s.trail.length }));
  // ball shadow
  if (ballOnGround || s.mode === 'ready') {
    const sy = FLOOR + 1, hgt = Math.max(0, FLOOR - s.p.y), a = Math.max(0.05, 0.28 - hgt / 600);
    if (s.mode !== 'ready') m.push({ path: `M${(s.p.x - BALL_R * 1.1).toFixed(1)} ${sy}a${BALL_R * 1.1} 3.4 0 1 0 ${BALL_R * 2.2} 0a${BALL_R * 1.1} 3.4 0 1 0 ${-BALL_R * 2.2} 0z`, color: '#2b2a28', alpha: a });
  }
  // band: back part sits behind the ball, thickness follows stretch
  const stretch = Math.max(len(bp.x - ANCHOR.x, bp.y - ANCHOR.y), 0);
  const width = Math.max(3.2, 10.5 - stretch * 0.075);
  for (const tip of [TIP_L, TIP_R]) {
    m.push({ path: line(tip, bp), color: '#262523', stroke: width, cap: 'round' });
    m.push({ path: line(tip, bp), color: '#6b6a66', stroke: Math.max(1, width * 0.25), cap: 'round', alpha: 0.7 });
  }
  // leather pouch and ball
  if (s.mode !== 'flight' && s.mode !== 'rest') {
    m.push({ path: circle(bp.x, bp.y, BALL_R + 5), color: '#4a3326' });
    m.push({ path: circle(bp.x, bp.y, BALL_R + 3), color: '#6d4c37' });
  }
  const bx = s.mode === 'ready' || s.mode === 'held' || s.mode === 'pull' ? s.p.x : s.p.x, by = s.p.y;
  const ba = s.mode === 'ready' ? s.fade : 1;
  m.push({ path: circle(bx, by, BALL_R), grad: { x0: bx - BALL_R, y0: by - BALL_R, x1: bx + BALL_R, y1: by + BALL_R, stops: [[0, '#d7ece0'], [0.5, '#5d8a6a'], [1, '#27402f']] }, alpha: ba });
  m.push({ path: circle(bx - 4, by - 5, 3.6), color: '#ffffff', alpha: 0.55 * ba });
  // front lip of the pouch over the ball
  if (s.mode === 'held' || s.mode === 'pull' || s.mode === 'ready') {
    m.push({ path: `M${bx - BALL_R - 3} ${by + 2}a${BALL_R + 3} ${BALL_R + 3} 0 0 0 ${2 * (BALL_R + 3)} 0`, color: '#6d4c37', stroke: 4, cap: 'round' });
  }
  return m;
}
