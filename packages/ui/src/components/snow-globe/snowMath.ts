/*
  Snow Globe physics. Pure TypeScript, shared by the React Native component, the web preview and the tests.

  Units: the water sphere has radius 1, y points up. Everything is simulated in the frame of the globe, so
  the walls stand still and shaking the globe shows up as the water lagging behind it.

  Water. A real 3D velocity field on a 14 x 14 x 14 grid, advanced with the "stable fluids" scheme:
  forces, viscous damping, semi-Lagrangian advection and a pressure projection that keeps it incompressible.
  Shaking drives it three ways: shear near the glass (the water drags against the wall), a rectified
  stirring that feeds divergence-free eddies, and a twist about the vertical axis. The flakes push back:
  each airborne flake adds its drag to the cell it sits in, so a falling blizzard pulls the water down and
  the return flow rises through the middle, the way a real globe churns.

  Flakes. Each flake relaxes to the local water velocity plus its own Stokes terminal fall speed
  (proportional to diameter squared) and feels a little sub-grid turbulence. It collides with the glass,
  the snowy ground, every pine (stacked cones), the cottage walls, the roof and chimney, and the lamp
  post, all described as signed distance fields. A flake that lands on a surface that faces up and is
  not too steep stays there, and shaking lifts it again, the loosest first. On steep surfaces it slides.
*/

export type Vec3 = [number, number, number];

export const SNOW_DEFAULTS = {
  gravityFall: 1, // scale on every flake's terminal speed
  subgrid: 0.5, // sub-grid turbulence relative to the resolved speed
  shearGain: 0.45, // wall shear forcing from container acceleration
  stirGain: 0.07, // rectified eddy forcing per unit of container acceleration
  twistGain: 0.03, // twist about the vertical axis per unit of container acceleration
  drag: 0.22, // slow linear spin-down of the water, per second
  viscosity: 0.012, // grid diffusion
  coupling: 0.5, // how hard the flakes push the water back
  maxSpeed: 2.6,
  wallRestitution: 0.1,
  groundDrag: 9,
  fixedStep: 1 / 90,
  fluidEvery: 2, // fluid is stepped every n flake sub-steps
  homeStiffness: 46,
  homeDamping: 5.5,
  holdStiffness: 190,
  holdDamping: 25,
  reach: 0.62, // how far the globe can be dragged from home, in sphere radii
};

export type Flake = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number; // base radius in design pixels
  rad: number; // collision radius, sphere radii
  vt: number; // terminal fall speed, sphere radii per second
  tau: number; // velocity relaxation time, seconds
  rest: boolean;
  on: number; // id of the solid the flake rests on, 0 for the ground
  lift: number; // agitation needed to pull the flake off its perch
  phase: number; // glitter phase
  spin: number;
  warm: number;
};

export const GN = 14; // grid cells per side
const GH = 2.1 / GN; // cell size
const GO = -1.05; // grid origin
const GN3 = GN * GN * GN;

export type Fluid = {
  u: Float32Array; v: Float32Array; w: Float32Array;
  u1: Float32Array; v1: Float32Array; w1: Float32Array;
  fx: Float32Array; fy: Float32Array; fz: Float32Array;
  p: Float32Array; div: Float32Array;
  mask: Uint8Array;
  cells: Int32Array;
  cx: Float32Array; cy: Float32Array; cz: Float32Array;
};

export type SnowWorld = {
  flakes: Flake[];
  fluid: Fluid;
  t: number;
  energy: number; // mean kinetic energy of the water, for the settling logic
  swirl: number; // mean swirl about the vertical axis
  // Globe (container) kinematics, in sphere radii. Positive x right, positive y up.
  cx: number; cy: number; cvx: number; cvy: number;
  held: boolean;
  targetX: number; targetY: number;
  shakeT: number; // seconds left of a scripted shake, 0 when idle
  shakeLen: number;
  acc: number;
  rng: number;
  peakAccel: number;
  groundTouch: number;
  swirlDir: number; // which way this shake tends to stir the water
  ax: number; ay: number; // container acceleration, last step
  agit: number; // smoothed container agitation, drives lift-off
  sub: number; // sub-step counter
};

