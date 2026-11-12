// Polygon escapement geometry from measured reference (reference-geometry.json).
// World frame: origin at escape-wheel center, x right, y up, units (10 = tip radius).
// Fork arbor measured at world (0, 13.4) - matches production forkPivot=13.4.
import { readFileSync } from 'node:fs';
const REF = JSON.parse(readFileSync(new URL('./reference-geometry.json', import.meta.url)));

export const ARBOR = { x: 0, y: 13.4 };

// tooth club polygon, polar profile (da deg from tip ray, r units), closed to root r=7.4
export function toothPolygon(tipAngleRad) {
  const pts = [];
  const prof = REF.tooth_club_profile_da_r;
  const root = 7.4;
  pts.push(polar(tipAngleRad + deg(prof[0][0]), root));
  for (const [da, r] of prof) pts.push(polar(tipAngleRad + deg(da), r));
  pts.push(polar(tipAngleRad + deg(prof[prof.length - 1][0]), root));
  return pts;
}
// pallet slab rectangle at fork rotation p (rad about ARBOR), measured at f001.
export function slabPolygon(which, p) {
  const s = REF.stones_f001[which];
  const theta = -deg(s.theta_deg_pxy);           // pixel y-down -> world y-up
  const hl = s.len_units / 2, hw = s.wid_units / 2;
  const local = [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]];
  const c0 = Math.cos(theta), s0 = Math.sin(theta);
  const base = local.map(([lx, ly]) => ({
    x: s.centroid_world[0] + lx * c0 - ly * s0,
    y: s.centroid_world[1] + lx * s0 + ly * c0,
  }));
  // rotate the whole slab from f001 fork angle to fork angle p about the arbor
  const dp = p - deg(REF.fork_line_deg_f001);
  const c = Math.cos(dp), sn = Math.sin(dp);
  return base.map(q => ({
    x: ARBOR.x + (q.x - ARBOR.x) * c - (q.y - ARBOR.y) * sn,
    y: ARBOR.y + (q.x - ARBOR.x) * sn + (q.y - ARBOR.y) * c,
  }));
}
const deg = d => d * Math.PI / 180;
const polar = (a, r) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });

// segment-segment min distance + SAT polygon distance (positive = separated)
export function polyDist(A, B) {
  // SAT: separating axis on normals of both
  let minOverlap = Infinity, sep = false;
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const ux = nx / nl, uy = ny / nl;
      let mnA = Infinity, mxA = -Infinity, mnB = Infinity, mxB = -Infinity;
      for (const q of A) { const d = q.x * ux + q.y * uy; mnA = Math.min(mnA, d); mxA = Math.max(mxA, d); }
      for (const q of B) { const d = q.x * ux + q.y * uy; mnB = Math.min(mnB, d); mxB = Math.max(mxB, d); }
      const ov = Math.min(mxA, mxB) - Math.max(mnA, mnB);
      if (ov < 0) sep = true;
      minOverlap = Math.min(minOverlap, ov);
    }
  }
  if (!sep) return -minOverlap;                  // penetrating: negative depth
  // separated: min vertex-edge distance
  let best = Infinity;
  const vEdge = (q, a, b) => {
    const ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1e-12;
    let t = ((q.x - a.x) * ex + (q.y - a.y) * ey) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(q.x - (a.x + t * ex), q.y - (a.y + t * ey));
  };
  for (const q of A) for (let i = 0; i < B.length; i++) best = Math.min(best, vEdge(q, B[i], B[(i + 1) % B.length]));
  for (const q of B) for (let i = 0; i < A.length; i++) best = Math.min(best, vEdge(q, A[i], A[(i + 1) % A.length]));
  return best;
}

