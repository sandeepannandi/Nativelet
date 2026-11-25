/* Camera, lighting and the draw list for Origami Fold. Pure TypeScript: the
   same list is painted by the Skia component and by the web Canvas2D preview. */
import { MODEL, STEP_COUNT, ease, pose, type PosedFacet, type V3 } from "./foldMath";

export const FOLD_W = 340;
export const FOLD_H = 420;
/** Half the sheet edge in world units. */
const S = 3.4;

export type Item =
  | { k: "poly"; pts: number[]; color: string; alpha?: number; blur?: number; grad?: { x0: number; y0: number; x1: number; y1: number; c0: string; c1: string } }
  | { k: "dots"; pts: number[]; color: string; size: number; alpha: number }
  | { k: "line"; pts: number[]; color: string; width: number; alpha?: number };

/* ---------- camera: sheet x right, y away, z up -> world [x, z, -y] ---------- */
const EYE: V3 = [0, 13.5, 8.4];
const TARGET: V3 = [0, 0, -0.2];
const FOCAL = 520;
const CX = FOLD_W / 2;
const CY = FOLD_H * 0.5;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const FWD = unit(sub(TARGET, EYE));
const RIGHT = unit(cross(FWD, [0, 1, 0]));
const UPV = cross(RIGHT, FWD);
const TO_CAM = unit(sub(EYE, [0, 0, 0])); // world space

/* The camera follows the folded shape: it recentres and zooms as the sheet shrinks. */
const VIEW = { cx: 0, cy: 0, zoom: 1 };
function setView(u: number) {
  const uu = Math.max(0, Math.min(STEP_COUNT, u));
  const i = Math.min(STEP_COUNT - 1, Math.floor(uu));
  const t = ease(uu - i);
  const box = (k: number) => {
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const f of MODEL.states[k]) for (const p of f.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, e: Math.max(x1 - x0, y1 - y0) / 2 };
  };
  const a = box(i);
  const b = box(i + 1);
  VIEW.cx = a.cx + (b.cx - a.cx) * t;
  VIEW.cy = a.cy + (b.cy - a.cy) * t;
  VIEW.zoom = Math.min(1.5, 1 / (a.e + (b.e - a.e) * t));
}
const world = (p: V3): V3 => [(p[0] - VIEW.cx) * VIEW.zoom * S, p[2] * VIEW.zoom * S, -(p[1] - VIEW.cy) * VIEW.zoom * S];
function proj(w: V3): [number, number, number] {
  const d = sub(w, EYE);
  const z = dot(d, FWD);
  const s = FOCAL / z;
  return [CX + dot(d, RIGHT) * s, CY - dot(d, UPV) * s, z];
}
const screen = (p: V3) => proj(world(p));

/* ---------- light ---------- */
// Light direction in sheet space (towards the light): from the front-left, high.
const LIGHT: V3 = unit([-0.45, -0.5, 1]);
// The same direction in world space for normals
const LIGHT_W: V3 = [LIGHT[0], LIGHT[2], -LIGHT[1]];
const FRONT_COL: [number, number, number] = [226, 66, 44]; // vermilion
const BACK_COL: [number, number, number] = [238, 231, 214]; // cream

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: [number, number, number], k: number, add = 0) => `rgb(${clamp(c[0] * k + add)},${clamp(c[1] * k + add)},${clamp(c[2] * k + add)})`;

/* Paper is matte with a faint sheen. `n` is the unit normal (sheet space) of the
   colour-A side; whichever side faces the camera is the one we see. */
function shade(n: V3, floor: number, depth: number): { col: string; side: "A" | "B" } {
  const nw: V3 = [n[0], n[2], -n[1]];
  const facing = dot(nw, TO_CAM) >= 0;
  const sn: V3 = facing ? nw : [-nw[0], -nw[1], -nw[2]];
  const diff = Math.max(0, dot(sn, LIGHT_W));
  const h = unit([LIGHT_W[0] + TO_CAM[0], LIGHT_W[1] + TO_CAM[1], LIGHT_W[2] + TO_CAM[2]]);
  const spec = Math.pow(Math.max(0, dot(sn, h)), 22) * 0.1;
  // light that has to reach down into a pile is a little dimmer
  const occl = 1 - Math.min(0.2, depth * 0.9) * (1 - Math.min(1, floor * 20));
  const k = (0.5 + 0.62 * diff) * (0.96 + 0.04 * occl);
  const base = facing ? FRONT_COL : BACK_COL;
  return { col: rgb(base, k, spec * 255), side: facing ? "A" : "B" };
}

