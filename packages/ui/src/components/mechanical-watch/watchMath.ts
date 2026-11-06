/* Mechanical watch shared simulation. Pure TypeScript, no closures over
   component state, so Reanimated can run every function on the UI thread.
   Model: a hand-wound Swiss-lever movement.
   - Gear train ratios are exact by construction: they come from tooth
     counts (barrel 72 -> center pinion 12, center 80 -> third pinion 10,
     third 75 -> fourth pinion 10, fourth 70 -> escape pinion 7), so the
     escape wheel turns once per 6 s at 6 beats/s (21,600 vph, 3 Hz
     balance), the fourth wheel carries the seconds hand at 1 rev/min, the
     center wheel the minute hand at 1 rev/hour, hour hand via 12:1 motion
     works. No hand or wheel has its own animator; every angle derives from
     the escape wheel through the tooth counts.
   - Escapement is an active-set impulse contact model on three rigid
     bodies: escape wheel (club-tooth tips as contact points), pallet fork
     (entry/exit stones with locking + impulse faces), balance wheel
     (hairspring oscillator with roller jewel engaging the fork horns).
     Locking, draw, unlocking, impulse, drop and recoil all emerge from
     contact geometry and mainspring torque - no code schedules a beat.
   - Simplifications, named: tooth/pallet contact is tooth-tip point vs
     pallet face segments (the real sliding pair is club plane vs stone
     plane); the guard-pin safety action is omitted; restarting from a
     full stop is seeded with a small impulse standing in for the handling
     jolt (real self-start geometry is not modeled); power reserve is
     accelerated so winding stays part of the interaction.
   This is a contact solver over point-face pairs, not a scripted
   state machine - the same idealisation class as the desk toys, applied
   to horology. */

export type WatchPhysics = {
  escapeTeeth: number;      // 15 club teeth
  escapeR: number;          // tip circle radius
  forkPivot: number;        // distance escape center -> pallet arbor
  balancePivot: number;     // distance pallet arbor -> balance staff
  rollerR: number;          // roller jewel radius from balance staff
  hornR: number;            // pallet arbor -> horn slot center
  slotHalf: number;         // half width of horn slot
  bankAngle: number;        // fork throw limit (rad)
  drawDeg: number;          // locking-face draw angle
  impulseDeg: number;       // impulse-face angle from radial
  stoneIn: number;          // how far a banking stone dips inside tip circle
  balanceHz: number;        // 3 Hz -> 21,600 vph
  balanceJ: number;
  balanceDamp: number;
  forkJ: number;
  escapeJ: number;          // includes reflected train inertia
  driveTorque: number;      // escape-wheel torque at full wind
  torqueFloor: number;      // fraction of torque at zero wind
  friction: number;         // Coulomb cap on tangential contact impulse
  reserveSeconds: number;   // accelerated power reserve (documented)
  windPerTurn: number;
  fixedDt: number;          // escapement substep
  seedKick: number;         // restart-from-stop seed (documented)
};

export const WATCH_DEFAULTS: WatchPhysics = {
  escapeTeeth: 15,
  escapeR: 10,
  forkPivot: 13.4,
  balancePivot: 12.2,
  rollerR: 2.0,
  hornR: 9.9,
  slotHalf: 0.62,
  bankAngle: 0.11,
  drawDeg: 12,
  impulseDeg: 25,
  stoneIn: 0.55,
  balanceHz: 3,
  balanceJ: 1,
  balanceDamp: 0.55,
  forkJ: 0.0045,
  escapeJ: 0.012,
  driveTorque: 0.028,
  torqueFloor: 0.28,
  friction: 0.12,
  reserveSeconds: 150,
  windPerTurn: 0.22,
  fixedDt: 1 / 960,
  seedKick: 0.6,
};

/* Exact train: tooth counts. Angles derive from the escape wheel angle. */
export const TRAIN = {
  barrelTeeth: 72, centerPinion: 12,   // barrel -> center 6:1
  centerTeeth: 80, thirdPinion: 10,    // center -> third 8:1
  thirdTeeth: 75, fourthPinion: 10,    // third -> fourth 7.5:1
  fourthTeeth: 72, escapePinion: 6,    // fourth -> escape 12:1 (2 beats per tooth: 30 beats/rev, 5 s/rev at 6 beats/s)
  motionWorks: 12,                     // hour hand = minute / 12
};
const R_E4 = TRAIN.fourthTeeth / TRAIN.escapePinion;   // 10
const R_43 = TRAIN.thirdTeeth / TRAIN.fourthPinion;    // 7.5
const R_3C = TRAIN.centerTeeth / TRAIN.thirdPinion;    // 8
const R_CB = TRAIN.barrelTeeth / TRAIN.centerPinion;   // 6

