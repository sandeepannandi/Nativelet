/* Camera, lighting and the draw list for the dice tray. Pure TypeScript: the
   same list is painted by the Skia component and by the web Canvas2D preview. */
import { FACE_AXES, qMat, type DiceWorld, type Die, type V3 } from "./diceMath";

export const TRAY_W = 340;
export const TRAY_H = 460;

export type Item =
  | { k: "poly"; pts: number[]; color: string; alpha?: number; blur?: number; grad?: { x0: number; y0: number; x1: number; y1: number; c0: string; c1: string } }
  | { k: "dots"; pts: number[]; color: string; size: number; alpha: number }
  | { k: "line"; pts: number[]; color: string; width: number; alpha?: number };

/* ---------- camera ---------- */
const EYE: V3 = [0, 11.6, 9.4];
const TARGET: V3 = [0, 0, 0.1];
const FOCAL = 500;
const CX = TRAY_W / 2;
const CY = TRAY_H * 0.47;

function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dotv = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossv = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const FWD = norm(sub(TARGET, EYE));
const RIGHT = norm(crossv(FWD, [0, 1, 0]));
const UPV = crossv(RIGHT, FWD);

export function project(p: V3): [number, number, number] {
  const d = sub(p, EYE);
  const z = dotv(d, FWD);
  const s = FOCAL / z;
  return [CX + dotv(d, RIGHT) * s, CY - dotv(d, UPV) * s, z];
}

/** The point on the horizontal plane y = planeY under a screen position. */
export function unproject(sx: number, sy: number, planeY: number): V3 {
  const dir = norm([
    FWD[0] + RIGHT[0] * ((sx - CX) / FOCAL) - UPV[0] * ((sy - CY) / FOCAL),
    FWD[1] + RIGHT[1] * ((sx - CX) / FOCAL) - UPV[1] * ((sy - CY) / FOCAL),
    FWD[2] + RIGHT[2] * ((sx - CX) / FOCAL) - UPV[2] * ((sy - CY) / FOCAL),
  ]);
  const t = (planeY - EYE[1]) / dir[1];
  return [EYE[0] + dir[0] * t, planeY, EYE[2] + dir[2] * t];
}

/** World units per pixel on the felt near the middle of the tray. */
export function worldPerPixel(): number {
  const a = unproject(CX, CY, 0);
  const b = unproject(CX + 1, CY, 0);
  return Math.abs(b[0] - a[0]);
}

