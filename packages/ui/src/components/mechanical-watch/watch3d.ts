/* watch3d.ts - true 3D mesh engine for the mechanical watch, shared TS.
   No GL: builds real 3D meshes (lathes, extruded gears, boxes), projects
   through a perspective camera, flat-shades with a two-light rig + Blinn
   specular, painter-sorts, and emits a flat triangle list that BOTH the
   native Skia renderer (createPicture) and the web Canvas2D renderer draw.
   Sim units: escape wheel tip radius = 10, dial radius ~46. +Z faces the
   viewer (out of the dial). */

export type Tri = {
  x0: number; y0: number; x1: number; y1: number; x2: number; y2: number;
  r: number; g: number; b: number;
  z0: number; z1: number; z2: number;   // view-space depth per vertex (>0)
  env?: boolean;                        // large polished face: add per-pixel env reflection in rasterizeZB
  enx?: number; eny?: number; enz?: number;   // cam-space face normal (unit, camera-facing)
  nv?: Float32Array;                    // 9 floats: per-VERTEX cam-space normals (smooth env on curved metal); absent = flat
  brush?: number;                       // circular-graining frequency (size-space) for spinning-wheel cap faces
  bcx?: number; bcy?: number;           // projected wheel-center (size-space) for the brush rings
};
const ENV_MIN_AREA = 3;   // px^2 at projection size: SUBPIXEL cutoff only - a surface-scale threshold cuts one polished face's triangulation into env/flat mottle (the gear-wedge artifact)

type V3 = [number, number, number];

export type Mesh = {
  pos: Float32Array;      // xyz per vertex
  idx: Uint32Array;       // 3 per triangle
  col: V3;                // base color 0..1
  metal: number;          // 0 dielectric .. 1 metal (specular strength/tint)
  spin?: { axis: V3; center: V3; angle: number };  // rigid transform per frame
  brush?: number;                     // circular-graining frequency for this mesh's flat cap faces (wheel finishing)
  nrm?: Float32Array;     // per-vertex analytic normals (smooth shading); absent = flat face normals
};

/* ---------- mesh builders ---------- */

function pushTri(p: number[], i: number[], a: V3, b: V3, c: V3) {
  const base = p.length / 3;
  p.push(...a, ...b, ...c);
  i.push(base, base + 1, base + 2);
}
function pushTriN(p: number[], n: number[], i: number[], a: V3, na: V3, b: V3, nb: V3, c: V3, nc: V3) {
  const base = p.length / 3;
  p.push(...a, ...b, ...c);
  n.push(...na, ...nb, ...nc);
  i.push(base, base + 1, base + 2);
}

/** Surface of revolution around the Y... around the Z axis. profile = [r, z][]. */
export function lathe(profile: [number, number][], seg: number, col: V3, metal: number): Mesh {
  const p: number[] = [], nr: number[] = [], idx: number[] = [];
  const n = profile.length;
  // profile tangent (dr,dz) -> surface normal (dz,-dr). Adjacent segments blend
  // only across gentle bends (polished arcs); hard corners keep crisp creases,
  // so flat caps stay uniformly lit instead of fanning into per-segment stripes.
  const segN: [number, number][] = [];
  for (let k = 0; k < n - 1; k++) {
    const [r0, z0] = profile[k], [r1, z1] = profile[k + 1];
    const dr = r1 - r0, dz = z1 - z0;
    const l = Math.hypot(dr, dz) || 1;
    segN.push([dz / l, -dr / l]);
  }
  const CREASE = 0.82;   // ~35deg
  const pn: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const prev = k > 0 ? segN[k - 1] : null, next = k < n - 1 ? segN[k] : null;
    if (prev && next && prev[0] * next[0] + prev[1] * next[1] > CREASE) {
      const sx = prev[0] + next[0], sz = prev[1] + next[1];
      const l = Math.hypot(sx, sz) || 1;
      pn.push([sx / l, sz / l]);
    } else pn.push(next ?? prev ?? [0, 1]);
  }
  // leftN[k] = normal segment k-1 uses at its k vertex; pn[k] = normal segment k
  // uses at its k vertex. At a crease they differ (own segment's normal).
  const pnL: [number, number][] = pn.map((p, k) => {
    const prev = k > 0 ? segN[k - 1] : null, next = k < n - 1 ? segN[k] : null;
    if (prev && next && prev[0] * next[0] + prev[1] * next[1] <= CREASE) return prev;
    return p;
  });
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 2 * Math.PI, a1 = ((s + 1) / seg) * 2 * Math.PI;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const am = (a0 + a1) / 2, cm = Math.cos(am), sm = Math.sin(am);   // segment-center angle: smooth around the curve
    for (let k = 0; k < n - 1; k++) {
      const [r0, z0] = profile[k], [r1, z1] = profile[k + 1];
      const A: V3 = [r0 * c0, r0 * s0, z0], B: V3 = [r1 * c0, r1 * s0, z1];
      const C: V3 = [r1 * c1, r1 * s1, z1], D: V3 = [r0 * c1, r0 * s1, z0];
      // per-vertex normals: profile normal rotated to each vertex's own
      // azimuth. Segment-center quad-shared normals make the reflection
      // direction constant within a segment and step at every boundary
      // (rim banding); true radial normals sweep smoothly across it.
      // Radial profile runs (caps) have a zero radial component, so they
      // still get identical normals at every vertex and stay perfectly flat.
      const nA0: V3 = [pn[k][0] * c0, pn[k][0] * s0, pn[k][1]];
      const nA1: V3 = [pn[k][0] * c1, pn[k][0] * s1, pn[k][1]];
      const nB0: V3 = [pnL[k + 1][0] * c0, pnL[k + 1][0] * s0, pnL[k + 1][1]];
      const nB1: V3 = [pnL[k + 1][0] * c1, pnL[k + 1][0] * s1, pnL[k + 1][1]];
      if (r0 > 1e-6 && r1 > 1e-6) { pushTriN(p, nr, idx, A, nA0, B, nB0, C, nB1); pushTriN(p, nr, idx, A, nA0, C, nB1, D, nA1); }
      else if (r1 > 1e-6) pushTriN(p, nr, idx, A, [0, 0, pn[k][1] >= 0 ? 1 : -1], B, nB0, C, nB1);       // r0 = 0: A == D on the axis
      else if (r0 > 1e-6) pushTriN(p, nr, idx, A, nA0, D, nA1, B, [0, 0, pn[k][1] >= 0 ? 1 : -1]);       // r1 = 0: B == C on the axis
    }
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal, nrm: new Float32Array(nr) };
}

/** Extrude a 2D polygon (CCW) to z0..z1 with caps. Polygon must be convex-ish
   or fan-triangulable from vertex 0; gear/star profiles qualify if ordered. */
export function extrude(pts: [number, number][], z0: number, z1: number, col: V3, metal: number): Mesh {
  const p: number[] = [], nr: number[] = [], idx: number[] = [];
  const n = pts.length;
  const ZUP: V3 = [0, 0, 1], ZDN: V3 = [0, 0, -1];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const W: V3 = [dy / l, -dx / l, 0];   // outward edge normal (CCW polygon)
    pushTriN(p, nr, idx, [x0, y0, z0], W, [x1, y1, z0], W, [x1, y1, z1], W);
    pushTriN(p, nr, idx, [x0, y0, z0], W, [x1, y1, z1], W, [x0, y0, z1], W);
  }
  for (let i = 1; i < n - 1; i++) {   // top cap (CCW from above)
    pushTriN(p, nr, idx, [pts[0][0], pts[0][1], z1], ZUP, [pts[i][0], pts[i][1], z1], ZUP, [pts[i + 1][0], pts[i + 1][1], z1], ZUP);
  }
  for (let i = 1; i < n - 1; i++) {   // bottom cap
    pushTriN(p, nr, idx, [pts[0][0], pts[0][1], z0], ZDN, [pts[i + 1][0], pts[i + 1][1], z0], ZDN, [pts[i][0], pts[i][1], z0], ZDN);
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal, nrm: new Float32Array(nr) };
}

