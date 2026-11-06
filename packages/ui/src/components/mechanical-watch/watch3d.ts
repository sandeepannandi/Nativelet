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
};

type V3 = [number, number, number];

export type Mesh = {
  pos: Float32Array;      // xyz per vertex
  idx: Uint32Array;       // 3 per triangle
  col: V3;                // base color 0..1
  metal: number;          // 0 dielectric .. 1 metal (specular strength/tint)
  spin?: { axis: V3; center: V3; angle: number };  // rigid transform per frame
};

/* ---------- mesh builders ---------- */

function pushTri(p: number[], i: number[], a: V3, b: V3, c: V3) {
  const base = p.length / 3;
  p.push(...a, ...b, ...c);
  i.push(base, base + 1, base + 2);
}

/** Surface of revolution around the Y... around the Z axis. profile = [r, z][]. */
export function lathe(profile: [number, number][], seg: number, col: V3, metal: number): Mesh {
  const p: number[] = [], idx: number[] = [];
  const n = profile.length;
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 2 * Math.PI, a1 = ((s + 1) / seg) * 2 * Math.PI;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    for (let k = 0; k < n - 1; k++) {
      const [r0, z0] = profile[k], [r1, z1] = profile[k + 1];
      const A: V3 = [r0 * c0, r0 * s0, z0], B: V3 = [r1 * c0, r1 * s0, z1];
      const C: V3 = [r1 * c1, r1 * s1, z1], D: V3 = [r0 * c1, r0 * s0, z0];
      if (r0 > 1e-6 && r1 > 1e-6) { pushTri(p, idx, A, B, C); pushTri(p, idx, A, C, D); }
      else if (r1 > 1e-6) pushTri(p, idx, A, B, C);       // r0 = 0: A == D on the axis
      else if (r0 > 1e-6) pushTri(p, idx, A, D, B);       // r1 = 0: B == C on the axis
    }
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal };
}

/** Extrude a 2D polygon (CCW) to z0..z1 with caps. Polygon must be convex-ish
   or fan-triangulable from vertex 0; gear/star profiles qualify if ordered. */
export function extrude(pts: [number, number][], z0: number, z1: number, col: V3, metal: number): Mesh {
  const p: number[] = [], idx: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    pushTri(p, idx, [x0, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    pushTri(p, idx, [x0, y0, z0], [x1, y1, z1], [x0, y0, z1]);
  }
  for (let i = 1; i < n - 1; i++) {   // top cap (CCW from above)
    pushTri(p, idx, [pts[0][0], pts[0][1], z1], [pts[i][0], pts[i][1], z1], [pts[i + 1][0], pts[i + 1][1], z1]);
  }
  for (let i = 1; i < n - 1; i++) {   // bottom cap
    pushTri(p, idx, [pts[0][0], pts[0][1], z0], [pts[i + 1][0], pts[i + 1][1], z0], [pts[i][0], pts[i][1], z0]);
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal };
}

/** Annulus (ring) extruded: outer + inner walls + two ring caps. */
export function ring(rOut: number, rIn: number, z0: number, z1: number, seg: number, col: V3, metal: number): Mesh {
  const p: number[] = [], idx: number[] = [];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 2 * Math.PI, a1 = ((s + 1) / seg) * 2 * Math.PI;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const O0: V3 = [rOut * c0, rOut * s0, z0], O1: V3 = [rOut * c1, rOut * s1, z0];
    const o0: V3 = [rOut * c0, rOut * s0, z1], o1: V3 = [rOut * c1, rOut * s1, z1];
    const I0: V3 = [rIn * c0, rIn * s0, z0], I1: V3 = [rIn * c1, rIn * s1, z0];
    const i0: V3 = [rIn * c0, rIn * s0, z1], i1: V3 = [rIn * c1, rIn * s1, z1];
    pushTri(p, idx, O0, O1, o1); pushTri(p, idx, O0, o1, o0);       // outer wall
    pushTri(p, idx, I0, i1, I1); pushTri(p, idx, I0, i0, i1);       // inner wall
    pushTri(p, idx, o0, o1, i1); pushTri(p, idx, o0, i1, i0);       // top ring
    pushTri(p, idx, O0, I1, O1); pushTri(p, idx, O0, I0, I1);       // bottom ring
  }
  return { pos: new Float32Array(p), idx: new Uint32Array(idx), col, metal };
}

