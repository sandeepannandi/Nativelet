// Scene and palette for Burn Dismiss. The card is an original procedural
// postcard: paper with fibre, a sunset photo, handwriting lines and a stamp.
// cardScene() returns plain draw items so the native example (Skia offscreen
// surface) and the Canvas2D web preview paint the identical card.

export const CARD_W = 340;
export const CARD_H = 460;

export type SceneItem =
  | { k: "vgrad"; x: number; y: number; w: number; h: number; from: string; to: string }
  | { k: "rect"; x: number; y: number; w: number; h: number; color: string; r?: number }
  | { k: "circle"; x: number; y: number; r: number; color: string }
  | { k: "poly"; points: number[]; color: string }
  | { k: "line"; points: number[]; color: string; width: number }
  | { k: "text"; x: number; y: number; size: number; color: string; text: string; align?: "left" | "center" | "right"; bold?: boolean };

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

export function cardScene(seed = 20261124): SceneItem[] {
  const items: SceneItem[] = [];
  // Paper.
  items.push({ k: "vgrad", x: 0, y: 0, w: CARD_W, h: CARD_H, from: "#faf5ea", to: "#f0e7d2" });
  // Paper fibre: faint short strokes, seeded so every platform matches.
  const rng = mulberry(seed);
  for (let i = 0; i < 170; i++) {
    const x = rng() * CARD_W;
    const y = rng() * CARD_H;
    const len = 3 + rng() * 9;
    const ang = (rng() - 0.5) * 0.9;
    items.push({
      k: "line",
      points: [x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len],
      color: rng() > 0.5 ? "rgba(120,98,64,0.10)" : "rgba(255,255,255,0.16)",
      width: 0.8,
    });
  }
  // Photo frame.
  items.push({ k: "rect", x: 18, y: 18, w: CARD_W - 36, h: 214, color: "#ffffff", r: 10 });
  items.push({ k: "rect", x: 18.75, y: 18.75, w: CARD_W - 37.5, h: 213, color: "rgba(90,70,40,0.18)", r: 10 });
  // Photo: sunset over hills, original procedural art.
  const px = 24, py = 24, pw = CARD_W - 48, ph = 202;
  items.push({ k: "vgrad", x: px, y: py, w: pw, h: ph, from: "#ffd9a3", to: "#f2766b" });
  // Sun with halo.
  items.push({ k: "circle", x: px + pw * 0.62, y: py + ph * 0.42, r: 30, color: "rgba(255,244,200,0.55)" });
  items.push({ k: "circle", x: px + pw * 0.62, y: py + ph * 0.42, r: 19, color: "#fff3c4" });
  // Far hills.
  items.push({
    k: "poly",
    points: [px, py + ph * 0.62, px + pw * 0.18, py + ph * 0.44, px + pw * 0.38, py + ph * 0.58, px + pw * 0.55, py + ph * 0.47, px + pw * 0.74, py + ph * 0.6, px + pw, py + ph * 0.5, px + pw, py + ph * 0.78, px, py + ph * 0.78],
    color: "#96506b",
  });
  // Near hills.
  items.push({
    k: "poly",
    points: [px, py + ph * 0.74, px + pw * 0.22, py + ph * 0.58, px + pw * 0.46, py + ph * 0.72, px + pw * 0.68, py + ph * 0.6, px + pw, py + ph * 0.74, px + pw, py + ph, px, py + ph],
    color: "#5f3450",
  });
  // Water band with sun reflection.
  items.push({ k: "vgrad", x: px, y: py + ph * 0.78, w: pw, h: ph * 0.22, from: "#e88a63", to: "#b4505e" });
  for (let i = 0; i < 6; i++) {
    const w = 14 - i * 1.8;
    const y = py + ph * (0.8 + i * 0.032);
    items.push({ k: "line", points: [px + pw * 0.62 - w, y, px + pw * 0.62 + w, y], color: "rgba(255,236,180,0.5)", width: 1.6 });
  }
  // Birds.
  items.push({ k: "line", points: [px + pw * 0.3, py + ph * 0.3, px + pw * 0.3 + 5, py + ph * 0.3 - 3, px + pw * 0.3 + 10, py + ph * 0.3], color: "#4a2c3c", width: 1.4 });
  items.push({ k: "line", points: [px + pw * 0.38, py + ph * 0.24, px + pw * 0.38 + 4, py + ph * 0.24 - 2.4, px + pw * 0.38 + 8, py + ph * 0.24], color: "#4a2c3c", width: 1.2 });
  // Title and handwriting lines.
  items.push({ k: "text", x: 24, y: 268, size: 19, color: "#3c2f22", text: "Hill station, day three", bold: true });
  items.push({ k: "text", x: 24, y: 296, size: 12.5, color: "#6d5c46", text: "The fog lifted before breakfast and the" });
  items.push({ k: "text", x: 24, y: 314, size: 12.5, color: "#6d5c46", text: "whole valley turned to amber. We walked" });
  items.push({ k: "text", x: 24, y: 332, size: 12.5, color: "#6d5c46", text: "the ridge until the lamps came on." });
  items.push({ k: "text", x: 24, y: 366, size: 12.5, color: "#6d5c46", text: "Wish you were here. Keep this one" });
  items.push({ k: "text", x: 24, y: 384, size: 12.5, color: "#6d5c46", text: "somewhere safe." });
  // Divider and footer.
  items.push({ k: "line", points: [24, 412, CARD_W - 24, 412], color: "rgba(90,70,40,0.25)", width: 1 });
  items.push({ k: "text", x: 24, y: 434, size: 10.5, color: "#8a7758", text: "SUNDAY · 7:12 PM" });
  // Postmark stamp.
  items.push({ k: "circle", x: CARD_W - 52, y: 428, r: 16, color: "rgba(150,100,60,0.55)" });
  items.push({ k: "circle", x: CARD_W - 52, y: 428, r: 14, color: "#f2e9d6" });
  items.push({ k: "text", x: CARD_W - 52, y: 433, size: 13, color: "#8a5a3a", text: "54", align: "center", bold: true });
  return items;
}
