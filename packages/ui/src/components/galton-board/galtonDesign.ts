/* Layout and palette shared by the Skia source and the Canvas2D preview.
   Viewport invariant: the whole board (frame, pegs, bins, balls) is drawn as
   one group scaled by BOARD_SCALE about the board centre, so that at the
   maximum drag tilt (GALTON_DEFAULTS.tiltMax = 0.12 rad in galtonMath) every
   corner of the 576x720 board stays inside the canvas:
     x extent: 0.86 * (288*cos 0.12 + 360*sin 0.12) = 0.86 * (285.9 + 43.1) = 283.0 < 288
     y extent: 0.86 * (288*sin 0.12 + 360*cos 0.12) = 0.86 * (34.5 + 357.4) = 337.0 < 360
   Renderers scale this design space down to the host; keep the invariant
   when retuning. */
export const GALTON_W = 576;
export const GALTON_H = 720;
export const BOARD_SCALE = 0.86;
export const CENTER_X = GALTON_W / 2;
export const CENTER_Y = GALTON_H / 2;

export const BOARD_BACKGROUND = "#f5f6f7";
export const FRAME_OUTER = "#6d5238";
export const FRAME_EDGE = "#573f29";
export const PANEL = "#f5f1e6";
export const PANEL_SHADOW = "#e6dfc9";
export const WALL_L = 34;
export const WALL_R = 542;
export const CEIL_Y = 26;
export const FLOOR_Y = 688;
export const BIN_TOP = 504;

export const ROWS = 10;
export const PEG_SX = 46;
export const PEG_SY = 38;
export const PEG_Y0 = 150;
export const PEG_R = 6;
export const BALL_R = 6;

export const FUNNEL = "#8b6b4a";
export const FUNNEL_DARK = "#6d5238";
export const DIVIDER = "#8b6b4a";
export const DIVIDER_DARK = "#6d5238";
export const PEG_RIM = "#7d5f23";
export const PEG_BASE = "#c9a24a";
export const PEG_HI = "#f2dd9a";
export const BALL_RIM = "#9c5a1e";
export const BALL_BASE = "#d1883a";
export const BALL_HI = "#f4b964";
export const CURVE_INK = "#6d5238";

export function pegX(row: number, j: number): number {
  "worklet";
  return CENTER_X + (j - (row - 1) / 2) * PEG_SX;
}
export function pegY(row: number): number {
  "worklet";
  return PEG_Y0 + (row - 1) * PEG_SY;
}
/* The last peg row has ROWS pegs at 99..477; dividers drop directly below
   each last-row peg, so the ROWS+1 bins are the gaps between them (the outer
   bins run from a wall to the first or last divider). */
export function binCenter(k: number): number {
  "worklet";
  /* Self-contained on purpose: on the Reanimated UI runtime an imported
     worklet's nested call to another worklet resolves to undefined
     ("undefined is not a function" in binCenter once the bell-curve overlay
     first renders, Android FATAL EXCEPTION main). dividerX(0) and
     dividerX(ROWS - 1) are inlined below; identical arithmetic. */
  const firstDivider = CENTER_X - ((ROWS - 1) / 2) * PEG_SX;
  const lastDivider = CENTER_X + ((ROWS - 1) / 2) * PEG_SX;
  if (k <= 0) return (WALL_L + firstDivider) / 2;
  if (k >= ROWS) return (lastDivider + WALL_R) / 2;
  return CENTER_X + (k - ROWS / 2) * PEG_SX;
}
/* Divider k = 0..ROWS-1 hangs below last-row peg k. */
export function dividerX(k: number): number {
  "worklet";
  return pegX(ROWS, k);
}
