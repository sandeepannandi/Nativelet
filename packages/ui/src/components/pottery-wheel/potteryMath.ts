// Pure model for the Pottery Wheel. A lump of clay is a stack of slices. Every
// slice keeps its own volume, so a slice with radius r is exactly
// m / (pi r^2) tall: squeeze a ring in and the clay climbs, pull it out and the
// wall sinks. Total height is capped by the canvas, so a squeeze that would
// overflow is scaled back. The wheel spins at a fixed rate. Each slice also has
// a small off-centre vector in the clay's own frame, a damped chain that a push
// kicks and the base holds still: that is the wobble you see on the rim.
// Native and web draw the same marks from potScene.

export const POT_W = 360;
export const POT_H = 440;
export const POT_CX = 180;
export const POT_BASE = 372;
export const POT_K = 0.2;
export const POT_N = 72;
export const POT_RMIN = 20;
export const POT_RMAX = 112;
export const POT_HMAX = 335;
export const POT_SPIN = 5.2;
const MASS = Math.PI * 68 * 68 * 150 / POT_N;
const SIGMA = 9;
const STEP = 1 / 240;

export type PotMark = {
  path: string;
  color?: string;
  stroke?: number;
  cap?: 'round';
  alpha?: number;
  grad?: { x0: number; x1: number; stops: [number, string][] };
};

export type Pot = {
  r: number[];
  ex: number[]; ey: number[]; vx: number[]; vy: number[];
  wet: number[];
  theta: number;
  grab: boolean;
  fx: number; fy: number;
  rest: number;
};

export function createPot(): Pot {
  const r = Array.from({ length: POT_N }, (_, i) => { const u = i / (POT_N - 1); return 72 - 20 * u * u * u - 6 * Math.sin(u * 9) * (1 - u); });
  const z = () => new Array(POT_N).fill(0);
  return { r, ex: z(), ey: z(), vx: z(), vy: z(), wet: new Array(POT_N).fill(0.35), theta: 0, grab: false, fx: 0, fy: 0, rest: 0 };
}

export const sliceHeight = (r: number) => MASS / (Math.PI * r * r);

export function potHeight(r: number[]) { let h = 0; for (const x of r) h += sliceHeight(x); return h; }

export function potCenters(r: number[]) {
  const c: number[] = []; let h = 0;
  for (const x of r) { const t = sliceHeight(x); c.push(h + t / 2); h += t; }
  return { centers: c, total: h };
}

/** Which clay is under a point: returns true when the point can grab the clay. */
export function potTouch(s: Pot, x: number, y: number) {
  const { centers, total } = potCenters(s.r);
  const hy = POT_BASE - y;
  s.fx = x; s.fy = y;
  if (hy < -10 || hy > total + 18) { s.grab = false; return false; }
  let i = 0; while (i < POT_N - 1 && centers[i] < hy) i++;
  s.grab = Math.abs(x - POT_CX) <= s.r[i] + 34;
  return s.grab;
}

export function potRelease(s: Pot) { s.grab = false; }

export function potMove(s: Pot, x: number, y: number, dt: number) {
  if (!s.grab) { s.fx = x; s.fy = y; return; }
  const target = Math.max(POT_RMIN, Math.min(POT_RMAX, Math.abs(x - POT_CX)));
  const dy = y - s.fy;
  const steps = Math.max(1, Math.min(24, Math.ceil(Math.abs(dy) / 3)));
  const side = x >= POT_CX ? 1 : -1;
  for (let k = 1; k <= steps; k++) {
    const yy = s.fy + dy * k / steps;
    press(s, yy, target, side, dt / steps);
  }
  s.fx = x; s.fy = y;
}