export type WatchState = {
  e: number; we: number;       // escape wheel angle, angular velocity
  p: number; wp: number;       // pallet fork
  b: number; wb: number;       // balance
  wind: number;                // mainspring wind 0..1
  crown: number;               // crown rotation (renderer + ratchet)
  beats: number;               // beat counter (haptics/tests)
  lastForkSign: number;
  amp: number;                 // recent amplitude estimate (rad)
  t: number;
  acc: number;                 // substep accumulator
  seeded: boolean;             // restart seed consumed
  stopped: boolean;
};

export function createWatch(p: WatchPhysics): WatchState {
  const w0 = 2 * Math.PI * p.balanceHz;
  return {
    e: 0, we: 0, p: -p.bankAngle, wp: 0,
    b: 0, wb: w0 * 4.4,          // starts running, near full amplitude
    wind: 1, crown: 0, beats: 0, lastForkSign: -1,
    amp: 4.4, t: 0, acc: 0, seeded: true, stopped: false,
  };
}

/* ------- gear train: exact derived angles (meshing phase offsets are
   visual alignment constants, they do not affect ratios) ------- */
export function trainAngles(e: number) {
  const fourth = -e / R_E4;
  const third = -fourth / R_43;
  const center = -third / R_3C;
  const barrel = -center / R_CB;
  return {
    escape: e, fourth, third, center, barrel,
    minute: center, second: fourth, hour: center / TRAIN.motionWorks,
  };
}

export function windCrown(s: WatchState, p: WatchPhysics, turns: number) {
  s.crown += turns * 2 * Math.PI;
  if (turns > 0) s.wind = Math.min(1, s.wind + turns * p.windPerTurn);
  if (s.stopped && s.wind > 0.04 && !s.seeded) {
    /* documented seed: the handling jolt that starts a real movement */
    s.wb = (s.b >= 0 ? 1 : -1) * p.seedKick * 2 * Math.PI * p.balanceHz;
    s.seeded = true; s.stopped = false;
  }
}

/* ------- escapement geometry -------
   World frame: escape wheel center at origin, tip circle escapeR.
   Fork pivot at (forkPivot, 0); balance at (forkPivot, balancePivot).
   Stones are defined at fork angle 0; rotating the fork moves exit stone
   INTO the wheel on positive throw, entry stone on negative throw. */

type Face = { ax: number; ay: number; nx: number; ny: number; tx: number; ty: number; len: number };
type StoneGeo = { cornerX: number; cornerY: number; lock: Face; impulse: Face };

const ENTRY_POLAR = (-30 * Math.PI) / 180;  // entry locking corner, wheel-centered
const EXIT_POLAR = (30 * Math.PI) / 180;    // exit locking corner (half-pitch stagger is built by the throw)

function rot(x: number, y: number, c: number, s: number): [number, number] {
  return [x * c - y * s, x * s + y * c];
}

/* Build both stones' faces for the current fork angle.
   Derived from first principles at each locking corner (wheel-centered
   polar position pol, outward radial R, tooth-travel tangent T):
   - locking face: from the corner heading outward; its normal is
     -T tilted by the draw angle toward +R, so wheel torque drags the
     stone deeper into the wheel (draw: the fork is held on its banking
     by the locked tooth, emergent, not scripted).
   - impulse face: from the corner heading forward+inward, tilted
     impulseDeg off the tangent circle; its normal resists tooth travel
     while its lever arm about the fork pivot drives the fork through
     its throw. The tooth slides down it, dropping toward the wheel
     center, and exits at the far end (drop).
   Corner separation is 2.5 tooth pitches (+-30 deg), the half-pitch
   stagger that makes entry and exit stones arrest alternate teeth:
   per beat the wheel advances exactly half a pitch (12 deg). */
