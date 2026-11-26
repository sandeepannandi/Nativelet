/*
  Roulette wheel drawing. Turns the physics world into a flat draw list that the Skia component and the
  Canvas2D web preview both paint, so the two always show the same picture.

  The bowl is real 3D geometry projected with a camera looking down at about 45 degrees: the ball track,
  shelf, rotor cone and pocket ring all use the same height profile the physics rolls on. Every facet is
  lit by one lamp (diffuse plus a glossy lacquer / brass highlight), so the highlight on the track stays
  put while the pockets and frets turn through it. Layers, back to front: still back (table, track, shelf,
  diamonds, rotor, turret), the turning wheel and the ball, still front (the near rim hides what is
  behind it), and the launch-power overlay.
*/
import {
  BALL_R, DEFLECTOR_H, DELTA, FRET_H, ORDER, POCKETS, POCKET_IN, POCKET_OUT, SHELF_IN, TRACK_IN,
  ballHeight, colorOf, deflectorPolys, height, slope, type RouletteWorld,
} from "./rouletteMath";

export const WHEEL_W = 340;
export const WHEEL_H = 336;

export type Grad = { x0: number; y0: number; x1: number; y1: number; c0: string; c1: string };
export type RGrad = { cx: number; cy: number; r: number; c0: string; c1: string };
export type Item =
  | { k: "poly"; pts: number[]; color: string; alpha?: number; grad?: Grad; rgrad?: RGrad; blur?: number; stroke?: number; closed?: boolean }
  | { k: "circ"; x: number; y: number; r: number; color: string; alpha?: number; rgrad?: RGrad; blur?: number };

type V3 = [number, number, number];

/* ---------- camera ---------- */
const EYE: V3 = [0, 3.2, 1.95];
const TARGET: V3 = [0, 0.1, 0.02];
const FOCAL = 494;
const CX = WHEEL_W / 2;
const CY = 142;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const FWD = norm(sub(TARGET, EYE));
const RIGHT = norm(cross(FWD, [0, 1, 0]));
const UPV = cross(RIGHT, FWD);

function project(p: V3): [number, number, number] {
  const d = sub(p, EYE);
  const z = dot(d, FWD);
  const s = FOCAL / z;
  return [CX + dot(d, RIGHT) * s, CY - dot(d, UPV) * s, z];
}
/** Bowl plane (x, y) at height h to a 3D point. */
const P3 = (x: number, y: number, h: number): V3 => [x, h, y];
const scr = (x: number, y: number, h: number) => project(P3(x, y, h));

/* ---------- light and materials ---------- */
const LIGHT: V3 = norm([-0.55, 0.78, 0.3]);
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (r: number, g: number, b: number) => `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`;
const rgba = (r: number, g: number, b: number, a: number) => `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${a})`;

type Mat = { base: V3; gloss: number; spec: number; amb: number };
const WALNUT: Mat = { base: [104, 58, 28], gloss: 70, spec: 210, amb: 0.34 };
const LACQUER: Mat = { base: [78, 40, 18], gloss: 120, spec: 250, amb: 0.3 };
const BRASS: Mat = { base: [190, 142, 62], gloss: 46, spec: 150, amb: 0.36 };

function shade(m: Mat, n: V3, p: V3, tint = 1): string {
  const v = norm(sub(EYE, p));
  const h = norm([LIGHT[0] + v[0], LIGHT[1] + v[1], LIGHT[2] + v[2]]);
  const diff = Math.max(0, dot(n, LIGHT));
  const spec = Math.pow(Math.max(0, dot(n, h)), m.gloss) * m.spec;
  const k = (m.amb + 0.95 * diff) * tint;
  return rgb(m.base[0] * k + spec, m.base[1] * k + spec * 0.92, m.base[2] * k + spec * 0.78);
}
const surfNormal = (s: number, phi: number): V3 => norm([-s * Math.cos(phi), 1, -s * Math.sin(phi)]);
const grain = (a: number, r: number) => 0.965 + 0.035 * Math.sin(a * 23 + r * 41) * Math.cos(a * 7 - r * 13) + 0.02 * Math.sin(a * 91 + r * 9);

