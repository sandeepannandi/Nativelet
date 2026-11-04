/* Newton's Cradle shared simulation. Pure TypeScript, no closures over
   component state, so Reanimated can run every function on the UI thread.
   Model: N identical rigid pendulums on taut strings (circular constraint),
   RK4 for free swing, sequential pairwise impulse resolution between
   neighbours for collisions. Equal masses swap the normal velocity component
   at restitution 1, so a left-to-right sweep propagates momentum through the
   line and produces the toy's n-in / n-out behaviour. Restitution is kept
   just under 1 and a light viscous drag bleeds energy so the cradle settles.
   This is an impulse solver over separated contacts, not a finite-element
   contact model - the same idealisation the real toy approximates. */

export type CradlePointer = { id: number; x: number; y: number; ball: number };

export type CradleConfig = {
  /* pivot x per ball (px), shared pivot y, string length and ball radius (px) */
  pivotX: Float32Array;
  pivotY: number;
  lengthPx: number;
  ballRadiusPx: number;
  pixelsPerMeter: number;
};

export type CradlePhysics = {
  balls: number;
  gravity: number;
  lengthM: number;
  damping: number;
  restitution: number;
  fixedDt: number;
  grabRate: number;
  velocitySmoothing: number;
  maxOmega: number;
  maxTheta: number;
  grabDeadband: number;
  restOmega: number;
  restTheta: number;
};

export const CRADLE_DEFAULTS: CradlePhysics = {
  balls: 5,
  gravity: 9.81,
  lengthM: 0.14,
  damping: 0.05,
  restitution: 0.99,
  fixedDt: 1 / 480,
  grabRate: 18,
  velocitySmoothing: 0.03,
  maxOmega: 16,
  maxTheta: 1.25,
  grabDeadband: 0.06,
  restOmega: 0.05,
  restTheta: 0.02,
};

export type CradleState = {
  th: Float32Array;
  om: Float32Array;
  grabbed: Float32Array;
  time: number;
  acc: number;
  resting: number;
  sweep: number;
  lastCollisionAt: number;
};

export function createCradle(opts: CradlePhysics): CradleState {
  "worklet";
  return {
    th: new Float32Array(opts.balls),
    om: new Float32Array(opts.balls),
    grabbed: new Float32Array(opts.balls),
    time: 0,
    acc: 0,
    resting: 1,
    sweep: 0,
    lastCollisionAt: -10,
  };
}

export function resetCradle(s: CradleState) {
  "worklet";
  s.th.fill(0);
  s.om.fill(0);
  s.grabbed.fill(0);
  s.time = 0;
  s.acc = 0;
  s.resting = 1;
  s.lastCollisionAt = -10;
}

export function ballCenter(s: CradleState, cfg: CradleConfig, i: number, out: number[]) {
  "worklet";
  out[0] = cfg.pivotX[i] + cfg.lengthPx * Math.sin(s.th[i]);
  out[1] = cfg.pivotY + cfg.lengthPx * Math.cos(s.th[i]);
}