function press(s: Pot, y: number, target: number, side: number, dt: number) {
  const { centers } = potCenters(s.r);
  const hy = POT_BASE - y;
  const next = s.r.slice();
  const kick: number[] = new Array(POT_N).fill(0);
  for (let i = 0; i < POT_N; i++) {
    const d = (centers[i] - hy) / SIGMA;
    if (d * d > 9) continue;
    const w = Math.exp(-d * d);
    next[i] += (target - s.r[i]) * (1 - Math.exp(-16 * w * dt));
    // Clay flows a little: soften sharp ledges next to the finger.
    const nb = ((i > 0 ? s.r[i - 1] : s.r[i]) + (i < POT_N - 1 ? s.r[i + 1] : s.r[i])) / 2;
    next[i] += (nb - s.r[i]) * (1 - Math.exp(-7 * w * dt));
    next[i] = Math.max(POT_RMIN, Math.min(POT_RMAX, next[i]));
  }
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const trial = s.r.map((v, i) => v + (next[i] - v) * scale);
    if (potHeight(trial) <= POT_HMAX) {
      for (let i = 0; i < POT_N; i++) { kick[i] = Math.abs(trial[i] - s.r[i]); s.r[i] = trial[i]; }
      break;
    }
    scale *= 0.5;
    if (attempt === 3) scale = 0;
  }
  const c = Math.cos(s.theta), sn = Math.sin(s.theta);
  for (let i = 1; i < POT_N; i++) {
    if (kick[i] <= 0) continue;
    const m = kick[i] * 420;
    s.vx[i] += -side * c * m; s.vy[i] += side * sn * m;
    s.wet[i] = Math.min(1, s.wet[i] + kick[i] * 0.8 + 0.02);
  }
}

export function stepPot(s: Pot, dt: number, reduce = false) {
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(STEP, left); left -= h;
    s.theta = (s.theta + POT_SPIN * (reduce ? 0.25 : 1) * h) % (Math.PI * 2);
    if (reduce) { s.ex.fill(0); s.ey.fill(0); s.vx.fill(0); s.vy.fill(0); continue; }
    for (let i = 1; i < POT_N; i++) {
      const f = i / (POT_N - 1);
      const ks = 30 + 90 * (1 - f), kc = 2600, c = 3.4 + 5 * (1 - f);
      const up = i + 1 < POT_N ? 1 : 0;
      const axx = -ks * s.ex[i] - kc * (2 * s.ex[i] - s.ex[i - 1] - (up ? s.ex[i + 1] : s.ex[i])) - c * s.vx[i];
      const ayy = -ks * s.ey[i] - kc * (2 * s.ey[i] - s.ey[i - 1] - (up ? s.ey[i + 1] : s.ey[i])) - c * s.vy[i];
      s.vx[i] += axx * h; s.vy[i] += ayy * h;
    }
    for (let i = 1; i < POT_N; i++) {
      s.ex[i] += s.vx[i] * h; s.ey[i] += s.vy[i] * h;
      const m = Math.hypot(s.ex[i], s.ey[i]);
      if (m > 16) { s.ex[i] *= 16 / m; s.ey[i] *= 16 / m; }
    }
  }
  const decay = Math.exp(-dt * 0.18);
  for (let i = 0; i < POT_N; i++) s.wet[i] = 0.35 + (s.wet[i] - 0.35) * decay;
}

/** Largest silhouette shift currently on the clay, in canvas units. */
export function potWobble(s: Pot) { let m = 0; for (let i = 0; i < POT_N; i++) m = Math.max(m, Math.hypot(s.ex[i], s.ey[i])); return m; }

// ---- drawing -------------------------------------------------------------

const hex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const mul = (a: number[], k: number) => a.map(v => v * k);
const DARKER = [34, 22, 18], DARK = [64, 41, 33], SHADE = [106, 68, 53], BASE = [148, 99, 76], LIGHT = [180, 128, 101], SPEC = [236, 216, 203];
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

