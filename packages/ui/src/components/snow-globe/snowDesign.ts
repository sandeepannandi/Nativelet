/*
  Snow Globe drawing. Turns the physics world into a flat draw list that the Skia component and the
  Canvas2D web preview both paint, so the two always show the same picture.

  The scene is built from the same solids the physics collides with (pines, cottage, lamp), projected
  from 3D with the camera looking slightly down. Everything inside the glass then goes through one lens
  pass: the water ball magnifies its middle and squeezes its rim, so geometry, flakes and light bend the
  way they do through a real glass sphere. The picture is a stack of depth layers (backdrop, ground, each
  object back to front). Flakes are drawn between the layers by depth, and a flake resting on the roof
  or on a pine is drawn right after the object that holds it, so snow collects on top of things.
*/
import { HOUSE, LAMP, TIERS, TREES, groundHeight, groundReach, type SnowWorld } from "./snowMath";

export const GLOBE_W = 340;
export const GLOBE_H = 460;
export const CX = 170;
export const CY = 170;
export const RP = 122; // pixels per sphere radius
const PITCH = 0.3; // radians the camera looks down
const COS = Math.cos(PITCH), SIN = Math.sin(PITCH);

export type Grad = { x0: number; y0: number; x1: number; y1: number; c0: string; c1: string };
export type RGrad = { cx: number; cy: number; r: number; c0: string; c1: string };
export type Item =
  | { k: "poly"; pts: number[]; color: string; alpha?: number; grad?: Grad; rgrad?: RGrad; blur?: number; stroke?: number; closed?: boolean }
  | { k: "circ"; x: number; y: number; r: number; color: string; alpha?: number; rgrad?: RGrad; blur?: number };

export type Projected = { x: number; y: number; depth: number; s: number };
export type Layer = { id: string; z: number; solids: number[]; items: Item[] };

/** World (sphere radii, y up) to design pixels. depth is positive away from the viewer. */
export function project(x: number, y: number, z: number): Projected {
  const yy = y * COS + z * SIN;
  const depth = z * COS - y * SIN;
  const s = 1 / (1 + 0.1 * depth);
  return { x: CX + x * RP * s, y: CY - yy * RP * s, depth, s };
}

/* ---------------------------------- the glass lens ---------------------------------- */
const LR = 120; // radius of the water in design pixels
/** Magnification at radius fraction u: strongest in the middle, squeezed to nothing at the rim. */
function lensGain(u: number): number {
  if (u >= 1) return 1;
  return 1.17 - 0.17 * u * u;
}
export function lens(x: number, y: number): [number, number, number] {
  const dx = x - CX, dy = y - CY;
  const u = Math.sqrt(dx * dx + dy * dy) / LR;
  const g = lensGain(u);
  return [CX + dx * g, CY + dy * g, g];
}

const rgba = (r: number, g: number, b: number, a: number) => `rgba(${r},${g},${b},${a})`;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function haze(c: string, t: number): string {
  const A = hex(c), B = hex("#31456f");
  return `#${[0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("")}`;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 28, a0 = 0, a1 = Math.PI * 2): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** The part of the glass circle below screen-y y0, as a closed polygon with its flat top at y0. */
function circleBelow(y0: number, r: number): number[] {
  const dy = y0 - CY;
  const a = Math.asin(Math.min(1, Math.max(-1, dy / r)));
  const pts: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const ang = a + ((Math.PI - 2 * a) * i) / 40;
    pts.push(CX + Math.cos(ang) * r, CY + Math.sin(ang) * r);
  }
  return pts;
}

/** Polygon between a ridge line (screen y at screen x) and the bottom of the glass circle. */
function hillBelowRidge(r: number, ridge: (x: number) => number): number[] {
  const top: number[] = [];
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const x = -r + (2 * r * i) / N;
    const chord = Math.sqrt(Math.max(0, r * r - x * x));
    const yTop = Math.min(CY + chord, Math.max(CY - chord, ridge(CX + x)));
    top.push(CX + x, yTop);
  }
  const bot: number[] = [];
  for (let i = N; i >= 0; i--) {
    const x = -r + (2 * r * i) / N;
    bot.push(CX + x, CY + Math.sqrt(Math.max(0, r * r - x * x)));
  }
  return [...top, ...bot];
}

/* ------------------------------ lens pass over a draw list ------------------------------ */
function subdivide(pts: number[], closed: boolean): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
    const j = (i + 1) % n;
    const x1 = pts[j * 2], y1 = pts[j * 2 + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(1, Math.ceil(len / 8));
    for (let s = 0; s < k; s++) out.push(x0 + ((x1 - x0) * s) / k, y0 + ((y1 - y0) * s) / k);
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}

function warp(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of items) {
    if (it.k === "circ") {
      const [x, y, g] = lens(it.x, it.y);
      const r = it.rgrad ? lens(it.rgrad.cx, it.rgrad.cy) : null;
      out.push({ ...it, x, y, r: it.r * g, rgrad: it.rgrad && r ? { ...it.rgrad, cx: r[0], cy: r[1], r: it.rgrad.r * r[2] } : undefined, blur: it.blur ? it.blur * g : undefined });
      continue;
    }
    const closed = it.stroke === undefined || it.closed !== false;
    const dense = subdivide(it.pts, closed);
    const pts: number[] = [];
    for (let i = 0; i < dense.length; i += 2) {
      const [x, y] = lens(dense[i], dense[i + 1]);
      pts.push(x, y);
    }
    let grad = it.grad, rgrad = it.rgrad;
    if (grad) {
      const a = lens(grad.x0, grad.y0), b = lens(grad.x1, grad.y1);
      grad = { ...grad, x0: a[0], y0: a[1], x1: b[0], y1: b[1] };
    }
    if (rgrad) {
      const c = lens(rgrad.cx, rgrad.cy);
      rgrad = { ...rgrad, cx: c[0], cy: c[1], r: rgrad.r * c[2] };
    }
    out.push({ ...it, pts, grad, rgrad });
  }
  return out;
}

