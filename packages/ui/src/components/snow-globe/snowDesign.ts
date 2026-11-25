/*
  Snow Globe drawing. Turns the physics world into a flat draw list that the Skia component and the
  Canvas2D web preview both paint, so the two always show the same picture.

  The camera looks slightly down on the globe. The static scene is built once as four layers
  (table shadow, backdrop, mid-ground, foreground, glass and base) and the flakes are drawn between
  them by depth, so a flake behind the cottage is hidden by it and a flake in front of the trees is not.
*/
import { groundHeight, groundReach, type SnowWorld } from "./snowMath";

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

/** World (sphere radii, y up) to design pixels. depth is positive away from the viewer. */
export function project(x: number, y: number, z: number): Projected {
  const yy = y * COS + z * SIN;
  const depth = z * COS - y * SIN;
  const s = 1 / (1 + 0.1 * depth);
  return { x: CX + x * RP * s, y: CY - yy * RP * s, depth, s };
}

const rgba = (r: number, g: number, b: number, a: number) => `rgba(${r},${g},${b},${a})`;

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

function pine(items: Item[], wx: number, wz: number, h: number, w: number, lean = 0) {
  const gy = groundHeight(wx, wz);
  const base = project(wx, gy, wz);
  const s = base.s;
  const H = h * RP * s, W = w * RP * s;
  const cx = base.x, by = base.y;
  // Contact shadow on the snow.
  items.push({ k: "poly", pts: ellipsePts(cx + W * 0.25, by + 1, W * 0.62, W * 0.18, 20), color: rgba(52, 72, 112, 1), alpha: 0.42, blur: 3 });
  // Trunk.
  items.push({ k: "poly", pts: [cx - W * 0.07, by, cx + W * 0.07, by, cx + W * 0.06, by - H * 0.18, cx - W * 0.06, by - H * 0.18], color: "#4a3626" });
  // Three tiers, widest first. Each: dark body with a lit left side, snow on the upper edges.
  const tiers = [
    { y0: 0.14, y1: 0.5, hw: 0.5 },
    { y0: 0.36, y1: 0.76, hw: 0.38 },
    { y0: 0.6, y1: 1.0, hw: 0.25 },
  ];
  for (const t of tiers) {
    const yb = by - H * t.y0, yt = by - H * t.y1;
    const hw = W * t.hw;
    const tipx = cx + lean * (t.y1 * 4);
    items.push({
      k: "poly",
      pts: [cx - hw, yb, tipx, yt, cx + hw, yb, cx + hw * 0.4, yb + H * 0.03, cx - hw * 0.4, yb + H * 0.03],
      color: "#1f4a38",
      grad: { x0: cx - hw, y0: yb, x1: cx + hw, y1: yb, c0: "#2f6a4a", c1: "#143528" },
    });
    // Snow draped on the upper slopes.
    const mid = yt + (yb - yt) * 0.5;
    items.push({
      k: "poly",
      pts: [
        tipx, yt, tipx + hw * 0.52, mid - (yb - yt) * 0.04, tipx + hw * 0.3, mid + (yb - yt) * 0.02,
        tipx + hw * 0.1, mid - (yb - yt) * 0.02, tipx - hw * 0.12, mid + (yb - yt) * 0.04,
        tipx - hw * 0.32, mid - (yb - yt) * 0.01, tipx - hw * 0.5, mid + (yb - yt) * 0.02,
      ],
      color: "#f2f6fd",
      grad: { x0: tipx - hw, y0: yt, x1: tipx + hw, y1: mid, c0: "#ffffff", c1: "#cfd9ec" },
    });
  }
}

