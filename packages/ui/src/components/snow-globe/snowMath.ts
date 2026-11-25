/*
  Snow Globe physics. Pure TypeScript, shared by the React Native component, the web preview and the tests.

  Units: the water sphere has radius 1, y points up. Everything is simulated in the frame of the globe, so
  the walls stand still and shaking the globe shows up as the water lagging behind it.

  The water is not meshed. It is a closed-form velocity field that mixes three parts:
    1. a bulk "sloshing" velocity, driven by the globe's acceleration (the water has inertia and lags it),
    2. a solid-body swirl around the vertical axis that spins down like a real stirred fluid,
    3. a divergence-free turbulent field (an Arnold-Beltrami-Childress flow) whose strength is the
       turbulence energy, fed by shaking and bled off by viscosity.
  All three fade to zero at the glass, so the flow has a no-slip boundary layer. Each flake relaxes to the
  local water velocity plus its own terminal fall speed (Stokes: proportional to diameter squared), so
  big flakes fall faster, small ones hang and drift. Flakes bounce softly off the glass, slide on the
  snowy ground and lie still once the water around them has calmed down. Shaking lifts them again, the
  loosest first.
*/

export type Vec3 = [number, number, number];

export const SNOW_DEFAULTS = {
  gravityFall: 1, // scale on every flake's terminal speed
  turbulenceGain: 0.95, // speed of the ABC flow at energy 1 (sphere radii per second)
  energyFromShake: 0.045, // energy gained per unit of acceleration per second
  energyDecay: 0.52, // viscous loss of turbulence, per second
  swirlDecay: 0.42, // spin-down of the solid-body swirl, per second
  bulkDecay: 2.1, // damping of the sloshing relative velocity, per second
  maxEnergy: 1.25,
  maxSwirl: 4.5,
  wallRestitution: 0.12,
  groundDrag: 9,
  fixedStep: 1 / 90,
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
  vt: number; // terminal fall speed, sphere radii per second
  tau: number; // velocity relaxation time, seconds
  rest: boolean;
  lift: number; // energy needed to pull the flake off the ground
  phase: number; // glitter phase
  spin: number;
  warm: number;
};

export type SnowWorld = {
  flakes: Flake[];
  t: number;
  energy: number;
  swirl: number;
  bulk: Vec3;
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

function placeOnGround(w: SnowWorld, f: Flake) {
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(w) * Math.PI * 2;
    const r = Math.sqrt(rand(w)) * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = groundHeight(x, z);
    if (Math.hypot(x, z) < groundReach(h) - 0.02) {
      f.x = x; f.z = z; f.y = h + 0.008;
      return;
    }
  }
  f.x = 0; f.z = 0; f.y = groundHeight(0, 0) + 0.008;
}

