// The picture behind the glass, as plain data in pane points: a harbor at
// sunrise with a city skyline and a sun path on the water. One description
// feeds both the Skia texture and the website's Canvas 2D preview.
export const PANE_W = 340;
export const PANE_H = 460;

export type DesignItem =
  | { k: "vgrad"; x: number; y: number; w: number; h: number; from: string; to: string; mid?: string }
  | { k: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { k: "circle"; x: number; y: number; r: number; color: string }
  | { k: "poly"; points: number[]; color: string };

function skyline(): DesignItem[] {
  const out: DesignItem[] = [];
  // [x, width, height] towers standing on the shoreline y = 292.
  const towers: [number, number, number][] = [
    [0, 26, 74], [24, 20, 108], [42, 30, 66], [70, 18, 130], [86, 26, 90], [110, 34, 58], [142, 22, 150],
    [162, 28, 84], [188, 20, 116], [206, 32, 70], [236, 24, 138], [258, 30, 92], [286, 22, 60], [306, 34, 102],
  ];
  for (const [x, w, h] of towers) {
    out.push({ k: "rect", x, y: 292 - h, w, h, color: h > 110 ? "#1c2a3f" : "#223249" });
    // lit windows
    for (let wy = 292 - h + 8; wy < 284; wy += 12) {
      for (let wx = x + 4; wx < x + w - 5; wx += 8) {
        if ((wx * 7 + wy * 3) % 5 < 2) out.push({ k: "rect", x: wx, y: wy, w: 3, h: 4, color: "#ffd9a0cc" });
      }
    }
  }
  return out;
}

export function glassSceneDesign(): DesignItem[] {
  const W = PANE_W;
  return [
    { k: "vgrad", x: 0, y: 0, w: W, h: 292, from: "#1d2b5c", mid: "#e0617a", to: "#ffc268" },
    { k: "circle", x: 170, y: 262, r: 78, color: "#ffe2a255" },
    { k: "circle", x: 170, y: 262, r: 54, color: "#fff0c2ee" },
    ...skyline(),
    { k: "vgrad", x: 0, y: 292, w: W, h: 168, from: "#f2a35f", to: "#14213a" },
    { k: "rect", x: 128, y: 300, w: 84, h: 3, color: "#fff0c299" },
    { k: "rect", x: 140, y: 312, w: 60, h: 3, color: "#fff0c277" },
    { k: "rect", x: 148, y: 326, w: 44, h: 3, color: "#fff0c25a" },
    { k: "rect", x: 154, y: 344, w: 32, h: 3, color: "#fff0c240" },
    { k: "rect", x: 158, y: 366, w: 24, h: 2.5, color: "#fff0c22e" },
    // two small boats
    { k: "poly", points: [60, 372, 112, 372, 104, 384, 68, 384], color: "#0f1a2e" },
    { k: "poly", points: [86, 372, 86, 344, 104, 372], color: "#e9ddc6" },
    { k: "poly", points: [236, 404, 290, 404, 282, 416, 244, 416], color: "#0b1426" },
    { k: "poly", points: [262, 404, 262, 378, 280, 404], color: "#e9ddc6" },
  ];
}

export const SHATTER_BACKDROP = "#0b1426";
