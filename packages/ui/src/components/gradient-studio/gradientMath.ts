// Nativelet Gradient Studio math. MIT: retain the accompanying LICENSE.
// Pure functions: no React, no Skia. The native control, the Canvas2D web
// preview and the unit tests all run this same state machine.

export type Stop = { id: number; pos: number; h: number; s: number; v: number };
export type Drag =
  | { kind: "stop"; id: number; offset: number; remove: boolean }
  | { kind: "hue" }
  | { kind: "sv" }
  | { kind: "track" }
  | null;
export type Tween = { from: TweenStop[]; to: TweenStop[]; t: number; dur: number };
type TweenStop = { pos: number; rgb: [number, number, number] };

export type Studio = {
  stops: Stop[];
  selected: number;
  nextId: number;
  drag: Drag;
  down: boolean;
  moved: boolean;
  sx: number;
  sy: number;
  px: number;
  py: number;
  lift: number;
  liftV: number;
  pin: number;
  pinV: number;
  pop: number;
  popV: number;
  tween: Tween | null;
  reduced: boolean;
  lastKind: "hue" | "sv" | "stop" | null;
  lastStop: number;
};

// ---- geometry (canvas points) ----
export const GS_W = 340;
export const GS_H = 468;
export const PREVIEW = { x: 16, y: 16, w: 308, h: 140, r: 22 };
export const TRACK_X0 = 34;
export const TRACK_X1 = 306;
export const TRACK_Y = 192;
export const TRACK_H = 10;
export const HANDLE_R = 14;
export const REMOVE_DY = 52;
export const MAX_STOPS = 6;
export const MIN_STOPS = 2;
export const WHEEL_CX = 170;
export const WHEEL_CY = 338;
export const RING_OUT = 112;
export const RING_IN = 88;
export const RING_MID = (RING_OUT + RING_IN) / 2;
export const SQ = 58; // half side of the saturation / value square
export const LOUPE_R = 46;
export const LOUPE_DY = 92;
export const LOUPE_ZOOM = 3;
export const PIN_DY = 50;
export const PIN_R = 19;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);

// ---- colour ----
export type RGB = [number, number, number];

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export function rgbToHsv(rgb: RGB, hueHint = 0): { h: number; s: number; v: number } {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = hueHint;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    h = (h + 360) % 360;
  }
  return { h, s: max <= 1e-6 ? 0 : d / max, v: max };
}

