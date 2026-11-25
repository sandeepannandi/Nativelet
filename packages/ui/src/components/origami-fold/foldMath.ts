/* Origami fold geometry. Pure TypeScript, no dependencies.

   The sheet is a list of flat convex facets stacked in layers. Each fold step
   is a crease line; every facet the crease crosses is cut in two and the side
   behind the crease swings over it by pi, ending reflected, flipped and on top
   of the pile. Posing the sheet at a fractional step rotates just those
   facets about the crease, so the same data folds forward and unfolds back. */

export type P2 = [number, number];
export type V3 = [number, number, number];

export type Facet = { pts: P2[]; layer: number; flipped: boolean };
export type CutFacet = Facet & { move: boolean; layerAfter: number };

/** Fold the side where n.p < d over onto the side where n.p > d. */
export type Crease = { nx: number; ny: number; d: number };

const R = Math.SQRT1_2;
/* Unit sheet, half-size 1. Four folds: corner to corner, the tip down to the
   middle of the long edge, the left half over, then the bottom edge up. */
export const CREASES: Crease[] = [
  { nx: R, ny: R, d: 0 },
  { nx: -R, ny: -R, d: -R },
  { nx: 1, ny: 0, d: 0 },
  { nx: 0, ny: 1, d: -0.42 },
];
export const STEP_NAMES = ["Fold corner to corner", "Tuck the tip down", "Fold the left half over", "Fold the base up"];
/** Layer spacing in sheet units, so stacked paper never z-fights. */
export const THICK = 0.012;
/** How far a freely swinging flap lags then leads its crease (radians). */
const BEND = 0.2;

function area(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Sutherland-Hodgman clip of a convex polygon to f(p) >= 0 (sign = 1) or f(p) <= 0 (sign = -1). */
function clip(pts: P2[], c: Crease, sign: 1 | -1): P2[] {
  const f = (p: P2) => sign * (c.nx * p[0] + c.ny * p[1] - c.d);
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= -1e-9) out.push(a);
    if ((fa > 1e-9 && fb < -1e-9) || (fa < -1e-9 && fb > 1e-9)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function reflect(p: P2, c: Crease): P2 {
  const s = c.nx * p[0] + c.ny * p[1] - c.d;
  return [p[0] - 2 * s * c.nx, p[1] - 2 * s * c.ny];
}

export type FoldModel = {
  /** states[i] is the flat sheet before step i; states[CREASES.length] is the finished fold. */
  states: Facet[][];
  /** cuts[i] is states[i] split along crease i, with the moving pieces flagged. */
  cuts: CutFacet[][];
};

export function buildModel(): FoldModel {
  const states: Facet[][] = [[{ pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]], layer: 0, flipped: false }]];
  const cuts: CutFacet[][] = [];
  for (const c of CREASES) {
    const cur = states[states.length - 1];
    const stay: Facet[] = [];
    const move: Facet[] = [];
    for (const f of cur) {
      const a = clip(f.pts, c, 1);
      const b = clip(f.pts, c, -1);
      if (a.length >= 3 && Math.abs(area(a)) > 1e-6) stay.push({ pts: a, layer: f.layer, flipped: f.flipped });
      if (b.length >= 3 && Math.abs(area(b)) > 1e-6) move.push({ pts: b, layer: f.layer, flipped: f.flipped });
    }
    const top = Math.max(0, ...stay.map((f) => f.layer), ...move.map((f) => f.layer));
    const maxMove = Math.max(0, ...move.map((f) => f.layer));
    const moved: Facet[] = move.map((f) => ({
      // reflecting reverses the winding, so reverse the points to keep them counter-clockwise
      pts: f.pts.map((p) => reflect(p, c)).reverse(),
      layer: top + 1 + (maxMove - f.layer),
      flipped: !f.flipped,
    }));
    const cut: CutFacet[] = [
      ...stay.map((f) => ({ ...f, move: false, layerAfter: f.layer })),
      ...move.map((f, i) => ({ ...f, move: true, layerAfter: moved[i].layer })),
    ];
    cuts.push(cut);
    states.push([...stay, ...moved]);
  }
  return { states, cuts };
}

export const MODEL = buildModel();
export const STEP_COUNT = CREASES.length;

export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));

export type PosedFacet = {
  /** Vertices in sheet space: x right, y away from the viewer, z up. */
  pts: V3[];
  /** Unit normal of the side that shows colour A, per vertex. */
  normals: V3[];
  flipped: boolean;
  moving: boolean;
  layer: number;
  /** Rotation angle of the moving flap, 0 to pi; 0 for pieces that stay put. */
  phi: number;
  /** Distance of each vertex from the crease, for shading ramps. */
  dist: number[];
  /** Height of the pile the flap lands on (sheet units). */
  floor: number;
};

/** Pose the sheet at fold progress u in [0, STEP_COUNT]. */
export function pose(u: number): PosedFacet[] {
  const uu = Math.max(0, Math.min(STEP_COUNT, u));
  const s = Math.min(STEP_COUNT - 1, Math.floor(uu));
  const e = uu - s;
  const c = CREASES[s];
  const phi = Math.PI * ease(e);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const out: PosedFacet[] = [];
  for (const f of MODEL.cuts[s]) {
    const zb = f.layer * THICK;
    const za = f.layerAfter * THICK;
    const sz = f.flipped ? -1 : 1;
    if (!f.move) {
      out.push({
        pts: f.pts.map((p) => [p[0], p[1], zb] as V3),
        normals: f.pts.map(() => [0, 0, sz] as V3),
        flipped: f.flipped,
        moving: false,
        layer: f.layer,
        phi: 0,
        dist: f.pts.map((p) => Math.abs(c.nx * p[0] + c.ny * p[1] - c.d)),
        floor: zb,
      });
      continue;
    }
    const pts: V3[] = [];
    const normals: V3[] = [];
    const dist: number[] = [];
    for (const p of f.pts) {
      const uAlong = c.nx * p[0] + c.ny * p[1] - c.d; // negative on the moving side
      const dd = Math.abs(uAlong);
      const pv = phi - BEND * Math.sin(2 * phi) * Math.min(1, dd / 1.3);
      const cv = Math.cos(pv);
      const sv = Math.sin(pv);
      const lift = zb + (za - zb) * (phi / Math.PI);
      // base point on the crease, then swing about it
      const bx = p[0] - uAlong * c.nx;
      const by = p[1] - uAlong * c.ny;
      pts.push([bx + uAlong * cv * c.nx, by + uAlong * cv * c.ny, lift - uAlong * sv]);
      normals.push([sz * sv * c.nx, sz * sv * c.ny, sz * cv]);
      dist.push(dd);
    }
    out.push({ pts, normals, flipped: f.flipped, moving: true, layer: f.layer, phi, dist, floor: 0 });
  }
  void cp;
  void sp;
  // the flap lands on whatever stays: record the pile height under it
  const stayTop = Math.max(0, ...out.filter((f) => !f.moving).map((f) => f.floor));
  for (const f of out) if (f.moving) f.floor = stayTop;
  return out;
}

export const facetArea = (f: Facet) => Math.abs(area(f.pts));