/* ---------------------------------------- objects --------------------------------------- */

/** A pine: four drooping tiers, each lit from the upper left, with snow on the upper slopes. */
function pine(items: Item[], t: { x: number; z: number; h: number; w: number }, mist: number) {
  const gy = groundHeight(t.x, t.z);
  const base = project(t.x, gy, t.z);
  const s = base.s;
  const H = t.h * RP * s;
  const cx = base.x, by = base.y;
  const dark = (c: string) => haze(c, mist);
  // Trunk.
  const tw = t.w * 0.07 * RP * s;
  items.push({ k: "poly", pts: [cx - tw, by + 1, cx + tw, by + 1, cx + tw * 0.8, by - H * 0.22, cx - tw * 0.8, by - H * 0.22], color: dark("#4a3626"), grad: { x0: cx - tw, y0: by, x1: cx + tw, y1: by, c0: dark("#6a4c34"), c1: dark("#2e2016") } });
  for (let ti = 0; ti < TIERS.length; ti++) {
    const [y0, y1, hw] = TIERS[ti];
    const yb = by - H * y0, yt = by - H * y1;
    const R = (t.w * hw * 0.5) * RP * s;
    // Drooping bottom edge, ragged like real boughs.
    const nb = 9;
    const bottom: number[] = [];
    for (let i = 0; i <= nb; i++) {
      const u = i / nb;
      const sag = Math.sin(u * Math.PI) * (R * 0.1) + (i % 2 === 0 ? R * 0.07 : -R * 0.02);
      bottom.push(cx + R - 2 * R * u, yb + sag + H * 0.012);
    }
    const body = [cx, yt, cx + R, yb, ...bottom, cx - R, yb];
    // Shadow the lower tier gets from the one above.
    items.push({
      k: "poly", pts: body, color: dark("#1f4a38"),
      grad: { x0: cx - R, y0: yb, x1: cx + R, y1: yb, c0: dark("#38774f"), c1: dark("#0f2a21") },
    });
    // Needle clumps, darker, along the slope.
    for (let c = 0; c < 4; c++) {
      const u = (c + 0.6) / 4.4;
      const px = cx + (u - 0.5) * R * 1.3, py = yt + (yb - yt) * (0.25 + 0.7 * u);
      items.push({ k: "poly", pts: ellipsePts(px, py, R * 0.22, (yb - yt) * 0.09, 10), color: dark("#0d2118"), alpha: 0.28, blur: 1.5 });
    }
    // Underside shadow where the tier overhangs the one below.
    items.push({ k: "poly", pts: ellipsePts(cx, yb + H * 0.01, R * 0.82, H * 0.028, 14), color: "#07120d", alpha: 0.38, blur: 3 });
    // Snow draped over the upper slopes with a scalloped edge.
    const tt = 0.62;
    const sr = [cx + R * tt, yt + (yb - yt) * tt], sl = [cx - R * tt, yt + (yb - yt) * tt];
    const scallop: number[] = [];
    const ns = 7;
    for (let i = 0; i <= ns; i++) {
      const u = i / ns;
      const bump = Math.sin(u * Math.PI * ns) * (yb - yt) * 0.035;
      scallop.push(sr[0] + (sl[0] - sr[0]) * u, sr[1] + (yb - yt) * 0.03 + bump + Math.sin(u * Math.PI) * (yb - yt) * 0.05);
    }
    items.push({
      k: "poly", pts: [cx, yt - 0.6, ...sr, ...scallop, ...sl],
      color: "#f4f8ff", grad: { x0: cx - R, y0: yt, x1: cx + R * 0.9, y1: yb, c0: "#ffffff", c1: haze("#c3d0ea", mist * 0.7) },
    });
    // Blue shading on the snow's shadow side.
    items.push({ k: "poly", pts: [cx + R * 0.1, yt + (yb - yt) * 0.12, ...sr, cx + R * 0.15, sr[1] - (yb - yt) * 0.06], color: "#8fa4cf", alpha: 0.45 });
  }
}

/** A box corner of the cottage in design pixels. local (lx, lz) is the house frame, h is height above ground. */
function housePt(lx: number, h: number, lz: number): [number, number, number] {
  const c = Math.cos(HOUSE.yaw), s = Math.sin(HOUSE.yaw);
  const wx = HOUSE.x + c * lx + s * lz;
  const wz = HOUSE.z - s * lx + c * lz;
  const gy = groundHeight(HOUSE.x, HOUSE.z) - 0.02;
  const p = project(wx, gy + h, wz);
  return [p.x, p.y, p.depth];
}