/** Build the layers that never change. All coordinates are in design pixels with the globe at rest. */
export function staticScene() {
  const shadow: Item[] = [];
  const s0: Item[] = [];
  const s1: Item[] = [];
  const s2: Item[] = [];
  const s3: Item[] = [];

  // Table shadow, soft and wide, and a warm bounce of light on the table.
  shadow.push({ k: "poly", pts: ellipsePts(CX + 6, 354, 150, 17, 36), color: "#000000", alpha: 0.42, blur: 16 });
  shadow.push({ k: "poly", pts: ellipsePts(CX, 350, 122, 8, 30), color: "#000000", alpha: 0.4, blur: 7 });

  // Backdrop painted on the back of the glass: a night sky going to a warm dusk glow at the horizon.
  const R = RP * 0.985;
  s0.push({
    k: "poly", pts: ellipsePts(CX, CY, R, R, 64), color: "#1c2b4e",
    grad: { x0: CX, y0: CY - R, x1: CX, y1: CY + R * 0.7, c0: "#16224a", c1: "#9a7a86" },
  });
  s0.push({ k: "poly", pts: ellipsePts(CX, CY, R, R, 64), color: "#000", alpha: 1, rgrad: { cx: CX - 30, cy: CY + 40, r: R * 0.9, c0: rgba(255, 190, 120, 0.42), c1: rgba(255, 190, 120, 0) } });
  // A few stars.
  const stars = [[-70, -92], [-24, -104], [38, -96], [78, -70], [-96, -52], [12, -70], [58, -108], [-52, -76], [100, -34], [-100, -8], [-8, -88]];
  for (const [sx, sy] of stars) s0.push({ k: "circ", x: CX + sx, y: CY + sy, r: 0.9, color: "#ffffff", alpha: 0.75 });
  // A pale moon, far away.
  s0.push({ k: "circ", x: CX + 66, y: CY - 70, r: 14, color: "#fff7df", alpha: 0.28, blur: 8 });
  s0.push({ k: "circ", x: CX + 66, y: CY - 70, r: 8.2, color: "#fff9e8", alpha: 0.95 });
  s0.push({ k: "circ", x: CX + 69, y: CY - 72, r: 7.2, color: "#1d2a4e", alpha: 0.18 });
  // Far hills, two ridges.
  s0.push({
    k: "poly",
    pts: hillBelowRidge(R, (x) => CY + 18 - 22 * Math.sin((x - CX) / 38 + 0.8) - 10 * Math.sin((x - CX) / 15)),
    color: "#5d6f96",
    grad: { x0: CX, y0: CY - 20, x1: CX, y1: CY + 60, c0: "#8294b8", c1: "#4f628c" },
  });
  s0.push({
    k: "poly",
    pts: hillBelowRidge(R, (x) => CY + 38 - 14 * Math.sin((x - CX) / 30 - 0.6) - 7 * Math.sin((x - CX) / 12 + 1)),
    color: "#e7edf8",
    grad: { x0: CX, y0: CY + 20, x1: CX, y1: CY + 90, c0: "#f1f5fc", c1: "#b9c6df" },
  });

  // Ground: the skirt below it (down to the neck of the globe), then the snowy top.
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
  // Skirt: everything inside the glass below the ground's front half.
  const frontIdx: number[] = [];
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * Math.PI * 2;
    if (Math.sin(a) <= 0.0001) frontIdx.push(i); // z <= 0 is toward the viewer
  }
  const skirt: number[] = [];
  const left = project(-groundReach(groundHeight(-0.85, 0)), groundHeight(-0.85, 0), 0);
  const right = project(groundReach(groundHeight(0.85, 0)), groundHeight(0.85, 0), 0);
  skirt.push(left.x, left.y);
  const fr = frontIdx.map((i) => [outline[i * 2], outline[i * 2 + 1]]).sort((a, b) => a[0] - b[0]);
  for (const [x, y] of fr) skirt.push(x, y);
  skirt.push(right.x, right.y);
  const below = circleBelow(Math.min(left.y, right.y), R);
  s1.push({
    k: "poly", pts: [...skirt, ...below], color: "#cfd9ee",
    grad: { x0: CX, y0: gc.y, x1: CX, y1: CY + R, c0: "#eaf0fa", c1: "#7d8cb2" },
  });
  s1.push({
    k: "poly", pts: outline, color: "#eef3fc",
    grad: { x0: CX - 80, y0: gc.y - 40, x1: CX + 90, y1: gc.y + 36, c0: "#ffffff", c1: "#c5d2ec" },
  });
  // Soft blue hollows and the warm light from the window and lamp on the snow.
  const hollow = project(0.35, groundHeight(0.35, -0.3), -0.3);
  s1.push({ k: "poly", pts: ellipsePts(hollow.x, hollow.y, 46, 10, 24), color: rgba(120, 140, 190, 1), alpha: 0.25, blur: 8 });
  const house = project(-0.3, groundHeight(-0.3, 0.25), 0.25);
  s1.push({ k: "poly", pts: ellipsePts(house.x + 6, house.y + 8, 56, 14, 24), color: "#ffc66e", alpha: 0.5, blur: 11 });

  // Cottage.
  const hx = house.x, hy = house.y;
  const wallW = 52, wallH = 30;
  s1.push({ k: "poly", pts: ellipsePts(hx + 10, hy + 2, wallW * 0.62, 7, 20), color: rgba(52, 72, 112, 1), alpha: 0.45, blur: 3 });
  // Side wall (darker) and front wall.
  s1.push({ k: "poly", pts: [hx + wallW / 2, hy, hx + wallW / 2 + 15, hy - 4, hx + wallW / 2 + 15, hy - wallH - 4, hx + wallW / 2, hy - wallH], color: "#8c5a3a", grad: { x0: hx + 26, y0: hy, x1: hx + 41, y1: hy, c0: "#7a4a30", c1: "#5a3524" } });
  s1.push({ k: "poly", pts: [hx - wallW / 2, hy, hx + wallW / 2, hy, hx + wallW / 2, hy - wallH, hx - wallW / 2, hy - wallH], color: "#b4754a", grad: { x0: hx - 26, y0: hy - wallH, x1: hx + 26, y1: hy, c0: "#c98558", c1: "#9a5f3e" } });
  // Wood plank lines.
  for (let i = 1; i < 5; i++) s1.push({ k: "poly", pts: [hx - wallW / 2, hy - i * 6, hx + wallW / 2, hy - i * 6], color: "#6d4128", alpha: 0.4, stroke: 0.6, closed: false });
  // Gabled roof: front face triangle, then the sloped roof plane with snow.
  const rt = hy - wallH - 22;
  s1.push({ k: "poly", pts: [hx - wallW / 2 - 4, hy - wallH, hx, rt, hx + wallW / 2 + 4, hy - wallH], color: "#6e3e2c", grad: { x0: hx, y0: rt, x1: hx, y1: hy - wallH, c0: "#7d4632", c1: "#5a3022" } });
  s1.push({ k: "poly", pts: [hx + wallW / 2 + 4, hy - wallH, hx, rt, hx + 14, rt - 5, hx + wallW / 2 + 19, hy - wallH - 4], color: "#52301f" });
  s1.push({ k: "poly", pts: [hx, rt, hx + 14, rt - 5, hx + wallW / 2 + 19, hy - wallH - 4, hx + wallW / 2 + 17, hy - wallH - 7, hx + 14, rt - 8, hx - 1, rt - 3], color: "#f7faff", grad: { x0: hx, y0: rt - 8, x1: hx + 40, y1: hy - wallH, c0: "#ffffff", c1: "#d3def2" } });
  s1.push({ k: "poly", pts: [hx - wallW / 2 - 5, hy - wallH + 1, hx, rt - 3, hx + 1, rt - 1, hx - wallW / 2 + 5, hy - wallH - 7, hx - wallW / 2 - 3, hy - wallH - 3], color: "#f4f8ff", grad: { x0: hx - 30, y0: rt, x1: hx - 20, y1: hy - wallH, c0: "#ffffff", c1: "#cdd8ee" } });
  // Chimney with a snow cap.
  s1.push({ k: "poly", pts: [hx + 14, rt + 8, hx + 14, rt - 14, hx + 22, rt - 14, hx + 22, rt + 3], color: "#7b4a3a" });
  s1.push({ k: "poly", pts: [hx + 12.5, rt - 14, hx + 23.5, rt - 14, hx + 22, rt - 18, hx + 14, rt - 18], color: "#f6f9ff" });
  // Window and door.
  s1.push({ k: "circ", x: hx - 12, y: hy - 17, r: 22, color: "#ffb454", alpha: 0.5, blur: 9 });
  s1.push({ k: "poly", pts: [hx - 20, hy - 24, hx - 6, hy - 24, hx - 6, hy - 11, hx - 20, hy - 11], color: "#ffd074", grad: { x0: hx - 13, y0: hy - 24, x1: hx - 13, y1: hy - 11, c0: "#fff0b0", c1: "#ffb040" } });
  s1.push({ k: "poly", pts: [hx - 13, hy - 24, hx - 13, hy - 11], color: "#5e3622", stroke: 1, closed: false });
  s1.push({ k: "poly", pts: [hx - 20, hy - 17.5, hx - 6, hy - 17.5], color: "#5e3622", stroke: 1, closed: false });
  s1.push({ k: "poly", pts: [hx - 20.8, hy - 24.8, hx - 5.2, hy - 24.8, hx - 5.2, hy - 10.2, hx - 20.8, hy - 10.2], color: "#5e3622", stroke: 1.4 });
  s1.push({ k: "poly", pts: [hx + 6, hy, hx + 6, hy - 18, hx + 17, hy - 18, hx + 17, hy], color: "#4c2c1e", grad: { x0: hx + 6, y0: hy, x1: hx + 17, y1: hy, c0: "#5c3523", c1: "#3b2116" } });
  s1.push({ k: "circ", x: hx + 15, y: hy - 9, r: 0.9, color: "#e8c46a" });
  // A far tree behind the house.
  pine(s1, 0.3, 0.5, 0.52, 0.3);
  pine(s1, 0.58, 0.36, 0.42, 0.24, 0.5);

  // Mid and front trees.
  pine(s2, 0.42, -0.02, 0.62, 0.34, -0.5);
  pine(s2, -0.62, -0.12, 0.5, 0.28, 0.4);
  pine(s2, 0.62, -0.24, 0.4, 0.22);
  // Lamp post with a warm glow.
  const lamp = project(0.02, groundHeight(0.02, -0.2), -0.2);
  s2.push({ k: "poly", pts: ellipsePts(lamp.x + 3, lamp.y + 1, 9, 2.5, 14), color: rgba(52, 72, 112, 1), alpha: 0.4, blur: 2 });
  s2.push({ k: "poly", pts: [lamp.x, lamp.y, lamp.x, lamp.y - 34], color: "#262b34", stroke: 1.8, closed: false });
  s2.push({ k: "circ", x: lamp.x, y: lamp.y - 37, r: 15, color: "#ffc766", alpha: 0.6, blur: 7 });
  s2.push({ k: "circ", x: lamp.x, y: lamp.y - 37, r: 4.4, color: "#fff4cf", rgrad: { cx: lamp.x, cy: lamp.y - 37, r: 4.4, c0: "#ffffff", c1: "#ffd275" } });
  s2.push({ k: "poly", pts: [lamp.x - 4, lamp.y - 33, lamp.x + 4, lamp.y - 33, lamp.x + 3, lamp.y - 31, lamp.x - 3, lamp.y - 31], color: "#262b34" });
  s2.push({ k: "poly", pts: ellipsePts(lamp.x, lamp.y - 1, 22, 5, 18), color: "#ffc66e", alpha: 0.35, blur: 6 });
  // Snow lip of the ground in front, so the trees sit in the snow.
  const frontLip = project(0, groundHeight(0, -0.78), -0.78);
  s2.push({ k: "poly", pts: ellipsePts(frontLip.x, frontLip.y + 2, 74, 8, 24), color: "#f6f9ff", alpha: 0.5, blur: 6 });

  // Glass: vignette where the sphere curves away, a fresnel ring, rim light and window reflections.
  const GR = RP * 1.045; // outer radius of the glass
  s3.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 8, GR - 8, 64), color: "#0a142c", stroke: 14, alpha: 0.3, blur: 6 });
  // Fresnel ring: brighter toward the edge, strongest at upper left.
  s3.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 2.5, GR - 2.5, 64), color: "#ffffff", stroke: 5, alpha: 0.2, grad: { x0: CX - GR, y0: CY - GR, x1: CX + GR, y1: CY + GR, c0: "#ffffff", c1: "#8ec0ff" }, blur: 1.5 });
  s3.push({ k: "poly", pts: ellipsePts(CX, CY, GR, GR, 64), color: "#ffffff", stroke: 1.6, alpha: 0.72, grad: { x0: CX - GR, y0: CY - GR, x1: CX + GR * 0.6, y1: CY + GR, c0: "#ffffff", c1: "#a4c8ff" } });
  s3.push({ k: "poly", pts: ellipsePts(CX, CY, GR - 5.5, GR - 5.5, 64), color: "#ffffff", stroke: 0.7, alpha: 0.28 });
  // Main softbox highlight: a curved pane at upper left.
  const hl: number[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * (1.05 + (0.46 * i) / 18);
    hl.push(CX + Math.cos(a) * (GR - 11), CY + Math.sin(a) * (GR - 11));
  }
  for (let i = 18; i >= 0; i--) {
    const a = Math.PI * (1.08 + (0.4 * i) / 18);
    hl.push(CX + Math.cos(a) * (GR - 27), CY + Math.sin(a) * (GR - 27));
  }
  s3.push({ k: "poly", pts: hl, color: "#ffffff", alpha: 0.6, grad: { x0: CX - 70, y0: CY - 100, x1: CX - 30, y1: CY - 20, c0: "#ffffff", c1: "rgba(255,255,255,0.06)" }, blur: 1.2 });
  // The window itself, reflected: two small panes.
  const px = CX - 52, py = CY - 56;
  s3.push({ k: "poly", pts: [px, py, px + 15, py - 8, px + 20, py + 4, px + 5, py + 13], color: "#ffffff", alpha: 0.55, blur: 0.8 });
  s3.push({ k: "poly", pts: [px + 19, py - 10, px + 33, py - 17, px + 38, py - 6, px + 24, py + 2], color: "#ffffff", alpha: 0.5, blur: 0.8 });
  // Secondary highlight, lower right, and a thin rim glint.
  const h2: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (0.18 + (0.22 * i) / 14);
    h2.push(CX + Math.cos(a) * (GR - 9), CY + Math.sin(a) * (GR - 9));
  }
  for (let i = 14; i >= 0; i--) {
    const a = Math.PI * (0.2 + (0.18 * i) / 14);
    h2.push(CX + Math.cos(a) * (GR - 16), CY + Math.sin(a) * (GR - 16));
  }
  s3.push({ k: "poly", pts: h2, color: "#cfe4ff", alpha: 0.5, blur: 1 });
  // Light focused by the glass onto the snow: a warm crescent at the bottom.
  s3.push({ k: "poly", pts: ellipsePts(CX + 12, CY + RP * 0.78, 54, 7, 24), color: "#ffe2a8", alpha: 0.32, blur: 7 });

  // Neck collar and base. The glass ends where the brass ring sits.
  const ny = CY + RP * 0.78;
  const chord = Math.sqrt(GR * GR - (ny - CY) * (ny - CY));
  s3.push({ k: "poly", pts: [CX - chord - 3, ny - 6, CX + chord + 3, ny - 6, CX + chord + 10, ny + 12, CX - chord - 10, ny + 12], color: "#b88a3e", grad: { x0: CX - chord, y0: ny, x1: CX + chord, y1: ny, c0: "#7d5a22", c1: "#6a4a1c" } });
  s3.push({ k: "poly", pts: [CX - chord - 3, ny - 6, CX + chord + 3, ny - 6, CX + chord + 10, ny + 12, CX - chord - 10, ny + 12], color: "#ffffff", alpha: 0.9, grad: { x0: CX - chord, y0: ny, x1: CX + chord, y1: ny, c0: "#8a6426", c1: "#e8c476" } });
  s3.push({ k: "poly", pts: [CX - chord - 3, ny - 6, CX + chord + 3, ny - 6], color: "#fff3c4", alpha: 0.85, stroke: 1.2, closed: false });
  s3.push({ k: "poly", pts: [CX - chord - 9, ny + 12, CX + chord + 9, ny + 12], color: "#3b2a10", alpha: 0.6, stroke: 1.2, closed: false });
  // Dark walnut base, two tiers.
  const t1y = ny + 12;
  s3.push({ k: "poly", pts: [CX - chord - 10, t1y, CX + chord + 10, t1y, CX + chord + 26, t1y + 30, CX - chord - 26, t1y + 30], color: "#3b2416", grad: { x0: CX - 110, y0: t1y, x1: CX + 110, y1: t1y, c0: "#6a4430", c1: "#2f1c11" } });
  s3.push({ k: "poly", pts: [CX - chord - 10, t1y, CX + chord + 10, t1y], color: "#a77a58", alpha: 0.7, stroke: 1, closed: false });
  const t2y = t1y + 30;
  s3.push({ k: "poly", pts: [CX - 112, t2y, CX + 112, t2y, CX + 118, t2y + 42, CX - 118, t2y + 42], color: "#2e1b10", grad: { x0: CX - 118, y0: t2y, x1: CX + 118, y1: t2y, c0: "#5e3b28", c1: "#24150c" } });
  // Wood grain.
  for (let i = 0; i < 9; i++) {
    const yy = t2y + 5 + i * 4.2;
    s3.push({ k: "poly", pts: [CX - 112 + i * 0.6, yy, CX - 30 + (i % 3) * 20, yy + 0.8, CX + 40 + (i % 2) * 20, yy - 0.5, CX + 112 - i * 0.6, yy + 0.4], color: "#000000", alpha: 0.12, stroke: 0.6, closed: false });
  }
  s3.push({ k: "poly", pts: [CX - 112, t2y, CX + 112, t2y], color: "#b78a64", alpha: 0.65, stroke: 1.2, closed: false });
  s3.push({ k: "poly", pts: [CX - 118, t2y + 42, CX + 118, t2y + 42], color: "#000000", alpha: 0.5, stroke: 1.6, closed: false });
  // Brass plaque with engraved lines.
  s3.push({ k: "poly", pts: [CX - 46, t2y + 12, CX + 46, t2y + 12, CX + 46, t2y + 32, CX - 46, t2y + 32], color: "#d2a550", grad: { x0: CX - 46, y0: t2y + 12, x1: CX + 46, y1: t2y + 32, c0: "#f0cf86", c1: "#a67a2e" } });
  s3.push({ k: "poly", pts: [CX - 46, t2y + 12, CX + 46, t2y + 12, CX + 46, t2y + 32, CX - 46, t2y + 32], color: "#5a3f12", alpha: 0.7, stroke: 0.8 });
  s3.push({ k: "poly", pts: [CX - 28, t2y + 18.5, CX + 28, t2y + 18.5], color: "#6b4a14", alpha: 0.85, stroke: 1.4, closed: false });
  s3.push({ k: "poly", pts: [CX - 18, t2y + 25, CX + 18, t2y + 25], color: "#6b4a14", alpha: 0.7, stroke: 1.1, closed: false });
  // Sheen on the glass above the base.
  s3.push({ k: "poly", pts: [CX - chord - 9, ny + 14, CX + chord + 9, ny + 14], color: "#ffffff", alpha: 0.12, stroke: 4, blur: 2, closed: false });

  return { shadow, s0, s1, s2, s3 };
}

