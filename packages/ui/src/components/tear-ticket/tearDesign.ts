/*
  Tear-off ticket drawing. Turns the physics world into a flat draw list that the Skia component and the
  Canvas2D web preview both paint, so the two always show the same picture.

  Layers, back to front: the table (still), the ticket body with its torn edge (redrawn only when a tie breaks),
  the stub's shadow, the stub (all its printing is bent by the same map as the paper), crease shading, and the
  slits of the ties that are still whole. The torn edge is one curve shared by both halves; torn bridges
  show the white paper core under the printed colour.
*/
import {
  HS, LB, NT, PITCH, PL, SLIT, TH, TW, X0, YP, TOPY, BOTY,
  buildCurve, fracture, hingeA, mapPoint, psiAt, rng, worldX, type Curve, type TearWorld,
} from "./tearMath";

export type Grad = { x0: number; y0: number; x1: number; y1: number; c0: string; c1: string };
export type RGrad = { cx: number; cy: number; r: number; c0: string; c1: string };
export type Item =
  | { k: "poly"; pts: number[]; extra?: number[][]; color: string; alpha?: number; grad?: Grad; rgrad?: RGrad; blur?: number; stroke?: number; closed?: boolean }
  | { k: "circ"; x: number; y: number; r: number; color: string; alpha?: number; rgrad?: RGrad; blur?: number };

export { TW as TICKET_W, TH as TICKET_H };

const CORNER = 9;
const NOTCH = 6;
const CREAM = "#f8eedb";
const PAPER_LO = "#cf4a2c";
const PAPER_HI = "#ee6341";

/* ---------- small helpers ---------- */

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number, out: number[]) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/* ---------- dot-matrix lettering (5 x 7 cells) ---------- */

const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

export const textWidth = (s: string, px: number) => s.length * 6 * px - px;

/** One item for a whole line: every lit dot is a subpath of the same path. */
function dots(s: string, x: number, y: number, px: number, color: string, alpha = 1): Item {
  const subs: number[][] = [];
  const d = px * 0.88;
  const o = (px - d) / 2;
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] ?? GLYPHS[" "];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== "1") continue;
        const px0 = x + (i * 6 + c) * px + o;
        const py0 = y + r * px + o;
        subs.push([px0, py0, px0 + d, py0, px0 + d, py0 + d, px0, py0 + d]);
      }
    }
  }
  return { k: "poly", pts: subs[0] ?? [0, 0, 0, 0, 0, 0], extra: subs.slice(1), color, alpha };
}

const centered = (s: string, cx: number, y: number, px: number, color: string, alpha = 1) =>
  dots(s, cx - textWidth(s, px) / 2, y, px, color, alpha);

/* ---------- printed art (ticket frame, fixed) ---------- */

function specks(x0: number, y0: number, x1: number, y1: number, seed: number, n: number): Item[] {
  const r = rng(seed);
  const light: number[][] = [];
  const dark: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    const w = 0.8 + r() * 2.2;
    const h = 0.4 + r() * 0.8;
    const a = r() * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const q = [x - w * c + h * s, y - w * s - h * c, x + w * c + h * s, y + w * s - h * c, x + w * c - h * s, y + w * s + h * c, x - w * c - h * s, y - w * s + h * c];
    (r() < 0.55 ? light : dark).push(q);
  }
  return [
    { k: "poly", pts: light[0], extra: light.slice(1), color: "#ffffff", alpha: 0.1 },
    { k: "poly", pts: dark[0], extra: dark.slice(1), color: "#5a1a0a", alpha: 0.09 },
  ];
}