function cottage(items: Item[]) {
  const { hx, hz, wall, roof, over } = HOUSE;
  const P = (lx: number, h: number, lz: number) => housePt(lx, h, lz);
  const flat = (...pts: [number, number, number][]) => pts.flatMap((q) => [q[0], q[1]]);
  const rz = hz + over, rx = hx + over;
  const base = P(0, 0, 0);
  // Contact shadow on the snow, cast to the lower right by the moon.
  items.push({ k: "poly", pts: ellipsePts(base[0] + 22, base[1] + 4, 66, 13, 22), color: rgba(40, 56, 100, 1), alpha: 0.5, blur: 6 });
  // Warm light from the windows spilling onto the snow.
  items.push({ k: "poly", pts: ellipsePts(base[0] - 4, base[1] + 14, 44, 10, 20), color: "#ffb860", alpha: 0.4, blur: 9 });

  // Right wall (in shade) then front wall.
  const rw = [P(hx, 0, -hz), P(hx, 0, hz), P(hx, wall, hz), P(hx, wall, -hz)];
  items.push({ k: "poly", pts: flat(...rw), color: "#6a4029", grad: { x0: rw[0][0], y0: 0, x1: rw[1][0], y1: 0, c0: "#7d4b31", c1: "#4f2e1f" } });
  const fw = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, wall, -hz), P(-hx, wall, -hz)];
  items.push({ k: "poly", pts: flat(...fw), color: "#b4754a", grad: { x0: fw[0][0], y0: fw[3][1], x1: fw[1][0], y1: fw[0][1], c0: "#d08c5e", c1: "#8e5638" } });
  // Log lines.
  for (let i = 1; i < 6; i++) {
    const h = (wall * i) / 6;
    const a = P(-hx, h, -hz), b = P(hx, h, -hz), c2 = P(hx, h, hz);
    items.push({ k: "poly", pts: [a[0], a[1], b[0], b[1]], color: "#5b3420", alpha: 0.55, stroke: 0.9, closed: false });
    items.push({ k: "poly", pts: [b[0], b[1], c2[0], c2[1]], color: "#3d2314", alpha: 0.5, stroke: 0.9, closed: false });
    items.push({ k: "poly", pts: [a[0], a[1] - 1, b[0], b[1] - 1], color: "#e3a373", alpha: 0.22, stroke: 0.6, closed: false });
  }
  // Corner posts.
  const c0 = P(hx, 0, -hz), c1 = P(hx, wall, -hz);
  items.push({ k: "poly", pts: [c0[0], c0[1], c1[0], c1[1]], color: "#3b2315", alpha: 0.7, stroke: 2, closed: false });
  // Window with a warm glow, frame and mullions.
  const win = (wx0: number, wx1: number, h0: number, h1: number, lz: number, alongX: boolean) => {
    const q = (a: number, h: number) => (alongX ? P(a, h, lz) : P(lz, h, a));
    const pts = [q(wx0, h0), q(wx1, h0), q(wx1, h1), q(wx0, h1)];
    const m = q((wx0 + wx1) / 2, (h0 + h1) / 2);
    items.push({ k: "circ", x: m[0], y: m[1], r: 20, color: "#ffb454", alpha: 0.5, blur: 10 });
    items.push({ k: "poly", pts: flat(...pts), color: "#ffd074", grad: { x0: pts[3][0], y0: pts[3][1], x1: pts[1][0], y1: pts[1][1], c0: "#fff2bf", c1: "#ff9f3a" } });
    const mid1 = q((wx0 + wx1) / 2, h0), mid2 = q((wx0 + wx1) / 2, h1);
    const mid3 = q(wx0, (h0 + h1) / 2), mid4 = q(wx1, (h0 + h1) / 2);
    items.push({ k: "poly", pts: [mid1[0], mid1[1], mid2[0], mid2[1]], color: "#4c2c1e", stroke: 1, closed: false });
    items.push({ k: "poly", pts: [mid3[0], mid3[1], mid4[0], mid4[1]], color: "#4c2c1e", stroke: 1, closed: false });
    items.push({ k: "poly", pts: flat(...pts), color: "#4c2c1e", stroke: 1.5 });
    // Warm window light slightly flares onto the frame edge.
    items.push({ k: "poly", pts: flat(pts[0], pts[1]), color: "#ffe9b3", alpha: 0.5, stroke: 1, closed: false });
  };
  win(-0.14, -0.04, 0.07, 0.15, -hz, true);
  win(0.01, 0.1, 0.07, 0.15, hz * -0.5, false);
  // Door on the front wall.
  const d = [P(0.05, 0, -hz), P(0.13, 0, -hz), P(0.13, 0.14, -hz), P(0.05, 0.14, -hz)];
  items.push({ k: "poly", pts: flat(...d), color: "#4a2a1b", grad: { x0: d[0][0], y0: 0, x1: d[1][0], y1: 0, c0: "#5d3724", c1: "#3b2116" } });
  items.push({ k: "poly", pts: flat(...d), color: "#25140b", stroke: 1.2 });
  items.push({ k: "circ", x: d[1][0] - 2, y: (d[0][1] + d[3][1]) / 2, r: 0.9, color: "#e8c46a" });
  // Stoop snow.
  items.push({ k: "poly", pts: ellipsePts(d[0][0] + 5, d[0][1] + 1, 12, 3, 12), color: "#eef4ff", alpha: 0.95 });

  // Roof. Front slope, gable end on the right, snow cover with a thick lip along the eave.
  const eaveH = wall;
  const e0 = P(-rx, eaveH - 0.01, -rz), e1 = P(rx, eaveH - 0.01, -rz);
  const r1 = P(rx, eaveH + roof, 0), r0 = P(-rx, eaveH + roof, 0);
  const gableL = P(rx, eaveH - 0.01, -rz), gableR = P(rx, eaveH - 0.01, rz), gableT = r1;
  items.push({ k: "poly", pts: flat(gableL, gableR, gableT), color: "#5a3322", grad: { x0: gableL[0], y0: 0, x1: gableR[0], y1: 0, c0: "#6f4029", c1: "#472818" } });
  items.push({ k: "poly", pts: flat(e0, e1, r1, r0), color: "#6e3e2c", grad: { x0: e0[0], y0: e0[1], x1: r0[0], y1: r0[1], c0: "#8a4d36", c1: "#5a2f22" } });
  // Roof boards.
  for (let i = 1; i < 5; i++) {
    const u = i / 5;
    items.push({ k: "poly", pts: [e0[0] + (r0[0] - e0[0]) * u, e0[1] + (r0[1] - e0[1]) * u, e1[0] + (r1[0] - e1[0]) * u, e1[1] + (r1[1] - e1[1]) * u], color: "#3b1f14", alpha: 0.4, stroke: 0.8, closed: false });
  }
  const lerp = (a: [number, number, number], b: [number, number, number], u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const u0 = 0.16;
  const sA = lerp(e0, r0, u0), sB = lerp(e1, r1, u0);
  const rag: number[] = [];
  const nr = 12;
  for (let i = 0; i <= nr; i++) {
    const u = i / nr;
    const x = sB[0] + (sA[0] - sB[0]) * u, y = sB[1] + (sA[1] - sB[1]) * u;
    rag.push(x, y + 2.2 + Math.sin(u * Math.PI * 6) * 1.6 + Math.sin(u * Math.PI) * 2.5);
  }
  items.push({ k: "poly", pts: [r0[0], r0[1] - 1.5, r1[0], r1[1] - 1.5, ...rag], color: "#f6f9ff", grad: { x0: r0[0], y0: r0[1], x1: e1[0], y1: e1[1], c0: "#ffffff", c1: "#c9d5ec" } });
  items.push({ k: "poly", pts: [r0[0], r0[1] - 1, r1[0], r1[1] - 1], color: "#ffffff", stroke: 2.2, closed: false });
  // Snow on the gable edge and a blue shadow on the snow near the eave.
  items.push({ k: "poly", pts: [...rag.slice(0, 6)], color: "#8da2d2", alpha: 0.45, stroke: 2, closed: false });
  items.push({ k: "poly", pts: flat(gableL, gableT), color: "#eef4ff", stroke: 2, closed: false });
  // Eave icicles.
  for (let i = 1; i < 8; i++) {
    const u = i / 8;
    const x = e0[0] + (e1[0] - e0[0]) * u, y = e0[1] + (e1[1] - e0[1]) * u;
    const L = 2 + ((i * 7) % 4);
    items.push({ k: "poly", pts: [x - 0.9, y + 1.8, x + 0.9, y + 1.8, x, y + 1.8 + L], color: "#e6f1ff", alpha: 0.8 });
  }
  // Chimney with a snow cap.
  const ch = HOUSE.chimW, cxl = HOUSE.chimX, czl = HOUSE.chimZ, top = eaveH + HOUSE.chimH;
  const cb = [P(cxl - ch, eaveH + 0.05, czl - ch), P(cxl + ch, eaveH + 0.05, czl - ch), P(cxl + ch, top, czl - ch), P(cxl - ch, top, czl - ch)];
  const cr = [P(cxl + ch, eaveH + 0.05, czl - ch), P(cxl + ch, eaveH + 0.05, czl + ch), P(cxl + ch, top, czl + ch), P(cxl + ch, top, czl - ch)];
  items.push({ k: "poly", pts: flat(...cr), color: "#5b392b" });
  items.push({ k: "poly", pts: flat(...cb), color: "#80513f", grad: { x0: cb[0][0], y0: 0, x1: cb[1][0], y1: 0, c0: "#946049", c1: "#6a4132" } });
  const capT = [P(cxl - ch - 0.006, top + 0.012, czl - ch - 0.006), P(cxl + ch + 0.006, top + 0.012, czl - ch - 0.006), P(cxl + ch + 0.006, top + 0.012, czl + ch + 0.006), P(cxl - ch - 0.006, top + 0.012, czl + ch + 0.006)];
  items.push({ k: "poly", pts: flat(...capT), color: "#f7faff" });
  // A thin curl of smoke.
  const sm = P(cxl, top + 0.03, czl);
  for (let i = 0; i < 5; i++) items.push({ k: "circ", x: sm[0] + Math.sin(i * 1.2) * 3 + i * 3, y: sm[1] - 6 - i * 8, r: 3 + i * 1.8, color: "#c8d0e4", alpha: 0.16 - i * 0.025, blur: 6 });
}

