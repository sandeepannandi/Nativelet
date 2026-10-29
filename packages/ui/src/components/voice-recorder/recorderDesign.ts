// Palette and small geometry for the Voice Recorder. The bar borrows the
// site's light Geist card tones; the recording accent is a signal red.

export const REC_BACKGROUND = "#f6f8f4";
export const REC_BAR_BG = "#ffffff";
export const REC_BAR_BORDER = "#d5e1d2";
export const REC_GREEN = "#193f30"; // mic + send
export const REC_GREEN_SOFT = "#e6edde";
export const REC_WAVE = "#31533e";
export const REC_RED = "#e5484d";
export const REC_RED_SOFT = "#fbe9e7";
export const REC_TEXT = "#4b6053";
export const REC_TEXT_FAINT = "#8aa092";
export const REC_LOCK_BG = "#193f30";

// Parse #rrggbb into [r, g, b]. Worklet-safe (used inside derived values).
export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Mix two #rrggbb colors, f in 0..1, returning an "rgb(r,g,b)" string.
export function mixColor(a: string, b: string, f: number): string {
  'worklet';
  const t = f < 0 ? 0 : f > 1 ? 1 : f;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