export function ring(rOut: number, rIn: number, z0: number, z1: number, seg: number, col: V3, metal: number): Mesh {
  const p: number[] = [], nr: number[] = [], idx: number[] = [];
  const ZUP: V3 = [0, 0, 1], ZDN: V3 = [0, 0, -1];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 2 * Math.PI, a1 = ((s + 1) / seg) * 2 * Math.PI;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const O0: V3 = [rOut * c0, rOut * s0, z0], O1: V3 = [rOut * c1, rOut * s1, z0];
    const o0: V3 = [rOut * c0, rOut * s0, z1], o1: V3 = [rOut * c1, rOut * s1, z1];
    const I0: V3 = [rIn * c0, rIn * s0, z0], I1: V3 = [rIn * c1, rIn * s1, z0];
    const i0: V3 = [rIn * c0, rIn * s0, z1], i1: V3 = [rIn * c1, rIn * s1, z1];
    // per-vertex true radial normals: the pair at each azimuth is shared by
    // both tris of the quad, so the two halves stay consistent while the
    // shading sweeps smoothly across the segment (real cylinder), instead of
    // stepping at every segment boundary (banding).
    const nO0: V3 = [c0, s0, 0], nO1: V3 = [c1, s1, 0], nI0: V3 = [-c0, -s0, 0], nI1: V3 = [-c1, -s1, 0];
    pushTriN(p, nr, idx, O0, nO0, O1, nO1, o1, nO1); pushTriN(p, nr, idx, O0, nO0, o1, nO1, o0, nO0);   // outer wall
    pushTriN(p, nr, idx, I0, nI0, i1, nI1, I1, nI1); pushTriN(p, nr, idx, I0, nI0, i0, nI0, i1, nI1);   // inner wall
    pushTriN(p, nr, idx, o0, ZUP, o1, ZUP, i1, ZUP); pushTriN(p, nr, idx, o0, ZUP, i1, ZUP, i0, ZUP);   // top ring
    pushTriN(p, nr, idx, O0, ZDN, I1, ZDN, O1, ZDN); pushTriN(p, nr, idx, O0, ZDN, I0, ZDN, I1, ZDN);   // bottom ring
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal, nrm: new Float32Array(nr) };
}

/** Spoked wheel: rim ring + hub + `spokes` tapered arms, all in one mesh. */
const lighten = (c: V3, k: number): V3 => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

export function spokedWheel(rOut: number, rIn: number, hubR: number, z0: number, z1: number, spokes: number, col: V3, metal: number): Mesh {
  const parts: Mesh[] = [ring(rOut, rIn, z0, z1, 40, col, metal)];
  // machined finishing: bright polished lip on the rim top, dark recess ring around the hub
  parts.push(ring(rOut + 0.02, rOut - 0.5, z1, z1 + 0.14, 40, lighten(col, 1.22), metal));
  parts.push(ring(hubR + 1.0, hubR + 0.4, z1 + 0.01, z1 + 0.05, 28, lighten(col, 0.55), metal));
  const armW = Math.max(0.65, (rIn - hubR) * 0.085);
  for (let s = 0; s < spokes; s++) {
    const a = (s / spokes) * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, py = ca;  // tangent
    const w0 = armW * 0.55, w1 = armW;
    const quad: [number, number][] = [
      [hubR * ca + px * w0, hubR * sa + py * w0],
      [rIn * ca + px * w1, rIn * sa + py * w1],
      [rIn * ca - px * w1, rIn * sa - py * w1],
      [hubR * ca - px * w0, hubR * sa - py * w0],
    ];
    parts.push(extrude(quad, z0, z1, col, metal));
  }
  parts.push(lathe([[hubR, z0], [hubR, z1], [0, z1], [0, z0]], 20, col, metal));
  return merge(parts);
}

/** Toothed gear: alternating root/tip radius star profile, extruded. */
export function gear(teeth: number, rootR: number, tipR: number, z0: number, z1: number, col: V3, metal: number): Mesh {
  const pts: [number, number][] = [];
  const step = (2 * Math.PI) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // trapezoid tooth: root 30%, rise 20%, tip 10%, fall 40% (club-ish lean)
    const prof: [number, number][] = [
      [a, rootR], [a + 0.30 * step, rootR], [a + 0.42 * step, tipR],
      [a + 0.52 * step, tipR], [a + 0.60 * step, rootR],
    ];
    for (const [aa, rr] of prof) pts.push([rr * Math.cos(aa), rr * Math.sin(aa)]);
  }
  return extrude(pts, z0, z1, col, metal);
}

/** Visual prototype: a toothed rim with a genuine open center.
 * Geometry only, keeps the tooth count, outer profile, z tiers and sim unchanged. */
function openGear(teeth: number, rootR: number, tipR: number, innerR: number, z0: number, z1: number, col: V3, metal: number): Mesh {
  const outer: V3[] = [], inner: V3[] = [];
  const step = 2 * Math.PI / teeth;
  for (let i = 0; i < teeth; i++) {
    for (const [phase, r] of [[0, rootR], [.30, rootR], [.42, tipR], [.52, tipR], [.60, rootR]]) {
      const a = (i + phase) * step;
      outer.push([r * Math.cos(a), r * Math.sin(a), z0]);
      inner.push([innerR * Math.cos(a), innerR * Math.sin(a), z0]);
    }
  }
  const p: number[] = [], ix: number[] = [];
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const a=outer[i], b=outer[j], c=inner[j], d=inner[i];
    const A: V3=[a[0],a[1],z1], B: V3=[b[0],b[1],z1], C: V3=[c[0],c[1],z1], D: V3=[d[0],d[1],z1];
    pushTri(p,ix,A,B,C); pushTri(p,ix,A,C,D);
    pushTri(p,ix,a,c,b); pushTri(p,ix,a,d,c);
    pushTri(p,ix,a,b,B); pushTri(p,ix,a,B,A);
    pushTri(p,ix,d,D,C); pushTri(p,ix,d,C,c);
  }
  return {pos:new Float32Array(p),idx:new Uint32Array(ix),col,metal};
}