/** The lamp post and its pool of warm light. */
function lampPost(items: Item[]) {
  const gy = groundHeight(LAMP.x, LAMP.z);
  const b = project(LAMP.x, gy, LAMP.z);
  const t = project(LAMP.x, gy + LAMP.h, LAMP.z);
  items.push({ k: "poly", pts: ellipsePts(b.x + 4, b.y + 1, 9, 2.5, 14), color: rgba(40, 56, 100, 1), alpha: 0.45, blur: 2 });
  items.push({ k: "poly", pts: [b.x, b.y, t.x, t.y], color: "#232830", stroke: 2, closed: false });
  items.push({ k: "poly", pts: [b.x - 3, b.y, b.x + 3, b.y, b.x + 1.5, b.y - 5, b.x - 1.5, b.y - 5], color: "#232830" });
  const hy = t.y - 4;
  items.push({ k: "circ", x: t.x, y: hy, r: 24, color: "#ffc766", alpha: 0.28, blur: 12 });
  items.push({ k: "circ", x: t.x, y: hy, r: 12, color: "#ffc766", alpha: 0.5, blur: 6 });
  items.push({ k: "poly", pts: [t.x - 5, hy + 5, t.x + 5, hy + 5, t.x + 4, hy + 7, t.x - 4, hy + 7], color: "#232830" });
  items.push({ k: "poly", pts: [t.x - 5, hy + 5, t.x - 5, hy - 5, t.x + 5, hy - 5, t.x + 5, hy + 5], color: "#fff0bf", rgrad: { cx: t.x, cy: hy, r: 7, c0: "#ffffff", c1: "#ffc766" } });
  items.push({ k: "poly", pts: [t.x - 5.5, hy - 5, t.x, hy - 10, t.x + 5.5, hy - 5], color: "#232830" });
  items.push({ k: "poly", pts: ellipsePts(b.x, b.y + 1, 26, 6, 18), color: "#ffc66e", alpha: 0.3, blur: 7 });
}