/* ---------- builders ---------- */
function ring(items: Item[], r0: number, r1: number, n: number, hAt: (r: number) => number, mat: Mat, opts: { bands?: number; cull?: boolean; skew?: number; normalAt?: (r: number, phi: number) => V3; tintAt?: (a: number, r: number) => number } = {}) {
  const bands = opts.bands ?? 4;
  const quads: { depth: number; it: Item }[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    for (let j = 0; j < bands; j++) {
      const ra = r0 + ((r1 - r0) * j) / bands, rb = r0 + ((r1 - r0) * (j + 1)) / bands, rm = (ra + rb) / 2;
      const s = (hAt(rb) - hAt(ra)) / (rb - ra);
      const nrm = opts.normalAt ? opts.normalAt(rm, am) : surfNormal(s, am);
      const c = P3(rm * Math.cos(am), rm * Math.sin(am), hAt(rm));
      if (opts.cull !== false && dot(nrm, sub(EYE, c)) <= 0) continue;
      const pts: number[] = [];
      for (const [r, a] of [[ra, a0], [rb, a0], [rb, a1], [ra, a1]] as [number, number][]) {
        const q = scr(r * Math.cos(a), r * Math.sin(a), hAt(r));
        pts.push(q[0], q[1]);
      }
      const tint = (opts.tintAt ? opts.tintAt(am, rm) : 1) * grain(am, rm);
      quads.push({ depth: project(c)[2], it: { k: "poly", pts, color: shade(mat, nrm, c, tint) } });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) items.push(q.it);
}

function wall(items: Item[], r: number, h0: number, h1: number, n: number, mat: Mat, inward: boolean) {
  const quads: { depth: number; it: Item }[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const nrm: V3 = inward ? [-Math.cos(am), 0, -Math.sin(am)] : [Math.cos(am), 0, Math.sin(am)];
    const c = P3(r * Math.cos(am), r * Math.sin(am), (h0 + h1) / 2);
    if (dot(nrm, sub(EYE, c)) <= 0) continue;
    const pts: number[] = [];
    for (const [a, h] of [[a0, h1], [a1, h1], [a1, h0], [a0, h0]] as [number, number][]) {
      const q = scr(r * Math.cos(a), r * Math.sin(a), h);
      pts.push(q[0], q[1]);
    }
    quads.push({ depth: project(c)[2], it: { k: "poly", pts, color: shade(mat, nrm, c, grain(am, r)) } });
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) items.push(q.it);
}

function ellipse3D(cx: number, cy: number, h: number, rad: number, n = 14): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = scr(cx + rad * Math.cos(a), cy + rad * Math.sin(a), h);
    pts.push(q[0], q[1]);
  }
  return pts;
}

/* ---------- geometry of the bowl ---------- */
const RIM_IN = 0.985;
const RIM_OUT = 1.1;
const RIM_Y = height(0.985) + 0.06;
const BASE_Y = -0.06;
const TURRET_BASE = height(POCKET_IN);
const TURRET_TOP = TURRET_BASE + 0.27;
const turretH = (r: number) => (r >= POCKET_IN ? height(r) : TURRET_BASE + ((POCKET_IN - r) / (POCKET_IN - 0.1)) * (TURRET_TOP - TURRET_BASE));
const rotorH = (r: number) => height(r);