/* Project the sheet onto the table along the light, for the cast shadow. */
function castPts(f: PosedFacet, lift: number): number[] {
  const out: number[] = [];
  for (const v of f.pts) {
    const z = Math.max(0, v[2] - lift);
    const p: V3 = [v[0] + (LIGHT[0] / LIGHT[2]) * -z, v[1] + (LIGHT[1] / LIGHT[2]) * -z, lift];
    const s = screen(p);
    out.push(s[0], s[1]);
  }
  return out;
}

/** Everything that never changes: the desk, its light pool and grain. */
export function staticScene(): { back: Item[] } {
  const back: Item[] = [];
  back.push({ k: "poly", pts: [0, 0, FOLD_W, 0, FOLD_W, FOLD_H, 0, FOLD_H], color: "#2a2a2e", grad: { x0: 0, y0: 0, x1: 0, y1: FOLD_H, c0: "#34343a", c1: "#1d1d21" } });
  // soft pool of light from the lamp, falling off towards the lower right
  back.push({ k: "poly", pts: [0, 0, FOLD_W, 0, FOLD_W, FOLD_H, 0, FOLD_H], color: "#ffffff", alpha: 1, grad: { x0: 40, y0: 60, x1: 300, y1: 380, c0: "rgba(255,241,214,0.17)", c1: "rgba(255,241,214,0)" } });
  // fine desk grain
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts: number[] = [];
  for (let i = 0; i < 340; i++) pts.push(rnd() * FOLD_W, rnd() * FOLD_H);
  back.push({ k: "dots", pts, color: "#ffffff", size: 1, alpha: 0.045 });
  const dark: number[] = [];
  for (let i = 0; i < 260; i++) dark.push(rnd() * FOLD_W, rnd() * FOLD_H);
  back.push({ k: "dots", pts: dark, color: "#000000", size: 1, alpha: 0.12 });
  return { back };
}

const dir2 = (a: number[], i: number, j: number) => [a[j] - a[i], a[j + 1] - a[i + 1]];