function stones(p: WatchPhysics, fork: number, out: StoneGeo[]) {
  const c = Math.cos(fork), s = Math.sin(fork);
  const F = p.forkPivot;
  const R = p.escapeR - p.stoneIn;
  const draw = (p.drawDeg * Math.PI) / 180;
  const imp = (p.impulseDeg * Math.PI) / 180;
  for (let i = 0; i < 2; i++) {
    const pol = i === 0 ? ENTRY_POLAR : EXIT_POLAR;
    const cx0 = R * Math.cos(pol), cy0 = R * Math.sin(pol);
    const rx = cx0 - F, ry = cy0;
    const wx = rx * c - ry * s + F, wy = rx * s + ry * c;
    const g = out[i];
    g.cornerX = wx; g.cornerY = wy;
    const radx = Math.cos(pol), rady = Math.sin(pol);
    const tanx = -Math.sin(pol), tany = Math.cos(pol);
    // locking normal = rot(-T, +draw)
    const cd = Math.cos(draw), sd = Math.sin(draw);
    const lnx = (-tanx) * cd - (-tany) * sd;
    const lny = (-tanx) * sd + (-tany) * cd;
    g.lock.nx = lnx; g.lock.ny = lny;
    // locking face dir = rot(n_lock, -90deg), flipped outward
    let ltx = lny, lty = -lnx;
    if (ltx * radx + lty * rady < 0) { ltx = -ltx; lty = -lty; }
    g.lock.ax = wx; g.lock.ay = wy; g.lock.tx = ltx; g.lock.ty = lty; g.lock.len = 0.95;
    // impulse face dir = rot(T, +imp toward wheel center), normal = rot(dir, +90)
    const ci = Math.cos(imp), si = Math.sin(imp);
    const idx = tanx * ci - tany * si, idy = tanx * si + tany * ci;
    const inx = -idy, iny = idx;
    g.impulse.nx = inx; g.impulse.ny = iny;
    g.impulse.ax = wx; g.impulse.ay = wy; g.impulse.tx = idx; g.impulse.ty = idy; g.impulse.len = 2.3;
  }
}

/* Point-vs-face contact: returns penetration depth (>=0 means touching)
   and writes the world-space contact normal into out. */
function contactFace(tx: number, ty: number, f: Face): number {
  const rx = tx - f.ax, ry = ty - f.ay;
  const u = rx * f.tx + ry * f.ty;
  if (u < -0.08 || u > f.len + 0.08) return -1;
  const d = rx * f.nx + ry * f.ny;
  return d <= 0.06 ? -d : -1;          // small skin; negative d = penetration
}