/** Small deterministic generator, so tests and replays are repeatable. */
export function rand(w: { rng: number }): number {
  let t = (w.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const GROUND = -0.5;

/** Height of the snowy ground at (x, z). A soft hill at the back, a gentle dip in front. */
export function groundHeight(x: number, z: number): number {
  const hill = 0.11 * Math.exp(-((x + 0.3) * (x + 0.3) + (z - 0.25) * (z - 0.25)) / 0.32);
  const bump = 0.04 * Math.exp(-((x - 0.45) * (x - 0.45) + (z + 0.1) * (z + 0.1)) / 0.1);
  return GROUND + hill + bump + 0.012 * Math.sin(x * 7.0 + z * 3.0);
}

/** Largest horizontal radius at which the ground still sits inside the sphere. */
export function groundReach(h: number): number {
  return Math.sqrt(Math.max(0.04, 1 - h * h)) - 0.03;
}

/* ------------------------------------------------------------------------------------------------ */
/* The scene's solids. The drawing code builds its pictures from the same numbers.                  */
/* ------------------------------------------------------------------------------------------------ */

export type TreeDef = { x: number; z: number; h: number; w: number; id: number };
/** Pines, back to front. id is the solid id flakes report when they rest on it. */
export const TREES: TreeDef[] = [
  { x: 0.3, z: 0.5, h: 0.52, w: 0.3, id: 1 },
  { x: 0.58, z: 0.36, h: 0.42, w: 0.24, id: 2 },
  { x: 0.42, z: -0.02, h: 0.62, w: 0.34, id: 3 },
  { x: -0.62, z: -0.12, h: 0.5, w: 0.28, id: 4 },
  { x: 0.62, z: -0.24, h: 0.4, w: 0.22, id: 5 },
];
/** Four tiers per pine: [bottom, top, half width], as fractions of the tree's height and width. */
export const TIERS: [number, number, number][] = [
  [0.1, 0.4, 1.0],
  [0.3, 0.6, 0.78],
  [0.5, 0.8, 0.56],
  [0.68, 1.0, 0.34],
];
export const TRUNK_W = 0.07;

export const HOUSE = {
  id: 6, x: -0.3, z: 0.25, yaw: 0.5, hx: 0.2, hz: 0.14, wall: 0.2, roof: 0.15, over: 0.03,
  chimX: 0.1, chimZ: -0.05, chimW: 0.035, chimH: 0.17,
};
export const LAMP = { id: 7, x: 0.02, z: -0.2, h: 0.3, r: 0.009, head: 0.032 };
export const SOLID_COUNT = 8;

const TREE_TOP_Y = TREES.map((t) => groundHeight(t.x, t.z));

function sdTree(i: number, x: number, y: number, z: number): number {
  const t = TREES[i];
  const dx = x - t.x, dz = z - t.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  const gy = TREE_TOP_Y[i];
  let d = 1e9;
  // Trunk.
  d = Math.min(d, Math.max(r - TRUNK_W * t.w * 0.9, gy - y, y - (gy + t.h * 0.2)));
  for (const [y0, y1, hw] of TIERS) {
    const Y0 = gy + t.h * y0, Y1 = gy + t.h * y1, R = t.w * hw * 0.5;
    // Triangle (0,Y0) (R,Y0) (0,Y1) in the (r, y) plane, as the max of its three plane distances.
    const sx = Y1 - Y0, sy = R; // slanted edge normal (sx, sy) / len
    const len = Math.sqrt(sx * sx + sy * sy);
    const dSlant = ((r - R) * sx + (y - Y0) * sy) / len;
    const dBottom = Y0 - y;
    d = Math.min(d, Math.max(dSlant, dBottom));
  }
  return d;
}

function houseLocal(x: number, z: number, out: [number, number]) {
  const c = Math.cos(HOUSE.yaw), s = Math.sin(HOUSE.yaw);
  const dx = x - HOUSE.x, dz = z - HOUSE.z;
  out[0] = c * dx - s * dz;
  out[1] = s * dx + c * dz;
}
const hl: [number, number] = [0, 0];

function sdHouse(x: number, y: number, z: number): number {
  houseLocal(x, z, hl);
  const lx = hl[0], lz = hl[1];
  const gy = groundHeight(HOUSE.x, HOUSE.z) - 0.02;
  const eaves = gy + HOUSE.wall;
  const body = Math.max(Math.abs(lx) - HOUSE.hx, Math.abs(lz) - HOUSE.hz, y - eaves, gy - y);
  // Roof prism: ridge along local x, cross-section is a triangle in (lz, y).
  const rz = HOUSE.hz + HOUSE.over, rh = HOUSE.roof;
  const sl = Math.sqrt(rh * rh + rz * rz);
  const dSlope = (Math.abs(lz) * rh + (y - eaves) * rz - rz * rh) / sl;
  const roof = Math.max(Math.abs(lx) - (HOUSE.hx + HOUSE.over), dSlope, eaves - 0.004 - y);
  const chim = Math.max(
    Math.abs(lx - HOUSE.chimX) - HOUSE.chimW, Math.abs(lz - HOUSE.chimZ) - HOUSE.chimW,
    y - (eaves + HOUSE.chimH), eaves - y,
  );
  return Math.min(body, roof, chim);
}

function sdLamp(x: number, y: number, z: number): number {
  const gy = groundHeight(LAMP.x, LAMP.z);
  const r = Math.hypot(x - LAMP.x, z - LAMP.z);
  const post = Math.max(r - LAMP.r, gy - y, y - (gy + LAMP.h));
  const head = Math.hypot(r, y - (gy + LAMP.h + 0.03)) - LAMP.head;
  return Math.min(post, head);
}

/** Signed distance from a point to solid `id` (negative inside). id 0 is the ground. */
export function sdSolid(id: number, x: number, y: number, z: number): number {
  if (id === 0) return y - groundHeight(x, z);
  if (id <= TREES.length) return sdTree(id - 1, x, y, z);
  if (id === HOUSE.id) return sdHouse(x, y, z);
  return sdLamp(x, y, z);
}

const nrm: Vec3 = [0, 1, 0];
/** Distance to the nearest solid, and which one. Writes the outward normal into nrm. */
function nearest(x: number, y: number, z: number): { d: number; id: number } {
  let d = y - groundHeight(x, z), id = 0;
  for (let i = 0; i < TREES.length; i++) {
    const t = TREES[i];
    const dx = x - t.x, dz = z - t.z;
    if (dx * dx + dz * dz > t.w * t.w * 0.5 || y > TREE_TOP_Y[i] + t.h + 0.05) continue;
    const di = sdTree(i, x, y, z);
    if (di < d) { d = di; id = t.id; }
  }
  if ((x - HOUSE.x) * (x - HOUSE.x) + (z - HOUSE.z) * (z - HOUSE.z) < 0.16) {
    const di = sdHouse(x, y, z);
    if (di < d) { d = di; id = HOUSE.id; }
  }
  if ((x - LAMP.x) * (x - LAMP.x) + (z - LAMP.z) * (z - LAMP.z) < 0.01) {
    const di = sdLamp(x, y, z);
    if (di < d) { d = di; id = LAMP.id; }
  }
  return { d, id };
}

function normalOf(id: number, x: number, y: number, z: number) {
  const e = 0.004;
  let nx = sdSolid(id, x + e, y, z) - sdSolid(id, x - e, y, z);
  let ny = sdSolid(id, x, y + e, z) - sdSolid(id, x, y - e, z);
  let nz = sdSolid(id, x, y, z + e) - sdSolid(id, x, y, z - e);
  const l = Math.hypot(nx, ny, nz) || 1;
  nrm[0] = nx / l; nrm[1] = ny / l; nrm[2] = nz / l;
}

/** Steepest slope a flake still sticks to, as the minimum upward component of the surface normal. */
const STICK = 0.55;

/** Where in the scene a flake would touch down: used to scatter the starting snow over every surface. */
function placeOnGround(w: SnowWorld, f: Flake) {
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(w) * Math.PI * 2;
    const r = Math.sqrt(rand(w)) * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = groundHeight(x, z);
    if (Math.hypot(x, z) < groundReach(h) - 0.02) {
      const q = nearest(x, h + f.rad, z);
      if (q.id !== 0) continue; // do not start inside a solid
      f.x = x; f.z = z; f.y = h + f.rad * 0.5;
      f.on = 0;
      return;
    }
  }
  f.x = 0; f.z = 0.05; f.y = groundHeight(0, 0.05) + f.rad * 0.5; f.on = 0;
}

function makeFluid(): Fluid {
  const mk = () => new Float32Array(GN3);
  const f: Fluid = {
    u: mk(), v: mk(), w: mk(), u1: mk(), v1: mk(), w1: mk(), fx: mk(), fy: mk(), fz: mk(), p: mk(), div: mk(),
    mask: new Uint8Array(GN3), cells: new Int32Array(GN3), cx: mk(), cy: mk(), cz: mk(),
  };
  let n = 0;
  for (let k = 0; k < GN; k++) for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const idx = (k * GN + j) * GN + i;
    const x = GO + (i + 0.5) * GH, y = GO + (j + 0.5) * GH, z = GO + (k + 0.5) * GH;
    f.cx[idx] = x; f.cy[idx] = y; f.cz[idx] = z;
    if (Math.sqrt(x * x + y * y + z * z) < 0.96) { f.mask[idx] = 1; f.cells[n++] = idx; }
  }
  f.cells = f.cells.slice(0, n);
  return f;
}