/** One frame of the folded sheet at fold progress u. */
export function buildFrame(u: number): Item[] {
  setView(u);
  const facets = pose(u);
  const items: Item[] = [];
  // Cast shadow on the desk: a wide soft one and a tight contact one.
  for (const f of facets) {
    if (f.pts.length < 3) continue;
    const high = Math.max(...f.pts.map((v) => v[2]));
    items.push({ k: "poly", pts: castPts(f, 0), color: "#000000", alpha: Math.max(0.1, 0.34 - high * 0.12), blur: 12 + high * 20 });
  }
  for (const f of facets) {
    if (f.pts.length < 3 || f.moving) continue;
    items.push({ k: "poly", pts: castPts(f, 0), color: "#000000", alpha: 0.26, blur: 3 });
  }
  // Painter's order: farther from the camera first.
  const order = facets
    .map((f) => {
      const c = f.pts.reduce((a, v) => [a[0] + v[0] / f.pts.length, a[1] + v[1] / f.pts.length, a[2] + v[2] / f.pts.length] as V3, [0, 0, 0] as V3);
      return { f, depth: screen(c)[2] - c[2] * 0.0 + 0 };
    })
    .sort((a, b) => b.depth - a.depth);
  // Piles read by height, so when two facets sit near the same depth, lower layers come first.
  order.sort((a, b) => {
    const za = a.f.pts.reduce((m, v) => m + v[2], 0) / a.f.pts.length;
    const zb = b.f.pts.reduce((m, v) => m + v[2], 0) / b.f.pts.length;
    if (Math.abs(a.depth - b.depth) < 0.35) return za - zb;
    return b.depth - a.depth;
  });
  for (const { f } of order) {
    if (f.pts.length < 3) continue;
    const sp: number[] = [];
    for (const v of f.pts) {
      const s = screen(v);
      sp.push(s[0], s[1]);
    }
    if (f.moving) {
      // the flap shades the paper it swings over
      const high = Math.max(...f.pts.map((v) => v[2]));
      const lift = f.floor + 0.004;
      items.push({ k: "poly", pts: castPts(f, lift), color: "#3a0f06", alpha: Math.min(0.32, 0.08 + high * 0.2) * Math.min(1, Math.sin(f.phi) * 3 + 0.2), blur: 6 + high * 10 });
    }
    // vertex colours -> one gradient from the crease side to the far side
    const cols = f.pts.map((v, i) => shade(f.normals[i], f.moving ? 0 : v[2], f.dist[i]));
    const cen = f.pts.reduce((a, v) => [a[0] + v[0] / f.pts.length, a[1] + v[1] / f.pts.length], [0, 0]);
    const fall = 1.05 - 0.07 * Math.min(1.6, Math.hypot(cen[0] + 0.5, cen[1] - 0.2));
    let lo = 0;
    let hi = 0;
    f.dist.forEach((d, i) => {
      if (d < f.dist[lo]) lo = i;
      if (d > f.dist[hi]) hi = i;
    });
    // when the visible side changes across the facet, keep the dominant one flat
    const mid = shade(f.normals[0], f.moving ? 0 : f.pts[0][2], f.dist[0]);
    const flat = !f.moving || cols.some((c) => c.side !== cols[0].side) || hi === lo;
    const item: Item = { k: "poly", pts: sp, color: flat ? mid.col : cols[lo].col };
    if (flat) {
      // a faint sheen across a flat piece keeps big areas of paper from looking printed
      let l = 0, r = 0;
      for (let i = 0; i < f.pts.length; i++) { if (sp[i * 2] < sp[l * 2]) l = i; if (sp[i * 2] > sp[r * 2]) r = i; }
      const m = mid.col.match(/\d+/g)!.map(Number);
      const tone = (k: number) => `rgb(${clamp(m[0] * k)},${clamp(m[1] * k)},${clamp(m[2] * k)})`;
      item.grad = { x0: sp[l * 2], y0: sp[l * 2 + 1], x1: sp[r * 2], y1: sp[r * 2 + 1], c0: tone(fall * 0.97), c1: tone(fall * 1.03) };
    }
    if (!flat) item.grad = { x0: sp[lo * 2], y0: sp[lo * 2 + 1], x1: sp[hi * 2], y1: sp[hi * 2 + 1], c0: cols[lo].col, c1: cols[hi].col };
    items.push(item);
    // creases and paper edge
    for (let i = 0; i < f.pts.length; i++) {
      const j = (i + 1) % f.pts.length;
      // the crease being folded right now only shows once the paper starts to bend
      const live = f.dist[i] < 1e-6 && f.dist[j] < 1e-6;
      items.push({ k: "line", pts: [sp[i * 2], sp[i * 2 + 1], sp[j * 2], sp[j * 2 + 1]], color: "#2b0a04", width: 0.7, alpha: 0.28 * (live ? Math.min(1, f.phi * 4) : 1) });
    }
    // a light edge on the lit lip of a lifted flap sells the paper thickness
    if (f.moving && Math.sin(f.phi) > 0.05) {
      const a = f.dist.map((d, i) => ({ d, i })).sort((p, q) => p.d - q.d).slice(0, 2);
      if (a.length === 2 && a[1].d < 1e-6) {
        items.push({ k: "line", pts: [sp[a[0].i * 2], sp[a[0].i * 2 + 1], sp[a[1].i * 2], sp[a[1].i * 2 + 1]], color: "#fff4e6", width: 1, alpha: 0.35 });
      }
    }
  }
  void dir2;
  return items;
}