/* One escapement substep: semi-implicit Euler + sequential impulses. */
function substep(s: WatchState, p: WatchPhysics, dt: number, geo: StoneGeo[]) {
  const k = (2 * Math.PI * p.balanceHz) ** 2 * p.balanceJ;
  const torque = p.driveTorque * (p.torqueFloor + (1 - p.torqueFloor) * s.wind);

  // free dynamics
  s.we += (torque / p.escapeJ) * dt;
  s.we *= 1 - 0.04 * dt * 60 * 0.001;  // tiny train drag
  s.wb += ((-k * s.b - p.balanceDamp * s.wb) / p.balanceJ) * dt;
  s.wp *= 1 - 2.2 * dt; // pivot friction (fork is contact-driven)

  // banking pins as hard one-sided constraints (before contacts, so the
  // draw presses the fork onto the pin instead of rattling the stone
  // into the locked tooth)
  if (s.p >= p.bankAngle && s.wp > 0) s.wp = 0;
  if (s.p <= -p.bankAngle && s.wp < 0) s.wp = 0;

  stones(p, s.p, geo);

  const pitch = (2 * Math.PI) / p.escapeTeeth;
  // escape wheel contacts: each tooth tip vs each stone face
  for (let kTooth = 0; kTooth < p.escapeTeeth; kTooth++) {
    const a = s.e + kTooth * pitch;
    const tx = p.escapeR * Math.cos(a), ty = p.escapeR * Math.sin(a);
    const vtx = -s.we * ty, vty = s.we * tx; // point velocity = w x r
    for (let i = 0; i < 2; i++) {
      const g = geo[i];
      for (let f = 0; f < 2; f++) {
        const face = f === 0 ? g.lock : g.impulse;
        const pen = contactFace(tx, ty, face);
        if (pen < 0) continue;
        // contact point approx = tooth tip; face point velocity from fork
        const cpx = face.ax - p.forkPivot, cpy = face.ay;
        const fvx = -s.wp * cpy, fvy = s.wp * cpx;
        const rvx = vtx - fvx, rvy = vty - fvy;
        const vn = rvx * face.nx + rvy * face.ny;
        if (vn >= 0 && pen < 0.02) continue; // separating and not sunk
        // effective masses along the normal
        const reX = tx, reY = ty;
        const ce = (reX * face.ny - reY * face.nx) ** 2 / p.escapeJ;
        const cf = (cpx * face.ny - cpy * face.nx) ** 2 / p.forkJ;
        const meff = ce + cf;
        if (meff <= 0) continue;
        const rest = 0.0;
        let j = (-(1 + rest) * vn + Math.min(pen, 0.04) * 0.25 / dt) / meff;
        if (j < 0) j = 0;
        // Coulomb friction on the tangential slide
        const tnx = -face.ny, tny = face.nx;
        const vt = rvx * tnx + rvy * tny;
        const ceT = (reX * tny - reY * tnx) ** 2 / p.escapeJ;
        const cfT = (cpx * tny - cpy * tnx) ** 2 / p.forkJ;
        let jt = -vt / (ceT + cfT + 1e-9);
        const cap = p.friction * j;
        if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;
        const ix = face.nx * j + tnx * jt, iy = face.ny * j + tny * jt;
        s.we += ((reX * iy - reY * ix) / p.escapeJ) * 1;
        s.wp -= ((cpx * iy - cpy * ix) / p.forkJ) * 1;
      }
    }
  }

  // roller jewel vs fork horns: unlock + impulse transfer to balance
  {
    const Bx = p.forkPivot, By = p.balancePivot;
    const ja = s.b;                       // jewel angle on roller
    const jx = Bx + p.rollerR * Math.sin(ja), jy = By - p.rollerR * Math.cos(ja);
    // horn slot: line along fork axis at hornR, two side walls at +/- slotHalf
    const c = Math.cos(s.p), sn = Math.sin(s.p);
    // slot center in world:
    const hx0 = 0, hy0 = p.hornR;         // fork-local: slot toward balance
    const hx = hx0 * c - hy0 * sn + p.forkPivot, hy = hx0 * sn + hy0 * c;
    // slot walls perpendicular to fork axis
    const ax = -sn, ay = c;               // fork axis (toward balance)
    const dx = jx - hx, dy = jy - hy;
    const along = dx * ax + dy * ay;      // along fork axis
    const side = dx * ay - dy * ax;       // signed distance to slot centerline
    const wxn = ay, wyn = -ax;            // wall normal
    if (Math.abs(along) < 1.6 && Math.abs(side) < p.slotHalf + 0.9) {
      const penS = Math.abs(side) - p.slotHalf;
      if (penS > 0) {
        const sgn = side > 0 ? 1 : -1;
        const nx = wxn * sgn, ny = wyn * sgn;
        const vjx = s.wb * p.rollerR * Math.cos(ja), vjy = s.wb * p.rollerR * Math.sin(ja);
        const cpx = hx - p.forkPivot, cpy = hy;
        const fvx = -s.wp * cpy, fvy = s.wp * cpx;
        const vn = (vjx - fvx) * nx + (vjy - fvy) * ny;
        const rjX = jx - Bx, rjY = jy - By;
        const cb = (rjX * ny - rjY * nx) ** 2 / p.balanceJ;
        const cf = (cpx * ny - cpy * nx) ** 2 / p.forkJ;
        const meff = cb + cf;
        if (meff > 0 && (vn < 0 || penS > 0.02)) {
          let j = (-vn + Math.min(penS, 0.05) * 0.25 / dt) / meff;
          if (j < 0) j = 0;
          s.wb += ((rjX * (ny * j) - rjY * (nx * j)) / p.balanceJ);
          s.wp -= ((cpx * (ny * j) - cpy * (nx * j)) / p.forkJ);
        }
      }
    }
  }

  // banking pins: position projection, no bounce
  if (s.p > p.bankAngle) { s.p = p.bankAngle; if (s.wp > 0) s.wp = 0; }
  if (s.p < -p.bankAngle) { s.p = -p.bankAngle; if (s.wp < 0) s.wp = 0; }

  // integrate (clamps keep a missed contact from running away)
  if (s.we > 40) s.we = 40; else if (s.we < -40) s.we = -40;
  if (s.wp > 120) s.wp = 120; else if (s.wp < -120) s.wp = -120;
  s.e += s.we * dt;
  s.p += s.wp * dt;
  s.b += s.wb * dt;

  // beat counting: fork crossing center
  const sg = s.p > 0 ? 1 : s.p < 0 ? -1 : s.lastForkSign;
  if (sg !== s.lastForkSign) { s.beats++; s.lastForkSign = sg; }

  // amplitude estimate (slow tracker)
  const ab = Math.abs(s.b);
  if (ab > s.amp) s.amp = ab; else s.amp += (ab - s.amp) * dt * 0.5;

  // power reserve
  s.wind = Math.max(0, s.wind - dt / p.reserveSeconds);
  if (s.amp < 0.25 && Math.abs(s.wb) < 0.8 && s.wind <= 0.04) {
    s.stopped = true; s.seeded = false;
  }
}

export function stepWatch(s: WatchState, p: WatchPhysics, dtFrame: number) {
  const geo: StoneGeo[] = [newStone(), newStone()];
  s.acc = Math.min(s.acc + dtFrame, 0.12);
  const n = Math.floor(s.acc / p.fixedDt);
  for (let i = 0; i < n; i++) { substep(s, p, p.fixedDt, geo); s.t += p.fixedDt; }
  s.acc -= n * p.fixedDt;
}

function newStone(): StoneGeo {
  const f = (): Face => ({ ax: 0, ay: 0, nx: 0, ny: 0, tx: 0, ty: 0, len: 0 });
  return { cornerX: 0, cornerY: 0, lock: f(), impulse: f() };
}