/** Spoked wheel: rim ring + hub + `spokes` tapered arms, all in one mesh. */
export function spokedWheel(rOut: number, rIn: number, hubR: number, z0: number, z1: number, spokes: number, col: V3, metal: number): Mesh {
  const parts: Mesh[] = [ring(rOut, rIn, z0, z1, 40, col, metal)];
  const armW = (rIn - hubR) * 0.42;
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

export function merge(meshes: Mesh[]): Mesh {
  let np = 0, ni = 0;
  for (const m of meshes) { np += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(np), idx = new Uint32Array(ni);
  let op = 0, oi = 0;
  for (const m of meshes) {
    pos.set(m.pos, op);
    const vb = op / 3;
    for (let k = 0; k < m.idx.length; k++) idx[oi + k] = m.idx[k] + vb;
    op += m.pos.length; oi += m.idx.length;
  }
  return { pos, idx, col: meshes[0].col, metal: meshes[0].metal };
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

const KEY: V3 = norm([-0.62, -0.28, 0.55]);   // grazing key from upper left (speculars reach the camera)
const FILL: V3 = norm([0.8, 0.35, 0.4]);

function norm(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

/** Render the scene to a painter-sorted (far-first) flat triangle list in
   a size x size square. Lights ride with the camera so the rig is stable. */
const ZBUF: number[] = [];

export function renderFrame(meshes: Mesh[], cam: Camera, size: number, out: Tri[]): void {
  out.length = 0;
  ZBUF.length = 0;
  const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = size / (2 * Math.tan(cam.fov / 2));
  const half = size / 2;
  for (const m of meshes) {
    const spn = m.spin;
    const n = m.idx.length;
    for (let k = 0; k < n; k += 3) {
      const w: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let j = 0; j < 3; j++) {
        const vi = m.idx[k + j] * 3;
        let v: V3 = [m.pos[vi], m.pos[vi + 1], m.pos[vi + 2]];
        if (spn) {
          v = [v[0] - spn.center[0], v[1] - spn.center[1], v[2] - spn.center[2]];
          v = rotZ(v, spn.angle);
          v = [v[0] + spn.center[0], v[1] + spn.center[1], v[2] + spn.center[2]];
        }
        w[j] = v;
      }
      const e1: V3 = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]];
      const e2: V3 = [w[2][0] - w[0][0], w[2][1] - w[0][1], w[2][2] - w[0][2]];
      let nrm: V3 = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]);
      if (nl < 1e-12) continue;
      nrm = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
      const scr: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      let behind = false;
      for (let j = 0; j < 3; j++) {
        const v = w[j];
        const x = v[0] * cyw - v[1] * syw, y = v[0] * syw + v[1] * cyw;
        // -z: the scene's +z (dial side) faces the camera
        const z2 = y * sp - v[2] * cp;
        const zc = z2 + cam.dist;
        if (zc < 4) { behind = true; break; }
        const y2 = y * cp + v[2] * sp;
        scr[j] = [x, y2, zc];
      }
      if (behind) continue;
      const nx = nrm[0] * cyw - nrm[1] * syw, ny = nrm[0] * syw + nrm[1] * cyw;
      const nry = ny * cp + nrm[2] * sp, nrz = ny * sp - nrm[2] * cp;
      // double-sided (painter sort resolves occlusion): flip away-facing
      // normals so the visible side is lit; no winding requirements on meshes
      const flip = nrz > 0 ? -1 : 1;
      const inv = flip / Math.max(1e-12, Math.hypot(nx, nry, nrz));
      const nv: V3 = [nx * inv, nry * inv, nrz * inv];
      const nvz2 = nrz * inv;
      const keyD = Math.max(0, -(nv[0] * KEY[0] + nv[1] * KEY[1] + nv[2] * KEY[2]));
      const fillD = Math.max(0, -(nv[0] * FILL[0] + nv[1] * FILL[1] + nv[2] * FILL[2]));
      // reflect the key light about the face normal; spec when it exits toward the camera (0,0,-1)
      const nd = nv[0] * KEY[0] + nv[1] * KEY[1] + nv[2] * KEY[2];
      const rz = KEY[2] - 2 * nd * nv[2];
      const rx = KEY[0] - 2 * nd * nv[0];
      const ry = KEY[1] - 2 * nd * nv[1];
      const rl = Math.max(1e-9, Math.hypot(rx, ry, rz));
      const specA = Math.max(
        Math.pow(Math.max(0, -rz / rl), 12),
        // studio streak: bright bands where curved metal walls turn edge-on
        Math.pow(Math.abs(nx), 10) * Math.pow(1 - Math.abs(nvz2), 2) * 0.9,
      );
      const spec = specA * (0.22 + 1.0 * m.metal);
      const amb = 0.22, dif = 0.78 * keyD + 0.25 * fillD;
      let r = m.col[0] * (amb + dif), g = m.col[1] * (amb + dif), b = m.col[2] * (amb + dif);
      const sm = m.metal > 0.5;
      r += spec * (sm ? Math.min(1, m.col[0] * 1.6) : 1);
      g += spec * (sm ? Math.min(1, m.col[1] * 1.6) : 1);
      b += spec * (sm ? Math.min(1, m.col[2] * 1.6) : 1);
      const px: number[] = [], py: number[] = [];
      let zAvg = 0;
      for (let j = 0; j < 3; j++) {
        px.push(half + (scr[j][0] * f) / scr[j][2]);
        py.push(half - (scr[j][1] * f) / scr[j][2]);
        zAvg += scr[j][2];
      }
      ZBUF.push(zAvg / 3);
      out.push({
        x0: px[0], y0: py[0], x1: px[1], y1: py[1], x2: px[2], y2: py[2],
        r: Math.min(1, r), g: Math.min(1, g), b: Math.min(1, b),
      });
    }
  }
  // painter sort: far (large z) drawn first
  const order = new Uint32Array(out.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  const z = ZBUF;
  Array.prototype.sort.call(order, (a, b) => z[b] - z[a]);
  const sorted: Tri[] = new Array(out.length);
  for (let i = 0; i < order.length; i++) sorted[i] = out[order[i]];
  for (let i = 0; i < sorted.length; i++) out[i] = sorted[i];
}