export function createWorld(count = 640, seed = 7): SnowWorld {
  const w: SnowWorld = {
    flakes: [], fluid: makeFluid(), t: 0, energy: 0, swirl: 0,
    cx: 0, cy: 0, cvx: 0, cvy: 0, held: false, targetX: 0, targetY: 0,
    shakeT: 0, shakeLen: 0.95, acc: 0, rng: seed >>> 0, peakAccel: 0, groundTouch: 0, swirlDir: 1,
    ax: 0, ay: 0, agit: 0, sub: 0,
  };
  for (let i = 0; i < count; i++) {
    const big = rand(w);
    const size = 1.1 + big * big * 2.1; // many small, a few big
    const d = size / 3.2; // relative diameter
    const f: Flake = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      size,
      rad: 0.003 + 0.0022 * size,
      vt: 0.045 + 0.2 * d * d + rand(w) * 0.025, // Stokes: v ~ d^2
      tau: 0.14 + rand(w) * 0.16,
      rest: true,
      on: 0,
      lift: 0.07 + 0.85 * Math.pow(rand(w), 1.6),
      phase: rand(w) * Math.PI * 2,
      spin: 1.5 + rand(w) * 4,
      warm: 0,
    };
    placeOnGround(w, f);
    w.flakes.push(f);
  }
  return w;
}