export function rgbToHex(rgb: RGB): string {
  const c = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// Oklab (Bjorn Ottosson). Mixing here keeps lightness even across the ramp,
// where a plain sRGB mix goes muddy between saturated hues.
export function rgbToOklab(rgb: RGB): RGB {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(lab: RGB): RGB {
  const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
  const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
  const s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2], 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [clamp01(fromLinear(r)), clamp01(fromLinear(g)), clamp01(fromLinear(b))];
}

export function mixOklab(a: RGB, b: RGB, t: number): RGB {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  return oklabToRgb([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
}

// ---- stops and ramps ----
export const stopRgb = (s: Stop): RGB => hsvToRgb(s.h, s.s, s.v);
export const stopHex = (s: Stop) => rgbToHex(stopRgb(s));
export const sortedStops = (stops: Stop[]) => [...stops].sort((a, b) => a.pos - b.pos || a.id - b.id);

export function colorAt(stops: Stop[], t: number): RGB {
  const list = sortedStops(stops);
  if (list.length === 0) return [0, 0, 0];
  if (t <= list[0].pos) return stopRgb(list[0]);
  const last = list[list.length - 1];
  if (t >= last.pos) return stopRgb(last);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (t >= a.pos && t <= b.pos) {
      const span = b.pos - a.pos;
      return mixOklab(stopRgb(a), stopRgb(b), span < 1e-6 ? 0 : (t - a.pos) / span);
    }
  }
  return stopRgb(last);
}

// Dense Oklab samples handed to a plain linear gradient: the renderer does
// sRGB blending between samples that are only ~4% apart, so the ramp reads
// as an Oklab blend and stop positions stay exact.
export function gradientRamp(stops: Stop[], samples = 25): { colors: string[]; positions: number[] } {
  const ts = new Set<number>();
  for (let i = 0; i < samples; i++) ts.add(i / (samples - 1));
  for (const s of stops) ts.add(clamp01(s.pos));
  const sorted = Array.from(ts).sort((a, b) => a - b);
  const positions: number[] = [];
  const colors: string[] = [];
  for (const t of sorted) {
    if (positions.length && t - positions[positions.length - 1] < 1e-4) continue;
    positions.push(t);
    colors.push(rgbToHex(colorAt(stops, t)));
  }
  return { colors, positions };
}

export function gradientToCss(stops: Stop[]): string {
  const parts = sortedStops(stops).map((s) => `${stopHex(s)} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(in oklab 90deg, ${parts.join(", ")})`;
}

export type Preset = { name: string; colors: string[]; positions: number[] };
export const PRESETS: Preset[] = [
  { name: "Dusk", colors: ["#FF9966", "#C2509C", "#3A3D9E"], positions: [0, 0.5, 1] },
  { name: "Lagoon", colors: ["#6FF0D8", "#5C9BEF", "#26338A"], positions: [0, 0.52, 1] },
  { name: "Peach", colors: ["#FFE3B8", "#FF8FA3", "#9B5BD6"], positions: [0, 0.56, 1] },
  { name: "Moss", colors: ["#F1F7B8", "#8CCB86", "#1D6B58"], positions: [0, 0.48, 1] },
];

function stopsFromPreset(p: Preset, firstId: number): Stop[] {
  return p.colors.map((c, i) => {
    const hsv = rgbToHsv(hexToRgb(c));
    return { id: firstId + i, pos: p.positions[i], ...hsv };
  });
}

export function createStudio(preset: Preset = PRESETS[0], reduced = false): Studio {
  const stops = stopsFromPreset(preset, 1);
  return {
    stops,
    selected: stops[1].id,
    nextId: stops.length + 1,
    drag: null,
    down: false,
    moved: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
    lift: 0,
    liftV: 0,
    pin: 0,
    pinV: 0,
    pop: 1,
    popV: 0,
    tween: null,
    reduced,
    lastKind: null,
    lastStop: 0,
  };
}

export const posToX = (pos: number) => TRACK_X0 + pos * (TRACK_X1 - TRACK_X0);
export const xToPos = (x: number) => clamp01((x - TRACK_X0) / (TRACK_X1 - TRACK_X0));
export const selectedStop = (s: Studio): Stop => s.stops.find((t) => t.id === s.selected) ?? s.stops[0];

// ---- wheel geometry ----
export function hueFromPoint(x: number, y: number): number {
  const deg = (Math.atan2(y - WHEEL_CY, x - WHEEL_CX) * 180) / Math.PI;
  return (deg + 360) % 360;
}
export function ringPoint(hue: number, radius = RING_MID): { x: number; y: number } {
  const a = (hue * Math.PI) / 180;
  return { x: WHEEL_CX + Math.cos(a) * radius, y: WHEEL_CY + Math.sin(a) * radius };
}
export function svPoint(sat: number, val: number): { x: number; y: number } {
  return { x: WHEEL_CX - SQ + sat * 2 * SQ, y: WHEEL_CY - SQ + (1 - val) * 2 * SQ };
}
export function svFromPoint(x: number, y: number): { s: number; v: number } {
  return { s: clamp01((x - (WHEEL_CX - SQ)) / (2 * SQ)), v: 1 - clamp01((y - (WHEEL_CY - SQ)) / (2 * SQ)) };
}

export type Target = "stop" | "hue" | "sv" | "track" | null;
export function hitTarget(s: Studio, x: number, y: number): { kind: Target; id?: number } {
  let best: Stop | null = null;
  let bestD = HANDLE_R + 10;
  for (const st of s.stops) {
    const d = Math.hypot(x - posToX(st.pos), y - TRACK_Y);
    // On a tie the selected stop wins, so stacked handles stay reachable.
    if (d < bestD || (d === bestD && best && st.id === s.selected)) {
      best = st;
      bestD = d;
    }
  }
  if (best) return { kind: "stop", id: best.id };
  const dr = Math.hypot(x - WHEEL_CX, y - WHEEL_CY);
  if (dr >= RING_IN - 6 && dr <= RING_OUT + 12) return { kind: "hue" };
  if (Math.abs(x - WHEEL_CX) <= SQ + 8 && Math.abs(y - WHEEL_CY) <= SQ + 8) return { kind: "sv" };
  if (Math.abs(y - TRACK_Y) <= 20 && x >= TRACK_X0 - 10 && x <= TRACK_X1 + 10) return { kind: "track" };
  return { kind: null };
}

function withStop(s: Studio, id: number, patch: Partial<Stop>): Studio {
  return { ...s, stops: s.stops.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

function select(s: Studio, id: number): Studio {
  if (s.selected === id) return s;
  return { ...s, selected: id, pop: s.reduced ? 1 : 0.8, popV: 0 };
}

export function addStopAt(s: Studio, pos: number): Studio {
  if (s.stops.length >= MAX_STOPS) return s;
  const hsv = rgbToHsv(colorAt(s.stops, pos), selectedStop(s).h);
  const id = s.nextId;
  const stop: Stop = { id, pos: clamp01(pos), ...hsv };
  return select({ ...s, stops: [...s.stops, stop], nextId: id + 1, tween: null }, id);
}

export function removeStop(s: Studio, id: number): Studio {
  if (s.stops.length <= MIN_STOPS) return s;
  const gone = s.stops.find((t) => t.id === id);
  if (!gone) return s;
  const rest = s.stops.filter((t) => t.id !== id);
  const near = [...rest].sort((a, b) => Math.abs(a.pos - gone.pos) - Math.abs(b.pos - gone.pos))[0];
  const next = { ...s, stops: rest, tween: null };
  return s.selected === id ? select(next, near.id) : next;
}

export function pointerDown(s: Studio, x: number, y: number): Studio {
  let next: Studio = { ...s, down: true, moved: false, sx: x, sy: y, px: x, py: y, tween: null };
  const hit = hitTarget(next, x, y);
  if (hit.kind === "stop" && hit.id !== undefined) {
    const st = next.stops.find((t) => t.id === hit.id) as Stop;
    next = select(next, st.id);
    return { ...next, lastKind: "stop", lastStop: st.id, drag: { kind: "stop", id: st.id, offset: x - posToX(st.pos), remove: false } };
  }
  if (hit.kind === "hue") {
    const sel = selectedStop(next);
    next = withStop(next, sel.id, { h: hueFromPoint(x, y) });
    return { ...next, lastKind: "hue", drag: { kind: "hue" } };
  }
  if (hit.kind === "sv") {
    const sel = selectedStop(next);
    const sv = svFromPoint(x, y);
    next = withStop(next, sel.id, { s: sv.s, v: sv.v });
    return { ...next, lastKind: "sv", drag: { kind: "sv" } };
  }
  if (hit.kind === "track") return { ...next, drag: { kind: "track" } };
  return { ...next, drag: null };
}

export function pointerMove(s: Studio, x: number, y: number): Studio {
  if (!s.down) return s;
  const moved = s.moved || Math.hypot(x - s.sx, y - s.sy) > 6;
  let next: Studio = { ...s, px: x, py: y, moved };
  const d = s.drag;
  if (!d) return next;
  if (d.kind === "stop") {
    const pos = xToPos(x - d.offset);
    const remove = s.stops.length > MIN_STOPS && Math.abs(y - TRACK_Y) > REMOVE_DY;
    next = withStop(next, d.id, { pos });
    return { ...next, drag: { ...d, remove } };
  }
  if (d.kind === "hue") return withStop(next, s.selected, { h: hueFromPoint(x, y) });
  if (d.kind === "sv") {
    const sv = svFromPoint(x, y);
    return withStop(next, s.selected, { s: sv.s, v: sv.v });
  }
  return next;
}

export function pointerUp(s: Studio): Studio {
  const d = s.drag;
  let next: Studio = { ...s, down: false, drag: null };
  if (d && d.kind === "stop" && d.remove) return removeStop(next, d.id);
  if (d && d.kind === "track" && !s.moved) return addStopAt(next, xToPos(s.px));
  return next;
}

// ---- keyboard / assistive paths ----
export function moveSelected(s: Studio, delta: number): Studio {
  const sel = selectedStop(s);
  return withStop({ ...s, tween: null }, sel.id, { pos: clamp01(sel.pos + delta) });
}
export function selectNeighbour(s: Studio, dir: 1 | -1): Studio {
  const list = sortedStops(s.stops);
  const i = list.findIndex((t) => t.id === s.selected);
  return select(s, list[(i + dir + list.length) % list.length].id);
}
export function addAtWidestGap(s: Studio): Studio {
  const list = sortedStops(s.stops);
  const edges = [0, ...list.map((t) => t.pos), 1];
  let at = 0.5;
  let widest = -1;
  for (let i = 0; i < edges.length - 1; i++) {
    const gap = edges[i + 1] - edges[i];
    if (gap > widest) {
      widest = gap;
      at = (edges[i] + edges[i + 1]) / 2;
    }
  }
  return addStopAt(s, at);
}
export function removeSelected(s: Studio): Studio {
  return removeStop(s, s.selected);
}
export function nudgeHue(s: Studio, deg: number): Studio {
  const sel = selectedStop(s);
  return withStop({ ...s, tween: null }, sel.id, { h: (sel.h + deg + 360) % 360 });
}
export function nudgeSV(s: Studio, ds: number, dv: number): Studio {
  const sel = selectedStop(s);
  return withStop({ ...s, tween: null }, sel.id, { s: clamp01(sel.s + ds), v: clamp01(sel.v + dv) });
}

// ---- loupe and pin overlays ----
export type Overlay =
  | { kind: "loupe"; lx: number; ly: number; tx: number; ty: number; hex: string; amount: number }
  | { kind: "pin"; x: number; y: number; hex: string; amount: number; remove: boolean }
  | null;

export function overlayFor(s: Studio): Overlay {
  const sel = selectedStop(s);
  const kind = s.drag ? (s.drag.kind === "track" ? null : s.drag.kind) : s.lastKind;
  if ((kind === "hue" || kind === "sv") && s.lift > 0.002) {
    const target = kind === "hue" ? ringPoint(sel.h) : svPoint(sel.s, sel.v);
    const lx = clamp(s.px, LOUPE_R + 6, GS_W - LOUPE_R - 6);
    let ly = s.py - LOUPE_DY;
    if (ly < LOUPE_R + 6) ly = Math.min(s.py + LOUPE_DY, GS_H - LOUPE_R - 6);
    return { kind: "loupe", lx, ly, tx: target.x, ty: target.y, hex: stopHex(sel), amount: s.lift };
  }
  if (kind === "stop" && s.pin > 0.002) {
    const st = s.stops.find((t) => t.id === s.lastStop);
    if (!st) return null;
    const remove = !!s.drag && s.drag.kind === "stop" && s.drag.remove;
    return { kind: "pin", x: posToX(st.pos), y: TRACK_Y - PIN_DY, hex: stopHex(st), amount: s.pin, remove };
  }
  return null;
}

// ---- animation ----
function spring(x: number, v: number, target: number, dt: number, k = 320, c = 27): [number, number] {
  let px = x;
  let pv = v;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    pv += (-k * (px - target) - c * pv) * h;
    px += pv * h;
  }
  return [px, pv];
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function resample(stops: Stop[], count: number): TweenStop[] {
  const list = sortedStops(stops);
  if (list.length === count) return list.map((t) => ({ pos: t.pos, rgb: stopRgb(t) }));
  return Array.from({ length: count }, (_, i) => {
    const pos = count === 1 ? 0 : i / (count - 1);
    return { pos, rgb: colorAt(stops, pos) };
  });
}

export function startPreset(s: Studio, preset: Preset): Studio {
  const to: TweenStop[] = preset.colors.map((c, i) => ({ pos: preset.positions[i], rgb: hexToRgb(c) }));
  if (s.reduced) {
    const stops = stopsFromPreset(preset, s.nextId);
    return { ...s, stops, nextId: s.nextId + stops.length, selected: stops[Math.min(1, stops.length - 1)].id, tween: null };
  }
  const from = resample(s.stops, to.length);
  // Re-key the stops so each one has a partner to travel to. The picture does
  // not jump: the "from" ramp is the current gradient sampled at those slots.
  const keyed = from.map((f, i) => {
    const hsv = rgbToHsv(f.rgb, selectedStop(s).h);
    return { id: s.nextId + i, pos: f.pos, ...hsv };
  });
  const selIndex = Math.min(1, keyed.length - 1);
  return {
    ...s,
    stops: keyed,
    nextId: s.nextId + keyed.length,
    selected: keyed[selIndex].id,
    tween: { from, to, t: 0, dur: 0.75 },
  };
}

export function stepStudio(s: Studio, dt: number): Studio {
  const dtc = Math.min(dt, 0.05);
  let next = s;
  const liftTarget = s.drag && (s.drag.kind === "hue" || s.drag.kind === "sv") ? 1 : 0;
  const pinTarget = s.drag && s.drag.kind === "stop" ? 1 : 0;
  if (s.reduced) {
    next = { ...next, lift: liftTarget, liftV: 0, pin: pinTarget, pinV: 0, pop: 1, popV: 0 };
  } else {
    const [lift, liftV] = spring(s.lift, s.liftV, liftTarget, dtc);
    const [pin, pinV] = spring(s.pin, s.pinV, pinTarget, dtc);
    const [pop, popV] = spring(s.pop, s.popV, 1, dtc, 380, 18);
    next = { ...next, lift, liftV, pin, pinV, pop, popV };
  }
  if (s.tween) {
    const t = Math.min(1, s.tween.t + dtc / s.tween.dur);
    const e = easeInOut(t);
    const keep = selectedStop(s).h;
    const stops = s.stops.map((st, i) => {
      const a = s.tween!.from[i];
      const b = s.tween!.to[i];
      const rgb = mixOklab(a.rgb, b.rgb, e);
      const hsv = rgbToHsv(rgb, st.h || keep);
      return { ...st, pos: a.pos + (b.pos - a.pos) * e, ...hsv };
    });
    next = { ...next, stops, tween: t >= 1 ? null : { ...s.tween, t } };
  }
  return next;
}

export function isAnimating(s: Studio): boolean {
  if (s.tween) return true;
  const liftTarget = s.drag && (s.drag.kind === "hue" || s.drag.kind === "sv") ? 1 : 0;
  const pinTarget = s.drag && s.drag.kind === "stop" ? 1 : 0;
  return (
    Math.abs(s.lift - liftTarget) > 0.002 || Math.abs(s.liftV) > 0.01 ||
    Math.abs(s.pin - pinTarget) > 0.002 || Math.abs(s.pinV) > 0.01 ||
    Math.abs(s.pop - 1) > 0.002 || Math.abs(s.popV) > 0.01
  );
}