/* ---------- the watch scene ----------
   Sim-consistent movement layout (escape tip R = 10):
   escape wheel at (0,-17) [sim coords offset (0,-17)], fork pivot (0,-3.6),
   balance (0,8.4). Center wheel at origin with the hands. Skeleton: no full
   dial - chapter ring + applied markers, movement visible. */

export type WatchScene = {
  statics: Mesh[];        // case, ring, plate, bridges (never spin)
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

function hand(len: number, w: number, tail: number, z0: number, z1: number, col: V3): Mesh {
  // tapered dauphine-ish hand pointing +Y from the center
  const pts: [number, number][] = [
    [-w * 0.5, -tail], [w * 0.5, -tail], [w * 0.42, len * 0.55], [0, len], [-w * 0.42, len * 0.55],
  ];
  return extrude(pts, z0, z1, col, 1);
}

export function buildWatchScene(): WatchScene {
  // case: clean band ring + convex bezel arc + solid back (no zigzag profiles)
  const caseBand = ring(50, 46.8, -2, 10.0, 64, STEEL, 1);   // top cap fully under the bezel bottom (10.2): no z-alternation
  const caseBack = lathe([[0, -2.8], [46.6, -2.8], [48.4, -2], [46.6, -1.7], [41.8, -1.7]], 48, STEEL, 1);   // no interior top disc: the plate covers it (fan interleave)
  const bezel = lathe([[45.8, 10.2], [50.3, 10.2], [51.2, 11.5], [49, 13.5], [45.8, 13.2], [45.8, 10.2]], 64, STEEL, 1);  // closed cross-section
  const crownX = merge([
    box(50.5, 0, 4, 3.5, 1.6, 1.6, STEEL, 1),     // stem
    box(53.5, 0, 4, 3.4, 4.6, 4.6, STEEL, 1),     // head
    box(53.5, 0, 4, 4.0, 3.4, 5.2, STEEL, 1),     // knurl cross
  ]);
  // chapter ring + applied markers
  const chapter = ring(46.55, 41.5, 6.4, 10.2, 64, [0.07, 0.07, 0.09], 0.2);   // tall rehaut, INSIDE the band inner wall (46.8) - no crossing
  const markers: Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const w = i % 3 === 0 ? 1.6 : 0.9;
    const m = box(0, 0, 0, w, 3.6, 0.5, STEEL, 1);
    bake(m, 43.9 * Math.sin(a), 43.9 * Math.cos(a), 10.0, -a);
    markers.push(m);
  }
  // solid mainplate disc (dark) + center medallion + balance cock
  const plate = lathe([[0, -0.8], [41.6, -0.8], [41.6, 0], [0, 0]], 56, PLATE, 0.8);
  const balCock = bake(box(0, 0, 0, 5, 14, 1.2, PLATE, 0.8), 0, 9, 6.0, 0.12);
  // gear train: z-tiered for depth separation (barrel low, rising toward escape)
  const barrel = merge([
    gear(84, 15.2, 16, 0.4, 1.6, BRASS, 1),
    spokedWheel(14.9, 14.1, 3.2, 1.6, 2.4, 6, BRASS, 1),
    lathe([[0, 0.2], [1.8, 0.2], [1.8, 3.0], [0, 3.0]], 12, STEEL, 1),
  ]);
  bake(barrel, -20, 15, 0);
  const center = merge([
    gear(80, 12.6, 13.2, 0.8, 1.6, BRASS, 1),
    spokedWheel(12.4, 11.6, 2.2, 1.6, 2.2, 5, BRASS, 1),
    lathe([[0, 0.2], [1.1, 0.2], [1.1, 8.6], [0, 8.6]], 10, STEEL, 1),
  ]);
  bake(center, 0, 2, 0);
  const third = merge([
    gear(75, 9.5, 10, 2.2, 2.9, BRASS, 1),
    spokedWheel(9.3, 8.6, 1.6, 2.9, 3.4, 5, BRASS, 1),
    lathe([[0, 1.6], [0.9, 1.6], [0.9, 3.8], [0, 3.8]], 10, STEEL, 1),
  ]);
  bake(third, 17, 11, 0);
  const fourth = merge([
    gear(72, 8.5, 9, 3.0, 3.7, BRASS, 1),
    spokedWheel(8.3, 7.6, 1.5, 3.7, 4.2, 4, BRASS, 1),
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
    ring(8.6, 7.6, 5.0, 6.0, 44, STEEL, 1),
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
  const hourHand = hand(17, 2.8, 4, 7.6, 8.3, STEEL);
  hourHand.spin = { axis: [0, 0, 1], center: [0, 0, 0], angle: 0 };
  const minuteHand = hand(29, 2.2, 5, 8.5, 9.1, STEEL);
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
    statics: [caseBand, caseBack, bezel, crownX, chapter, plate, balCock, ...markers],
    wheels: [barrel, center, third, fourth, escape],
    fork, balance, hairspring, hourHand, minuteHand, secondHand,
  };
}

/** Per-frame: set spin angles from the sim state and render everything. */
export function renderWatch(scene: WatchScene, a: {
  barrel: number; center: number; third: number; fourth: number; escape: number;
  fork: number; balance: number; hour: number; minute: number; second: number;
}, cam: Camera, size: number, out: Tri[]): void {
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
  renderFrame([...scene.statics, ...scene.wheels, scene.fork, scene.balance, scene.hairspring, scene.hourHand, scene.minuteHand, scene.secondHand], cam, size, out);
}