export function createWorld(count = 480, seed = 7): SnowWorld {
  const w: SnowWorld = {
    flakes: [], t: 0, energy: 0, swirl: 0, bulk: [0, 0, 0],
    cx: 0, cy: 0, cvx: 0, cvy: 0, held: false, targetX: 0, targetY: 0,
    shakeT: 0, shakeLen: 0.95, acc: 0, rng: seed >>> 0, peakAccel: 0, groundTouch: 0, swirlDir: 1,
  };
  for (let i = 0; i < count; i++) {
    const big = rand(w);
    const size = 1.1 + big * big * 2.1; // many small, a few big
    const d = size / 3.2; // relative diameter
    const f: Flake = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      size,
      vt: 0.07 + 0.26 * d * d + rand(w) * 0.03, // Stokes: v ~ d^2
      tau: 0.14 + rand(w) * 0.16,
      rest: true,
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

/** Divergence-free turbulent field (ABC flow) with drifting phases, scaled to unit-ish magnitude. */
function abc(x: number, y: number, z: number, t: number, out: Vec3) {
  const k = 3.9;
  const p1 = t * 0.9, p2 = 1.7 + t * 1.3, p3 = 3.1 + t * 1.1;
  const A = 1, B = 0.72, C = 0.86;
  out[0] = A * Math.sin(k * z + p1) + C * Math.cos(k * y + p2);
  out[1] = B * Math.sin(k * x + p3) + A * Math.cos(k * z + p1);
  out[2] = C * Math.sin(k * y + p2) + B * Math.cos(k * x + p3);
}

const tmp: Vec3 = [0, 0, 0];

/** Water velocity at a point, in the globe frame. Writes into out. */
export function waterVelocity(w: SnowWorld, x: number, y: number, z: number, out: Vec3, p = SNOW_DEFAULTS) {
  const r = Math.sqrt(x * x + y * y + z * z);
  // No-slip: the flow fades over the last 18 percent of the radius.
  const edge = Math.min(1, Math.max(0, (1 - r) / 0.18));
  const wall = Math.sqrt(edge);
  abc(x, y, z, w.t, tmp);
  const g = w.energy * p.turbulenceGain;
  out[0] = (w.bulk[0] + w.swirl * z + g * tmp[0]) * wall;
  out[1] = (w.bulk[1] + g * tmp[1]) * wall;
  out[2] = (w.bulk[2] - w.swirl * x + g * tmp[2]) * wall;
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
  const a = Math.hypot(ax, ay);
  if (a > w.peakAccel) w.peakAccel = a;

  // 2. The water lags the globe: container acceleration pushes it the opposite way.
  w.bulk[0] += -ax * dt * 0.55;
  w.bulk[1] += -ay * dt * 0.55;
  const damp = Math.exp(-p.bulkDecay * dt);
  w.bulk[0] *= damp; w.bulk[1] *= damp; w.bulk[2] *= damp;
  // Horizontal shaking stirs the water round, vertical shaking mostly mixes it.
  w.swirl += (-ax * 0.03 + w.swirlDir * a * 0.02) * dt;
  w.swirl = Math.max(-p.maxSwirl, Math.min(p.maxSwirl, w.swirl)) * Math.exp(-p.swirlDecay * dt);
  w.energy = Math.min(p.maxEnergy, w.energy + a * p.energyFromShake * dt);
  w.energy *= Math.exp(-p.energyDecay * dt);
  if (w.energy < 1e-4) w.energy = 0;
  if (Math.abs(w.swirl) < 1e-4) w.swirl = 0;

  // 3. Flakes.
  const u: Vec3 = [0, 0, 0];
  const calm = w.energy + Math.hypot(w.bulk[0], w.bulk[1]) * 0.9 + Math.abs(w.swirl) * 0.22;
  for (const f of w.flakes) {
    if (f.rest) {
      if (calm > f.lift) {
        f.rest = false;
        f.vy = 0.5 + rand(w) * 0.6;
        f.vx = (rand(w) - 0.5) * 0.3;
        f.vz = (rand(w) - 0.5) * 0.3;
      } else continue;
    }
    waterVelocity(w, f.x, f.y, f.z, u, p);
    const tx2 = u[0], ty2 = u[1] - f.vt * p.gravityFall, tz2 = u[2];
    const relax = 1 - Math.exp(-dt / f.tau);
    f.vx += (tx2 - f.vx) * relax;
    f.vy += (ty2 - f.vy) * relax;
    f.vz += (tz2 - f.vz) * relax;
    // Tiny turbulent jitter, proportional to how much the water is moving.
    const j = 0.05 * Math.min(1, w.energy * 2) * dt * 60;
    f.vx += (rand(w) - 0.5) * j * 0.1;
    f.vy += (rand(w) - 0.5) * j * 0.1;
    f.vz += (rand(w) - 0.5) * j * 0.1;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;

    // Glass wall.
    const r = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z);
    const rmax = 0.985;
    if (r > rmax) {
      const nx = f.x / r, ny = f.y / r, nz = f.z / r;
      f.x = nx * rmax; f.y = ny * rmax; f.z = nz * rmax;
      const vn = f.vx * nx + f.vy * ny + f.vz * nz;
      if (vn > 0) {
        const s = (1 + p.wallRestitution) * vn;
        f.vx -= s * nx; f.vy -= s * ny; f.vz -= s * nz;
      }
    }
    // Ground.
    const gh = groundHeight(f.x, f.z) + 0.006;
    if (f.y < gh) {
      f.y = gh;
      if (f.vy < 0) f.vy = 0;
      const drag = Math.exp(-p.groundDrag * dt);
      f.vx *= drag; f.vz *= drag;
      const sp = Math.hypot(f.vx, f.vz);
      const local = Math.hypot(u[0], u[2]) + Math.abs(u[1]);
      w.groundTouch += 1;
      if (sp < 0.05 && local < 0.07 + f.lift * 0.3 && calm < f.lift + 0.02) {
        f.rest = true; f.vx = f.vy = f.vz = 0;
      }
      // Keep ground flakes inside the glass.
      const reach = groundReach(gh);
      const rr = Math.hypot(f.x, f.z);
      if (rr > reach) { f.x *= reach / rr; f.z *= reach / rr; }
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

/** True once the water is calm and every flake lies on the ground. */
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
