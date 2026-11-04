/* Layout and palette shared by the Skia source and the Canvas2D preview.
   Viewport invariant: a ball held at the maximum drag angle (maxTheta = 1.25
   rad in cradleMath) must stay fully inside the canvas. The canvas is widened
   (not the swing narrowed) to guarantee it:
     pivotX(0) - STRING_LEN * sin(1.25) - BALL_R = 228 - 205.0 - 15 = 8.0 px
   and symmetric on the right (576 - 8.0 = 568.0). Renderers scale this design
   space down to the host; keep the invariant when retuning. */
export const CRADLE_W = 576;
export const CRADLE_H = 380;
export const CRADLE_BACKGROUND = "#f3efe6";
export const CRADLE_BALLS = 5;
export const BALL_R = 15;
export const PIVOT_Y = 44;
export const STRING_LEN = 216;
export const BALL_SPACING = BALL_R * 2;
export const CENTER_X = CRADLE_W / 2;
export const PIVOT_DX = 5;
export const REST_BALL_Y = PIVOT_Y + STRING_LEN;
export const SHADOW_Y = 332;

export const FRAME_BAR = "#9aa5ae";
export const FRAME_EDGE = "#5c666e";
export const FRAME_POST = "#8b96a0";
export const BASE_TOP = "#8b6b4a";
export const BASE_SIDE = "#6d5238";
export const STRING_COLOR = "#3f4a52";
export const BALL_BASE = "#7d8890";
export const BALL_RIM = "#454f56";
export const CHROME_STOPS = ["#fdfefe", "#c3ccd2", "#5f6a72"] as const;
export const SPECULAR = "rgba(255,255,255,0.95)";

export function pivotX(i: number): number {
  "worklet";
  return CENTER_X + (i - (CRADLE_BALLS - 1) / 2) * BALL_SPACING;
}