function ring(cx: number, cy: number, r: number, width: number, alpha: number): Item {
  const pts: number[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return { k: "poly", pts, color: CREAM, alpha, stroke: width };
}

function mainArt(): Item[] {
  const cx = X0 + PL / 2;
  const out: Item[] = [];
  out.push(ring(cx, 128, 84, 1.2, 0.2), ring(cx, 128, 70, 3, 0.1), ring(cx, 128, 58, 0.9, 0.16));
  const frame: number[] = [];
  const inset = 10;
  const fr = 10;
  const L = X0 + inset;
  const R = X0 + PL - inset;
  const T = TOPY + inset;
  const B = YP - inset;
  arc(L + fr, T + fr, fr, Math.PI, Math.PI * 1.5, 6, frame);
  arc(R - fr, T + fr, fr, Math.PI * 1.5, Math.PI * 2, 6, frame);
  arc(R - fr, B - fr, fr, 0, Math.PI * 0.5, 6, frame);
  arc(L + fr, B - fr, fr, Math.PI * 0.5, Math.PI, 6, frame);
  out.push({ k: "poly", pts: frame, color: CREAM, alpha: 0.55, stroke: 1.2 });
  out.push(centered("SPECIAL ENGAGEMENT", cx, 52, 1.55, CREAM, 0.85));
  out.push(centered("ADMIT", cx, 80, 5.3, CREAM, 0.97));
  out.push(centered("ONE", cx, 123, 5.3, CREAM, 0.97));
  out.push(centered("NATIVELET LIVE", cx, 172, 1.95, CREAM, 0.92));
  out.push(centered("NOV 28  8 PM", cx, 192, 1.95, CREAM, 0.9));
  out.push(centered("ROW 7  SEAT 14", cx, 211, 1.95, CREAM, 0.9));
  return out;
}

function stubArt(): Item[] {
  const cx = X0 + PL / 2;
  const out: Item[] = [];
  out.push(...specks(X0 + 4, YP + 2, X0 + PL - 4, BOTY - 2, 77, 90));
  out.push(centered("ADMIT ONE", cx, YP + 12, 2.1, CREAM, 0.92));
  const r = rng(5);
  const bars: number[][] = [];
  let x = cx - 76;
  while (x < cx + 76) {
    const w = r() < 0.4 ? 1 : r() < 0.7 ? 2 : 3.2;
    if (r() < 0.8) bars.push([x, YP + 30, x + w, YP + 30, x + w, YP + 62, x, YP + 62]);
    x += w + (r() < 0.5 ? 1.2 : 2.2);
  }
  out.push({ k: "poly", pts: bars[0], extra: bars.slice(1), color: CREAM, alpha: 0.92 });
  out.push(centered("NO 000417", cx, YP + 66, 1.6, CREAM, 0.85));
  return out;
}

/* ---------- ticket outlines ---------- */

/** Fracture samples along the perforation, from the start end: [a, e] with e the shared torn-edge height. */
function fractureProfile(w: TearWorld): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k < NT; k++) {
    if (k >= w.broken) break;
    const a0 = k * PITCH + SLIT;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push([a0 + u * (PITCH - SLIT), fracture(w, k, u)]);
    }
  }
  return pts;
}

function edgePts(w: TearWorld, ascending: boolean): number[] {
  const prof = fractureProfile(w).filter((p) => p[0] > NOTCH && p[0] < PL - NOTCH);
  const out: number[] = [];
  const list = [[NOTCH, 0], ...prof, [PL - NOTCH, 0]];
  const pts = list.map((p) => [worldX(w.dir, p[0]), YP + p[1]]);
  pts.sort((p, q) => (ascending ? p[0] - q[0] : q[0] - p[0]));
  for (const p of pts) out.push(p[0], p[1]);
  return out;
}

function mainOutline(w: TearWorld): number[] {
  const o: number[] = [];
  const L = X0;
  const R = X0 + PL;
  arc(L + CORNER, TOPY + CORNER, CORNER, Math.PI, Math.PI * 1.5, 7, o);
  arc(R - CORNER, TOPY + CORNER, CORNER, Math.PI * 1.5, Math.PI * 2, 7, o);
  o.push(R, YP - NOTCH);
  // notch, bottom right: a quarter circle cut out of the corner
  arc(R, YP, NOTCH, Math.PI * 1.5, Math.PI, 6, o);
  o.push(...edgePts(w, false));
  arc(L, YP, NOTCH, 0, -Math.PI * 0.5, 6, o);
  return o;
}

function stubOutline(w: TearWorld): number[] {
  const o: number[] = [];
  const L = X0;
  const R = X0 + PL;
  arc(L, YP, NOTCH, -Math.PI * 0.5, 0, 6, o);
  o.push(...edgePts(w, true));
  arc(R, YP, NOTCH, Math.PI, Math.PI * 0.5, 6, o);
  arc(R - CORNER, BOTY - CORNER, CORNER, 0, Math.PI * 0.5, 7, o);
  arc(L + CORNER, BOTY - CORNER, CORNER, Math.PI * 0.5, Math.PI, 7, o);
  return o;
}

/** White paper core showing where bridges tore. side = -1 on the ticket, +1 on the stub. */
function fibres(w: TearWorld, side: -1 | 1): Item {
  const subs: number[][] = [];
  for (let k = 0; k < w.broken; k++) {
    const a0 = k * PITCH + SLIT;
    if (a0 < NOTCH || a0 + PITCH - SLIT > PL - NOTCH) continue;
    const top: number[] = [];
    const back: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const e = fracture(w, k, u);
      const wd = (0.35 + w.fiber[k] * Math.sin(Math.PI * u)) * (0.7 + 0.5 * Math.abs(Math.sin(u * 9 + k)));
      const x = worldX(w.dir, a0 + u * (PITCH - SLIT));
      top.push(x, YP + e);
      back.push(x, YP + e + side * wd);
    }
    const rev: number[] = [];
    for (let i = back.length - 2; i >= 0; i -= 2) rev.push(back[i], back[i + 1]);
    subs.push([...top, ...rev]);
  }
  if (!subs.length) return { k: "poly", pts: [0, 0, 0, 0, 0, 0], color: CREAM, alpha: 0 };
  return { k: "poly", pts: subs[0], extra: subs.slice(1), color: "#fff8ea", alpha: 0.95 };
}