export function merge(meshes: Mesh[]): Mesh {
  let np = 0, ni = 0;
  for (const m of meshes) { np += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(np), idx = new Uint32Array(ni);
  const allN = meshes.every((m) => m.nrm && m.nrm.length === m.pos.length);
  const nrm = allN ? new Float32Array(np) : undefined;
  let op = 0, oi = 0;
  for (const m of meshes) {
    pos.set(m.pos, op);
    if (nrm) nrm.set(m.nrm!, op);
    const vb = op / 3;
    for (let k = 0; k < m.idx.length; k++) idx[oi + k] = m.idx[k] + vb;
    op += m.pos.length; oi += m.idx.length;
  }
  const out: Mesh = { pos, idx, col: meshes[0].col, metal: meshes[0].metal };
  if (nrm) out.nrm = nrm;
  return out;
}

export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3, metal: number): Mesh {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  return extrude([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, col, metal);
}

/* ---------- transforms ---------- */

function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** translate + rotate a mesh's positions in place (bake). */
export function bake(m: Mesh, dx: number, dy: number, dz: number, rz = 0): Mesh {
  for (let i = 0; i < m.pos.length; i += 3) {
    const v = rotZ([m.pos[i], m.pos[i + 1], m.pos[i + 2]], rz);
    m.pos[i] = v[0] + dx; m.pos[i + 1] = v[1] + dy; m.pos[i + 2] = v[2] + dz;
  }
  return m;
}

/* ---------- camera + shading ---------- */

export type Camera = { yaw: number; pitch: number; dist: number; fov: number; cx: number; cy: number };

const KEY: V3 = norm([-0.62, -0.28, 0.55]);
const SKEY: V3 = norm([-0.35, 0.5, -0.8]);   // spec light travels INTO the scene so highlights reach the camera (the diffuse key's bounces never do)
const FILL: V3 = norm([0.8, 0.35, 0.4]);

function norm(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

/** Render the scene to a painter-sorted (far-first) flat triangle list in
   a size x size square. Allocation-free inner loop (UI-thread frame budget);
   lights ride with the camera so the rig is stable. Meshes with
   convex=true skip the per-triangle sort (drawn in index order). */
const ZKEY = new Float64Array(65536);
const ZIDX = new Uint32Array(65536);
const ZMESH = new Uint16Array(65536);
const TIE_EPS = 0.35;   // depths closer than this are the same physical layer: mesh order decides (meshes are assembled far -> near)

// Each output stream owns its scratch objects; separate component instances do
// not overwrite one another. Consumers already replace each frame's output.
const TRI_POOLS = new WeakMap<Tri[], { tris: Tri[]; normals: Float32Array[] }>();
export function renderFrame(meshes: Mesh[], cam: Camera, size: number, out: Tri[], sort = true): void {
  // Painter clients may retain triangle objects; reuse only for the bitmap path.
  let pool = sort ? { tris: [] as Tri[], normals: [] as Float32Array[] } : TRI_POOLS.get(out);
  if (!pool) { pool = { tris: [], normals: [] }; TRI_POOLS.set(out, pool); }
  out.length = 0;
  let zCount = 0;
  const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = size / (2 * Math.tan(cam.fov / 2));
  const half = size / 2;
  const KX = KEY[0], KY = KEY[1], KZ = KEY[2];
  const FX = FILL[0], FY = FILL[1], FZ = FILL[2];
  for (let mi = 0; mi < meshes.length; mi++) {
    const m = meshes[mi];
    const spn = m.spin;
    const pos = m.pos, idx = m.idx;
    const mcr = m.col[0], mcg = m.col[1], mcb = m.col[2];
    const nrms = m.nrm;
    const metal = m.metal, sm = metal > 0.5;
    const n = idx.length;
    const scx = spn ? spn.center[0] : 0, scy = spn ? spn.center[1] : 0;
    const sang = spn ? spn.angle : 0;
    const sc = Math.cos(sang), ss = Math.sin(sang);
    // General-axis (non-z) spin: Rodrigues rotation about the unit axis through center.
    // z-axis meshes keep the cheap inline path below; this closure is built once per mesh.
    let genRot: ((x: number, y: number, z: number, o: number[]) => void) | null = null;
    if (spn && !(spn.axis[0] === 0 && spn.axis[1] === 0 && spn.axis[2] === 1)) {
      const ux = spn.axis[0], uy = spn.axis[1], uz = spn.axis[2];
      const ccx = spn.center[0], ccy = spn.center[1], ccz = spn.center[2];
      const t1 = 1 - sc;
      genRot = (x, y, z, o) => {
        const dx = x - ccx, dy = y - ccy, dz = z - ccz;
        const dot = ux * dx + uy * dy + uz * dz;
        o[0] = ccx + dx * sc + (uy * dz - uz * dy) * ss + ux * dot * t1;
        o[1] = ccy + dy * sc + (uz * dx - ux * dz) * ss + uy * dot * t1;
        o[2] = ccz + dz * sc + (ux * dy - uy * dx) * ss + uz * dot * t1;
      };
    }
    const GV = [0, 0, 0];
    for (let k = 0; k < n; k += 3) {
      let vi = idx[k] * 3;
      let ax = pos[vi], ay = pos[vi + 1], az = pos[vi + 2];
      vi = idx[k + 1] * 3;
      let bx = pos[vi], by = pos[vi + 1], bz = pos[vi + 2];
      vi = idx[k + 2] * 3;
      let cx = pos[vi], cy = pos[vi + 1], cz = pos[vi + 2];
      if (genRot) {
        genRot(ax, ay, az, GV); ax = GV[0]; ay = GV[1]; az = GV[2];
        genRot(bx, by, bz, GV); bx = GV[0]; by = GV[1]; bz = GV[2];
        genRot(cx, cy, cz, GV); cx = GV[0]; cy = GV[1]; cz = GV[2];
      } else if (spn) {
        let dx = ax - scx, dy = ay - scy;
        ax = scx + dx * sc - dy * ss; ay = scy + dx * ss + dy * sc;
        dx = bx - scx; dy = by - scy;
        bx = scx + dx * sc - dy * ss; by = scy + dx * ss + dy * sc;
        dx = cx - scx; dy = cy - scy;
        cx = scx + dx * sc - dy * ss; cy = scy + dx * ss + dy * sc;
      }
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nrx = e1y * e2z - e1z * e2y;
      let nry = e1z * e2x - e1x * e2z;
      let nrz0 = e1x * e2y - e1y * e2x;
      let nl = Math.sqrt(nrx * nrx + nry * nry + nrz0 * nrz0);
      if (nl < 1e-12) continue;
      if (nrms) {   // analytic smooth normals: average the 3 vertex normals (spin-rotated)
        let vj = idx[k] * 3;
        let pnx = nrms[vj], pny = nrms[vj + 1], pnz = nrms[vj + 2];
        vj = idx[k + 1] * 3;
        pnx += nrms[vj]; pny += nrms[vj + 1]; pnz += nrms[vj + 2];
        vj = idx[k + 2] * 3;
        pnx += nrms[vj]; pny += nrms[vj + 1]; pnz += nrms[vj + 2];
        if (genRot) {
          const ux2 = spn!.axis[0], uy2 = spn!.axis[1], uz2 = spn!.axis[2];
          const dot = ux2 * pnx + uy2 * pny + uz2 * pnz;
          const t2 = 1 - sc;
          const qx = pnx * sc + (uy2 * pnz - uz2 * pny) * ss + ux2 * dot * t2;
          const qy = pny * sc + (uz2 * pnx - ux2 * pnz) * ss + uy2 * dot * t2;
          const qz = pnz * sc + (ux2 * pny - uy2 * pnx) * ss + uz2 * dot * t2;
          pnx = qx; pny = qy; pnz = qz;
        } else if (spn) { const qx = pnx * sc - pny * ss; pny = pnx * ss + pny * sc; pnx = qx; }
        nrx = pnx; nry = pny; nrz0 = pnz;
        nl = Math.sqrt(nrx * nrx + nry * nry + nrz0 * nrz0);
        if (nl < 1e-12) continue;
      }
      // camera transform (+z of the scene faces the camera)
      const ax2 = ax * cyw - ay * syw, ayw = ax * syw + ay * cyw;
      const azc = ayw * sp - az * cp + cam.dist;
      const bx2 = bx * cyw - by * syw, byw = bx * syw + by * cyw;
      const bzc = byw * sp - bz * cp + cam.dist;
      const cx2 = cx * cyw - cy * syw, cyw2 = cx * syw + cy * cyw;
      const czc = cyw2 * sp - cz * cp + cam.dist;
      if (azc < 4 || bzc < 4 || czc < 4) continue;
      const ays = ayw * cp + az * sp;
      const bys = byw * cp + bz * sp;
      const cys = cyw2 * cp + cz * sp;
      // normal to camera space
      let nx = nrx * cyw - nry * syw, ny = nrx * syw + nry * cyw;
      let nyy = ny * cp + nrz0 * sp, nzz = ny * sp - nrz0 * cp;
      const flip = nzz > 0 ? -1 : 1;
      const inv = flip / nl;
      nx *= inv; nyy *= inv; nzz *= inv;
      const keyD = -(nx * KX + nyy * KY + nzz * KZ);
      const fillD = -(nx * FX + nyy * FY + nzz * FZ);
      const nd = nx * SKEY[0] + nyy * SKEY[1] + nzz * SKEY[2];
      const rz = SKEY[2] - 2 * nd * nzz;
      const rx2 = SKEY[0] - 2 * nd * nx;
      const ry2 = SKEY[1] - 2 * nd * nyy;
      const rl = Math.sqrt(rx2 * rx2 + ry2 * ry2 + rz * rz);
      // plain Blinn: the |nx|^n "brushed streak" terms quantized per-triangle
      // into stripes/teeth on curved steel - removed, not retuned.
      const specA = Math.pow(Math.max(0, -rz / (rl > 1e-9 ? rl : 1)), 24);
      const spec = specA * (0.22 + 1.0 * metal);
      // lighting tuned in look-dev sweep (V1): lower ambient, harder key for modeling
      const LP = (globalThis as any).__lightP || { amb: 0.17, key: 0.9, fill: 0.25 };
      const amb = LP.amb;
      const dif = LP.key * (keyD > 0 ? keyD : 0) + LP.fill * (fillD > 0 ? fillD : 0);
      let r = mcr * (amb + dif), g = mcg * (amb + dif), b = mcb * (amb + dif);
      const sa = sm ? 1.6 : 1;
      r += spec * (sm ? Math.min(1, mcr * sa) : 1);
      g += spec * (sm ? Math.min(1, mcg * sa) : 1);
      b += spec * (sm ? Math.min(1, mcb * sa) : 1);
      const qx0 = half + (ax2 * f) / azc, qy0 = half - (ays * f) / azc;
      const qx1 = half + (bx2 * f) / bzc, qy1 = half - (bys * f) / bzc;
      const qx2 = half + (cx2 * f) / czc, qy2 = half - (cys * f) / czc;
      const ti = out.length;
      let tri = pool.tris[ti];
      if (!tri) { tri = { x0:0,y0:0,x1:0,y1:0,x2:0,y2:0,r:0,g:0,b:0,z0:0,z1:0,z2:0 }; pool.tris[ti] = tri; }
      tri.x0=qx0; tri.y0=qy0; tri.x1=qx1; tri.y1=qy1; tri.x2=qx2; tri.y2=qy2;
      tri.r=r>1?1:r; tri.g=g>1?1:g; tri.b=b>1?1:b;
      tri.z0=azc; tri.z1=bzc; tri.z2=czc;
      tri.env=undefined; tri.enx=undefined; tri.eny=undefined; tri.enz=undefined; tri.nv=undefined;
      tri.brush=undefined; tri.bcx=undefined; tri.bcy=undefined;
      // large polished faces get per-pixel environment reflection in the rasterizer:
      // mirror reflections vary with the per-pixel view ray, which per-face
      // shading cannot express - that flatness is what reads as plastic.
      if (sm) {
        // eligibility is per-SURFACE, not per-triangle: a 30px^2 threshold
        // cut through one polished face's own triangulation (the gear cap
        // fan's small tris fell below it while spoke tops cleared it) and
        // painted alternating env/flat pie-slice mottle. Only subpixel tris
        // stay on the packed path (tooth-scale silhouette sparkle control).
        const area = 0.5 * Math.abs((qx1 - qx0) * (qy2 - qy0) - (qx2 - qx0) * (qy1 - qy0));
        if (area > ENV_MIN_AREA) {
          tri.env = true; tri.enx = nx; tri.eny = nyy; tri.enz = nzz;
          if (nrms) {
            // per-vertex normals through the same spin + camera transform:
            // flat per-segment normals step at every segment boundary and
            // read as coarse rim banding once the buffer tier quantizes them.
            const nv = pool.normals[ti] ?? (pool.normals[ti] = new Float32Array(9));
            for (let vv = 0; vv < 3; vv++) {
              const vj = idx[k + vv] * 3;
              let pnx = nrms[vj], pny = nrms[vj + 1], pnz = nrms[vj + 2];
              if (genRot) {
                const ux2 = spn!.axis[0], uy2 = spn!.axis[1], uz2 = spn!.axis[2];
                const dot = ux2 * pnx + uy2 * pny + uz2 * pnz;
                const t2 = 1 - sc;
                const qx = pnx * sc + (uy2 * pnz - uz2 * pny) * ss + ux2 * dot * t2;
                const qy = pny * sc + (uz2 * pnx - ux2 * pnz) * ss + uy2 * dot * t2;
                const qz = pnz * sc + (ux2 * pny - uy2 * pnx) * ss + uz2 * dot * t2;
                pnx = qx; pny = qy; pnz = qz;
              } else if (spn) { const qx = pnx * sc - pny * ss; pny = pnx * ss + pny * sc; pnx = qx; }
              let vnx = pnx * cyw - pny * syw, vny = pnx * syw + pny * cyw;
              const vnyy = vny * cp + pnz * sp, vnzz = vny * sp - pnz * cp;
              const vflip = vnzz > 0 ? -1 : 1;
              const vl = Math.sqrt(vnx * vnx + vnyy * vnyy + vnzz * vnzz) || 1;
              nv[vv * 3] = vflip * vnx / vl; nv[vv * 3 + 1] = vflip * vnyy / vl; nv[vv * 3 + 2] = vflip * vnzz / vl;
            }
            // flat face (all vertex normals agree): interpolation would be
            // identity - drop it so pass 2 keeps the cheap flat path.
            let dev = 0;
            for (let c = 0; c < 3; c++) {
              dev = Math.max(dev,
                Math.abs(nv[c] - nv[3 + c]) + Math.abs(nv[c] - nv[6 + c]));
            }
            if (dev > 1e-3) tri.nv = nv;
          }
        }
      }
      if (tri.env && m.brush && spn && spn.axis[0] === 0 && spn.axis[1] === 0 && spn.axis[2] === 1 && Math.abs(nrz0) > 0.9 * nl) {
        // circular graining (brush rings) on spinning-wheel cap faces: project
        // the wheel center so pass 2 can ring-modulate the env reflection
        const wx = spn.center[0], wy = spn.center[1], wz = spn.center[2];
        const wx2 = wx * cyw - wy * syw, wyw = wx * syw + wy * cyw;
        const wzc = wyw * sp - wz * cp + cam.dist;
        const wys = wyw * cp + wz * sp;
        tri.brush = m.brush;
        tri.bcx = half + (wx2 * f) / wzc; tri.bcy = half - (wys * f) / wzc;
      }
      out.push(tri);
      if (sort && zCount < 65536) { ZKEY[zCount] = (azc + bzc + czc) / 3; ZIDX[zCount] = out.length - 1; ZMESH[zCount] = mi; zCount++; }
    }
  }
  // painter sort: far (large z) drawn first (skipped by the z-buffer path)
  if (!sort) return;
  const order = ZIDX.subarray(0, zCount);
  const z = ZKEY;
  Array.prototype.sort.call(order, (a, b) => {
    const dz = z[b] - z[a];
    if (dz > TIE_EPS) return 1;
    if (dz < -TIE_EPS) return -1;
    return ZMESH[a] - ZMESH[b];
  });
  const sorted: Tri[] = new Array(zCount);
  for (let i = 0; i < zCount; i++) sorted[i] = out[ZIDX[i]];
  for (let i = 0; i < zCount; i++) out[i] = sorted[i];
  out.length = zCount;
}

/* ---------- the watch scene ----------
   Sim-consistent movement layout (escape tip R = 10):
   escape wheel at (0,-17) [sim coords offset (0,-17)], fork pivot (0,-3.6),
   balance (0,8.4). Center wheel at origin with the hands. Skeleton: no full
   dial - chapter ring + applied markers, movement visible. */

export type WatchScene = {
  statics: Mesh[];        // case, ring, plate, bridges (never spin)
  crown: Mesh;            // spins about its stem axis when wound
  wheels: Mesh[];         // barrel, center, third, fourth, escape (spin.angle set per frame)
  fork: Mesh;             // spins about (0,-3.6)
  balance: Mesh;          // spins about (0,8.4)
  hairspring: Mesh;       // same center as balance
  hourHand: Mesh; minuteHand: Mesh; secondHand: Mesh;
};

const BRASS: V3 = [0.80, 0.62, 0.24];
const STEEL: V3 = [0.72, 0.74, 0.78];
const BLUED: V3 = [0.16, 0.28, 0.62];
const PLATE: V3 = [0.30, 0.30, 0.34];
const RUBY: V3 = [0.72, 0.10, 0.16];
const GOLD: V3 = [0.85, 0.68, 0.30];   // jewel chatons
const PLATE_DARK: V3 = [0.205, 0.205, 0.24];   // Geneva stripe alternation: deeper contrast so the bands actually read

function hand(len: number, w: number, tail: number, z0: number, z1: number, col: V3): Mesh {
  // tapered dauphine-ish hand pointing +Y from the center
  const pts: [number, number][] = [
    [-w * 0.5, -tail], [w * 0.5, -tail], [w * 0.42, len * 0.55], [0, len], [-w * 0.42, len * 0.55],
  ];
  return extrude(pts, z0, z1, col, 1);
}

function handFaceted(len: number, w: number, tail: number, z0: number, z1: number, ridge: number, col: V3): Mesh {
  // true dauphine: center spine raised by `ridge`, top split into flat facets
  // that catch the light differently on each side of the ridge
  const pts: [number, number][] = [
    [-w * 0.5, -tail], [w * 0.5, -tail], [w * 0.42, len * 0.55], [0, len], [-w * 0.42, len * 0.55],
  ];
  const p: number[] = [], nr: number[] = [], idx: number[] = [];
  const zr = z1 + ridge;
  const topZ = (i: number): number => (i === 3 ? zr : z1);   // tip lies on the raised spine
  const S0: V3 = [0, -tail, zr], S1: V3 = [0, len, zr];
  const facet = (a: V3, b: V3, c: V3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    const N: V3 = [nx / l, ny / l, nz / l];
    pushTriN(p, nr, idx, a, N, b, N, c, N);
  };
  const P = (i: number): V3 => [pts[i][0], pts[i][1], topZ(i)];
  // top facets: tail, right of spine, left of spine
  facet(P(0), P(1), S0);
  facet(S0, P(1), P(2)); facet(S0, P(2), S1);
  facet(S0, S1, P(4)); facet(S0, P(4), P(0));
  const ZDN: V3 = [0, 0, -1];
  for (let i = 0; i < 5; i++) {   // side walls rise to the per-point top z
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 5];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const W: V3 = [dy / l, -dx / l, 0];
    const t0 = topZ(i), t1 = topZ((i + 1) % 5);
    pushTriN(p, nr, idx, [x0, y0, z0], W, [x1, y1, z0], W, [x1, y1, t1], W);
    pushTriN(p, nr, idx, [x0, y0, z0], W, [x1, y1, t1], W, [x0, y0, t0], W);
  }
  for (let i = 1; i < 4; i++) {   // bottom cap
    pushTriN(p, nr, idx, [pts[0][0], pts[0][1], z0], ZDN, [pts[i + 1][0], pts[i + 1][1], z0], ZDN, [pts[i][0], pts[i][1], z0], ZDN);
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal: 1, nrm: new Float32Array(nr) };
}

export function buildWatchScene(): WatchScene {
  // case: clean band ring + convex bezel arc + solid back (no zigzag profiles)
  const caseBand = ring(50, 46.8, -2, 10.0, 192, STEEL, 1);   // top cap fully under the bezel bottom (10.2): no z-alternation
  const caseBack = lathe([[0, -2.8], [46.6, -2.8], [48.4, -2], [46.6, -1.7], [41.8, -1.7]], 160, STEEL, 1);   // no interior top disc: the plate covers it (fan interleave)
  // open dome profile: top arc + outer wall straight down to the band top.
  // No bottom face, no inner wall: a closed thin shell stacked its bore circles
  // at grazing angles and the polygon sagitta zippered the depth test.
  const bezel = lathe([[45.8, 13.5], [50.1, 13.3], [51.2, 11.9], [51.2, 10.0]], 256, STEEL, 1);
  const crown = merge([
    box(50.5, 0, 4, 3.5, 1.6, 1.6, STEEL, 1),     // stem
    box(53.5, 0, 4, 3.4, 4.6, 4.6, STEEL, 1),     // head
    box(53.5, 0, 4, 4.0, 3.4, 5.2, STEEL, 1),     // knurl cross
  ]);
  crown.spin = { axis: [1, 0, 0], center: [53.5, 0, 4], angle: 0 };   // crown winds about its own stem axis
  /* movement finishing: ruby jewels in gold chatons at the visible pivots,
     Geneva stripes across the mainplate, polished slotted screws. */
  const jewel = (jx: number, jy: number, z0: number): Mesh => merge([
    ring(1.55, 1.0, z0, z0 + 0.55, 20, GOLD, 1),
    lathe([[0, z0], [1.0, z0], [1.0, z0 + 0.55], [0, z0 + 0.55]], 20, RUBY, 0.6),
  ]);
  const jewels = [
    bake(jewel(0, 0, 0), -20, 15, 3.0),    // barrel arbor
    bake(jewel(0, 0, 0), 0, 2, 2.2),       // center wheel top
    bake(jewel(0, 0, 0), 17, 11, 3.8),     // third arbor
    bake(jewel(0, 0, 0), 18, -7, 4.2),     // fourth wheel top
    bake(jewel(0, 0, 0), 0, -22, 4.8),     // escape arbor
    bake(jewel(0, 0, 0), 0, 3.4, 6.6),     // balance upper jewel in the cock
  ];
  const stripes: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const sx = -18.2 + i * 5.2;
    const half = Math.sqrt(Math.max(0, 40.6 * 40.6 - sx * sx)) - 0.6;
    const m = box(sx, 0, 0.12, 4.9, 2 * half, 0.24, i % 2 === 0 ? PLATE_DARK : PLATE, 0.6);
    stripes.push(m);
  }
  const screw = (sx: number, sy: number, z0: number, a: number): Mesh => merge([
    lathe([[0, z0], [1.0, z0], [1.0, z0 + 0.5], [0.86, z0 + 0.62], [0, z0 + 0.62]], 12, STEEL, 1),
    bake(box(0, 0, 0, 1.55, 0.26, 0.14, [0.08, 0.08, 0.1], 0.2), sx, sy, z0 + 0.55, a),
  ]);
  const screws = [screw(-30, -12, 0, 0.5), screw(30, -14, 0, 1.9), screw(-8, -30, 0, 2.8), screw(8, 28, 0, 1.1)];
  // chapter ring + applied markers
  const chapter = ring(46.55, 41.5, 6.4, 9.4, 160, [0.07, 0.07, 0.09], 0.2);   // tall rehaut: top (9.4) clears the band top (10.0) and bezel bottom (10.2) - no coplanar contact
  const markers: Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const w = i % 3 === 0 ? 1.6 : 0.9;
    const m = box(0, 0, 0, w, 3.6, 0.5, STEEL, 1);
    bake(m, 43.9 * Math.sin(a), 43.9 * Math.cos(a), 9.65, -a);   // sits on the chapter top (9.4), under the bezel bottom (10.2)
    markers.push(m);
  }
  // solid mainplate disc (dark) + center medallion + balance cock
  const plate = lathe([[0, -0.8], [41.6, -0.8], [41.6, 0], [0, 0]], 96, PLATE, 0.8);
  const balCock = bake(box(0, 0, 0, 5, 14, 1.2, PLATE, 0.8), 0, 9, 6.0, 0.12);
  // gear train: z-tiered for depth separation (barrel low, rising toward escape)
  const barrel = merge([
    gear(84, 15.2, 16, 0.4, 1.6, BRASS, 1),
    spokedWheel(14.9, 14.1, 3.2, 1.54, 2.4, 6, BRASS, 1),
    lathe([[0, 0.2], [1.8, 0.2], [1.8, 3.0], [0, 3.0]], 12, STEEL, 1),
  ]);
  bake(barrel, -20, 15, 0);
  const center = merge([
    openGear(80, 12.6, 13.2, 11.6, 0.8, 1.6, BRASS, 1),
    spokedWheel(12.4, 11.6, 2.2, 1.54, 2.2, 5, BRASS, 1),
    lathe([[0, 0.2], [1.1, 0.2], [1.1, 8.6], [0, 8.6]], 10, STEEL, 1),
  ]);
  bake(center, 0, 2, 0);
  const third = merge([
    openGear(75, 9.5, 10, 8.6, 2.2, 2.9, BRASS, 1),
    spokedWheel(9.3, 8.6, 1.6, 2.84, 3.4, 5, BRASS, 1),
    lathe([[0, 1.6], [0.9, 1.6], [0.9, 3.8], [0, 3.8]], 10, STEEL, 1),
  ]);
  bake(third, 17, 11, 0);
  const fourth = merge([
    openGear(72, 8.5, 9, 7.6, 3.0, 3.7, BRASS, 1),
    spokedWheel(8.3, 7.6, 1.5, 3.64, 4.2, 4, BRASS, 1),
    lathe([[0, 2.4], [0.8, 2.4], [0.8, 8.8], [0, 8.8]], 10, STEEL, 1),
  ]);
  bake(fourth, 18, -7, 0);
  const escape = merge([
    gear(15, 8.5, 10, 3.4, 4.2, BRASS, 1),
    lathe([[0, 3.0], [0.8, 3.0], [0.8, 4.8], [0, 4.8]], 8, STEEL, 1),
  ]);
  bake(escape, 0, -22, 0);
  // pallet fork (sim geometry offset (0,-22): fork pivot at (0,-8.6))
  const forkOutline: [number, number][] = [
    [-3.2, 6.2], [3.2, 6.2],
    [1.1, 2.0], [6.4, -4.4], [4.4, -6.2],
    [1.6, -3.2], [-1.6, -3.2],
    [-4.4, -6.2], [-6.4, -4.4], [-1.1, 2.0],
  ];
  const forkBody = extrude(forkOutline, 4.4, 5.2, STEEL, 1);
  const entryStone = bake(box(0, 0, 0, 1.1, 2.4, 1.4, RUBY, 0.4), -4.9, -4.9, 4.8, -0.3);
  const exitStone = bake(box(0, 0, 0, 1.1, 2.4, 1.4, RUBY, 0.4), 5.2, -5.4, 4.8, 0.25);
  const fork = merge([forkBody, entryStone, exitStone]);
  bake(fork, 0, -8.6, 0);
  fork.spin = { axis: [0, 0, 1], center: [0, -8.6, 0], angle: 0 };
  // balance at (0, 3.4) above the train plane
  const balance = merge([
    ring(8.6, 7.6, 5.0, 6.0, 64, STEEL, 1),
    spokedWheel(7.6, 7.0, 1.4, 5.4, 6.0, 2, STEEL, 1),
    lathe([[0, 3.8], [0.7, 3.8], [0.7, 7.0], [0, 7.0]], 8, STEEL, 1),
  ]);
  bake(balance, 0, 3.4, 0);
  balance.spin = { axis: [0, 0, 1], center: [0, 3.4, 0], angle: 0 };
  const sp: [number, number][] = [];
  const turns = 5, steps = 140;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI;
    const r = 1.6 + (t / (2 * Math.PI)) * 1.05;
    sp.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  const hairspring = extrude(sp, 6.4, 6.7, BLUED, 0.8);
  bake(hairspring, 0, 3.4, 0);
  hairspring.spin = { axis: [0, 0, 1], center: [0, 3.4, 0], angle: 0 };
  // hands: bright steel hour/minute, red seconds
  const hourHand = handFaceted(17, 2.8, 4, 7.6, 8.3, 0.32, STEEL);
  hourHand.spin = { axis: [0, 0, 1], center: [0, 0, 0], angle: 0 };
  const minuteHand = handFaceted(29, 2.2, 5, 8.5, 9.1, 0.26, STEEL);
  minuteHand.spin = { axis: [0, 0, 1], center: [0, 0, 0], angle: 0 };
  const secondHand = merge([
    hand(36, 0.7, 7, 9.4, 9.8, RUBY),
    lathe([[0, 9.4], [1.8, 9.4], [1.8, 9.8], [0, 9.8]], 12, RUBY, 0.4),
  ]);
  secondHand.spin = { axis: [0, 0, 1], center: [0, 0, 0], angle: 0 };
  const wheelCenters: [number, number][] = [[-20, 15], [0, 2], [17, 11], [18, -7], [0, -22]];
  [barrel, center, third, fourth, escape].forEach((w, i) => {
    w.spin = { axis: [0, 0, 1], center: [wheelCenters[i][0], wheelCenters[i][1], 0], angle: 0 };
  });
  return {
    // assembled far -> near in renderWatch; painter ties inside a layer resolve by this order
    statics: [caseBack, plate, balCock, chapter, ...markers, caseBand, bezel, ...jewels, ...stripes, ...screws],
    wheels: [barrel, center, third, fourth, escape],
    fork, balance, hairspring, hourHand, minuteHand, secondHand, crown,
  };
  for (const w of [barrel, center, third, fourth, escape]) w.brush = 1.2;   // circular-grained caps
}