/* ---------- light and colour ---------- */
const LIGHT: V3 = [-4.5, 13, 6];
const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.max(0, Math.min(255, Math.round(r)))},${Math.max(0, Math.min(255, Math.round(g)))},${Math.max(0, Math.min(255, Math.round(b)))})`;

type Rgb = [number, number, number];
const DIE_BASE: Rgb = [186, 22, 30];
const PIP_BASE: Rgb = [246, 240, 226];
const FELT_BOUNCE: Rgb = [22, 78, 46];

function lit(base: Rgb, p: V3, n: V3, gloss: number): Rgb {
  const l = norm(sub(LIGHT, p));
  const v = norm(sub(EYE, p));
  const h = norm([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
  const nl = Math.max(0, dotv(n, l));
  const sky = 0.5 + 0.5 * n[1];
  const diff = 0.2 + 0.82 * nl + 0.18 * sky;
  const spec = gloss * Math.pow(Math.max(0, dotv(n, h)), 64);
  const rim = gloss * 0.35 * Math.pow(1 - Math.max(0, dotv(n, v)), 3) * sky;
  const bounce = Math.max(0, -n[1]) * 0.55 + 0.1 * (1 - Math.abs(n[1]));
  // A glossy red acrylic die lets some light through: lift the shadow side toward warm red.
  const glow = 0.11 * gloss;
  return [
    base[0] * (diff + glow) + FELT_BOUNCE[0] * bounce + 255 * (spec + rim * 0.5),
    base[1] * (diff + glow * 0.4) + FELT_BOUNCE[1] * bounce + 255 * (spec + rim * 0.5),
    base[2] * (diff + glow * 0.4) + FELT_BOUNCE[2] * bounce + 255 * (spec + rim * 0.5),
  ];
}

/* ---------- felt, rails (static) ---------- */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quad(a: V3, b: V3, c: V3, d: V3, color: string, extra: Partial<Item> = {}): Item {
  const pa = project(a), pb = project(b), pc = project(c), pd = project(d);
  return { k: "poly", pts: [pa[0], pa[1], pb[0], pb[1], pc[0], pc[1], pd[0], pd[1]], color, ...extra } as Item;
}

const RAIL_H = 0.7;
const RAIL_W = 1.1;

export function staticScene(halfX: number, halfZ: number): { back: Item[]; front: Item[] } {
  const back: Item[] = [];
  const front: Item[] = [];
  const ox = halfX + RAIL_W, oz = halfZ + RAIL_W;
  // Table surface outside the tray.
  back.push({ k: "poly", pts: [0, 0, TRAY_W, 0, TRAY_W, TRAY_H, 0, TRAY_H], color: "rgb(26,18,13)" });
  // Rail tops (padded leather) behind the felt: far rail, left, right.
  const topY = RAIL_H;
  const leatherA = "rgb(70,44,30)";
  const leatherB = "rgb(40,24,16)";
  const rail = (a: V3, b: V3, c: V3, d: V3, c0 = leatherA, c1 = leatherB) => {
    const pa = project(a), pc = project(c);
    return quad(a, b, c, d, c0, { grad: { x0: pa[0], y0: pa[1], x1: pc[0], y1: pc[1], c0, c1 } });
  };
  back.push(rail([-ox, topY, -oz], [ox, topY, -oz], [ox, topY, -halfZ], [-ox, topY, -halfZ]));
  back.push(rail([-ox, topY, -oz], [-halfX, topY, -oz], [-halfX, topY, oz], [-ox, topY, oz]));
  back.push(rail([halfX, topY, -oz], [ox, topY, -oz], [ox, topY, oz], [halfX, topY, oz]));
  // Inner walls (felt-covered): far wall and the two sides.
  const wallFar0 = "rgb(30,92,58)", wallFar1 = "rgb(14,50,31)";
  const wf = [project([-halfX, topY, -halfZ]), project([halfX, topY, -halfZ])];
  back.push(quad([-halfX, 0, -halfZ], [halfX, 0, -halfZ], [halfX, topY, -halfZ], [-halfX, topY, -halfZ], wallFar0, { grad: { x0: 0, y0: project([0, 0, -halfZ])[1], x1: 0, y1: wf[0][1], c0: wallFar1, c1: wallFar0 } }));
  const wl = project([-halfX, 0, 0]), wl2 = project([-halfX, 0, -halfZ]);
  back.push(quad([-halfX, 0, -halfZ], [-halfX, 0, halfZ], [-halfX, topY, halfZ], [-halfX, topY, -halfZ], "rgb(22,70,43)", { grad: { x0: wl[0], y0: wl[1], x1: wl2[0], y1: wl2[1], c0: "rgb(25,80,49)", c1: "rgb(14,46,29)" } }));
  back.push(quad([halfX, 0, -halfZ], [halfX, 0, halfZ], [halfX, topY, halfZ], [halfX, topY, -halfZ], "rgb(18,58,36)", { grad: { x0: project([halfX, 0, 0])[0], y0: wl[1], x1: project([halfX, 0, -halfZ])[0], y1: wl2[1], c0: "rgb(20,64,40)", c1: "rgb(11,38,24)" } }));
  // Felt floor.
  const f0 = project([-halfX, 0, -halfZ]), f1 = project([halfX, 0, -halfZ]), f2 = project([halfX, 0, halfZ]), f3 = project([-halfX, 0, halfZ]);
  back.push({ k: "poly", pts: [f0[0], f0[1], f1[0], f1[1], f2[0], f2[1], f3[0], f3[1]], color: "rgb(31,98,60)", grad: { x0: 0, y0: f0[1], x1: 0, y1: f3[1], c0: "rgb(27,84,52)", c1: "rgb(36,112,69)" } });
  // Soft pool of light on the felt: stacked rings fake a blur on every renderer.
  for (let ring = 0; ring < 9; ring++) {
    const k = 1 - ring * 0.1;
    const lp: number[] = [];
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const p = project([-0.5 + Math.cos(t) * halfX * 0.95 * k, 0, 0.4 + Math.sin(t) * halfZ * 0.85 * k]);
      lp.push(p[0], p[1]);
    }
    back.push({ k: "poly", pts: lp, color: "rgb(130,220,160)", alpha: 0.035 });
  }
  // Felt nap: thousands of fibre specks in felt plane coordinates, projected.
  const rng = mulberry(77);
  const dark: number[] = [], light: number[] = [], mid: number[] = [];
  for (let i = 0; i < 4200; i++) {
    const p = project([(rng() * 2 - 1) * halfX, 0, (rng() * 2 - 1) * halfZ]);
    const r = rng();
    (r < 0.4 ? dark : r < 0.75 ? light : mid).push(p[0], p[1]);
  }
  back.push({ k: "dots", pts: dark, color: "rgb(8,40,22)", size: 1.1, alpha: 0.34 });
  back.push({ k: "dots", pts: light, color: "rgb(120,200,150)", size: 1.0, alpha: 0.2 });
  back.push({ k: "dots", pts: mid, color: "rgb(60,140,90)", size: 1.4, alpha: 0.16 });
  // Contact shadow where the wall meets the felt.
  const far = project([0, 0, -halfZ]);
  back.push({ k: "line", pts: [f0[0], far[1], f1[0], far[1]], color: "rgb(0,0,0)", width: 7, alpha: 0.35 });
  // Near rail top, in front of the dice.
  front.push(rail([-ox, topY, halfZ], [ox, topY, halfZ], [ox, topY, oz], [-ox, topY, oz], "rgb(78,50,34)", "rgb(54,34,22)"));
  // Light catching the rounded inner edge of the padding.
  const e0 = project([-halfX, topY, halfZ]), e1 = project([halfX, topY, halfZ]);
  front.push({ k: "line", pts: [e0[0], e0[1], e1[0], e1[1]], color: "rgb(150,104,72)", width: 2, alpha: 0.7 });
  const g0 = project([-halfX, topY, -halfZ]), g1 = project([halfX, topY, -halfZ]);
  back.push({ k: "line", pts: [g0[0], g0[1], g1[0], g1[1]], color: "rgb(150,104,72)", width: 2, alpha: 0.5 });
  return { back, front };
}

/* ---------- dice ---------- */
const BEVEL = 0.085;
const PIP_G = 0.235;
const PIP_R = 0.092;
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function hull(points: number[][]): number[][] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

const DIE_LIGHT_DIR: V3 = norm([-0.38, -1, -0.5]);

function shadowItems(d: Die, m: number[], out: Item[]) {
  const worldPts: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const c: V3 = [i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5];
    worldPts.push([
      d.p[0] + m[0] * c[0] + m[1] * c[1] + m[2] * c[2],
      d.p[1] + m[3] * c[0] + m[4] * c[1] + m[5] * c[2],
      d.p[2] + m[6] * c[0] + m[7] * c[1] + m[8] * c[2],
    ]);
  }
  const height = Math.max(0, d.p[1] - 0.5);
  // Directional shadow, longer and softer as the die rises.
  const cast = worldPts.map((p) => {
    const t = Math.max(0, p[1]) / -DIE_LIGHT_DIR[1];
    const q = project([p[0] + DIE_LIGHT_DIR[0] * t, 0.004, p[2] + DIE_LIGHT_DIR[2] * t]);
    return [q[0], q[1]];
  });
  const h1 = hull(cast).flat();
  const soft = 3 + height * 7;
  out.push({ k: "poly", pts: h1, color: "rgb(2,12,6)", alpha: Math.max(0.18, 0.42 - height * 0.08), blur: soft });
  // Red light bleeding off the acrylic onto the felt.
  out.push({ k: "poly", pts: hull(worldPts.map((p) => { const q = project([d.p[0] + (p[0] - d.p[0]) * 1.25, 0.002, d.p[2] + (p[2] - d.p[2]) * 1.25]); return [q[0], q[1]]; })).flat(), color: "rgb(170,26,34)", alpha: 0.14 * Math.max(0, 1 - height / 1.4), blur: 7 });
  // Ambient occlusion: tight dark contact under the die, fading quickly with height.
  const under = worldPts.map((p) => {
    const q = project([d.p[0] + (p[0] - d.p[0]) * 1.06, 0.003, d.p[2] + (p[2] - d.p[2]) * 1.06]);
    return [q[0], q[1]];
  });
  const ao = Math.max(0, 1 - height / 1.3);
  if (ao > 0.01) out.push({ k: "poly", pts: hull(under).flat(), color: "rgb(0,6,3)", alpha: 0.55 * ao, blur: 2.2 + height * 4 });
}

type Facet = { verts: V3[]; n: V3 };

function dieFacets(d: Die, m: number[]): { facets: Facet[]; pips: { c: V3; u: V3; v: V3; n: V3; r: number }[] } {
  const rot = (l: V3): V3 => [
    d.p[0] + m[0] * l[0] + m[1] * l[1] + m[2] * l[2],
    d.p[1] + m[3] * l[0] + m[4] * l[1] + m[5] * l[2],
    d.p[2] + m[6] * l[0] + m[7] * l[1] + m[8] * l[2],
  ];
  const rotN = (l: V3): V3 => [m[0] * l[0] + m[1] * l[1] + m[2] * l[2], m[3] * l[0] + m[4] * l[1] + m[5] * l[2], m[6] * l[0] + m[7] * l[1] + m[8] * l[2]];
  const facets: Facet[] = [];
  const pips: { c: V3; u: V3; v: V3; n: V3; r: number }[] = [];
  const H = 0.5, I = 0.5 - BEVEL;
  const mk = (xs: number[]): V3 => [xs[0], xs[1], xs[2]];
  // Faces.
  for (const f of FACE_AXES) {
    const a = f.axis, ta = (a + 1) % 3, tb = (a + 2) % 3;
    const corner = (su: number, sv: number): V3 => {
      const v = [0, 0, 0];
      v[a] = f.sign * H; v[ta] = su * I; v[tb] = sv * I;
      return rot(mk(v));
    };
    const nl = [0, 0, 0]; nl[a] = f.sign;
    facets.push({ verts: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], n: rotN(mk(nl)) });
    const ul = [0, 0, 0]; ul[ta] = 1;
    const vl = [0, 0, 0]; vl[tb] = 1;
    for (const [pu, pv] of PIP_LAYOUT[f.value]) {
      const cl = [0, 0, 0]; cl[a] = f.sign * H; cl[ta] = pu * PIP_G; cl[tb] = pv * PIP_G;
      pips.push({ c: rot(mk(cl)), u: rotN(mk(ul)), v: rotN(mk(vl)), n: rotN(mk(nl)), r: PIP_R });
    }
  }
  // Edge bevels: 12 strips between neighbouring faces.
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const p1 = (t: number) => { const v = [0, 0, 0]; v[a] = sa * H; v[b] = sb * I; v[c] = t; return rot(mk(v)); };
      const p2 = (t: number) => { const v = [0, 0, 0]; v[a] = sa * I; v[b] = sb * H; v[c] = t; return rot(mk(v)); };
      const nl = [0, 0, 0]; nl[a] = sa; nl[b] = sb;
      facets.push({ verts: [p1(-I), p1(I), p2(I), p2(-I)], n: rotN(norm(mk(nl))) });
    }
  }
  // Corner triangles.
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const va = rot([sx * H, sy * I, sz * I]), vb = rot([sx * I, sy * H, sz * I]), vc = rot([sx * I, sy * I, sz * H]);
    facets.push({ verts: sx * sy * sz > 0 ? [va, vb, vc] : [va, vc, vb], n: rotN(norm([sx, sy, sz])) });
  }
  return { facets, pips };
}

function dieItems(d: Die, out: Item[]) {
  const m = qMat(d.q);
  const { facets, pips } = dieFacets(d, m);
  const centre = d.p;
  const view = (p: V3) => norm(sub(EYE, p));
  // Painter's order inside one convex die: far facets first is unnecessary after culling.
  for (const f of facets) {
    const mid: V3 = [0, 0, 0];
    for (const v of f.verts) { mid[0] += v[0] / f.verts.length; mid[1] += v[1] / f.verts.length; mid[2] += v[2] / f.verts.length; }
    if (dotv(f.n, view(mid)) <= 0.0) continue;
    const pts: number[] = [];
    for (const v of f.verts) { const p = project(v); pts.push(p[0], p[1]); }
    const c0 = lit(DIE_BASE, f.verts[0], f.n, 1);
    const mc = lit(DIE_BASE, f.verts[Math.floor(f.verts.length / 2)], f.n, 1);
    out.push({
      k: "poly", pts, color: rgb(mc[0], mc[1], mc[2]),
      grad: f.verts.length === 4
        ? { x0: pts[0], y0: pts[1], x1: pts[4], y1: pts[5], c0: rgb(c0[0], c0[1], c0[2]), c1: rgb(mc[0], mc[1], mc[2]) }
        : undefined,
    });
  }
  // Softbox reflection on the glossy faces: a blurred white window that slides across as the die turns.
  for (let fi = 0; fi < 6; fi++) {
    const f = facets[fi];
    const mid: V3 = [(f.verts[0][0] + f.verts[2][0]) / 2, (f.verts[0][1] + f.verts[2][1]) / 2, (f.verts[0][2] + f.verts[2][2]) / 2];
    const vv = view(mid);
    if (dotv(f.n, vv) <= 0.05) continue;
    const l = norm(sub(LIGHT, mid));
    const hv = norm([l[0] + vv[0], l[1] + vv[1], l[2] + vv[2]]);
    const nh = Math.max(0, dotv(f.n, hv));
    const a = Math.pow(nh, 18) * 0.62;
    if (a < 0.03) continue;
    // Window slides across the face with the half-vector offset.
    const e1: V3 = norm(sub(f.verts[1], f.verts[0]));
    const e2: V3 = norm(sub(f.verts[3], f.verts[0]));
    const ox = Math.max(-0.5, Math.min(0.5, dotv(sub(hv, f.n), e1) * 3.2));
    const oy = Math.max(-0.5, Math.min(0.5, dotv(sub(hv, f.n), e2) * 3.2));
    const cx = mid[0] + e1[0] * ox * 0.5 + e2[0] * oy * 0.5;
    const cy = mid[1] + e1[1] * ox * 0.5 + e2[1] * oy * 0.5;
    const cz = mid[2] + e1[2] * ox * 0.5 + e2[2] * oy * 0.5;
    const hw = 0.22, hh = 0.1;
    const corner = (su: number, sv: number): number[] => {
      const q = project([cx + e1[0] * su * hw + e2[0] * sv * hh, cy + e1[1] * su * hw + e2[1] * sv * hh, cz + e1[2] * su * hw + e2[2] * sv * hh]);
      return [q[0], q[1]];
    };
    const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].flat();
    out.push({ k: "poly", pts: c, color: "rgb(255,236,230)", alpha: Math.min(0.42, a * 0.7), blur: 5 });
  }
  // Pips on visible faces.
  for (const p of pips) {
    if (dotv(p.n, view(p.c)) <= 0.04) continue;
    const toLight = norm(sub(LIGHT, p.c));
    // The rim facing the light is in shadow, the opposite rim catches light.
    const lu = dotv(toLight, p.u), lv = dotv(toLight, p.v);
    const ll = Math.hypot(lu, lv) || 1;
    const sh = 0.016;
    const ring = (r: number, ox: number, oy: number, depth: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        const x = Math.cos(t) * r + ox, y = Math.sin(t) * r + oy;
        const q = project([
          p.c[0] + p.u[0] * x + p.v[0] * y - p.n[0] * depth,
          p.c[1] + p.u[1] * x + p.v[1] * y - p.n[1] * depth,
          p.c[2] + p.u[2] * x + p.v[2] * y - p.n[2] * depth,
        ]);
        pts.push(q[0], q[1]);
      }
      return pts;
    };
    // Drilled recess: dark wall, then the painted pip sunk a little.
    out.push({ k: "poly", pts: ring(p.r * 1.1, 0, 0, 0), color: "rgb(70,6,10)", alpha: 0.9 });
    const pc = lit(PIP_BASE, p.c, p.n, 0.8);
    const pcDark: Rgb = [pc[0] * 0.78, pc[1] * 0.76, pc[2] * 0.74];
    const a0 = ring(p.r, lu / ll * sh, lv / ll * sh, 0.012);
    out.push({
      k: "poly", pts: a0, color: rgb(pc[0], pc[1], pc[2]),
      grad: (() => {
        const q0 = project([p.c[0] + p.u[0] * (-lu / ll) * p.r + p.v[0] * (-lv / ll) * p.r, p.c[1] + p.u[1] * (-lu / ll) * p.r + p.v[1] * (-lv / ll) * p.r, p.c[2] + p.u[2] * (-lu / ll) * p.r + p.v[2] * (-lv / ll) * p.r]);
        const q1 = project([p.c[0] + p.u[0] * (lu / ll) * p.r + p.v[0] * (lv / ll) * p.r, p.c[1] + p.u[1] * (lu / ll) * p.r + p.v[1] * (lv / ll) * p.r, p.c[2] + p.u[2] * (lu / ll) * p.r + p.v[2] * (lv / ll) * p.r]);
        return { x0: q0[0], y0: q0[1], x1: q1[0], y1: q1[1], c0: rgb(pcDark[0], pcDark[1], pcDark[2]), c1: rgb(pc[0], pc[1], pc[2]) };
      })(),
    });
  }
  void centre;
}

export function buildFrame(world: DiceWorld, held?: boolean): { shadows: Item[]; dice: Item[] } {
  const shadows: Item[] = [];
  const dice: Item[] = [];
  void held;
  const order = world.dice
    .map((d, i) => ({ d, z: project(d.p)[2], i }))
    .sort((a, b) => b.z - a.z);
  for (const { d } of order) shadowItems(d, qMat(d.q), shadows);
  for (const { d } of order) dieItems(d, dice);
  return { shadows, dice };
}
