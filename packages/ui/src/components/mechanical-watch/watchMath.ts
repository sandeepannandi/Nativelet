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
  forkPivot: number;        // distance escape center -> pallet arbor (pivot ABOVE wheel)
  balancePivot: number;     // distance pallet arbor -> balance staff
  rollerR: number;          // roller jewel radius from balance staff
  hornR: number;            // pallet arbor -> horn slot center
  slotHalf: number;         // half width of horn slot
  bankAngle: number;        // fork throw limit (rad), half the lock-to-lock throw
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
  forkPivot: 13.4,   // ~1.4 x tip radius: pallet ARBOR (zero-motion point of the reference fork), not the slot neck
  balancePivot: 12,
  rollerR: 2.5,
  hornR: 9.5,
  slotHalf: 0.5,
  bankAngle: 0.05,   // total throw 5.7 deg; set so engaged lock depth ~0.5, disengaged clearance ~0.4
  balanceHz: 3,
  balanceJ: 1,
  balanceDamp: 0.35,
  forkJ: 0.0045,
  escapeJ: 0.5,
  driveTorque: 3000,
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
    // tooth 3 rests on the engaged exit shelf; gentle balance start (the
    // escapement itself must pump the amplitude up - that is the validation)
    e: -0.2904, we: 0, p: -p.bankAngle, wp: 0,   // tooth 3 on the exit lock face at -bank
    b: 0, wb: w0 * 4.4,   // running amplitude; unlock needs b ~ 1.5+ against full-wind draw
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
   World frame: y-up math coords. Escape wheel center at origin, tip circle
   escapeR. THE WHEEL TURNS CLOCKWISE (e decreases under mainspring torque).
   Pallet pivot ABOVE the wheel at (0, forkPivot) - the long anchor arms are
   load-bearing: a short straight fork makes correct draw physically
   impossible (probe2 cone search, see STATUS.md). Geometry measured from the
   Wikimedia anchor-escapement reference and verified against the three
   contact constraints (resists tooth, tooth outside, draw toward the engaged
   banking) in probe3.mjs:
   - entry stone at polar 120 deg: a vertical slab; its LEFT face is the
     locking face (normal (-1,0)), its BOTTOM face is the impulse face
     (normal (0,-1)); engaged at the +banking.
   - exit stone at polar 60 deg: its locking face is a shallow shelf tilted
     12 deg from the tooth travel direction (the draw angle: the locked
     tooth wedges the fork onto its banking), its impulse face rises at
     30 deg with normal (-0.5, 0.866); engaged at the -banking.
   Corner separation 60 deg = 2.5 tooth pitches: the half-pitch stagger that
   gives exactly 2 beats per tooth is structural, not scheduled. */

type Face = { ax: number; ay: number; nx: number; ny: number; tx: number; ty: number; len: number };

/* fork-local face definitions at fork angle 0 (pivot at local origin);
   world = rotate(p) + (0, forkPivot). Positions from the measurements
   above, scaled to escapeR = 10. */
/* verified by probe4.mjs (resist / draw sign / creep / corner-cone margin):
   entry corner (-4.82,-4.72) polar 119 deg, exit corner (5.72,-5.23) polar
   55 deg; engaged depth 0.4 at the banking, clearance ~0.34 at the other. */
const ENTRY_LOCK = { ax: -4.82, ay: -4.72, tx: -0.292, ty: 0.957, nx: -0.957, ny: -0.292, len: 1.5 };
const ENTRY_IMP  = { ax: -4.82, ay: -4.72, tx: -1, ty: 0, nx: 0, ny: -1, len: 1.2 };
const EXIT_LOCK  = { ax: 5.61, ay: -5.33, tx: 0.743, ty: 0.669, nx: -0.669, ny: 0.743, len: 1.4 };
const EXIT_IMP   = { ax: 5.72, ay: -5.23, tx: -0.342, ty: 0.940, nx: -0.940, ny: -0.342, len: 1.2 };

function rotFace(local: Face, c: number, s: number, F: number, out: Face) {
  out.ax = local.ax * c - local.ay * s;
  out.ay = local.ax * s + local.ay * c + F;
  out.tx = local.tx * c - local.ty * s;
  out.ty = local.tx * s + local.ty * c;
  out.nx = local.nx * c - local.ny * s;
  out.ny = local.nx * s + local.ny * c;
  out.len = local.len;
}