export function pickBall(s: CradleState, cfg: CradleConfig, x: number, y: number, maxDistPx: number): number {
  "worklet";
  let best = -1;
  let bestD = maxDistPx;
  const c = [0, 0];
  for (let i = 0; i < s.th.length; i++) {
    ballCenter(s, cfg, i, c);
    const d = Math.hypot(x - c[0], y - c[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pendAccel(th: number, om: number, p: CradlePhysics): number {
  "worklet";
  return -(p.gravity / p.lengthM) * Math.sin(th) - p.damping * om;
}

function rk4(s: CradleState, i: number, dt: number, p: CradlePhysics) {
  "worklet";
  const th0 = s.th[i], om0 = s.om[i];
  const k1t = om0, k1o = pendAccel(th0, om0, p);
  const k2t = om0 + (dt / 2) * k1o, k2o = pendAccel(th0 + (dt / 2) * k1t, om0 + (dt / 2) * k1o, p);
  const k3t = om0 + (dt / 2) * k2o, k3o = pendAccel(th0 + (dt / 2) * k2t, om0 + (dt / 2) * k2o, p);
  const k4t = om0 + dt * k3o, k4o = pendAccel(th0 + dt * k3t, om0 + dt * k3o, p);
  s.th[i] = th0 + (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
  s.om[i] = om0 + (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
}

/* Resolve one touching pair. n points from i to j. Velocities are in m/s;
   the normal component is exchanged with restitution, tangential kept.
   A grabbed ball is treated as infinitely massive (the hand holds it). */
function resolvePair(s: CradleState, cfg: CradleConfig, p: CradlePhysics, i: number, j: number) {
  "worklet";
  const ci = [0, 0], cj = [0, 0];
  ballCenter(s, cfg, i, ci);
  ballCenter(s, cfg, j, cj);
  let nx = cj[0] - ci[0], ny = cj[1] - ci[1];
  let d = Math.hypot(nx, ny);
  const minD = 2 * cfg.ballRadiusPx * 0.999;
  if (d >= minD) return;
  if (d < 1e-6) {
    nx = 1;
    ny = 0;
    d = 1e-6;
  } else {
    nx /= d;
    ny /= d;
  }
  const L = p.lengthM;
  const uiX = Math.cos(s.th[i]), uiY = -Math.sin(s.th[i]);
  const ujX = Math.cos(s.th[j]), ujY = -Math.sin(s.th[j]);
  const vnI = L * s.om[i] * (uiX * nx + uiY * ny);
  const vnJ = L * s.om[j] * (ujX * nx + ujY * ny);
  const gi = s.grabbed[i] > 0.5;
  const gj = s.grabbed[j] > 0.5;
  const e = p.restitution;
  if (vnI - vnJ > 0 && !(gi && gj)) {
    let nI = vnI, nJ = vnJ;
    if (gi) nJ = (1 + e) * vnI - e * vnJ;
    else if (gj) nI = (1 + e) * vnJ - e * vnI;
    else {
      nI = ((1 - e) * vnI + (1 + e) * vnJ) / 2;
      nJ = ((1 + e) * vnI + (1 - e) * vnJ) / 2;
    }
    if (!gi) s.om[i] += ((nI - vnI) * (uiX * nx + uiY * ny)) / L;
    if (!gj) s.om[j] += ((nJ - vnJ) * (ujX * nx + ujY * ny)) / L;
    s.lastCollisionAt = s.time;
  }
  /* positional de-overlap: free balls share the correction, a grabbed ball stays */
  const overlap = 2 * cfg.ballRadiusPx - d;
  if (overlap > 0) {
    const shareI = gi ? 0 : gj ? 1 : 0.5;
    const shareJ = gj ? 0 : gi ? 1 : 0.5;
    const mv = (k: number, mx: number, my: number) => {
      const c = [0, 0];
      ballCenter(s, cfg, k, c);
      s.th[k] = Math.atan2(c[0] + mx - cfg.pivotX[k], c[1] + my - cfg.pivotY);
    };
    if (shareI > 0) mv(i, -nx * overlap * shareI, -ny * overlap * shareI);
    if (shareJ > 0) mv(j, nx * overlap * shareJ, ny * overlap * shareJ);
  }
}

/* Balls held this frame, mapped from active pointers. Pulling the k-th ball
   from an end scoops the whole outer group, matching how the toy is grabbed. */
function applyGrabs(s: CradleState, cfg: CradleConfig, p: CradlePhysics, dt: number, pointers: CradlePointer[]) {
  "worklet";
  const held = new Float32Array(s.th.length);
  for (let pi = 0; pi < pointers.length; pi++) {
    const ptr = pointers[pi];
    if (ptr.ball < 0 || ptr.ball >= s.th.length) continue;
    const b = ptr.ball;
    const target = Math.atan2(ptr.x - cfg.pivotX[b], ptr.y - cfg.pivotY);
    const clamped = Math.max(-p.maxTheta, Math.min(p.maxTheta, target));
    let lo = b, hi = b;
    if (clamped < -p.grabDeadband) {
      lo = 0;
      hi = b;
    } else if (clamped > p.grabDeadband) {
      lo = b;
      hi = s.th.length - 1;
    }
    const ease = 1 - Math.exp(-p.grabRate * dt);
    const blend = 1 - Math.exp(-dt / p.velocitySmoothing);
    for (let k = lo; k <= hi; k++) {
      held[k] = 1;
      const before = s.th[k];
      const next = before + (clamped - before) * ease;
      s.om[k] += ((next - before) / dt - s.om[k]) * blend;
      s.th[k] = next;
      s.grabbed[k] = 1;
    }
  }
  for (let k = 0; k < s.th.length; k++) {
    if (s.grabbed[k] > 0.5 && held[k] < 0.5) {
      s.grabbed[k] = 0;
      s.om[k] = Math.max(-p.maxOmega, Math.min(p.maxOmega, s.om[k]));
    }
  }
}

function settle(s: CradleState, p: CradlePhysics) {
  "worklet";
  let worstO = 0, worstT = 0;
  for (let i = 0; i < s.th.length; i++) {
    worstO = Math.max(worstO, Math.abs(s.om[i]));
    worstT = Math.max(worstT, Math.abs(s.th[i]));
  }
  if (worstO < p.restOmega && worstT < p.restTheta) {
    for (let i = 0; i < s.th.length; i++) {
      s.th[i] *= 0.92;
      s.om[i] *= 0.85;
    }
    if (worstO < 0.004 && worstT < 0.002) {
      s.th.fill(0);
      s.om.fill(0);
      s.resting = 1;
    }
  }
}

export function totalEnergy(s: CradleState, p: CradlePhysics): number {
  "worklet";
  let e = 0;
  for (let i = 0; i < s.th.length; i++) {
    e += 0.5 * p.lengthM * p.lengthM * s.om[i] * s.om[i] + p.gravity * p.lengthM * (1 - Math.cos(s.th[i]));
  }
  return e;
}

function substep(s: CradleState, cfg: CradleConfig, p: CradlePhysics, dt: number, pointers: CradlePointer[]) {
  "worklet";
  applyGrabs(s, cfg, p, dt, pointers);
  let anyGrab = false;
  for (let i = 0; i < s.th.length; i++) {
    if (s.grabbed[i] > 0.5) {
      anyGrab = true;
      continue;
    }
    rk4(s, i, dt, p);
  }
  /* sequential pairwise passes; sweep direction alternates per substep so the
     propagation order does not systematically favour one side */
  s.sweep = 1 - s.sweep;
  for (let pass = 0; pass < 3; pass++) {
    if (s.sweep === 0) {
      for (let i = 0; i < s.th.length - 1; i++) resolvePair(s, cfg, p, i, i + 1);
    } else {
      for (let i = s.th.length - 2; i >= 0; i--) resolvePair(s, cfg, p, i, i + 1);
    }
  }
  if (!anyGrab) settle(s, p);
  else s.resting = 0;
  if (!s.resting) s.time += dt;
}

export function stepCradleFixed(
  s: CradleState,
  cfg: CradleConfig,
  dtFrame: number,
  pointers: CradlePointer[],
  opts: CradlePhysics,
) {
  "worklet";
  s.acc += Math.min(dtFrame, 0.05);
  const dt = opts.fixedDt;
  while (s.acc >= dt) {
    substep(s, cfg, opts, dt, pointers);
    s.acc -= dt;
  }
}

/* Convenience for demos and keyboard control: pull a group out over `ms`
   worth of steps then let go. count=1 lifts one ball from the given side. */
export function releaseImpulse(s: CradleState, side: "left" | "right", count: number, angle: number) {
  "worklet";
  const n = s.th.length;
  const a = Math.max(-CRADLE_DEFAULTS.maxTheta, Math.min(CRADLE_DEFAULTS.maxTheta, Math.abs(angle)));
  for (let k = 0; k < count && k < n; k++) {
    const i = side === "left" ? k : n - 1 - k;
    s.th[i] = side === "left" ? -a : a;
    s.om[i] = 0;
    s.grabbed[i] = 0;
  }
  s.resting = 0;
}