/* ---------- warp ---------- */

type MapFn = (x: number, y: number, out: { x: number; y: number }) => void;

function densify(pts: number[], step: number): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    out.push(x0, y0);
    const j = (i + 1) % n;
    const x1 = pts[j * 2];
    const y1 = pts[j * 2 + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > step && (i < n - 1 || true)) {
      const m = Math.ceil(len / step);
      for (let q = 1; q < m; q++) out.push(x0 + ((x1 - x0) * q) / m, y0 + ((y1 - y0) * q) / m);
    }
  }
  return out;
}

function warpPts(pts: number[], map: MapFn, dense: boolean): number[] {
  const src = dense ? densify(pts, 3.2) : pts;
  const out = new Array<number>(src.length);
  const t = { x: 0, y: 0 };
  for (let i = 0; i < src.length; i += 2) {
    map(src[i], src[i + 1], t);
    out[i] = t.x;
    out[i + 1] = t.y;
  }
  return out;
}

function warpItem(it: Item, map: MapFn): Item {
  if (it.k === "circ") {
    const t = { x: 0, y: 0 };
    map(it.x, it.y, t);
    return { ...it, x: t.x, y: t.y };
  }
  const dense = it.stroke === undefined && !it.extra;
  const pts = warpPts(it.pts, map, dense || it.pts.length > 16);
  const extra = it.extra ? it.extra.map((s) => warpPts(s, map, false)) : undefined;
  let grad = it.grad;
  if (grad) {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    map(grad.x0, grad.y0, a);
    map(grad.x1, grad.y1, b);
    grad = { ...grad, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  let rgrad = it.rgrad;
  if (rgrad) {
    const c = { x: 0, y: 0 };
    map(rgrad.cx, rgrad.cy, c);
    rgrad = { ...rgrad, cx: c.x, cy: c.y };
  }
  return { ...it, pts, extra, grad, rgrad };
}

/* ---------- scene ---------- */

export function staticScene(): Item[] {
  const items: Item[] = [];
  items.push({ k: "poly", pts: [-20, -20, TW + 20, -20, TW + 20, TH + 20, -20, TH + 20], color: "#1b211d", grad: { x0: 0, y0: 0, x1: TW, y1: TH, c0: "#262e28", c1: "#141915" } });
  items.push({ k: "circ", x: TW / 2, y: 190, r: 260, color: "#2b352e", alpha: 0.5, rgrad: { cx: TW / 2, cy: 190, r: 260, c0: "rgba(60,74,64,0.55)", c1: "rgba(20,26,22,0)" } });
  // a faint stitched edge so the table reads as a desk mat
  const edge: number[] = [];
  arc(26, 26, 14, Math.PI, Math.PI * 1.5, 5, edge);
  arc(TW - 26, 26, 14, Math.PI * 1.5, Math.PI * 2, 5, edge);
  arc(TW - 26, TH - 26, 14, 0, Math.PI * 0.5, 5, edge);
  arc(26, TH - 26, 14, Math.PI * 0.5, Math.PI, 5, edge);
  items.push({ k: "poly", pts: edge, color: "#d7e2d0", alpha: 0.07, stroke: 1 });
  return items;
}

const LIGHT_GRAD_MAIN: Grad = { x0: X0, y0: TOPY, x1: X0 + PL, y1: YP, c0: PAPER_HI, c1: PAPER_LO };
const LIGHT_GRAD_STUB: Grad = { x0: X0, y0: YP, x1: X0 + PL, y1: BOTY, c0: "#e45a3a", c1: "#c23f25" };

export function mainKey(w: TearWorld) {
  return w.broken * 2 + (w.dir > 0 ? 0 : 1);
}

/** The ticket body with its shadow, art and torn edge. Changes only when a tie breaks. */
export function mainLayer(w: TearWorld): Item[] {
  const out = mainOutline(w);
  const items: Item[] = [];
  items.push({ k: "poly", pts: out.map((v, i) => (i % 2 ? v + 8 : v + 3)), color: "#000000", alpha: 0.5, blur: 14 });
  items.push({ k: "poly", pts: out.map((v, i) => (i % 2 ? v + 2.5 : v + 1)), color: "#000000", alpha: 0.4, blur: 3.5 });
  items.push({ k: "poly", pts: out, color: PAPER_LO, grad: LIGHT_GRAD_MAIN });
  items.push(...specks(X0 + 4, TOPY + 4, X0 + PL - 4, YP - 4, 41, 220));
  items.push(...mainArt());
  items.push(fibres(w, -1));
  items.push({ k: "poly", pts: out, color: "#ffffff", alpha: 0.22, stroke: 0.8 });
  return items;
}

function slitOverlay(w: TearWorld): Item | null {
  const subs: number[][] = [];
  for (let k = w.broken + 1; k < NT; k++) {
    const a0 = k * PITCH;
    const a1 = a0 + SLIT;
    if (a0 < NOTCH + 0.5 || a1 > PL - NOTCH - 0.5) continue;
    const x0 = worldX(w.dir, a0);
    const x1 = worldX(w.dir, a1);
    const xm0 = Math.min(x0, x1);
    const xm1 = Math.max(x0, x1);
    subs.push([xm0, YP, xm0 + 0.5, YP - 0.55, xm1 - 0.5, YP - 0.55, xm1, YP, xm1 - 0.5, YP + 0.55, xm0 + 0.5, YP + 0.55]);
  }
  if (!subs.length) return null;
  return { k: "poly", pts: subs[0], extra: subs.slice(1), color: "#120d0b", alpha: 0.82 };
}

export type Frame = { stubShadow: Item[]; stub: Item[]; overlay: Item[] };

let artCache: Item[] | null = null;

export function buildFrame(w: TearWorld): Frame {
  const free = w.mode === "free";
  const curve: Curve | null = free && w.beta >= 1 ? null : buildCurve(hingeA(w), w.dir, w.psi);
  const map: MapFn = (x, y, out) => {
    const a = w.dir > 0 ? x - X0 : X0 + PL - x;
    mapPoint(w, curve, a, y - YP, out);
  };
  const outline = stubOutline(w);
  // the printing never changes; only the torn edge does
  if (!artCache) artCache = stubArt();
  const lift = free ? Math.max(0, w.body.z) : Math.sin(Math.min(w.psi, 1.5)) * 9;
  const sh = 1.6 + lift * 0.42;
  const stubFill: Item = { k: "poly", pts: outline, color: "#cf4a2c", grad: LIGHT_GRAD_STUB };
  const fib = fibres(w, 1);
  const body: Item[] = [stubFill, ...artCache, fib, { k: "poly", pts: outline, color: "#ffffff", alpha: 0.2, stroke: 0.8 }];
  const warped = body.map((it) => warpItem(it, map));
  const sOut = warpItem({ k: "poly", pts: outline, color: "#000000" }, map);
  const shadow: Item[] = [];
  if (sOut.k === "poly") {
    const dx = sh * 0.7;
    const dy = sh * 1.5;
    const moved = sOut.pts.map((v, i) => v + (i % 2 ? dy : dx));
    shadow.push({ k: "poly", pts: moved, color: "#000000", alpha: Math.max(0.16, 0.5 - lift * 0.012), blur: 5 + lift * 0.9 });
    shadow.push({ k: "poly", pts: sOut.pts.map((v, i) => v + (i % 2 ? sh * 0.45 : sh * 0.2)), color: "#000000", alpha: Math.max(0.1, 0.34 - lift * 0.01), blur: 2.2 });
  }
  const overlay: Item[] = [];
  const phi = w.mode === "attached" ? w.psi : 0;
  if (curve && phi > 0.04) {
    const k = Math.min(1, phi * 1.4);
    // paper tilts away from the lamp as it lifts: darker, with a bright crease where it bends
    if (sOut.k === "poly") overlay.push({ k: "poly", pts: sOut.pts, color: "#1a0a05", alpha: 0.12 * k });
    const strips = 7;
    const t = { x: 0, y: 0 };
    for (let i = 0; i < strips; i++) {
      const s0 = (i / strips) * LB;
      const s1 = ((i + 1) / strips) * LB;
      const a0 = hingeA(w) - s0;
      const a1 = hingeA(w) - s1;
      if (a1 < 6) break;
      const pts: number[] = [];
      for (const [a, sx] of [[a0, 0], [a1, 0], [a1, HS], [a0, HS]]) {
        mapPoint(w, curve, a, sx, t);
        pts.push(t.x, t.y);
      }
      const mid = (s0 + s1) / 2 / LB;
      const curv = 6 * mid * (1 - mid);
      overlay.push(
        mid < 0.5
          ? { k: "poly", pts, color: "#fff4e0", alpha: 0.2 * k * curv }
          : { k: "poly", pts, color: "#1a0a05", alpha: 0.26 * k * curv },
      );
    }
  }
  const slits = slitOverlay(w);
  if (slits) overlay.push(slits);
  void psiAt;
  return { stubShadow: shadow, stub: warped, overlay };
}
