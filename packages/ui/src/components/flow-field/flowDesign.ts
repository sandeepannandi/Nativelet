// Palette, streak geometry and speed buckets for the Flow Field. Slow
// particles read as deep indigo dots; stirring pushes them through blue
// and cyan into bright mint comets, so energy is visible as color.

export const FLOW_BACKGROUND = "#04060d";
export const FLOW_BG_TOP = "#0a1124";
export const FLOW_BG_BOTTOM = "#04060d";

// Speed bucket boundaries, px/s. Ambient riding sits mostly in buckets
// 0-1; a stirred paddle pushes nearby particles into 2-3.
export const FLOW_SPEED_LIMITS = [16, 38, 90];

export const FLOW_CORES = [
  "rgba(96,110,199,0.72)",
  "rgba(84,134,232,0.88)",
  "rgba(99,213,246,0.95)",
  "rgba(198,250,224,1)",
];
export const FLOW_GLOWS = [
  "rgba(70,83,168,0.05)",
  "rgba(63,116,224,0.07)",
  "rgba(76,201,240,0.10)",
  "rgba(158,246,214,0.13)",
];
// Core and glow stroke widths for the small and big size classes.
export const FLOW_STROKES = [1.5, 2.4];
export const FLOW_GLOW_STROKES = [5, 7.5];
export const FLOW_BIG_SIZE = 2.05;

// Streak window: the tail is the displacement over this many seconds,
// clamped so slow particles stay dots and fast ones stay inside the card.
export const FLOW_TRAIL_SECONDS = 0.055;
export const FLOW_TRAIL_MIN = 1.2;
export const FLOW_TRAIL_MAX = 15;

export const FLOW_VEILS = [
  // Slow ambient light patches behind the particles (screen-space depth).
  { cx: 74, cy: 88, r: 120, color: "rgba(48,72,180,0.10)" },
  { cx: 258, cy: 300, r: 140, color: "rgba(24,120,140,0.08)" },
] as const;