/* ------------------------------------------------------------------------------------------------ */
/* Fluid                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

/** Divergence-free turbulent field (ABC flow) with drifting phases. */
function abc(x: number, y: number, z: number, t: number, out: Vec3) {
  const k = 4.2;
  const p1 = t * 0.9, p2 = 1.7 + t * 1.3, p3 = 3.1 + t * 1.1;
  const A = 1, B = 0.72, C = 0.86;
  out[0] = A * Math.sin(k * z + p1) + C * Math.cos(k * y + p2);
  out[1] = B * Math.sin(k * x + p3) + A * Math.cos(k * z + p1);
  out[2] = C * Math.sin(k * y + p2) + B * Math.cos(k * x + p3);
}
const tmp: Vec3 = [0, 0, 0];

/** Trilinear sample of one grid field. Cells outside the sphere count as still water. */
function sample(a: Float32Array, m: Uint8Array, x: number, y: number, z: number): number {
  let gx = (x - GO) / GH - 0.5, gy = (y - GO) / GH - 0.5, gz = (z - GO) / GH - 0.5;
  gx = gx < 0 ? 0 : gx > GN - 1.001 ? GN - 1.001 : gx;
  gy = gy < 0 ? 0 : gy > GN - 1.001 ? GN - 1.001 : gy;
  gz = gz < 0 ? 0 : gz > GN - 1.001 ? GN - 1.001 : gz;
  const i = gx | 0, j = gy | 0, k = gz | 0;
  const fx = gx - i, fy = gy - j, fz = gz - k;
  const b = (k * GN + j) * GN + i;
  const s = GN, s2 = GN * GN;
  const c000 = a[b], c100 = a[b + 1], c010 = a[b + s], c110 = a[b + s + 1];
  const c001 = a[b + s2], c101 = a[b + s2 + 1], c011 = a[b + s2 + s], c111 = a[b + s2 + s + 1];
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

/** Water velocity at a point, in the globe frame, including sub-grid turbulence. Writes into out. */
export function waterVelocity(w: SnowWorld, x: number, y: number, z: number, out: Vec3, p = SNOW_DEFAULTS) {
  const F = w.fluid;
  const r = Math.sqrt(x * x + y * y + z * z);
  const wall = Math.sqrt(Math.min(1, Math.max(0, (1 - r) / 0.12)));
  const a = sample(F.u, F.mask, x, y, z), b = sample(F.v, F.mask, x, y, z), c = sample(F.w, F.mask, x, y, z);
  const sp = Math.sqrt(a * a + b * b + c * c);
  abc(x, y, z, w.t, tmp);
  const g = Math.min(0.4, sp * p.subgrid) * 0.55;
  out[0] = (a + g * tmp[0]) * wall;
  out[1] = (b + g * tmp[1]) * wall;
  out[2] = (c + g * tmp[2]) * wall;
}

const fv: Vec3 = [0, 0, 0];

function fluidStep(w: SnowWorld, dt: number, p = SNOW_DEFAULTS) {
  const F = w.fluid, cells = F.cells, n = cells.length;
  const { u, v, w: ww, u1, v1, w1, fx, fy, fz } = F;
  const a = Math.hypot(w.ax, w.ay);
  // Forcing from the container's motion.
  const tq = (-w.ax * 0.5 + w.swirlDir * a * 0.7) * p.twistGain;
  const stir = a * p.stirGain;
  const dragK = Math.exp(-p.drag * dt);
  for (let q = 0; q < n; q++) {
    const i = cells[q];
    const x = F.cx[i], y = F.cy[i], z = F.cz[i];
    const r = Math.sqrt(x * x + y * y + z * z);
    // Shear is strongest where the water meets the glass.
    const s = Math.min(1, Math.max(0, (r - 0.25) / 0.65));
    const ww0 = s * s * (3 - 2 * s);
    let ax = -w.ax * p.shearGain * ww0, ay = -w.ay * p.shearGain * ww0, az = 0;
    if (stir > 1e-5) {
      abc(x, y, z, w.t * 2.3, fv);
      const e = stir * (0.35 + 0.65 * ww0);
      ax += e * fv[0]; ay += e * fv[1]; az += e * fv[2];
    }
    if (tq !== 0) {
      const e = tq * (0.35 + 0.65 * Math.min(1, r * 1.1));
      ax += e * z; az += -e * x;
    }
    u[i] = (u[i] + (ax + fx[i]) * dt) * dragK;
    v[i] = (v[i] + (ay + fy[i]) * dt) * dragK;
    ww[i] = (ww[i] + (az + fz[i]) * dt) * dragK;
    fx[i] = 0; fy[i] = 0; fz[i] = 0;
  }
  // Viscous diffusion: one relaxed Laplacian pass.
  const S = GN, S2 = GN * GN;
  const k = p.viscosity * dt / (GH * GH);
  const m = F.mask;
  for (let q = 0; q < n; q++) {
    const i = cells[q];
    const nb = (arr: Float32Array) => {
      let s = 0, c = 0;
      if (m[i - 1]) { s += arr[i - 1]; c++; } if (m[i + 1]) { s += arr[i + 1]; c++; }
      if (m[i - S]) { s += arr[i - S]; c++; } if (m[i + S]) { s += arr[i + S]; c++; }
      if (m[i - S2]) { s += arr[i - S2]; c++; } if (m[i + S2]) { s += arr[i + S2]; c++; }
      return c ? s / c : 0;
    };
    // Cells next to the glass lose more: that is the no-slip boundary layer.
    const open = (m[i - 1] + m[i + 1] + m[i - S] + m[i + S] + m[i - S2] + m[i + S2]) / 6;
    const kk = Math.min(0.5, k * 6 * (1 + (1 - open) * 4));
    u1[i] = u[i] + (nb(u) - u[i]) * kk;
    v1[i] = v[i] + (nb(v) - v[i]) * kk;
    w1[i] = ww[i] + (nb(ww) - ww[i]) * kk;
  }
  // Advect (semi-Lagrangian), reading the diffused field, writing back into u, v, w.
  for (let q = 0; q < n; q++) {
    const i = cells[q];
    const x = F.cx[i] - u1[i] * dt, y = F.cy[i] - v1[i] * dt, z = F.cz[i] - w1[i] * dt;
    u[i] = sample(u1, m, x, y, z); v[i] = sample(v1, m, x, y, z); ww[i] = sample(w1, m, x, y, z);
  }
  // Project: remove the divergence with Gauss-Seidel on the pressure. Glass cells are walls.
  const div = F.div, pr = F.p;
  const h2 = GH * GH;
  for (let q = 0; q < n; q++) {
    const i = cells[q];
    const du = (m[i + 1] ? u[i + 1] : 0) - (m[i - 1] ? u[i - 1] : 0);
    const dv = (m[i + S] ? v[i + S] : 0) - (m[i - S] ? v[i - S] : 0);
    const dw = (m[i + S2] ? ww[i + S2] : 0) - (m[i - S2] ? ww[i - S2] : 0);
    div[i] = (du + dv + dw) / (2 * GH);
  }
  for (let it = 0; it < 14; it++) {
    for (let q = 0; q < n; q++) {
      const i = cells[q];
      let s = 0, c = 0;
      if (m[i - 1]) { s += pr[i - 1]; c++; } if (m[i + 1]) { s += pr[i + 1]; c++; }
      if (m[i - S]) { s += pr[i - S]; c++; } if (m[i + S]) { s += pr[i + S]; c++; }
      if (m[i - S2]) { s += pr[i - S2]; c++; } if (m[i + S2]) { s += pr[i + S2]; c++; }
      pr[i] = c ? (s - div[i] * h2) / c : 0;
    }
  }
  let ke = 0, sw = 0;
  const cap = p.maxSpeed;
  for (let q = 0; q < n; q++) {
    const i = cells[q];
    u[i] -= ((m[i + 1] ? pr[i + 1] : pr[i]) - (m[i - 1] ? pr[i - 1] : pr[i])) / (2 * GH);
    v[i] -= ((m[i + S] ? pr[i + S] : pr[i]) - (m[i - S] ? pr[i - S] : pr[i])) / (2 * GH);
    ww[i] -= ((m[i + S2] ? pr[i + S2] : pr[i]) - (m[i - S2] ? pr[i - S2] : pr[i])) / (2 * GH);
    const sp = Math.sqrt(u[i] * u[i] + v[i] * v[i] + ww[i] * ww[i]);
    if (sp > cap) { const s = cap / sp; u[i] *= s; v[i] *= s; ww[i] *= s; }
    ke += sp * sp;
    sw += ww[i] * F.cx[i] * -1 + u[i] * F.cz[i];
  }
  w.energy = n ? Math.sqrt(ke / n) : 0;
  w.swirl = n ? sw / n : 0;
  if (!(w.energy < 1e6)) { u.fill(0); v.fill(0); ww.fill(0); w.energy = 0; } // never let a NaN stay
}

/** Start a scripted shake, the way a hand would rattle the globe. */
export function startShake(w: SnowWorld, strength = 1) {
  w.shakeT = w.shakeLen * (0.8 + 0.4 * strength);
  w.swirlDir = rand(w) < 0.5 ? -1 : 1;
}

/** Grab the globe. The pointer position is given in sphere radii from the globe's rest centre. */
export function holdGlobe(w: SnowWorld, tx: number, ty: number) {
  w.held = true;
  w.swirlDir = rand(w) < 0.5 ? -1 : 1;
  w.targetX = tx; w.targetY = ty;
}

export function moveGlobe(w: SnowWorld, tx: number, ty: number) {
  w.targetX = tx; w.targetY = ty;
}

export function releaseGlobe(w: SnowWorld) {
  w.held = false;
  w.targetX = 0; w.targetY = 0;
}

function clampReach(x: number, y: number, reach: number): [number, number] {
  const m = Math.hypot(x, y);
  return m > reach ? [(x / m) * reach, (y / m) * reach] : [x, y];
}

function substep(w: SnowWorld, dt: number, p = SNOW_DEFAULTS) {
  // 1. Globe kinematics: a spring to the finger, or back home.
  let tx = w.targetX, ty = w.targetY;
  if (!w.held) {
    if (w.shakeT > 0) {
      const u = 1 - w.shakeT / w.shakeLen;
      const env = Math.sin(Math.PI * Math.min(1, u)) * (1 - 0.35 * u);
      const s = w.shakeLen - w.shakeT;
      tx = 0.55 * env * Math.sin(2 * Math.PI * 4.6 * s + 0.4);
      ty = 0.3 * env * Math.sin(2 * Math.PI * 6.8 * s + 1);
      w.shakeT = Math.max(0, w.shakeT - dt);
    } else {
      tx = 0; ty = 0;
    }
  }
  [tx, ty] = clampReach(tx, ty, p.reach);
  const k = w.held || w.shakeT > 0 ? p.holdStiffness : p.homeStiffness;
  const c = w.held || w.shakeT > 0 ? p.holdDamping : p.homeDamping;
  const ax = k * (tx - w.cx) - c * w.cvx;
  const ay = k * (ty - w.cy) - c * w.cvy;
  w.cvx += ax * dt; w.cvy += ay * dt;
  w.cx += w.cvx * dt; w.cy += w.cvy * dt;
  [w.cx, w.cy] = clampReach(w.cx, w.cy, p.reach * 1.25);
  w.ax = ax; w.ay = ay;
  const a = Math.hypot(ax, ay);
  if (a > w.peakAccel) w.peakAccel = a;
  w.agit = Math.max(a, w.agit * Math.exp(-3 * dt));

  // 2. The water, at a lower rate than the flakes.
  if (w.sub++ % p.fluidEvery === 0) fluidStep(w, dt * p.fluidEvery, p);
  const F = w.fluid;

  // 3. Flakes.
  const u: Vec3 = [0, 0, 0];
  const mix = 1 / Math.max(1, F.cells.length);
  for (const f of w.flakes) {
    waterVelocity(w, f.x, f.y, f.z, u, p);
    const local = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
    if (f.rest) {
      if (local * 1.25 + w.agit * 0.012 > f.lift) {
        f.rest = false;
        f.vy = 0.35 + rand(w) * 0.5;
        f.vx = (rand(w) - 0.5) * 0.3;
        f.vz = (rand(w) - 0.5) * 0.3;
      } else continue;
    }
    const tx2 = u[0], ty2 = u[1] - f.vt * p.gravityFall, tz2 = u[2];
    const relax = 1 - Math.exp(-dt / f.tau);
    const dvx = (tx2 - f.vx) * relax, dvy = (ty2 - f.vy) * relax, dvz = (tz2 - f.vz) * relax;
    f.vx += dvx; f.vy += dvy; f.vz += dvz;
    // The flake pushes the water the other way (drag on the fluid), spread to the cell it is in.
    if (p.coupling > 0) {
      const gi = ((((f.z - GO) / GH) | 0) * GN + (((f.y - GO) / GH) | 0)) * GN + (((f.x - GO) / GH) | 0);
      if (gi > 0 && gi < GN3 && F.mask[gi]) {
        const s = -p.coupling * mix * 70 / dt;
        F.fx[gi] += dvx * s * 0.02; F.fy[gi] += dvy * s * 0.02; F.fz[gi] += dvz * s * 0.02;
      }
    }
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;

    // Glass wall.
    const r = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z);
    const rmax = 0.985 - f.rad;
    if (r > rmax) {
      const nx = f.x / r, ny = f.y / r, nz = f.z / r;
      f.x = nx * rmax; f.y = ny * rmax; f.z = nz * rmax;
      const vn = f.vx * nx + f.vy * ny + f.vz * nz;
      if (vn > 0) {
        const s = (1 + p.wallRestitution) * vn;
        f.vx -= s * nx; f.vy -= s * ny; f.vz -= s * nz;
      }
    }

    // Solids: ground, pines, cottage, lamp.
    const q = nearest(f.x, f.y, f.z);
    if (q.d < f.rad) {
      normalOf(q.id, f.x, f.y, f.z);
      const pen = f.rad - q.d;
      f.x += nrm[0] * pen; f.y += nrm[1] * pen; f.z += nrm[2] * pen;
      const vn = f.vx * nrm[0] + f.vy * nrm[1] + f.vz * nrm[2];
      if (vn < 0) {
        const e = 0.06;
        f.vx -= (1 + e) * vn * nrm[0]; f.vy -= (1 + e) * vn * nrm[1]; f.vz -= (1 + e) * vn * nrm[2];
      }
      // Friction along the surface: snow is sticky.
      const drag = Math.exp(-p.groundDrag * dt);
      const vn2 = f.vx * nrm[0] + f.vy * nrm[1] + f.vz * nrm[2];
      const tx3 = f.vx - vn2 * nrm[0], ty3 = f.vy - vn2 * nrm[1], tz3 = f.vz - vn2 * nrm[2];
      f.vx = vn2 * nrm[0] + tx3 * drag; f.vy = vn2 * nrm[1] + ty3 * drag; f.vz = vn2 * nrm[2] + tz3 * drag;
      w.groundTouch += 1;
      const sp = Math.hypot(f.vx, f.vy, f.vz);
      if (nrm[1] > STICK && sp < 0.06 && local < 0.06 + f.lift * 0.25 && w.agit * 0.012 < f.lift) {
        f.rest = true; f.on = q.id; f.vx = f.vy = f.vz = 0;
      }
      // Keep ground flakes inside the glass.
      if (q.id === 0) {
        const reach = groundReach(f.y);
        const rr = Math.hypot(f.x, f.z);
        if (rr > reach) { f.x *= reach / rr; f.z *= reach / rr; }
      }
    }
  }
  w.t += dt;
}

/** Advance the world by dt seconds using fixed sub-steps. */
export function stepSnow(w: SnowWorld, dt: number, p = SNOW_DEFAULTS) {
  w.acc += Math.min(dt, 0.1);
  let guard = 0;
  while (w.acc >= p.fixedStep && guard++ < 24) {
    substep(w, p.fixedStep, p);
    w.acc -= p.fixedStep;
  }
}

/** True once the water is calm and every flake lies on a surface. */
export function allSettled(w: SnowWorld): boolean {
  if (w.energy > 0.03 || Math.abs(w.swirl) > 0.04 || w.shakeT > 0 || w.held) return false;
  for (const f of w.flakes) if (!f.rest) return false;
  return Math.hypot(w.cvx, w.cvy) < 0.02;
}

export function airborne(w: SnowWorld): number {
  let n = 0;
  for (const f of w.flakes) if (!f.rest) n++;
  return n;
}

/** Mean speed of the airborne flakes, sphere radii per second. */
export function meanSpeed(w: SnowWorld): number {
  let s = 0, n = 0;
  for (const f of w.flakes) if (!f.rest) { s += Math.hypot(f.vx, f.vy, f.vz); n++; }
  return n ? s / n : 0;
}