/** Per-frame: set spin angles from the sim state and render everything. */
export function renderWatch(scene: WatchScene, a: {
  barrel: number; center: number; third: number; fourth: number; escape: number;
  fork: number; balance: number; hour: number; minute: number; second: number; crown: number;
}, cam: Camera, size: number, out: Tri[], sort = true): void {
  scene.crown.spin!.angle = a.crown;
  scene.wheels[0].spin!.angle = a.barrel;
  scene.wheels[1].spin!.angle = a.center;
  scene.wheels[2].spin!.angle = a.third;
  scene.wheels[3].spin!.angle = a.fourth;
  scene.wheels[4].spin!.angle = a.escape;
  scene.fork.spin!.angle = a.fork;
  scene.balance.spin!.angle = a.balance;
  scene.hairspring.spin!.angle = a.balance * 0.92;   // slight lag illusion
  scene.hourHand.spin!.angle = a.hour;
  scene.minuteHand.spin!.angle = a.minute;
  scene.secondHand.spin!.angle = a.second;
  const st = scene.statics;
  // st: [caseBack, plate, balCock, chapter, ...markers, caseBand, bezel]
  renderFrame([st[0], st[1], ...scene.wheels, scene.fork, st[2], scene.balance, scene.hairspring, ...st.slice(3), scene.crown, scene.hourHand, scene.minuteHand, scene.secondHand], cam, size, out, sort);
}