/** Build the layers that never change. All coordinates are in design pixels with the globe at rest. */
export function staticScene() {
  const shadow: Item[] = [];
  const R = RP * 0.985;

  // Table shadow, soft and wide.
  shadow.push({ k: "poly", pts: ellipsePts(CX + 6, 356, 152, 17, 36), color: "#000000", alpha: 0.42, blur: 16 });
  shadow.push({ k: "poly", pts: ellipsePts(CX, 351, 122, 8, 30), color: "#000000", alpha: 0.4, blur: 7 });

  // Backdrop painted on the back of the glass: night sky to a warm dusk glow, far hills.
  const back: Item[] = [];
  back.push({ k: "poly", pts: ellipsePts(CX, CY, R, R, 64), color: "#1c2b4e", grad: { x0: CX, y0: CY - R, x1: CX, y1: CY + R * 0.7, c0: "#121c40", c1: "#9a7a86" } });
  back.push({ k: "poly", pts: ellipsePts(CX, CY, R, R, 64), color: "#000", alpha: 1, rgrad: { cx: CX - 30, cy: CY + 44, r: R * 0.95, c0: rgba(255, 186, 120, 0.46), c1: rgba(255, 186, 120, 0) } });
  const stars = [[-70, -92], [-24, -104], [38, -96], [78, -70], [-96, -52], [12, -70], [58, -108], [-52, -76], [100, -34], [-100, -8], [-8, -88], [-38, -60], [90, -92], [-84, -80], [28, -112]];
  stars.forEach(([sx, sy], i) => back.push({ k: "circ", x: CX + sx, y: CY + sy, r: i % 4 === 0 ? 1.2 : 0.8, color: "#ffffff", alpha: 0.5 + (i % 3) * 0.15 }));
  back.push({ k: "circ", x: CX + 66, y: CY - 70, r: 18, color: "#fff7df", alpha: 0.22, blur: 12 });
  back.push({ k: "circ", x: CX + 66, y: CY - 70, r: 8.2, color: "#fff9e8", alpha: 0.96 });
  back.push({ k: "circ", x: CX + 69, y: CY - 72, r: 7.2, color: "#1d2a4e", alpha: 0.16 });
  back.push({ k: "circ", x: CX + 63, y: CY - 67, r: 1.6, color: "#d8cfb4", alpha: 0.5 });
  back.push({ k: "circ", x: CX + 67, y: CY - 73, r: 1.1, color: "#d8cfb4", alpha: 0.4 });
  back.push({
    k: "poly", pts: hillBelowRidge(R, (x) => CY + 18 - 22 * Math.sin((x - CX) / 38 + 0.8) - 10 * Math.sin((x - CX) / 15)),
    color: "#5d6f96", grad: { x0: CX, y0: CY - 20, x1: CX, y1: CY + 60, c0: "#8294b8", c1: "#4f628c" },
  });
  // Distant pines on the far ridge.
  for (let i = 0; i < 9; i++) {
    const px = CX - 98 + i * 24 + ((i * 13) % 7), ph = 12 + ((i * 7) % 6), py = CY + 22 - 20 * Math.sin((px - CX) / 38 + 0.8) - 9 * Math.sin((px - CX) / 15) + 3;
    back.push({ k: "poly", pts: [px, py - ph, px + ph * 0.32, py, px - ph * 0.32, py], color: "#3f5280", alpha: 0.85 });
  }
  back.push({
    k: "poly", pts: hillBelowRidge(R, (x) => CY + 38 - 14 * Math.sin((x - CX) / 30 - 0.6) - 7 * Math.sin((x - CX) / 12 + 1)),
    color: "#e7edf8", grad: { x0: CX, y0: CY + 20, x1: CX, y1: CY + 90, c0: "#f1f5fc", c1: "#b9c6df" },
  });

  // Ground: skirt below it (down to the neck of the globe), snowy top, drifts, shadows and glitter.
  const ground: Item[] = [];
  const gc = project(0, groundHeight(0, 0) - 0.04, 0);
  const outline: number[] = [];
  const NG = 48;
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * Math.PI * 2;
    const x0 = Math.cos(a), z0 = Math.sin(a);
    let h = groundHeight(x0 * 0.8, z0 * 0.8);
    const reach = groundReach(h);
    const px = x0 * reach, pz = z0 * reach;
    h = groundHeight(px, pz);
    const p = project(px, h, pz);
    outline.push(p.x, p.y);
  }
  const frontIdx: number[] = [];
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * Math.PI * 2;
    if (Math.sin(a) <= 0.0001) frontIdx.push(i);
  }
  const skirt: number[] = [];
  const left = project(-groundReach(groundHeight(-0.85, 0)), groundHeight(-0.85, 0), 0);
  const right = project(groundReach(groundHeight(0.85, 0)), groundHeight(0.85, 0), 0);
  skirt.push(left.x, left.y);
  const fr = frontIdx.map((i) => [outline[i * 2], outline[i * 2 + 1]]).sort((a, b) => a[0] - b[0]);
  for (const [x, y] of fr) skirt.push(x, y);
  skirt.push(right.x, right.y);
  const below = circleBelow(Math.min(left.y, right.y), R);
  ground.push({ k: "poly", pts: [...skirt, ...below], color: "#cfd9ee", grad: { x0: CX, y0: gc.y, x1: CX, y1: CY + R, c0: "#e4ecf9", c1: "#6d7ba3" } });
  ground.push({ k: "poly", pts: outline, color: "#eef3fc", grad: { x0: CX - 80, y0: gc.y - 40, x1: CX + 90, y1: gc.y + 36, c0: "#ffffff", c1: "#bccaea" } });
  // Drifts: soft blue hollows and bright crests.
  const blobs: [number, number, number, number, string, number][] = [
    [0.35, -0.3, 54, 11, "#7890c4", 0.3], [-0.45, -0.35, 40, 8, "#7890c4", 0.26], [0.0, -0.55, 60, 9, "#9fb2dd", 0.3],
    [0.5, 0.1, 40, 8, "#fff", 0.55], [-0.2, -0.1, 46, 8, "#fff", 0.5], [-0.55, 0.3, 36, 7, "#8aa0cf", 0.26],
  ];
  for (const [bx, bz, rx, ry, col, al] of blobs) {
    const p = project(bx, groundHeight(bx, bz), bz);
    ground.push({ k: "poly", pts: ellipsePts(p.x, p.y, rx, ry, 22), color: col, alpha: al, blur: 9 });
  }
  // Warm pools of lamp and window light on the snow.
  const lp = project(LAMP.x, groundHeight(LAMP.x, LAMP.z), LAMP.z);
  ground.push({ k: "poly", pts: ellipsePts(lp.x, lp.y + 2, 58, 13, 24), color: "#ffc66e", alpha: 0.42, blur: 12 });
  // Cast shadows from the moon, falling to the lower right.
  for (const t of TREES) {
    const b = project(t.x, groundHeight(t.x, t.z), t.z);
    const H = t.h * RP * b.s, W = t.w * RP * b.s * 0.5;
    const len = H * 0.6;
    ground.push({ k: "poly", pts: [b.x - W * 0.3, b.y, b.x + W * 0.3, b.y + 1, b.x + len * 0.92, b.y + len * 0.2, b.x + len * 0.78, b.y + len * 0.13], color: rgba(46, 64, 112, 1), alpha: 0.33, blur: 4 });
    ground.push({ k: "poly", pts: ellipsePts(b.x, b.y + 1, W * 0.95, W * 0.22, 18), color: rgba(40, 56, 100, 1), alpha: 0.34, blur: 4 });
  }
  // Glitter, deterministic.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 190; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.82;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = groundHeight(x, z);
    if (Math.hypot(x, z) > groundReach(h) - 0.04) continue;
    const p = project(x, h, z);
    const hue = rnd();
    ground.push({ k: "circ", x: p.x, y: p.y, r: 0.45 + rnd() * 0.55, color: hue < 0.12 ? "#ffd8f4" : hue < 0.24 ? "#cfe8ff" : "#ffffff", alpha: 0.5 + rnd() * 0.5 });
  }

  const obj = (id: string, z: number, solids: number[], fn: (items: Item[]) => void): Layer => {
    const items: Item[] = [];
    fn(items);
    return { id, z, solids, items };
  };
  const trees = TREES.map((t) => obj(`pine${t.id}`, t.z - t.w * 0.45, [t.id], (it) => pine(it, t, t.id === 1 ? 0.34 : t.id === 2 ? 0.24 : t.id === 4 ? 0.1 : 0)));
  const layers: Layer[] = [
    { id: "backdrop", z: 9, solids: [], items: warp(back) },
    { id: "ground", z: 8, solids: [0], items: warp(ground) },
    ...trees.slice(0, 2),
    obj("house", HOUSE.z - HOUSE.hz, [HOUSE.id], cottage),
    ...trees.slice(2, 4),
    obj("lamp", LAMP.z, [LAMP.id], lampPost),
    trees[4],
  ];
  for (let i = 2; i < layers.length; i++) layers[i] = { ...layers[i], items: warp(layers[i].items) };
  layers.sort((a, b) => b.z - a.z || 0);

  // Glass in front: water tint and refraction, fresnel rim, window reflections, chromatic fringe, brass collar and base.
  const glass: Item[] = [];
  const GR = RP * 1.045;
  // The water is slightly blue-green and thicker toward the rim, so the rim darkens and cools.
  glass.push({ k: "poly", pts: ellipsePts(CX, CY, R, R, 64), color: "#000", alpha: 1, rgrad: { cx: CX, cy: CY, r: R, c0: "rgba(120,190,210,0)", c1: "rgba(70,130,170,0.34)" } });
  glass.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 8, GR - 8, 64), color: "#0a142c", stroke: 14, alpha: 0.32, blur: 6 });
  // Light bent by the lower glass: a bright caustic arc under the globe and a darker band above it.
  glass.push({ k: "poly", pts: ellipsePts(CX + 8, CY + RP * 0.8, 62, 6.5, 24), color: "#ffe2a8", alpha: 0.4, blur: 7 });
  glass.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 3, GR - 3, 64), color: "#ffffff", stroke: 5, alpha: 0.2, grad: { x0: CX - GR, y0: CY - GR, x1: CX + GR, y1: CY + GR, c0: "#ffffff", c1: "#8ec0ff" }, blur: 1.5 });
  // Chromatic edge: red and blue fringes either side of the rim.
  glass.push({ k: "poly", pts: ellipsePts(CX - 0.8, CY - 0.4, GR - 1.2, GR - 1.2, 64), color: "#ff7a5a", stroke: 0.9, alpha: 0.32 });
  glass.push({ k: "poly", pts: ellipsePts(CX + 0.9, CY + 0.5, GR - 3.4, GR - 3.4, 64), color: "#5aa2ff", stroke: 0.9, alpha: 0.34 });
  glass.push({ k: "poly", pts: ellipsePts(CX, CY, GR, GR, 64), color: "#ffffff", stroke: 1.6, alpha: 0.74, grad: { x0: CX - GR, y0: CY - GR, x1: CX + GR * 0.6, y1: CY + GR, c0: "#ffffff", c1: "#a4c8ff" } });
  glass.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 5.5, GR - 5.5, 64), color: "#ffffff", stroke: 0.7, alpha: 0.28 });
  // Softbox highlight at upper left, with the window's mullions in it.
  const hl: number[] = [];
  for (let i = 0; i <= 18; i++) { const a = Math.PI * (1.05 + (0.46 * i) / 18); hl.push(CX + Math.cos(a) * (GR - 11), CY + Math.sin(a) * (GR - 11)); }
  for (let i = 18; i >= 0; i--) { const a = Math.PI * (1.08 + (0.4 * i) / 18); hl.push(CX + Math.cos(a) * (GR - 27), CY + Math.sin(a) * (GR - 27)); }
  glass.push({ k: "poly", pts: hl, color: "#ffffff", alpha: 0.6, grad: { x0: CX - 70, y0: CY - 100, x1: CX - 30, y1: CY - 20, c0: "#ffffff", c1: "rgba(255,255,255,0.06)" }, blur: 1.2 });
  const px = CX - 52, py = CY - 56;
  glass.push({ k: "poly", pts: [px, py, px + 15, py - 8, px + 20, py + 4, px + 5, py + 13], color: "#ffffff", alpha: 0.58, blur: 0.8 });
  glass.push({ k: "poly", pts: [px + 19, py - 10, px + 33, py - 17, px + 38, py - 6, px + 24, py + 2], color: "#ffffff", alpha: 0.52, blur: 0.8 });
  glass.push({ k: "poly", pts: [px + 6, py + 20, px + 22, py + 11, px + 25, py + 18, px + 9, py + 27], color: "#ffffff", alpha: 0.22, blur: 1.2 });
  // Secondary reflection, lower right, and a thin rim glint.
  const h2: number[] = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI * (0.18 + (0.22 * i) / 14); h2.push(CX + Math.cos(a) * (GR - 9), CY + Math.sin(a) * (GR - 9)); }
  for (let i = 14; i >= 0; i--) { const a = Math.PI * (0.2 + (0.18 * i) / 14); h2.push(CX + Math.cos(a) * (GR - 16), CY + Math.sin(a) * (GR - 16)); }
  glass.push({ k: "poly", pts: h2, color: "#cfe4ff", alpha: 0.5, blur: 1 });
  glass.push({ k: "circ", x: CX - 78, y: CY - 76, r: 2.6, color: "#ffffff", alpha: 0.9, blur: 1 });

  // Neck collar and base.
  const ny = CY + RP * 0.78;
  const chord = Math.sqrt(GR * GR - (ny - CY) * (ny - CY));
  const collar = [CX - chord - 3, ny - 6, CX + chord + 3, ny - 6, CX + chord + 10, ny + 12, CX - chord - 10, ny + 12];
  glass.push({ k: "poly", pts: collar, color: "#b88a3e", grad: { x0: CX - chord, y0: ny, x1: CX + chord, y1: ny, c0: "#6a4a1c", c1: "#6a4a1c" } });
  glass.push({ k: "poly", pts: collar, color: "#ffffff", alpha: 0.95, grad: { x0: CX - chord, y0: ny, x1: CX + chord, y1: ny, c0: "#7d5a22", c1: "#f0cf86" } });
  glass.push({ k: "poly", pts: [CX - chord - 3, ny - 6, CX + chord + 3, ny - 6], color: "#fff3c4", alpha: 0.85, stroke: 1.2, closed: false });
  glass.push({ k: "poly", pts: [CX - chord - 8, ny + 3, CX + chord + 8, ny + 3], color: "#5c3f12", alpha: 0.5, stroke: 0.8, closed: false });
  glass.push({ k: "poly", pts: [CX - chord - 9, ny + 12, CX + chord + 9, ny + 12], color: "#3b2a10", alpha: 0.6, stroke: 1.2, closed: false });
  // The collar reflects the warm scene in a soft streak.
  glass.push({ k: "poly", pts: [CX - chord * 0.4, ny - 1, CX + chord * 0.1, ny - 1], color: "#fff6d8", alpha: 0.7, stroke: 2.4, blur: 2, closed: false });
  const t1y = ny + 12;
  glass.push({ k: "poly", pts: [CX - chord - 10, t1y, CX + chord + 10, t1y, CX + chord + 26, t1y + 30, CX - chord - 26, t1y + 30], color: "#3b2416", grad: { x0: CX - 110, y0: t1y, x1: CX + 110, y1: t1y, c0: "#704a34", c1: "#2a190f" } });
  glass.push({ k: "poly", pts: [CX - chord - 10, t1y, CX + chord + 10, t1y], color: "#a77a58", alpha: 0.7, stroke: 1, closed: false });
  const t2y = t1y + 30;
  glass.push({ k: "poly", pts: [CX - 112, t2y, CX + 112, t2y, CX + 118, t2y + 42, CX - 118, t2y + 42], color: "#2e1b10", grad: { x0: CX - 118, y0: t2y, x1: CX + 118, y1: t2y, c0: "#64402c", c1: "#20120a" } });
  for (let i = 0; i < 12; i++) {
    const yy = t2y + 4 + i * 3.2;
    glass.push({ k: "poly", pts: [CX - 112 + i * 0.6, yy, CX - 40 + (i % 3) * 20, yy + 0.9 + (i % 2) * 0.6, CX + 30 + (i % 2) * 24, yy - 0.6, CX + 112 - i * 0.6, yy + 0.4], color: i % 2 ? "#000000" : "#b78a64", alpha: i % 2 ? 0.14 : 0.07, stroke: 0.6, closed: false });
  }
  // Soft lamp-light on the base from the warm scene above it.
  glass.push({ k: "poly", pts: ellipsePts(CX, t1y + 2, 110, 6, 20), color: "#ffcf86", alpha: 0.16, blur: 8 });
  glass.push({ k: "poly", pts: [CX - 112, t2y, CX + 112, t2y], color: "#b78a64", alpha: 0.65, stroke: 1.2, closed: false });
  glass.push({ k: "poly", pts: [CX - 118, t2y + 42, CX + 118, t2y + 42], color: "#000000", alpha: 0.5, stroke: 1.6, closed: false });
  glass.push({ k: "poly", pts: [CX - 46, t2y + 12, CX + 46, t2y + 12, CX + 46, t2y + 32, CX - 46, t2y + 32], color: "#d2a550", grad: { x0: CX - 46, y0: t2y + 12, x1: CX + 46, y1: t2y + 32, c0: "#f6d994", c1: "#a67a2e" } });
  glass.push({ k: "poly", pts: [CX - 46, t2y + 12, CX + 46, t2y + 12, CX + 46, t2y + 32, CX - 46, t2y + 32], color: "#5a3f12", alpha: 0.7, stroke: 0.8 });
  glass.push({ k: "poly", pts: [CX - 28, t2y + 18.5, CX + 28, t2y + 18.5], color: "#6b4a14", alpha: 0.85, stroke: 1.4, closed: false });
  glass.push({ k: "poly", pts: [CX - 18, t2y + 25, CX + 18, t2y + 25], color: "#6b4a14", alpha: 0.7, stroke: 1.1, closed: false });
  glass.push({ k: "poly", pts: [CX - chord - 9, ny + 14, CX + chord + 9, ny + 14], color: "#ffffff", alpha: 0.12, stroke: 4, blur: 2, closed: false });

  return { shadow, layers, glass };
}