export function staticScene(): { back: Item[]; front: Item[] } {
  const back: Item[] = [];
  const front: Item[] = [];

  // table and the shadow the bowl throws on it
  back.push({ k: "poly", pts: [0, 0, WHEEL_W, 0, WHEEL_W, WHEEL_H, 0, WHEEL_H], color: "#17110d", grad: { x0: 0, y0: 0, x1: WHEEL_W, y1: WHEEL_H, c0: "#241a13", c1: "#0d0907" } });
  back.push({ k: "poly", pts: ellipse3D(0.1, 0.14, BASE_Y, 1.3, 40), color: "#000", alpha: 0.6, blur: 22 });
  back.push({ k: "poly", pts: ellipse3D(0, 0, BASE_Y, 1.2, 40), color: "#000", alpha: 0.35, blur: 8 });

  // outer wall of the bowl (near side only) goes in front
  wall(front, RIM_OUT, BASE_Y, RIM_Y, 160, WALNUT, false);
  // base ring of brass at the foot
  wall(front, RIM_OUT + 0.012, BASE_Y, BASE_Y + 0.05, 90, BRASS, false);

  // ball track: a curved wall lit as a lacquered walnut bowl
  ring(back, TRACK_IN, RIM_IN, 200, height, LACQUER, { bands: 8 });
  // brass trim where the track meets the shelf
  ring(back, TRACK_IN - 0.012, TRACK_IN + 0.004, 96, height, BRASS, { bands: 1, cull: false });
  // shelf
  ring(back, SHELF_IN + 0.01, TRACK_IN - 0.012, 144, height, WALNUT, { bands: 3, tintAt: () => 1.0 });

  // deflectors: brass diamonds standing on the shelf
  const polys = deflectorPolys().map((poly) => ({ poly, depth: project(P3(poly[0][0] * 0.5 + poly[2][0] * 0.5, poly[0][1] * 0.5 + poly[2][1] * 0.5, height(0.645)))[2] }));
  polys.sort((a, b) => b.depth - a.depth);
  for (const { poly } of polys) {
    const cxm = (poly[0][0] + poly[2][0]) / 2, cym = (poly[0][1] + poly[2][1]) / 2;
    back.push({ k: "poly", pts: ellipse3D(cxm - 0.04, cym + 0.015, height(0.645), 0.05, 12), color: "#000", alpha: 0.45, blur: 3 });
    const h0 = height(0.645);
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const nrm = norm([ey, 0, -ex]); // outward for this winding, flipped below if needed
      const mid = P3((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, h0 + DEFLECTOR_H / 2);
      const outward: V3 = [mid[0] - cxm, 0, mid[2] - cym];
      const nn: V3 = dot(nrm, outward) < 0 ? [-nrm[0], 0, -nrm[2]] : nrm;
      if (dot(nn, sub(EYE, mid)) <= 0) continue;
      const a = scr(p[0], p[1], h0), b = scr(q[0], q[1], h0), c = scr(q[0], q[1], h0 + DEFLECTOR_H), d = scr(p[0], p[1], h0 + DEFLECTOR_H);
      back.push({ k: "poly", pts: [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], color: shade(BRASS, nn, mid) });
    }
    const top = poly.map((p) => scr(p[0], p[1], h0 + DEFLECTOR_H));
    const tp: number[] = [];
    top.forEach((t) => tp.push(t[0], t[1]));
    back.push({ k: "poly", pts: tp, color: shade(BRASS, [0, 1, 0], P3(cxm, cym, h0 + DEFLECTOR_H)), grad: { x0: tp[0], y0: tp[1], x1: tp[4], y1: tp[5], c0: "#f6dc9c", c1: "#a57a30" } });
  }

  // rotor cone (rotationally plain; the markings that turn are drawn with the wheel)
  ring(back, POCKET_OUT, SHELF_IN + 0.01, 144, rotorH, WALNUT, { bands: 3, tintAt: (a) => 0.95 + 0.1 * Math.sin(a * 2) });
  ring(back, POCKET_OUT - 0.006, POCKET_OUT + 0.01, 96, rotorH, BRASS, { bands: 1, cull: false });
  ring(back, SHELF_IN, SHELF_IN + 0.014, 96, rotorH, BRASS, { bands: 1, cull: false });

  // pocket well floor underlay (dark) so thin gaps between pockets never show the background
  ring(back, POCKET_IN, POCKET_OUT, 72, rotorH, { base: [12, 10, 10], gloss: 10, spec: 0, amb: 1 }, { bands: 1, cull: false });

  // turret: polished brass cone with a lamp highlight
  const tN = 120;
  const tq: { depth: number; it: Item }[] = [];
  for (let i = 0; i < tN; i++) {
    const a0 = (i / tN) * Math.PI * 2, a1 = ((i + 1) / tN) * Math.PI * 2, am = (a0 + a1) / 2;
    for (let j = 0; j < 8; j++) {
      const ra = POCKET_IN - ((POCKET_IN - 0.1) * j) / 8, rb = POCKET_IN - ((POCKET_IN - 0.1) * (j + 1)) / 8;
      const s = (turretH(rb) - turretH(ra)) / (rb - ra);
      const nrm = surfNormal(s, am);
      const rm = (ra + rb) / 2;
      const c = P3(rm * Math.cos(am), rm * Math.sin(am), turretH(rm));
      const pts: number[] = [];
      for (const [r, a] of [[ra, a0], [rb, a0], [rb, a1], [ra, a1]] as [number, number][]) {
        const q = scr(r * Math.cos(a), r * Math.sin(a), turretH(r));
        pts.push(q[0], q[1]);
      }
      tq.push({ depth: project(c)[2], it: { k: "poly", pts, color: shade({ ...BRASS, gloss: 30, spec: 120 }, nrm, c, 1) } });
    }
  }
  tq.sort((a, b) => b.depth - a.depth);
  tq.forEach((q) => back.push(q.it));
  const dome = scr(0, 0, TURRET_TOP);
  back.push({ k: "circ", x: dome[0], y: dome[1], r: 0.105 * FOCAL / dome[2], color: "#e8c878", rgrad: { cx: dome[0] - 3, cy: dome[1] - 3, r: 0.105 * FOCAL / dome[2] * 1.15, c0: "#fff4d0", c1: "#9c7226" } });

  // near rim top (flat lacquered walnut) goes in front of the ball
  ring(front, RIM_IN, RIM_OUT, 120, () => RIM_Y, WALNUT, { bands: 3, normalAt: () => [0, 1, 0], cull: false });
  // chamfer and brass inlay ring on the rim
  ring(front, RIM_IN - 0.006, RIM_IN + 0.02, 120, (r) => RIM_Y - (r < RIM_IN + 0.01 ? 0.02 : 0), BRASS, { bands: 1, normalAt: () => [0, 1, 0], cull: false });
  ring(front, 1.045, 1.055, 120, () => RIM_Y + 0.0005, BRASS, { bands: 1, normalAt: () => [0, 1, 0], cull: false });
  return { back, front };
}