export type FrameData = { dx: number; dy: number; f1: Item[]; f2: Item[]; f3: Item[]; speedHint: number };

/** The flakes for one frame, split into depth layers, and the globe's offset. */
export function buildFrame(w: SnowWorld): FrameData {
  const f1: Item[] = [], f2: Item[] = [], f3: Item[] = [];
  const house = project(-0.3, groundHeight(-0.3, 0.25) + 0.12, 0.25);
  const lamp = project(0.02, groundHeight(0.02, -0.2) + 0.2, -0.2);
  for (const f of w.flakes) {
    const p = project(f.x, f.y, f.z);
    // Nearer flakes are bigger, brighter and softer (shallow depth of field).
    const near = Math.max(0, Math.min(1, (0.9 - p.depth) / 1.8));
    let r = f.size * (0.62 + 0.4 * near) * p.s;
    const tw = f.rest ? 1 : 0.7 + 0.3 * Math.sin(f.phase + w.t * f.spin);
    let alpha = (f.rest ? 0.6 : 0.95) * (0.55 + 0.45 * near) * tw;
    // Warm tint from the window and lamp light.
    const dw = Math.hypot(p.x - house.x, p.y - house.y);
    const dl = Math.hypot(p.x - lamp.x, p.y - lamp.y);
    const warm = Math.max(0, 1 - Math.min(dw, dl) / 52);
    const g = Math.round(247 - warm * 18), b = Math.round(255 - warm * 70);
    const color = `rgb(255,${g},${b})`;
    const blur = near > 0.8 && !f.rest ? 1.6 : 0;
    if (blur) r *= 1.05;
    const item: Item = { k: "circ", x: p.x, y: p.y, r: f.rest ? Math.min(r * 0.7, 1.1) : r, color, alpha: Math.min(1, alpha), blur: blur || undefined };
    if (f.rest) { f2.push(item); continue; }
    if (f.z > 0.3) f1.push(item);
    else if (f.z > -0.15) f2.push(item);
    else f3.push(item);
  }
  return { dx: w.cx * RP, dy: -w.cy * RP, f1, f2, f3, speedHint: w.energy };
}