export type FrameData = { dx: number; dy: number; slots: Item[][]; speedHint: number };

let layerSig = "";
let slotOf: number[] = [];
let groundSlot = 1;
let solidSlot: number[] = [];

/** Tell the frame builder which layers exist, so flakes can be filed between them. */
export function bindLayers(layers: Layer[]) {
  const sig = layers.map((l) => l.id).join(",");
  if (sig === layerSig) return;
  layerSig = sig;
  slotOf = layers.map((l) => l.z);
  groundSlot = layers.findIndex((l) => l.id === "ground");
  solidSlot = [];
  layers.forEach((l, i) => l.solids.forEach((s) => { if (s > 0) solidSlot[s] = i; }));
}

/** The flakes for one frame, filed by layer, and the globe's offset. */
export function buildFrame(w: SnowWorld, layers: Layer[]): FrameData {
  bindLayers(layers);
  const slots: Item[][] = layers.map(() => []);
  const house = project(HOUSE.x, groundHeight(HOUSE.x, HOUSE.z) + 0.14, HOUSE.z);
  const lamp = project(LAMP.x, groundHeight(LAMP.x, LAMP.z) + LAMP.h, LAMP.z);
  for (const f of w.flakes) {
    const p = project(f.x, f.y, f.z);
    // Nearer flakes are bigger, brighter and softer (shallow depth of field).
    const near = Math.max(0, Math.min(1, (0.9 - p.depth) / 1.8));
    const [lx, ly, mag] = lens(p.x, p.y);
    let r = f.size * (0.62 + 0.4 * near) * p.s * (0.5 + 0.5 * mag);
    const tw = f.rest ? 1 : 0.7 + 0.3 * Math.sin(f.phase + w.t * f.spin);
    const alpha = (f.rest ? 0.7 : 0.95) * (0.55 + 0.45 * near) * tw;
    // Warm tint from the window and lamp light, cool in the shade.
    const dw = Math.hypot(lx - house.x, ly - house.y);
    const dl = Math.hypot(lx - lamp.x, ly - lamp.y);
    const warm = Math.max(0, 1 - Math.min(dw, dl) / 56);
    const g = Math.round(247 - warm * 18), b = Math.round(255 - warm * 70);
    const color = `rgb(255,${g},${b})`;
    const blur = near > 0.8 && !f.rest ? 1.6 : 0;
    if (blur) r *= 1.05;
    const item: Item = { k: "circ", x: lx, y: ly, r: f.rest ? Math.min(r * 0.75, 1.25) : r, color, alpha: Math.min(1, alpha), blur: blur || undefined };
    let slot = -1;
    if (f.rest && f.on > 0 && solidSlot[f.on] !== undefined) slot = solidSlot[f.on];
    else {
      // After every layer that sits behind the flake, never before the ground.
      slot = groundSlot;
      for (let i = groundSlot + 1; i < slotOf.length; i++) if (slotOf[i] > f.z) slot = i;
    }
    slots[slot].push(item);
  }
  return { dx: w.cx * RP, dy: -w.cy * RP, slots, speedHint: w.energy };
}