/* ---------- the turning wheel and the ball ---------- */
const PALETTE = {
  red: [168, 22, 28] as V3,
  black: [22, 22, 26] as V3,
  green: [18, 118, 52] as V3,
};

export type FrameOpts = { power?: number; charging?: boolean };

export function buildFrame(w: RouletteWorld, opts: FrameOpts = {}): { dyn: Item[]; overlay: Item[] } {
  const dyn: Item[] = [];
  const overlay: Item[] = [];

  // rotor studs turn with the wheel
  for (let i = 0; i < POCKETS; i++) {
    const a = w.theta + (i + 0.5) * DELTA;
    const r = 0.53;
    const s = scr(r * Math.cos(a), r * Math.sin(a), rotorH(r) + 0.004);
    const nrm = surfNormal(slope(r), a);
    dyn.push({ k: "circ", x: s[0], y: s[1], r: 1.55, color: shade(BRASS, nrm, P3(r * Math.cos(a), r * Math.sin(a), rotorH(r))) });
    dyn.push({ k: "circ", x: s[0] - 0.4, y: s[1] - 0.5, r: 0.5, color: "#fff2c8", alpha: 0.8 });
  }

  // pockets: order by depth so the near frets overlap the far floors correctly
  const pk: { depth: number; items: Item[] }[] = [];
  for (let i = 0; i < POCKETS; i++) {
    const n = ORDER[i];
    const col = PALETTE[colorOf(n)];
    const a0 = w.theta + i * DELTA, a1 = a0 + DELTA, am = (a0 + a1) / 2;
    const rm = (POCKET_IN + POCKET_OUT) / 2;
    const c3 = P3(rm * Math.cos(am), rm * Math.sin(am), rotorH(rm));
    const nrm = surfNormal(slope(rm), am);
    const pts: number[] = [];
    const arcs: [number, number][] = [];
    for (const a of [a0, (a0 + a1) / 2, a1]) arcs.push([POCKET_OUT, a]);
    for (const a of [a1, (a0 + a1) / 2, a0]) arcs.push([POCKET_IN, a]);
    for (const [r, a] of arcs) {
      const q = scr(r * Math.cos(a), r * Math.sin(a), rotorH(r));
      pts.push(q[0], q[1]);
    }
    const lam = 0.38 + 0.95 * Math.max(0, dot(nrm, LIGHT));
    const sheen = Math.pow(Math.max(0, dot(nrm, norm([LIGHT[0] + 0, LIGHT[1] + 0.9, LIGHT[2] + 0.7]))), 30) * 90;
    const base = rgb(col[0] * lam + sheen, col[1] * lam + sheen, col[2] * lam + sheen);
    const lo = scr(POCKET_IN * Math.cos(am), POCKET_IN * Math.sin(am), rotorH(POCKET_IN));
    const hi = scr(POCKET_OUT * Math.cos(am), POCKET_OUT * Math.sin(am), rotorH(POCKET_OUT));
    const items: Item[] = [
      { k: "poly", pts, color: base, grad: { x0: hi[0], y0: hi[1], x1: lo[0], y1: lo[1], c0: rgb(col[0] * lam * 1.15 + sheen, col[1] * lam * 1.15 + sheen, col[2] * lam * 1.15 + sheen), c1: rgb(col[0] * lam * 0.55, col[1] * lam * 0.55, col[2] * lam * 0.55) } },
    ];
    // fret on the leading edge of the pocket: brass ridge, bright on the lit side
    const f0 = scr(POCKET_IN * Math.cos(a0), POCKET_IN * Math.sin(a0), rotorH(POCKET_IN) + FRET_H);
    const f1 = scr(POCKET_OUT * Math.cos(a0), POCKET_OUT * Math.sin(a0), rotorH(POCKET_OUT) + FRET_H);
    const g0 = scr(POCKET_IN * Math.cos(a0), POCKET_IN * Math.sin(a0), rotorH(POCKET_IN));
    const g1 = scr(POCKET_OUT * Math.cos(a0), POCKET_OUT * Math.sin(a0), rotorH(POCKET_OUT));
    const fn: V3 = [-Math.sin(a0), 0.2, Math.cos(a0)];
    const lit = Math.max(0.35, 0.55 + 0.7 * dot(norm(fn), LIGHT));
    items.push({ k: "poly", pts: [g0[0] + 1, g0[1] + 1.5, g1[0] + 1, g1[1] + 1.5], color: "#000", alpha: 0.35, stroke: 1.8, closed: false });
    items.push({ k: "poly", pts: [f0[0], f0[1], f1[0], f1[1]], color: rgb(206 * lit, 156 * lit, 66 * lit), stroke: 1.7, closed: false });
    items.push({ k: "poly", pts: [f0[0], f0[1] - 0.5, f1[0], f1[1] - 0.5], color: rgb(255 * Math.min(1, lit + 0.1), 238 * Math.min(1, lit + 0.1), 190 * Math.min(1, lit + 0.1)), alpha: 0.7, stroke: 0.6, closed: false });
    items.push({ k: "circ", x: f1[0], y: f1[1], r: 1.5, color: rgb(228 * lit, 186 * lit, 96 * lit) });
    pk.push({ depth: project(c3)[2], items });
  }
  pk.sort((a, b) => b.depth - a.depth);
  pk.forEach((p) => dyn.push(...p.items));

  // cross handle on the turret
  for (const k of [0, 1]) {
    const a = w.theta + (k * Math.PI) / 2 + 0.3;
    const e: number[] = [];
    for (const rr of [-0.27, -0.13, 0, 0.13, 0.27]) {
      const r = Math.abs(rr);
      const h = TURRET_TOP + 0.018 - r * 0.55;
      const q = scr(Math.cos(a) * rr, Math.sin(a) * rr, h);
      e.push(q[0], q[1]);
    }
    dyn.push({ k: "poly", pts: e.map((v, i) => (i % 2 ? v + 2.2 : v + 1.2)), color: "#000", alpha: 0.35, stroke: 3.6, closed: false });
    dyn.push({ k: "poly", pts: e, color: "#c99a45", stroke: 3.4, closed: false });
    dyn.push({ k: "poly", pts: e.map((v, i) => (i % 2 ? v - 0.9 : v - 0.3)), color: "#fff0c0", alpha: 0.75, stroke: 1, closed: false });
    for (const sgn of [-1, 1]) {
      const r = 0.27;
      const q = scr(Math.cos(a) * r * sgn, Math.sin(a) * r * sgn, TURRET_TOP + 0.018 - r * 0.55 + 0.012);
      const rad = 0.034 * FOCAL / q[2];
      dyn.push({ k: "circ", x: q[0], y: q[1], r: rad, color: "#d9ac55", rgrad: { cx: q[0] - rad * 0.35, cy: q[1] - rad * 0.4, r: rad * 1.2, c0: "#fff3cf", c1: "#8a6420" } });
    }
  }
  const top = scr(0, 0, TURRET_TOP + 0.06);
  const tr = 0.045 * FOCAL / top[2];
  dyn.push({ k: "circ", x: top[0], y: top[1], r: tr, color: "#e0b45a", rgrad: { cx: top[0] - tr * 0.35, cy: top[1] - tr * 0.4, r: tr * 1.3, c0: "#fffbe6", c1: "#8a6420" } });

  // ball
  const b = w.ball;
  if (b.live) {
    const r = Math.hypot(b.x, b.y) || 1e-9;
    const hs = height(r);
    const s = slope(r);
    const nrm = surfNormal(s, Math.atan2(b.y, b.x));
    const surf = P3(b.x, b.y, hs);
    const cen: V3 = [surf[0] + nrm[0] * BALL_R, surf[1] + nrm[1] * BALL_R + b.z, surf[2] + nrm[2] * BALL_R];
    const pc = project(cen);
    const rad = (BALL_R * 1.25 * FOCAL) / pc[2];
    // streak behind a fast ball
    const speed = Math.hypot(b.vx, b.vy);
    const t = w.trail;
    if (speed > 1.4 && b.z < 0.05) {
      const n = t.length / 2;
      for (let i = Math.max(0, n - 7); i < n - 1; i++) {
        const q0 = scr(t[i * 2], t[i * 2 + 1], height(Math.hypot(t[i * 2], t[i * 2 + 1])) + BALL_R);
        const q1 = scr(t[i * 2 + 2], t[i * 2 + 3], height(Math.hypot(t[i * 2 + 2], t[i * 2 + 3])) + BALL_R);
        const f = (i - (n - 8)) / 7;
        dyn.push({ k: "poly", pts: [q0[0], q0[1], q1[0], q1[1]], color: "#e8edf2", alpha: Math.min(0.16, 0.025 * speed) * Math.max(0, f), stroke: rad * 1.5, closed: false });
      }
    }
    // shadow: cast along the lamp direction, softer and fainter the higher the ball is
    const lift = BALL_R + b.z;
    const sx = b.x - (LIGHT[0] / LIGHT[1]) * lift, sy = b.y - (LIGHT[2] / LIGHT[1]) * lift;
    const sr = Math.hypot(sx, sy) || 1e-9;
    const spin = ellipse3D(sx, sy, height(sr) + 0.001, BALL_R * 1.05, 14);
    dyn.push({ k: "poly", pts: spin, color: "#000", alpha: Math.max(0.2, 0.6 - b.z * 9), blur: 1.5 + b.z * 90 });
    // chrome sphere: dark rim, warm wood reflected low, window highlight high left
    dyn.push({ k: "circ", x: pc[0], y: pc[1], r: rad, color: "#9aa2ab", rgrad: { cx: pc[0] - rad * 0.2, cy: pc[1] - rad * 0.25, r: rad * 1.15, c0: "#e9eef3", c1: "#2c3138" } });
    dyn.push({ k: "circ", x: pc[0] + rad * 0.28, y: pc[1] + rad * 0.5, r: rad * 0.62, color: "#b57a3c", alpha: 0.5, rgrad: { cx: pc[0] + rad * 0.28, cy: pc[1] + rad * 0.5, r: rad * 0.62, c0: "#c98a46", c1: "rgba(120,70,30,0)" } });
    dyn.push({ k: "circ", x: pc[0] - rad * 0.36, y: pc[1] - rad * 0.4, r: rad * 0.3, color: "#ffffff", alpha: 0.95, rgrad: { cx: pc[0] - rad * 0.36, cy: pc[1] - rad * 0.4, r: rad * 0.3, c0: "#ffffff", c1: "rgba(255,255,255,0)" } });
    dyn.push({ k: "circ", x: pc[0] + rad * 0.5, y: pc[1] - rad * 0.1, r: rad * 0.1, color: "#ffffff", alpha: 0.55 });
  }

  // launch power: a row of ticks on the near rim fills as the finger drags
  if (opts.charging) {
    const p = Math.max(0, Math.min(1, opts.power ?? 0));
    const N = 26;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (0.18 + (0.64 * i) / (N - 1));
      const q0 = scr(1.0 * Math.cos(a), 1.0 * Math.sin(a), RIM_Y + 0.003);
      const q1 = scr(1.085 * Math.cos(a), 1.085 * Math.sin(a), RIM_Y + 0.003);
      const on = i / (N - 1) <= p + 1e-6 && p > 0;
      overlay.push({ k: "poly", pts: [q0[0], q0[1], q1[0], q1[1]], color: on ? (i / N > 0.75 ? "#ff6a3d" : "#ffc247") : "#ffffff", alpha: on ? 1 : 0.22, stroke: 2.2, closed: false });
    }
  }
  return { dyn, overlay };
}
export { TRACK_IN, SHELF_IN };