function ring(cx: number, y: number, r: number) {
  const ry = r * POT_K;
  return `M${f2(cx - r)} ${f2(y)}A${f2(r)} ${f2(ry)} 0 1 0 ${f2(cx + r)} ${f2(y)}A${f2(r)} ${f2(ry)} 0 1 0 ${f2(cx - r)} ${f2(y)}Z`;
}

export function potGeometry(s: Pot) {
  const { centers, total } = potCenters(s.r);
  const c = Math.cos(s.theta), sn = Math.sin(s.theta);
  const sy = centers.map(v => POT_BASE - v);
  const ox = s.r.map((_, i) => s.ex[i] * c - s.ey[i] * sn);
  return { sy, ox, total, cx: ox.map(v => POT_CX + v) };
}

export function potScene(s: Pot): PotMark[] {
  const g = potGeometry(s), r = s.r, n = POT_N, marks: PotMark[] = [];
  const base = r[0], top = r[n - 1];
  // Plate and shadow
  marks.push({ path: ring(POT_CX, POT_BASE + 13, 133), color: '#26211f' });
  marks.push({ path: `M${POT_CX - 133} ${POT_BASE}L${POT_CX - 133} ${POT_BASE + 13}A133 26.6 0 0 0 ${POT_CX + 133} ${POT_BASE + 13}L${POT_CX + 133} ${POT_BASE}Z`, color: '#312b29' });
  marks.push({ path: ring(POT_CX, POT_BASE, 133), color: '#4a4440' });
  marks.push({ path: ring(POT_CX, POT_BASE, 126), color: '#3b3633' });
  let ticks = '';
  for (let k = 0; k < 10; k++) {
    const a = s.theta + k * Math.PI / 5;
    for (const rr of [108, 122]) ticks += `${k % 1 === 0 && rr === 108 ? 'M' : 'L'}${f2(POT_CX + Math.sin(a) * rr)} ${f2(POT_BASE + Math.cos(a) * rr * POT_K)}`;
  }
  let tk = '';
  for (let k = 0; k < 10; k++) { const a = s.theta + k * Math.PI / 5; if (Math.cos(a) < -0.15) continue; tk += `M${f2(POT_CX + Math.sin(a) * 114)} ${f2(POT_BASE + Math.cos(a) * 114 * POT_K)}L${f2(POT_CX + Math.sin(a) * 124)} ${f2(POT_BASE + Math.cos(a) * 124 * POT_K)}`; }
  if (tk) marks.push({ path: tk, color: '#7a726b', stroke: 2.2, cap: 'round', alpha: 0.7 });
  marks.push({ path: ring(POT_CX, POT_BASE + 2, base * 1.12), color: '#000000', alpha: 0.28 });
  // Body silhouette (base colour under the strips hides seams)
  let sil = `M${f2(g.cx[0] - base)} ${f2(g.sy[0])}A${f2(base)} ${f2(base * POT_K)} 0 0 0 ${f2(g.cx[0] + base)} ${f2(g.sy[0])}`;
  for (let i = 1; i < n; i++) sil += `L${f2(g.cx[i] + r[i])} ${f2(g.sy[i])}`;
  sil += `A${f2(top)} ${f2(top * POT_K)} 0 0 1 ${f2(g.cx[n - 1] - top)} ${f2(g.sy[n - 1])}`;
  for (let i = n - 2; i >= 0; i--) sil += `L${f2(g.cx[i] - r[i])} ${f2(g.sy[i])}`;
  marks.push({ path: sil + 'Z', color: hex(SHADE) });
  // Strips between neighbouring rings
  for (let i = 0; i < n - 1; i++) {
    const a = r[i], b = r[i + 1], xa = g.cx[i], xb = g.cx[i + 1], ya = g.sy[i], yb = g.sy[i + 1];
    const slope = (b - a) / Math.max(0.5, ya - yb);
    const prev = r[Math.max(0, i - 1)], next = r[Math.min(n - 1, i + 2)];
    const curve = prev - a - b + next;
    let k = 1 - 0.55 * Math.max(-1, Math.min(1, slope)) + Math.max(-0.2, Math.min(0.2, -curve * 0.09));
    k = Math.max(0.6, Math.min(1.3, k));
    const hl = Math.max(0.26, Math.min(0.44, 0.35 + 0.1 * Math.max(-1, Math.min(1, slope))));
    const wet = (s.wet[i] + s.wet[i + 1]) / 2;
    const spec = mix(mul(LIGHT, k), SPEC, Math.min(1, wet * 0.95));
    const stops: [number, string][] = [
      [0, hex(mul(DARK, k))], [0.08, hex(mul(SHADE, k))], [hl - 0.14, hex(mul(BASE, k))],
      [hl - 0.05, hex(mul(LIGHT, k))], [hl, hex(spec)], [hl + 0.05, hex(mul(LIGHT, k))],
      [hl + 0.3, hex(mul(BASE, k * 0.92))], [0.82, hex(mul(SHADE, k * 0.9))], [0.94, hex(mul(DARK, k * 0.9))], [1, hex(mul(DARKER, k))],
    ];
    const x0 = Math.min(xa - a, xb - b), x1 = Math.max(xa + a, xb + b);
    const yl = ya + 0.9;
    const path = `M${f2(xa - a)} ${f2(yl)}A${f2(a)} ${f2(a * POT_K)} 0 0 0 ${f2(xa + a)} ${f2(yl)}L${f2(xb + b)} ${f2(yb)}A${f2(b)} ${f2(b * POT_K)} 0 0 1 ${f2(xb - b)} ${f2(yb)}Z`;
    marks.push({ path, grad: { x0, x1, stops } });
  }
  // Grog flecks that turn with the clay
  let light = '', dark = '';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let j = 0; j < 150; j++) {
    const u = rnd() * (n - 1), a0 = rnd() * Math.PI * 2, big = rnd() > 0.7;
    const i = Math.floor(u), t = u - i, j2 = Math.min(n - 1, i + 1);
    const rr = r[i] + (r[j2] - r[i]) * t, xc = g.cx[i] + (g.cx[j2] - g.cx[i]) * t, yc = g.sy[i] + (g.sy[j2] - g.sy[i]) * t;
    const al = a0 + s.theta;
    if (Math.cos(al) < 0.05) continue;
    const x = xc + Math.sin(al) * rr, y = yc + Math.cos(al) * rr * POT_K;
    const seg = `M${f2(x)} ${f2(y)}l${big ? 0.9 : 0.4} 0`;
    if (big) dark += seg; else light += seg;
  }
  marks.push({ path: dark, color: '#3d2116', stroke: 1.5, cap: 'round', alpha: 0.5 });
  marks.push({ path: light, color: '#e8c3a9', stroke: 1.2, cap: 'round', alpha: 0.4 });
  // Rim: outer top, wall, dark opening, wet highlight
  const ty = g.sy[n - 1], tx = g.cx[n - 1], wall = Math.min(top * 0.8, 15), inner = Math.max(5, top - wall);
  marks.push({ path: ring(tx, ty, top), grad: { x0: tx - top, x1: tx + top, stops: [[0, hex(SHADE)], [0.3, hex(mix(LIGHT, SPEC, s.wet[n - 1] * 0.5))], [0.62, hex(BASE)], [1, hex(DARK)]] } });
  marks.push({ path: ring(tx, ty + 0.6, inner), grad: { x0: tx - inner, x1: tx + inner, stops: [[0, hex(DARKER)], [0.55, '#2c1710'], [1, hex(DARK)]] } });
  marks.push({ path: `M${f2(tx - top + 1)} ${f2(ty)}A${f2(top - 1)} ${f2((top - 1) * POT_K)} 0 0 0 ${f2(tx + top - 1)} ${f2(ty)}`, color: '#ffe9d8', stroke: 1.2, alpha: 0.35 + 0.35 * s.wet[n - 1] });
  return marks;
}