// Rich convex contact query: null when separated by more than skin, else
// { depth (>0 = penetration, else -gap), nx, ny (from B toward A), x, y (witness) }.
function centroid(P) { let x = 0, y = 0; for (const q of P) { x += q.x; y += q.y; } return { x: x / P.length, y: y / P.length }; }
function pointInPoly(q, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function polyContact(A, B, skin) {
  const cA = centroid(A), cB = centroid(B);
  let minOv = Infinity, nMin = null;      // penetration track
  let bestGap = -Infinity, nGap = null;   // separating track
  for (const [P, sgn] of [[A, 1], [B, 1]]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      let mnA = Infinity, mxA = -Infinity, mnB = Infinity, mxB = -Infinity;
      for (const q of A) { const d = q.x * nx + q.y * ny; if (d < mnA) mnA = d; if (d > mxA) mxA = d; }
      for (const q of B) { const d = q.x * nx + q.y * ny; if (d < mnB) mnB = d; if (d > mxB) mxB = d; }
      const ov = Math.min(mxA, mxB) - Math.max(mnA, mnB);
      // orient normal from B toward A
      if ((cA.x - cB.x) * nx + (cA.y - cB.y) * ny < 0) { nx = -nx; ny = -ny; }
      if (ov < 0) { if (ov > bestGap) { bestGap = ov; nGap = [nx, ny]; } }
      else if (ov < minOv) { minOv = ov; nMin = [nx, ny]; }
    }
  }
  if (bestGap > -Infinity && bestGap >= -1e-12) {
    // separated (or just touching): bestGap is the separating distance... note ov<0 only above
  }
  if (nMin === null || bestGap > -Infinity) {
    // separated: true distance = min vertex-edge feature distance; normal from
    // the closest slab point toward the closest tooth point.
    let best = Infinity, witA = null, witB = null;
    const vEdge = (q, P, qIsA) => {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1e-12;
        let t = ((q.x - a.x) * ex + (q.y - a.y) * ey) / L2; t = Math.max(0, Math.min(1, t));
        const px = a.x + t * ex, py = a.y + t * ey;
        const d = Math.hypot(q.x - px, q.y - py);
        if (d < best) { best = d; if (qIsA) { witA = [q.x, q.y]; witB = [px, py]; } else { witA = [px, py]; witB = [q.x, q.y]; } }
      }
    };
    for (const q of A) vEdge(q, B, true);
    for (const q of B) vEdge(q, A, false);
    if (best > skin) return null;
    let nx = witA[0] - witB[0], ny = witA[1] - witB[1];
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    return { depth: -best, nx, ny, x: (witA[0] + witB[0]) / 2, y: (witA[1] + witB[1]) / 2 };
  }
  // penetrating: witness = deepest tooth vertex inside slab, else slab vertex inside tooth
  let wit = null, deep = -Infinity;
  for (const q of A) if (pointInPoly(q, B)) { const d = minOv; if (d > deep) { deep = d; wit = [q.x, q.y]; } }
  if (!wit) for (const q of B) if (pointInPoly(q, A)) { wit = [q.x, q.y]; break; }
  if (!wit) wit = [(cA.x + cB.x) / 2, (cA.y + cB.y) / 2];
  return { depth: minOv, nx: nMin[0], ny: nMin[1], x: wit[0], y: wit[1] };
}

// Feature-based contact for a sharp tooth against a slab: normals constrained
// to the slab's four face normals (the physical faces). Chooses the slab face
// with the least tooth penetration; witness = deepest tooth vertex on that
// face. Returns { depth (>0 pen), nx, ny (slab->tooth), x, y } or null when
// separated beyond skin along every slab normal.
export function slabFaceContact(tooth, slab, skin) {
  let best = null;
  for (let i = 0; i < slab.length; i++) {
    const a = slab[i], b = slab[(i + 1) % slab.length];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    // face outward normal: polygon winding unknown; orient so it points from
    // slab centroid outward across edge ab
    let cx = 0, cy = 0; for (const q of slab) { cx += q.x; cy += q.y; }
    cx /= slab.length; cy /= slab.length;
    const mx = (a.x + b.x) / 2 - cx, my = (a.y + b.y) / 2 - cy;
    if (mx * nx + my * ny < 0) { nx = -nx; ny = -ny; }
    // tooth penetration along this face normal: how far the deepest tooth
    // vertex sits below the face plane (positive = inside the slab)
    const d0 = a.x * nx + a.y * ny;
    let deep = -Infinity, wit = null;
    for (const q of tooth) {
      const pen = d0 - (q.x * nx + q.y * ny);
      if (pen > deep) { deep = pen; wit = q; }
    }
    // also require the witness to project within the face segment (edge contact
    // on this face, not past its corners) with a small tolerance
    const ex = b.x - a.x, ey = b.y - a.y, el = Math.hypot(ex, ey) || 1;
    const t = ((wit.x - a.x) * ex + (wit.y - a.y) * ey) / (el * el);
    const within = t > -0.15 && t < 1.15;
    if (!within) continue;
    if (best === null || deep > best.deep) best = { deep, nx, ny, wit, face: i };
  }
  if (!best) return null;
  if (best.deep < -skin) return null;
  return { depth: best.deep, nx: best.nx, ny: best.ny, x: best.wit.x, y: best.wit.y, face: best.face };
}
