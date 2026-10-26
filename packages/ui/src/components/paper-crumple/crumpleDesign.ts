// Palette for Paper Crumple. Ten tone levels per paper kind, from the
// deepest crease shadow to a lit facet. Kind 0 is plain paper, kind 1 is a
// pale blue ruled band so the sheet's distortion is readable while it folds.

export const CRUMPLE_BACKGROUND = "#e9e6df";
export const CRUMPLE_BG_TOP = "#f1eee8";
export const CRUMPLE_BG_BOTTOM = "#dcd8cf";
export const CRUMPLE_SHADOW = "rgba(40,34,24,0.34)";

const PAPER_DARK = [112, 106, 94];
const PAPER_LIGHT = [252, 250, 244];
const RULED_DARK = [96, 108, 128];
const RULED_LIGHT = [214, 228, 248];

function ramp(dark: number[], light: number[], levels: number) {
  const out: string[] = [];
  for (let i = 0; i < levels; i++) {
    const t = i / (levels - 1);
    // Ease toward light so most facets read as clean paper and only
    // creases darken.
    const e = Math.pow(t, 0.8);
    const r = Math.round(dark[0] + (light[0] - dark[0]) * e);
    const g = Math.round(dark[1] + (light[1] - dark[1]) * e);
    const b = Math.round(dark[2] + (light[2] - dark[2]) * e);
    out.push(`rgb(${r},${g},${b})`);
  }
  return out;
}

export const CRUMPLE_PAPER = ramp(PAPER_DARK, PAPER_LIGHT, 10);
export const CRUMPLE_RULED = ramp(RULED_DARK, RULED_LIGHT, 10);
// Bucket id = layer * 20 + kind * 10 + level.
export const CRUMPLE_COLORS = [CRUMPLE_PAPER, CRUMPLE_RULED];