/* Depth-correct rasterizer: the painter sort cannot order intersecting or
   near-coplanar triangles (sawtooth splatter), so the production adapters
   rasterize the Tri list per-pixel with a z-buffer instead of drawing the
   sorted list. 1/z is linear in screen space under perspective projection,
   so interpolating q=1/z per pixel and keeping the largest-q (nearest) hit
   is exact for depth ordering. ss=2 supersampling + box downsample gives AA.
   Zero allocation per call beyond the returned frame: buffers are module-level
   and grow-only. */
let ZB_DEPTH = new Float32Array(0);
let ZB_COL = new Uint8Array(0);   // 4 bytes per pixel (RGBX) so a Uint32 view can write packed colors
let ZB_WINNER = new Int32Array(0);
let ZB_RAY = new Float32Array(0);
let ZB_RAY_R = 0, ZB_RAY_F = 0;
let ZB_BC = new Float64Array(0);   // per-triangle barycentric coefficient cache (values identical to per-pixel recompute)
let ZB_BCS = new Int32Array(0);    // per-triangle stamp for ZB_BC validity this call
let ZB_BCSTAMP = 0;
let ZB_WSTAMP = 0;                 // winner-buffer frame stamp: avoids clearing winner every frame
const rasterClock = () => globalThis.performance?.now?.() ?? Date.now();
export function rasterizeZB(tris: Tri[], size: number, ss: number, bg: [number, number, number], out: Uint8ClampedArray | Uint8Array, focal?: number, profile?: { setup: number; geometry: number; reflection: number; resolve: number }): void {
  let stageAt = profile ? rasterClock() : 0;
  const R = size * ss;
  const n = R * R;
  if (ZB_DEPTH.length < n) { ZB_DEPTH = new Float32Array(n); ZB_COL = new Uint8Array(n * 4); ZB_WINNER = new Int32Array(n); }
  const depth = ZB_DEPTH.subarray(0, n), col = ZB_COL.subarray(0, n * 4), winner = ZB_WINNER.subarray(0, n);
  // frame-stamped winner buffer: a pixel's winner entry is valid only if its
  // upper bits match this call's stamp, so the old per-frame fill(-1) is gone.
  // Geometry stores (stamp<<16)|ti for env faces and (stamp<<16)|0xFFFF for
  // non-env faces; pass 2 treats anything else as no-env. On stamp wrap the
  // buffer is zeroed once (stamp 0 then matches nothing).
  if (++ZB_WSTAMP === 32767) { winner.fill(0); ZB_WSTAMP = 1; }
  const wStamp16 = ZB_WSTAMP << 16;
  // normalized per-pixel view rays, rebuilt only when size/focal changes
  const fsc = (focal ?? 0) * (R / size);
  if (focal && (ZB_RAY_R !== R || ZB_RAY_F !== fsc || ZB_RAY.length < 3 * n)) {
    if (ZB_RAY.length < 3 * n) ZB_RAY = new Float32Array(3 * n);
    const h = R / 2;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const dx = (x + 0.5) - h, dy = h - (y + 0.5), dz = fsc;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      const p3 = 3 * (y * R + x);
      ZB_RAY[p3] = dx * il; ZB_RAY[p3 + 1] = dy * il; ZB_RAY[p3 + 2] = dz * il;
    }
    ZB_RAY_R = R; ZB_RAY_F = fsc;
  }
  depth.fill(0);   // q = 1/z > 0 always; larger q = nearer
  for (let i = 0; i < n * 4; i += 4) { col[i] = bg[0]; col[i + 1] = bg[1]; col[i + 2] = bg[2]; col[i + 3] = 255; }
  const col32 = new Uint32Array(col.buffer, 0, n);
  const scale = R / size;   // tris were projected for a `size` buffer; scale up for SSAA
  if (profile) { const t = rasterClock(); profile.setup = t-stageAt; stageAt = t; }
  for (let ti = 0; ti < tris.length; ti++) {
    const t = tris[ti];
    const xs0 = t.x0 * scale, xs1 = t.x1 * scale, xs2 = t.x2 * scale;
    const ys0 = t.y0 * scale, ys1 = t.y1 * scale, ys2 = t.y2 * scale;
    const q0 = 1 / t.z0, q1 = 1 / t.z1, q2 = 1 / t.z2;
    const yMin = Math.max(0, Math.ceil(Math.min(ys0, ys1, ys2) - 0.5));
    const yMax = Math.min(R - 1, Math.ceil(Math.max(ys0, ys1, ys2) - 0.5) - 1);
    if (yMax < yMin) continue;
    const xMin = Math.min(xs0, xs1, xs2), xMax = Math.max(xs0, xs1, xs2);
    if (xMax < 0 || xMin >= R) continue;
    // every per-scanline span is a subset of the bbox x-range, so an empty bbox
    // column range means this triangle fills zero pixels (exact skip, no output change)
    if (Math.ceil(xMin - 0.5) > Math.floor(xMax - 0.5)) continue;
    const packed = (255 << 24) | (Math.round(t.b * 255) << 16) | (Math.round(t.g * 255) << 8) | Math.round(t.r * 255);
    const ay0 = ys0, by0 = ys1;
    const lo0 = Math.min(ay0, by0), hi0 = Math.max(ay0, by0);
    const dy0 = by0-ay0, dx0 = xs1-xs0, dq0 = q1-q0;
    const ay1 = ys1, by1 = ys2;
    const lo1 = Math.min(ay1, by1), hi1 = Math.max(ay1, by1);
    const dy1 = by1-ay1, dx1 = xs2-xs1, dq1 = q2-q1;
    const ay2 = ys2, by2 = ys0;
    const lo2 = Math.min(ay2, by2), hi2 = Math.max(ay2, by2);
    const dy2 = by2-ay2, dx2 = xs0-xs2, dq2 = q0-q2;
    for (let y = yMin; y <= yMax; y++) {
      const yy = y + 0.5;
      // gather edge crossings (x and q)
      let hx0 = 0, hq0 = 0, hx1 = 0, hq1 = 0, cnt = 0;
      if (yy >= lo0 && yy < hi0) {
        const u = (yy-ay0)/dy0;
        const x = xs0+u*dx0, q = q0+u*dq0;
        if (cnt === 0) { hx0=x; hq0=q; cnt=1; }
        else if (x < hx0) { hx1=hx0; hq1=hq0; hx0=x; hq0=q; cnt=2; }
        else { hx1=x; hq1=q; cnt=2; }
      }
      if (yy >= lo1 && yy < hi1) {
        const u = (yy-ay1)/dy1;
        const x = xs1+u*dx1, q = q1+u*dq1;
        if (cnt === 0) { hx0=x; hq0=q; cnt=1; }
        else if (x < hx0) { hx1=hx0; hq1=hq0; hx0=x; hq0=q; cnt=2; }
        else { hx1=x; hq1=q; cnt=2; }
      }
      if (yy >= lo2 && yy < hi2) {
        const u = (yy-ay2)/dy2;
        const x = xs2+u*dx2, q = q2+u*dq2;
        if (cnt === 0) { hx0=x; hq0=q; cnt=1; }
        else if (x < hx0) { hx1=hx0; hq1=hq0; hx0=x; hq0=q; cnt=2; }
        else { hx1=x; hq1=q; cnt=2; }
      }
      if (cnt < 2) continue;
      const x0 = Math.max(0, Math.ceil(hx0 - 0.5)), x1 = Math.min(R - 1, Math.floor(hx1 - 0.5));
      const span = hx1 - hx0;
      const dq = span > 1e-9 ? (hq1 - hq0) / span : 0;
      let q = hq0 + ((x0 + 0.5) - hx0) * dq;
      const row = y * R;
      const winVal = focal !== undefined && t.env === true ? wStamp16 | ti : wStamp16 | 0xffff;
      for (let x = x0; x <= x1; x++, q += dq) {
        const p = row + x;
        if (q > depth[p]) { depth[p] = q; col32[p] = packed; winner[p] = winVal; }
      }
    }
  }
  if (profile) { const t = rasterClock(); profile.geometry = t-stageAt; stageAt = t; }
  /* Pass 2: per-pixel studio-environment reflection on large polished faces.
     The mirror direction varies with the view ray even across a flat face;
     adding it per-pixel is what makes brass/steel read as metal. Rational
     falloffs instead of exp() - this runs ~100k times per frame. */
  if (focal !== undefined) {
    const ray = ZB_RAY;
    const RS = R / size;   // loop-invariant; identical value to the old inline (R / size)
    // per-triangle barycentric coefficient cache for this call: identical
    // arithmetic per pixel, just not recomputed from scratch each pixel
    if (ZB_BC.length < tris.length * 6) { ZB_BC = new Float64Array(tris.length * 6); ZB_BCS = new Int32Array(tris.length); }
    const bc = ZB_BC, bcs = ZB_BCS, stamp = ++ZB_BCSTAMP;
    for (let y = 0; y < R; y++) {
      const pyv = (y + 0.5) / RS, rowOff = y * R;
      for (let x = 0; x < R; x++) {
      const p = rowOff + x;
      const w = winner[p];
      if ((w >>> 16) !== ZB_WSTAMP) continue;
      const ti = w & 0xffff;
      if (ti === 0xffff) continue;
      const t = tris[ti];
      let enx = t.enx!, eny = t.eny!, enz = t.enz!;
      if (t.nv) {
        // barycentric-interpolated vertex normal: smooth reflection across
        // segment boundaries (rim/bezel banding fix)
        const pxv = (x + 0.5) / RS;
        const o6 = ti * 6;
        if (bcs[ti] !== stamp) {
          const d = (t.y1 - t.y2) * (t.x0 - t.x2) + (t.x2 - t.x1) * (t.y0 - t.y2);
          bc[o6] = d; bc[o6 + 1] = t.y1 - t.y2; bc[o6 + 2] = t.x2 - t.x1;
          bc[o6 + 3] = t.y2 - t.y0; bc[o6 + 4] = t.x0 - t.x2;
          bc[o6 + 5] = d !== 0 ? 1 : 0;
          bcs[ti] = stamp;
        }
        if (bc[o6 + 5] === 1) {
          const d = bc[o6];
          const w0 = (bc[o6 + 1] * (pxv - t.x2) + bc[o6 + 2] * (pyv - t.y2)) / d;
          const w1 = (bc[o6 + 3] * (pxv - t.x2) + bc[o6 + 4] * (pyv - t.y2)) / d;
          const w2 = 1 - w0 - w1;
          const nv = t.nv;
          enx = w0 * nv[0] + w1 * nv[3] + w2 * nv[6];
          eny = w0 * nv[1] + w1 * nv[4] + w2 * nv[7];
          enz = w0 * nv[2] + w1 * nv[5] + w2 * nv[8];
          const il = 1 / (Math.sqrt(enx * enx + eny * eny + enz * enz) || 1);
          enx *= il; eny *= il; enz *= il;
        }
      }
      const p3 = 3 * p;
      const dx = ray[p3], dy = ray[p3 + 1], dz = ray[p3 + 2];
      const dn = dx * enx + dy * eny + dz * enz;   // negative: normal faces camera
      let rx = dx - 2 * dn * enx, ry = dy - 2 * dn * eny;   // rz unused by env
      const up = ry > 0 ? ry : 0, dwn = ry < 0 ? -ry : 0;
      let env = 0.06 + 0.55 * up * up + 0.10 * dwn;
      const w1x = rx + 0.45, w1y = ry - 0.55;
      const d1 = 1 + w1x * w1x * 6 + w1y * w1y * 2.2;
      env += 0.9 / (d1 * d1);
      const w2x = rx - 0.55, w2y = ry - 0.35;
      const d2 = 1 + w2x * w2x * 9 + w2y * w2y * 3;
      env += 0.55 / (d2 * d2);
      if (t.brush !== undefined) {
        // concentric circular-graining rings around the wheel center (triangle wave)
        const bdx = (x + 0.5) / RS - t.bcx!, bdy = (y + 0.5) / RS - t.bcy!;
        const rr = Math.sqrt(bdx * bdx + bdy * bdy) * t.brush;
        const fr2 = rr - Math.floor(rr);
        const tw = 1 - 2 * (fr2 > 0.5 ? fr2 - 0.5 : 0.5 - fr2);
        env *= 0.94 + 0.06 * tw;
      }
      const ct = -dn, om = 1 - ct, om2 = om * om;
      const om5 = om2 * om2 * om;
      // metal Fresnel: F0 is the tinted base reflectance, not a dielectric
      // 0.25 - metals stay reflective at normal incidence, which is what makes
      // brass/steel read as metal instead of matte plastic
      const e255 = env * 0.85 * 255;
      // metal Fresnel tuning (look-dev sweep winner, variant A): tinted F0 with
      // partial energy conservation so highlights enrich instead of washing out
      const P = { f0a: 0.10, f0t: 0.38, conserve: 0.45 };
      const f0r = P.f0a + P.f0t * (0.55 + 0.45 * t.r);
      const f0g = P.f0a + P.f0t * (0.55 + 0.45 * t.g);
      const f0b = P.f0a + P.f0t * (0.55 + 0.45 * t.b);
      const fr = f0r + (1 - f0r) * om5, fg = f0g + (1 - f0g) * om5, fb = f0b + (1 - f0b) * om5;
      const o = 4 * p;
      const er = e255 * fr, eg = e255 * fg, eb = e255 * fb;
      const nr = col[o] * (1 - P.conserve * fr) + er, ng = col[o + 1] * (1 - P.conserve * fg) + eg, nb = col[o + 2] * (1 - P.conserve * fb) + eb;
      col[o] = nr > 255 ? 255 : nr; col[o + 1] = ng > 255 ? 255 : ng; col[o + 2] = nb > 255 ? 255 : nb;
      }
    }
  }

  if (profile) { const t = rasterClock(); profile.reflection = t-stageAt; stageAt = t; }
  /* Fused finishing pass over the live color+depth buffers:
     (a) contact shading (SSAO-lite, 8 taps): a pixel whose neighbors sit much
         nearer is in a contact zone (plate under a gear edge, gear under a
         hand) - darken it; the depth cue that grounds the movement;
     (b) edge anti-aliasing: pixels near a depth or color discontinuity blend
         0.3 toward their across-edge neighbors, softening staircases without
         SS2's 4x cost. One traversal shares the depth reads between both. */
  if (ss === 1) {   // SS2 tier gets AA from the downsample; finishing runs at final res only
    const rad = 3;
    const T = 36 * 3;
    for (let y = rad; y < R - rad; y++) {
      for (let x = rad; x < R - rad; x++) {
        const p = y * R + x;
        const q = depth[p];
        if (q > 0) {
          const thr = q * 1.014;   // ~2 scene units nearer at watch distance
          let occ = 0;
          if (depth[p - rad] > thr) occ++;
          if (depth[p + rad] > thr) occ++;
          if (depth[p - rad * R] > thr) occ++;
          if (depth[p + rad * R] > thr) occ++;
          if (depth[p - rad - rad * R] > thr) occ++;
          if (depth[p + rad - rad * R] > thr) occ++;
          if (depth[p - rad + rad * R] > thr) occ++;
          if (depth[p + rad + rad * R] > thr) occ++;
          if (occ > 0) {
            const sh = 1 - 0.5 * (occ / 8);
            const o = 4 * p;
            col[o] = col[o] * sh; col[o + 1] = col[o + 1] * sh; col[o + 2] = col[o + 2] * sh;
          }
        }
        // edge detect: depth discontinuity (silhouette) or strong color step
        const qx = depth[p + 1], qy = depth[p + R];
        const ex = (q === 0) !== (qx === 0) || (qx > 0 && (q > qx ? q - qx > q * 0.014 : qx - q > qx * 0.014));
        const ey = (q === 0) !== (qy === 0) || (qy > 0 && (q > qy ? q - qy > q * 0.014 : qy - q > qy * 0.014));
        let axis = ex ? 0 : ey ? 1 : -1;
        const o = 4 * p;
        if (axis < 0) {
          const l = col[o] + col[o + 1] + col[o + 2];
          const lx = col[o + 4] + col[o + 5] + col[o + 6];
          const dxc = l > lx ? l - lx : lx - l;
          const ly = col[o + R * 4] + col[o + R * 4 + 1] + col[o + R * 4 + 2];
          const dyc = l > ly ? l - ly : ly - l;
          if (dxc > T || dyc > T) axis = dxc >= dyc ? 0 : 1;
        }
        if (axis === 0) {
          for (let c = 0; c < 3; c++) col[o + c] = (col[o + c] * 7 + ((col[o - 4 + c] + col[o + 4 + c]) >> 1) * 3) / 10;
        } else if (axis === 1) {
          for (let c = 0; c < 3; c++) col[o + c] = (col[o + c] * 7 + ((col[o - R * 4 + c] + col[o + R * 4 + c]) >> 1) * 3) / 10;
        }
      }
    }
  }
  // SS1 already has the final pixels, including opaque background.
  if (ss === 1) { out.set(col); if (profile) profile.resolve = rasterClock()-stageAt; return; }

  // box downsample ss x ss -> size x size RGBA
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let dy = 0; dy < ss; dy++) {
        const row = ((y * ss + dy) * R + x * ss) * 4;
        for (let dx = 0; dx < ss; dx++) {
          const o = row + dx * 4;
          sr += col[o]; sg += col[o + 1]; sb += col[o + 2];
        }
      }
      const d = (y * size + x) * 4, a = ss * ss;
      out[d] = sr / a; out[d + 1] = sg / a; out[d + 2] = sb / a; out[d + 3] = 255;
    }
  }
  if (profile) profile.resolve = rasterClock()-stageAt;
}