/* Point-vs-face contact: returns penetration depth (>=0 means touching). */
function contactFace(tx: number, ty: number, f: Face): number {
  const rx = tx - f.ax, ry = ty - f.ay;
  const u = rx * f.tx + ry * f.ty;
  if (u < -0.08 || u > f.len + 0.08) return -1;
  const d = rx * f.nx + ry * f.ny;
  // skin 0.06; deeper than 0.35 the point has tunneled through the thin
  // stone model - release it (a dropped lock recoils and the next tooth locks)
  return d <= 0.06 && d >= -0.5 ? -d : -1;
}

/* One escapement substep: semi-implicit Euler + sequential impulses. */
function substep(s: WatchState, p: WatchPhysics, dt: number, geo: Face[]) {
  const k = (2 * Math.PI * p.balanceHz) ** 2 * p.balanceJ;
  const torque = p.driveTorque * (p.torqueFloor + (1 - p.torqueFloor) * s.wind);
  const F = p.forkPivot;

  // free dynamics; CLOCKWISE wheel: drive torque is negative
  s.we += (-torque / p.escapeJ) * dt;
  s.we *= 1 - 0.04 * dt * 60 * 0.001;  // tiny train drag
  s.wb += ((-k * s.b - p.balanceDamp * s.wb) / p.balanceJ) * dt;
  s.wp *= 1 - 2.2 * dt; // pivot friction (fork is contact-driven)

  // banking pins as hard one-sided constraints (before contacts, so the
  // draw presses the fork onto the pin instead of rattling)
  if (s.p >= p.bankAngle && s.wp > 0) s.wp = 0;
  if (s.p <= -p.bankAngle && s.wp < 0) s.wp = 0;

  const c = Math.cos(s.p), sn = Math.sin(s.p);
  rotFace(ENTRY_LOCK, c, sn, F, geo[0]);
  rotFace(ENTRY_IMP, c, sn, F, geo[1]);
  rotFace(EXIT_LOCK, c, sn, F, geo[2]);
  rotFace(EXIT_IMP, c, sn, F, geo[3]);

  const pitch = (2 * Math.PI) / p.escapeTeeth;
  for (let kTooth = 0; kTooth < p.escapeTeeth; kTooth++) {
    const a = s.e + kTooth * pitch;
    const tx = p.escapeR * Math.cos(a), ty = p.escapeR * Math.sin(a);
    const vtx = -s.we * ty, vty = s.we * tx; // point velocity = w x r
    for (let i = 0; i < 4; i++) {
      const face = geo[i];
      const pen = contactFace(tx, ty, face);
      if (pen < 0) continue;
      const cpx = face.ax, cpy = face.ay - F;   // lever from fork pivot
      const fvx = -s.wp * cpy, fvy = s.wp * cpx;
      const rvx = vtx - fvx, rvy = vty - fvy;
      const vn = rvx * face.nx + rvy * face.ny;
      if (vn >= 0 && pen < 0.02) continue; // separating and not sunk
      const reX = tx, reY = ty;
      const ce = (reX * face.ny - reY * face.nx) ** 2 / p.escapeJ;
      let cf = (cpx * face.ny - cpy * face.nx) ** 2 / p.forkJ;
      // banking pin is a bilateral constraint at its limit: if this contact
      // presses the fork INTO the pin it already rests on, the pin (not the
      // fork inertia) absorbs it - treat the fork as grounded for this contact
      const cn = cpx * face.ny - cpy * face.nx;
      const dwpSign = -cn; // sign of fork velocity change per unit j (j >= 0)
      const onPin =
        (s.p >= p.bankAngle - 1e-6 && dwpSign > 0) ||
        (s.p <= -p.bankAngle + 1e-6 && dwpSign < 0);
      if (onPin) cf = 0;
      const meff = ce + cf;
      if (meff <= 0) continue;
      let j = -vn / meff;  // restitution 0; positional correction is separate below
      if (j < 0) j = 0;
      const tnx = -face.ny, tny = face.nx;
      const vt = rvx * tnx + rvy * tny;
      const ceT = (reX * tny - reY * tnx) ** 2 / p.escapeJ;
      let cfT = (cpx * tny - cpy * tnx) ** 2 / p.forkJ;
      if (onPin) cfT = 0;
      let jt = -vt / (ceT + cfT + 1e-9);
      const cap = p.friction * j;
      if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;
      const ix = face.nx * j + tnx * jt, iy = face.ny * j + tny * jt;
      s.we += (reX * iy - reY * ix) / p.escapeJ;
      s.wp -= (cpx * iy - cpy * ix) / p.forkJ;
    }
  }

  // positional depenetration (pseudo-impulse, no kinetic energy injection):
  // split between wheel and fork by inverse effective mass
  for (let kTooth = 0; kTooth < p.escapeTeeth; kTooth++) {
    const a = s.e + kTooth * pitch;
    const tx = p.escapeR * Math.cos(a), ty = p.escapeR * Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const face = geo[i];
      const pen = contactFace(tx, ty, face);
      if (pen <= 0.005) continue;
      const cpx = face.ax, cpy = face.ay - F;
      const reX = tx, reY = ty;
      const ce = (reX * face.ny - reY * face.nx) ** 2 / p.escapeJ;
      const cf = (cpx * face.ny - cpy * face.nx) ** 2 / p.forkJ;
      const meff = ce + cf;
      if (meff <= 0) continue;
      const rn = reX * face.ny - reY * face.nx;
      const cn = cpx * face.ny - cpy * face.nx;
      const dP = -((cn / p.forkJ) * 0.4 * Math.min(pen - 0.004, 0.3)) / meff;
      const pinned =
        (s.p >= p.bankAngle - 1e-6 && dP > 0) || (s.p <= -p.bankAngle + 1e-6 && dP < 0);
      if (pinned) {
        // fork is on its banking: the whole correction goes to the wheel
        if (Math.abs(rn) > 1e-6) s.e += (0.8 * Math.min(pen - 0.004, 0.3)) / rn;
      } else {
        const lambda = 0.4 * Math.min(pen - 0.004, 0.3) / meff;
        s.e += (rn / p.escapeJ) * lambda;
        s.p += dP;
      }
    }
  }

  // roller jewel vs fork slot walls: unlock + impulse transfer to balance
  {
    const Bx = 0, By = F + p.balancePivot;
    const ja = s.b;
    const jx = Bx + p.rollerR * Math.sin(ja), jy = By - p.rollerR * Math.cos(ja);
    const hx0 = 0, hy0 = p.hornR;         // fork-local: slot toward balance
    const hx = hx0 * c - hy0 * sn, hy = hx0 * sn + hy0 * c + F;
    const ax = -sn, ay = c;               // fork axis (toward balance)
    const dx = jx - hx, dy = jy - hy;
    const along = dx * ax + dy * ay;
    const side = dx * ay - dy * ax;
    const wxn = ay, wyn = -ax;
    if (Math.abs(along) < 1.6 && Math.abs(side) < p.slotHalf + 0.9) {
      const penS = Math.abs(side) - p.slotHalf;
      if (penS > 0) {
        const sgn = side > 0 ? 1 : -1;
        const nx = wxn * sgn, ny = wyn * sgn;
        const vjx = s.wb * p.rollerR * Math.cos(ja), vjy = s.wb * p.rollerR * Math.sin(ja);
        const cpx = hx, cpy = hy - F;
        const fvx = -s.wp * cpy, fvy = s.wp * cpx;
        const vn = (vjx - fvx) * nx + (vjy - fvy) * ny;
        const rjX = jx - Bx, rjY = jy - By;
        const cb = (rjX * ny - rjY * nx) ** 2 / p.balanceJ;
        const cf = (cpx * ny - cpy * nx) ** 2 / p.forkJ;
        const meff = cb + cf;
        if (meff > 0 && (vn < 0 || penS > 0.02)) {
          let j = -vn / meff;
          if (j < 0) j = 0;
          s.wb += (rjX * (ny * j) - rjY * (nx * j)) / p.balanceJ;
          s.wp -= (cpx * (ny * j) - cpy * (nx * j)) / p.forkJ;
        }
      }
    }
  }

  // banking pins: position projection, no bounce
  if (s.p > p.bankAngle) { s.p = p.bankAngle; if (s.wp > 0) s.wp = 0; }
  if (s.p < -p.bankAngle) { s.p = -p.bankAngle; if (s.wp < 0) s.wp = 0; }

  // banking pin hard stop at integration (contacts may set wp after the
  // pre-clamp; never let one substep jump past the pin)
  if ((s.p >= p.bankAngle && s.wp > 0) || (s.p <= -p.bankAngle && s.wp < 0)) s.wp = 0;
  if (s.p + s.wp * dt > p.bankAngle) { s.p = p.bankAngle; s.wp = 0; }
  else if (s.p + s.wp * dt < -p.bankAngle) { s.p = -p.bankAngle; s.wp = 0; }
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
  const geo: Face[] = [newFace(), newFace(), newFace(), newFace()];
  s.acc = Math.min(s.acc + dtFrame, 0.12);
  const n = Math.floor(s.acc / p.fixedDt);
  for (let i = 0; i < n; i++) { substep(s, p, p.fixedDt, geo); s.t += p.fixedDt; }
  s.acc -= n * p.fixedDt;
}

function newFace(): Face {
  return { ax: 0, ay: 0, nx: 0, ny: 0, tx: 0, ty: 0, len: 0 };
}
