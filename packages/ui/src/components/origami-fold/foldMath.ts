/* Origami fold geometry. Pure TypeScript, no dependencies.

   The sheet is a list of flat convex facets stacked in layers. A fold is a
   crease line anywhere on the sheet: every facet it crosses is cut in two and
   the side behind the crease swings over by pi, ending reflected, flipped and
   on top of the pile. Posing a cut at a fractional angle rotates just those
   facets about the crease, so the same data folds forward and unfolds back. */

export type P2 = [number, number];
export type V3 = [number, number, number];

export type Facet = { pts: P2[]; layer: number; flipped: boolean };
export type CutFacet = Facet & { move: boolean; layerAfter: number };

/** Fold the side where n.p < d over onto the side where n.p > d. */
export type Crease = { nx: number; ny: number; d: number };

/** Layer spacing in sheet units, so stacked paper never z-fights. */
export const THICK = 0.012;
/** Paper thickness per layer, shrunk for tall piles so a many-fold stack never towers over the sheet. */
export const thickFor = (maxLayer: number) => Math.min(THICK, 0.28 / Math.max(1, maxLayer));
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


/** True when two convex polygons share real area (touching edges do not count). */
function overlaps(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const len = Math.hypot(ex, ey);
      if (len < 1e-12) continue;
      const nx = -ey / len, ny = ex / len;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) { const d = nx * v[0] + ny * v[1]; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const v of b) { const d = nx * v[0] + ny * v[1]; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      if (aMax <= bMin + 1e-6 || bMax <= aMin + 1e-6) return false;
    }
  }
  return true;
}

/** Stack height of each item: one above the highest earlier item it actually overlaps, so
 *  paper never floats above a pile it does not touch. Items must come in bottom-to-top order. */
function localLayers(pts: P2[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    let h = 0;
    for (let j = 0; j < i; j++) if (out[j] + 1 > h && overlaps(pts[i], pts[j])) h = out[j] + 1;
    out.push(h);
  }
  return out;
}

export type Sheet = Facet[];
export const flatSheet = (): Sheet => [{ pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]], layer: 0, flipped: false }];
/** Facets beyond this and further folds are refused, to keep frames cheap. */
export const MAX_FACETS = 260;

/** Split the sheet along the crease. Returns null when the crease misses the paper (nothing to fold). */
export function cutSheet(sheet: Sheet, c: Crease): CutFacet[] | null {
  const stay: Facet[] = [];
  const move: Facet[] = [];
  for (const f of sheet) {
    const a = clip(f.pts, c, 1);
    const b = clip(f.pts, c, -1);
    if (a.length >= 3 && Math.abs(area(a)) > 1e-7) stay.push({ pts: a, layer: f.layer, flipped: f.flipped });
    if (b.length >= 3 && Math.abs(area(b)) > 1e-7) move.push({ pts: b, layer: f.layer, flipped: f.flipped });
  }
  if (!stay.length || !move.length || stay.length + move.length > MAX_FACETS) return null;
  // bottom-to-top order of the sheet after the fold: what stays, then the flap in reverse
  const stayS = [...stay].sort((x, y) => x.layer - y.layer);
  const moveS = [...move].sort((x, y) => y.layer - x.layer);
  const after = localLayers([...stayS.map((f) => f.pts), ...moveS.map((f) => f.pts.map((p) => reflect(p, c)))]);
  return [
    ...stayS.map((f, i) => ({ ...f, layer: after[i], move: false, layerAfter: after[i] })),
    ...moveS.map((f, i) => ({ ...f, move: true, layerAfter: after[stayS.length + i] })),
  ];
}

/** The flat sheet after the cut has been folded all the way over. */
export function applyCut(cuts: CutFacet[], c: Crease): Sheet {
  const out: Facet[] = cuts.map((f) =>
    f.move
      ? // reflecting reverses the winding, so reverse the points to keep them counter-clockwise
        { pts: f.pts.map((p) => reflect(p, c)).reverse(), layer: f.layerAfter, flipped: !f.flipped }
      : { pts: f.pts, layer: f.layer, flipped: f.flipped },
  );
  // keep layer numbers dense so a long session never stacks the paper up into the sky
  const ranks = Array.from(new Set(out.map((f) => f.layer))).sort((x, y) => x - y);
  return out.map((f) => ({ ...f, layer: ranks.indexOf(f.layer) }));
}

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

/** Pose a cut sheet with its flap swung to angle phi (0 flat, pi folded over). */
export function poseCuts(cuts: CutFacet[], c: Crease, phiIn: number): PosedFacet[] {
  const phi = Math.max(0, Math.min(Math.PI, phiIn));
  const out: PosedFacet[] = [];
  const th = thickFor(Math.max(0, ...cuts.map((f) => Math.max(f.layer, f.layerAfter))));
  for (const f of cuts) {
    const zb = f.layer * th;
    const za = f.layerAfter * th;
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
  // the flap lands on whatever stays: record the pile height under it
  const stayTop = Math.max(0, ...out.filter((f) => !f.moving).map((f) => f.floor));
  for (const f of out) if (f.moving) f.floor = stayTop;
  return out;
}

export const facetArea = (f: Facet) => Math.abs(area(f.pts));

/** The sheet lying flat, nothing moving. */
export function poseFlat(sheet: Sheet): PosedFacet[] {
  const th = thickFor(Math.max(0, ...sheet.map((f) => f.layer)));
  return sheet.map((f) => ({
    pts: f.pts.map((p) => [p[0], p[1], f.layer * th] as V3),
    normals: f.pts.map(() => [0, 0, f.flipped ? -1 : 1] as V3),
    flipped: f.flipped,
    moving: false,
    layer: f.layer,
    phi: 0,
    dist: f.pts.map(() => 1.2),
    floor: f.layer * th,
  }));
}

export const sheetArea = (sheet: Sheet) => sheet.reduce((t, f) => t + facetArea(f), 0);

export function pointInFacet(p: P2, pts: P2[]): boolean {
  let sg = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cr) < 1e-12) continue;
    if (sg === 0) sg = Math.sign(cr);
    else if (Math.sign(cr) !== sg) return false;
  }
  return true;
}

