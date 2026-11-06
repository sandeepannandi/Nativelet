/* Hybrid event-driven escapement (prototype A).
   Modes: LOCK_ENTRY/LOCK_EXIT (draw-pinned rest), SLIDE (1-DOF constrained
   contact on a lock or impulse face, analytic manifold), DROP (free flight
   with event-exact banking/catch detection + bisection).
   NO position projection, NO speculation: positions advance only by
   integrating velocities; contact transitions happen at event times.
   Beats are lock-ARREST events. Geometry identical to the verified baseline
   (probe3/4). See /tmp/hybrid/DESIGN.md. */

export type WatchPhysics = {
  escapeTeeth: number; escapeR: number; forkPivot: number; balancePivot: number;
  rollerR: number; hornR: number; slotHalf: number; bankAngle: number;
  balanceHz: number; balanceJ: number; balanceDamp: number; forkJ: number;
  escapeJ: number; driveTorque: number; torqueFloor: number; friction: number;
  eImpLen?: number; xImpLen?: number;
  reserveSeconds: number; windPerTurn: number; fixedDt: number; seedKick: number;
};

export const WATCH_DEFAULTS: WatchPhysics = {
  escapeTeeth: 15, escapeR: 10,
  forkPivot: 13.4, balancePivot: 12, rollerR: 2.5, hornR: 9.5, slotHalf: 0.5,
  bankAngle: 0.06,
  balanceHz: 3, balanceJ: 1, balanceDamp: 0.35, forkJ: 0.02, escapeJ: 0.5,
  driveTorque: 3000, torqueFloor: 0.28, friction: 0.12,
  reserveSeconds: 150, windPerTurn: 0.22, fixedDt: 1 / 960, seedKick: 0.6,
};

export const TRAIN = {
  barrelTeeth: 72, centerPinion: 12, centerTeeth: 80, thirdPinion: 10,
  thirdTeeth: 75, fourthPinion: 10, fourthTeeth: 72, escapePinion: 6,
  motionWorks: 12,
};
const R_E4 = TRAIN.fourthTeeth / TRAIN.escapePinion;
const R_43 = TRAIN.thirdTeeth / TRAIN.fourthPinion;
const R_3C = TRAIN.centerTeeth / TRAIN.thirdPinion;
const R_CB = TRAIN.barrelTeeth / TRAIN.centerPinion;

export type WatchState = {
  e: number; we: number; p: number; wp: number; b: number; wb: number;
  wind: number; crown: number; beats: number; lockHeld: boolean; amp: number;
  t: number; acc: number; seeded: boolean; stopped: boolean;
  mode: string;      // 'LE' | 'LX' | 'SE' | 'SX' | 'DROP' ('_f' marks imp-face half of a slide)
  kT: number;        // tooth index engaged in LOCK/SLIDE
  u: number;         // face parameter (SLIDE)
  du: number;        // d(face param)/dt (SLIDE)
  _f?: string;       // 'imp' during the impulse-face half of a slide
  _slv?: boolean;    // slave constraint was active last slide substep
};

export const EDBG: any = {
  workTorque: 0, dampLoss: 0, impactLoss: 0, events: 0, overcap: 0,
  arrestsE: 0, arrestsX: 0, jewelP: 0,
};

type Face = { ax: number; ay: number; nx: number; ny: number; tx: number; ty: number; len: number };
// Pallet stone faces (fork-local). Anchors are parameterized so stone DEPTH
// (radial shift toward the wheel center = (0,-forkPivot) in fork frame) can be
// swept: deeper stones catch the next tooth sooner -> less drop.
const ENTRY_BASE = { lock: { ax: -4.738, ay: -4.674 }, imp: { ax: -4.738, ay: -4.674 } };
const EXIT_BASE  = { lock: { ax: 5.514, ay: -5.316 }, imp: { ax: 5.625, ay: -5.216 } };
let ENTRY_LOCK: Face = { ax: -4.738, ay: -4.674, tx: -0.292, ty: 0.957, nx: -0.957, ny: -0.292, len: 1.1 };
let ENTRY_IMP: Face  = { ax: -4.738, ay: -4.674, tx: 1, ty: 0, nx: 0, ny: -1, len: 1.5 };  // extended: less drop (was 0.9)
let EXIT_LOCK: Face  = { ax: 5.514, ay: -5.316, tx: 0.743, ty: 0.669, nx: -0.669, ny: 0.743, len: 1.4 };
let EXIT_IMP: Face   = { ax: 5.625, ay: -5.216, tx: 0.342, ty: -0.940, nx: -0.940, ny: -0.342, len: 1.8 };  // extended: less drop (was 1.2)
export function setStoneDepth(dE: number, dX: number, FP = 13.4, lenIE?: number, lenIX?: number) {
  const shift = (base: { ax: number; ay: number }, d: number) => {
    const rx = base.ax, ry = base.ay + FP;
    const rm = Math.hypot(rx, ry);
    return { ax: base.ax - d * rx / rm, ay: base.ay - d * ry / rm };
  };
  const el = shift(ENTRY_BASE.lock, dE), ei = shift(ENTRY_BASE.imp, dE);
  const xl = shift(EXIT_BASE.lock, dX), xi = shift(EXIT_BASE.imp, dX);
  ENTRY_LOCK = { ...ENTRY_LOCK, ...el }; ENTRY_IMP = { ...ENTRY_IMP, ...ei };
  EXIT_LOCK = { ...EXIT_LOCK, ...xl }; EXIT_IMP = { ...EXIT_IMP, ...xi };
  if (lenIE !== undefined) ENTRY_IMP = { ...ENTRY_IMP, len: lenIE };
  if (lenIX !== undefined) EXIT_IMP = { ...EXIT_IMP, len: lenIX };
}

function facePointWorld(f: Face, u: number, pp: number, F: number): [number, number] {
  const vx = f.ax + u * f.tx, vy = f.ay + u * f.ty;
  const c = Math.cos(pp), s = Math.sin(pp);
  return [vx * c - vy * s, vx * s + vy * c + F];
}
function solveP(f: Face, u: number, pGuess: number, F: number, R: number): number | null {
  const vx = f.ax + u * f.tx, vy = f.ay + u * f.ty;
  const v2 = vx * vx + vy * vy, vm = Math.sqrt(v2);
  const rhs = (R * R - v2 - F * F) / (2 * F * vm);
  if (Math.abs(rhs) > 1) return null;
  const phi = Math.atan2(vy, vx), a = Math.asin(rhs);
  const wrap = (q: number) => pGuess + Math.atan2(Math.sin(q - pGuess), Math.cos(q - pGuess));
  const c1 = wrap(a - phi), c2 = wrap(Math.PI - a - phi);
  return Math.abs(c1 - pGuess) <= Math.abs(c2 - pGuess) ? c1 : c2;
}
function solveE(f: Face, u: number, pp: number, kTooth: number, teeth: number, F: number): number {
  const [X, Y] = facePointWorld(f, u, pp, F);
  return Math.atan2(Y, X) - kTooth * (2 * Math.PI / teeth);
}
function slideDerivs(f: Face, u: number, pp: number, kTooth: number, P: WatchPhysics) {
  const h = 1e-4;
  const pA = solveP(f, u - h, pp, P.forkPivot, P.escapeR)!;
  const pB = solveP(f, u + h, pp, P.forkPivot, P.escapeR)!;
  const p0 = solveP(f, u, pp, P.forkPivot, P.escapeR)!;
  const dpdu = (pB - pA) / (2 * h);
  const eA = solveE(f, u - h, pA, kTooth, P.escapeTeeth, P.forkPivot);
  const eB = solveE(f, u + h, pB, kTooth, P.escapeTeeth, P.forkPivot);
  return { p0, dpdu, dedu: (eB - eA) / (2 * h) };
}

function jewelSlaveB(pp: number, sigma: number, bGuess: number, P: WatchPhysics): number | null {
  const g = (sigma * P.slotHalf - P.balancePivot * Math.sin(pp)) / P.rollerR;
  if (Math.abs(g) > 1) return null;
  const a = Math.asin(g);
  const wrap = (q: number) => bGuess + Math.atan2(Math.sin(q - bGuess), Math.cos(q - bGuess));
  const c1 = wrap(pp + a), c2 = wrap(pp + Math.PI - a);
  return Math.abs(c1 - bGuess) <= Math.abs(c2 - bGuess) ? c1 : c2;
}
function jewelDbDp(pp: number, sigma: number, P: WatchPhysics): number {
  const g = (sigma * P.slotHalf - P.balancePivot * Math.sin(pp)) / P.rollerR;
  const gp = -P.balancePivot * Math.cos(pp) / P.rollerR;
  return 1 + gp / Math.sqrt(Math.max(1 - g * g, 1e-9));
}
function jewelPos(b: number, P: WatchPhysics): [number, number] {
  return [P.rollerR * Math.sin(b), P.forkPivot + P.balancePivot - P.rollerR * Math.cos(b)];
}
function jewelInMouth(b: number, pp: number, P: WatchPhysics): boolean {
  const [jx, jy] = jewelPos(b, P);
  const hx = -P.hornR * Math.sin(pp), hy = P.hornR * Math.cos(pp) + P.forkPivot;
  const along = (jx - hx) * -Math.sin(pp) + (jy - hy) * Math.cos(pp);
  return Math.abs(along) < 1.6;
}

function keNow(s: WatchState, P: WatchPhysics): number {
  const k = 2 * Math.PI * P.balanceHz;
  return 0.5 * P.escapeJ * s.we * s.we + 0.5 * P.forkJ * s.wp * s.wp +
    0.5 * P.balanceJ * s.wb * s.wb + 0.5 * k * s.b * s.b;
}
const impTag: Record<string, number> = {};
function plasticLoss(s: WatchState, P: WatchPhysics, apply: () => void, tag = 'other') {
  const ke0 = keNow(s, P);
  apply();
  const ke1 = keNow(s, P);
  if (ke0 > ke1) { EDBG.impactLoss += ke0 - ke1; impTag[tag] = (impTag[tag] || 0) + ke0 - ke1; }
}
export const IMP_TAGS = impTag;
function driveTau(s: WatchState, P: WatchPhysics): number {
  return -P.driveTorque * (P.torqueFloor + (1 - P.torqueFloor) * s.wind);
}
const lockFaceOf = (mode: string) => mode.endsWith('E') ? ENTRY_LOCK : EXIT_LOCK;
const impFaceOf = (mode: string) => mode.endsWith('E') ? ENTRY_IMP : EXIT_IMP;

export function createWatch(P: WatchPhysics): WatchState {
  const w0 = 2 * Math.PI * P.balanceHz;
  const s: WatchState = {
    e: -0.2796, we: 0, p: -P.bankAngle, wp: 0,
    b: 0, wb: w0 * 4.4,
    wind: 1, crown: 0, beats: 0, lockHeld: true, amp: 4.4,
    t: 0, acc: 0, seeded: true, stopped: false,
    mode: 'LX', kT: 3, u: 0.695, du: 0,
  };
  let best = 0.7, bd = 1e9;
  for (let u = 0; u <= EXIT_LOCK.len; u += 0.0005) {
    const [X, Y] = facePointWorld(EXIT_LOCK, u, -P.bankAngle, P.forkPivot);
    const d = Math.abs(Math.hypot(X, Y) - P.escapeR);
    if (d < bd) { bd = d; best = u; }
  }
  s.u = best;
  s.e = solveE(EXIT_LOCK, best, -P.bankAngle, 3, P.escapeTeeth, P.forkPivot);
  return s;
}

export function trainAngles(e: number) {
  const fourth = -e / R_E4, third = -fourth / R_43, center = -third / R_3C, barrel = -center / R_CB;
  return { escape: e, fourth, third, center, barrel, minute: center, second: fourth, hour: center / TRAIN.motionWorks };
}

export function windCrown(s: WatchState, p: WatchPhysics, turns: number) {
  s.crown += turns * 2 * Math.PI;
  if (turns > 0) s.wind = Math.min(1, s.wind + turns * p.windPerTurn);
  if (s.stopped && s.wind > 0.04 && !s.seeded) {
    s.wb = (s.b >= 0 ? 1 : -1) * p.seedKick * 2 * Math.PI * p.balanceHz;
    s.seeded = true; s.stopped = false;
  }
}

function substepLock(s: WatchState, P: WatchPhysics, dt: number) {
  s._slv = false;
  const k = (2 * Math.PI * P.balanceHz) ** 2 * P.balanceJ;
  const sigma = s.mode === 'LE' ? 1 : -1;
  const bs = jewelSlaveB(s.p, sigma, s.b, P);
  const inMouth = jewelInMouth(s.b, s.p, P);
  if (inMouth && bs !== null) {
    const reached = sigma > 0 ? s.b >= bs : s.b <= bs;
    const approaching = sigma > 0 ? s.wb > 0 : s.wb < 0;
    if (reached && approaching) {
      // jewel-wall capture: plastic coupling between the balance and the
      // locked-train slide manifold through the wall contact normal.
      const dbdp = jewelDbDp(s.p, sigma, P);
      const jn = P.rollerR * (Math.cos(s.b) * Math.cos(s.p) + Math.sin(s.b) * Math.sin(s.p));
      const { dpdu, dedu } = slideDerivs(lockFaceOf(s.mode), s.u, s.p, s.kT, P);
      const dbdu = dbdp * dpdu;
      // manifold side of the collision = wheel+fork ONLY (the balance is the
      // other collision partner; including it here would double-count it)
      const Jeff = P.escapeJ * dedu * dedu + P.forkJ * dpdu * dpdu;
      const lever = jn * dbdu;                     // wall-point normal velocity per du
      const mB = P.balanceJ / Math.max(jn * jn, 1e-9);
      const mF = Jeff / Math.max(lever * lever, 1e-9);
      const vj = jn * s.wb;                        // jewel normal velocity
      const v1 = (mB * vj) / (mB + mF);            // plastic common velocity
      const du1 = v1 / lever;
      // unlock direction is u DEEPER->corner: for both locks, du<0 unlocks.
      // Threshold: draw + pin friction absorb perturbations too weak to
      // actually unlock (prevents zero-energy lock/unlock chatter).
      if (du1 < -1.0) {
        plasticLoss(s, P, () => { s.du = du1; s.wb = v1 / jn; }, 'unlock-capture');
        s.mode = 'S' + s.mode[1];
        s._f = undefined;
        EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
        return;
      }
      // collision pressed the fork INTO the pin: the pin absorbs it (ground)
      plasticLoss(s, P, () => { s.wb = 0; }, 'static-unlock');
      s.b = bs;
    } else if (reached && !approaching) {
      // resting press: hold while the spring pushes into the wall; release
      // (separation) when the wall reaction would go tensile
      const dbdp = jewelDbDp(s.p, sigma, P);
      const tauBal = -k * bs - P.balanceDamp * s.wb;
      const lam = -tauBal * dbdp / (P.balanceJ * dbdp * dbdp);
      if (lam > 0) {
        s.b = bs; s.wb = 0;
        // static unlock: sustained press torque exceeding the draw
        const [jx, jy] = jewelPos(bs, P);
        const tauJ = -sigma * lam * (jx * Math.sin(s.p) - (jy - P.forkPivot) * Math.cos(s.p));
        const f = lockFaceOf(s.mode);
        const [X, Y] = facePointWorld(f, s.u, s.p, P.forkPivot);
        const c = Math.cos(s.p), sn = Math.sin(s.p);
        const nx = f.nx * c - f.ny * sn, ny = f.nx * sn + f.ny * c;
        const rn = X * ny - Y * nx;
        const N = Math.abs(driveTau(s, P)) / Math.max(Math.abs(rn), 1e-6);
        const tauD = (X * ny - (Y - P.forkPivot) * nx) * N;
        const bank = s.mode === 'LE' ? P.bankAngle : -P.bankAngle;
        if (Math.sign(tauJ) !== Math.sign(bank) && Math.abs(tauJ) > Math.abs(tauD)) {
          s.mode = 'S' + s.mode[1]; s.du = 0; s._f = undefined;
          EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
          return;
        }
        return;   // held: balance rests on the wall this substep
      }
      // separation: fall through to free flight
    }
  }
  s.wb += ((-k * s.b - P.balanceDamp * s.wb) / P.balanceJ) * dt;
  EDBG.dampLoss += P.balanceDamp * s.wb * s.wb * dt;
  s.b += s.wb * dt;
}

function substepSlide(s: WatchState, P: WatchPhysics, dt: number) {
  const face: Face = s._f === 'imp' ? impFaceOf('I' + s.mode[1]) : lockFaceOf(s.mode);
  const k = (2 * Math.PI * P.balanceHz) ** 2 * P.balanceJ;
  const sigma = s.mode[1] === 'E' ? 1 : -1;
  const { p0, dpdu, dedu } = slideDerivs(face, s.u, s.p, s.kT, P);
  // re-lock: on a lock face the banking pin caps the fork angle; reaching the
  // rest parameter with positive du is a plastic arrest against the pin
  if (s._f !== 'imp' && Math.abs(p0) >= P.bankAngle - 1e-9 && s.du > 0) {
    plasticLoss(s, P, () => { s.we = 0; s.wp = 0; s.wb = 0; }, 'full-arrest');
    s.du = 0; s.we = 0; s.wp = 0;
    s.p = Math.sign(p0) * P.bankAngle;
    s.e = solveE(face, s.u, s.p, s.kT, P.escapeTeeth, P.forkPivot);
    s.mode = 'L' + s.mode[1];
    EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
    return;
  }
  let slaved = false, dbdu = 0, tauBal = 0;
  if (jewelInMouth(s.b, p0, P)) {
    const bs = jewelSlaveB(p0, sigma, s.b, P);
    if (bs !== null && Math.abs(bs - s.b) < 0.35) {
      slaved = true;
      dbdu = jewelDbDp(p0, sigma, P) * dpdu;
      tauBal = -k * s.b - P.balanceDamp * s.wb;
    }
  }
  const Jeff = P.escapeJ * dedu * dedu + P.forkJ * dpdu * dpdu + (slaved ? P.balanceJ * dbdu * dbdu : 0);
  if (slaved && !s._slv) {
    // slave engagement is an inelastic constraint acquisition, not a hard
    // velocity set: conserve generalized momentum along u and audit the loss.
    const JeffWf = P.escapeJ * dedu * dedu + P.forkJ * dpdu * dpdu;
    const duN = (P.balanceJ * s.wb * dbdu + JeffWf * s.du) / Math.max(Jeff, 1e-12);
    plasticLoss(s, P, () => { s.du = duN; s.wb = dbdu * duN; s.b = jewelSlaveB(p0, sigma, s.b, P)!; }, 'slave-capture');
  }
  s._slv = slaved;
  let Q = driveTau(s, P) * dedu + (-2.2 * s.wp) * dpdu + (slaved ? tauBal * dbdu : 0);
  const h = 1e-3;
  const dA = slideDerivs(face, Math.max(s.u - h, 1e-5), s.p, s.kT, P);
  const dB = slideDerivs(face, s.u + h, s.p, s.kT, P);
  const jA = P.escapeJ * dA.dedu ** 2 + P.forkJ * dA.dpdu ** 2 + (slaved ? P.balanceJ * (jewelDbDp(dA.p0, sigma, P) * dA.dpdu) ** 2 : 0);
  const jB = P.escapeJ * dB.dedu ** 2 + P.forkJ * dB.dpdu ** 2 + (slaved ? P.balanceJ * (jewelDbDp(dB.p0, sigma, P) * dB.dpdu) ** 2 : 0);
  Q -= 0.5 * ((jB - jA) / (2 * h)) * s.du * s.du;
  if (Jeff <= 1e-12) { s.mode = 'DROP'; s._f = undefined; return; }
  const e0 = s.e;
  s.du += (Q / Jeff) * dt;
  s.u += s.du * dt;
  if (s._f !== 'imp' && s.u <= 0) {
    // corner: the tooth does NOT wrap around the kink - the recoil velocity
    // dies against the corner and the wheel's drive torque captures the tooth
    // onto the impulse face. Pre-capture velocities come from the OLD (lock)
    // manifold at u=0; the capture impulse kills the approach velocity along
    // the impulse-face normal; the tangential remainder is the new slide rate.
    // Corner: the tooth's contact switches from the lock face to the impulse
    // face. This is a plastic constraint switch for the WHOLE 1-DOF system:
    // the balance participates through the persistent jewel-slot constraint
    // (its velocity must stay continuous - no impact acts on it directly).
    // Post-impact du is the projection of the pre-impact momentum vector onto
    // the new manifold direction in the mass metric; the KE drop is audited.
    const lk = lockFaceOf(s.mode);
    const dL = slideDerivs(lk, 0, s.p, s.kT, P);
    const weO = dL.dedu * s.du, wpO = dL.dpdu * s.du;
    const imp = impFaceOf('I' + s.mode[1]);
    const { p0: pc, dpdu: dpc, dedu: dec } = slideDerivs(imp, 0, s.p, s.kT, P);
    const dbdI = jewelDbDp(pc, sigma, P) * dpc;
    const JeffI = P.escapeJ * dec * dec + P.forkJ * dpc * dpc + P.balanceJ * dbdI * dbdI;
    const duI = (P.escapeJ * weO * dec + P.forkJ * wpO * dpc + P.balanceJ * s.wb * dbdI) / Math.max(JeffI, 1e-12);
    plasticLoss(s, P, () => {
      s.p = pc; s.e = solveE(imp, 0, pc, s.kT, P.escapeTeeth, P.forkPivot);
      s.du = duI; s.we = dec * duI; s.wp = dpc * duI;
      s.wb = dbdI * duI; s.b = jewelSlaveB(pc, sigma, s.b, P)!;
    }, 'corner-capture');
    // the tooth may enter the impulse face still recoiling (du<0): the
    // contact stays while compressive - the drive torque decelerates the
    // recoil and re-accelerates forward. Leaving the segment (bounds guard)
    // is what ends the contact.
    s.u = 0; s._f = 'imp';
    EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode + ':imp', u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
    return;
  }
  if (s._f === 'imp' && s.u >= face.len) {
    s.we = dedu * s.du; s.wp = dpdu * s.du;
    if (slaved) { s.b = jewelSlaveB(p0, sigma, s.b, P)!; s.wb = dbdu * s.du; }
    s.mode = 'DROP'; s._f = undefined;
    EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
    return;
  }
  if (s.u < -0.5 || s.u > face.len + 0.5) {
    // contact lost beyond the segment: release to free flight
    s.we = dedu * s.du; s.wp = dpdu * s.du;
    s.mode = 'DROP'; s._f = undefined; s.du = 0;
    EDBG.events++;
    return;
  }
  if (EDBG.tr) EDBG.tr.push({ t: +s.t.toFixed(4), md: s.mode + (s._f === 'imp' ? ':i' : ':l'), u: +s.u.toFixed(3), du: +s.du.toFixed(2), wb: +s.wb.toFixed(2), b: +s.b.toFixed(3), Eb: +(0.5 * P.balanceJ * s.wb * s.wb + 0.5 * k * s.b * s.b).toFixed(1), Ek: +(0.5 * Jeff * s.du * s.du).toFixed(1), slv: slaved ? 1 : 0 });
  s.p = p0; s.e = solveE(face, s.u, p0, s.kT, P.escapeTeeth, P.forkPivot);
  s.we = dedu * s.du; s.wp = dpdu * s.du;
  let dE = s.e - e0;
  dE -= 2 * Math.PI * Math.round(dE / (2 * Math.PI)); // wheel-angle wrap: ledger sees the short way
  EDBG.workTorque += driveTau(s, P) * dE;
  if (slaved) {
    const nb = jewelSlaveB(p0, sigma, s.b, P)!;
    EDBG.jewelP += tauBal * dbdu * s.du * dt;
    s.b = nb; s.wb = dbdu * s.du;
    EDBG.dampLoss += P.balanceDamp * s.wb * s.wb * dt;
  } else {
    s.wb += ((-k * s.b - P.balanceDamp * s.wb) / P.balanceJ) * dt;
    EDBG.dampLoss += P.balanceDamp * s.wb * s.wb * dt;
    s.b += s.wb * dt;
  }
}

function substepDrop(s: WatchState, P: WatchPhysics, dt: number) {
  s._slv = false;
  const k = (2 * Math.PI * P.balanceHz) ** 2 * P.balanceJ;
  const e0 = s.e, p0 = s.p;
  s.we += (driveTau(s, P) / P.escapeJ) * dt;
  s.we *= 1 - 0.00004 * dt * 60;
  s.wp *= 1 - 2.2 * dt;
  s.wb += ((-k * s.b - P.balanceDamp * s.wb) / P.balanceJ) * dt;
  EDBG.dampLoss += P.balanceDamp * s.wb * s.wb * dt;
  s.e += s.we * dt; s.p += s.wp * dt; s.b += s.wb * dt;
  let dE = s.e - e0;
  dE -= 2 * Math.PI * Math.round(dE / (2 * Math.PI)); // wheel-angle wrap: ledger sees the short way
  EDBG.workTorque += driveTau(s, P) * dE;

  if (s.p > P.bankAngle || s.p < -P.bankAngle) {
    const bank = Math.sign(s.p) * P.bankAngle;
    plasticLoss(s, P, () => { s.wp = 0; }, 'relock');
    s.p = bank;
    EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
  }

  for (const [side, f] of [['E', ENTRY_LOCK], ['X', EXIT_LOCK]] as const) {
    let caught = false;
    for (let kk = 0; kk < P.escapeTeeth; kk++) {
      const pitch = 2 * Math.PI / P.escapeTeeth;
      const aA = e0 + kk * pitch, aB = s.e + kk * pitch;
      const gA = gapAt(f, P.escapeR * Math.cos(aA), P.escapeR * Math.sin(aA), p0, P);
      const gB = gapAt(f, P.escapeR * Math.cos(aB), P.escapeR * Math.sin(aB), s.p, P);
      if (gA > 0.06 && gB <= 0.06 && gB > -900) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 30; i++) {
          const m = (lo + hi) / 2;
          const em = e0 + (s.e - e0) * m, pm = p0 + (s.p - p0) * m;
          const am = em + kk * pitch;
          const gm = gapAt(f, P.escapeR * Math.cos(am), P.escapeR * Math.sin(am), pm, P);
          if (gm > 0.06) lo = m; else hi = m;
        }
        const frac = (lo + hi) / 2;
        s.e = e0 + (s.e - e0) * frac; s.p = p0 + (s.p - p0) * frac;
        const am = s.e + kk * pitch;
        const tx = P.escapeR * Math.cos(am), ty = P.escapeR * Math.sin(am);
        const c = Math.cos(s.p), sn = Math.sin(s.p);
        const nx = f.nx * c - f.ny * sn, ny = f.nx * sn + f.ny * c;
        const rn = tx * ny - ty * nx;
        const cpx = tx, cpy = ty - P.forkPivot;
        const cn = cpx * ny - cpy * nx;
        const onPin = (s.p >= P.bankAngle - 1e-9 && -cn > 0) || (s.p <= -P.bankAngle + 1e-9 && -cn < 0);
        const meff = rn * rn / P.escapeJ + (onPin ? 0 : cn * cn / P.forkJ);
        const vn = s.we * rn - s.wp * cn;
        if (vn < 0 && meff > 0) {
          const wePre = s.we, wpPre = s.wp;
          const j = -vn / meff;
          const tnx = -ny, tny = nx;
          const rt = tx * tny - ty * tnx, ct = cpx * tny - cpy * tnx;
          const vt = s.we * rt - s.wp * ct;
          const meffT = rt * rt / P.escapeJ + (onPin ? 0 : ct * ct / P.forkJ);
          let jt = meffT > 0 ? -vt / meffT : 0;
          const cap = P.friction * j;
          if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;
          plasticLoss(s, P, () => {
            s.we += (j * rn + jt * rt) / P.escapeJ;
            if (!onPin) s.wp -= (j * cn + jt * ct) / P.forkJ;
          }, 'catch-impulse');
          EDBG.catchN = (EDBG.catchN || 0) + 1;
          if (EDBG.catchLog && EDBG.catchLog.length < 40) EDBG.catchLog.push({ t: +s.t.toFixed(4), j: +j.toFixed(1), jt: +jt.toFixed(1), vn: +vn.toFixed(1), we0: +wePre.toFixed(1), wp0: +wpPre.toFixed(1), onPin });
        }
        plasticLoss(s, P, () => { s.we = 0; s.wp = 0; }, 'drop-catch');
        s.mode = 'L' + side; s.kT = kk;
        let best = 0, bd = 1e9;
        for (let u = 0; u <= f.len; u += 0.0005) {
          const [X, Y] = facePointWorld(f, u, s.p, P.forkPivot);
          const d = Math.hypot(X - tx, Y - ty);
          if (d < bd) { bd = d; best = u; }
        }
        s.u = best; s.du = 0;
        s.beats++;
        if (side === 'E') EDBG.arrestsE++; else EDBG.arrestsX++;
        EDBG.events++; if (EDBG.elog && EDBG.elog.length < 400) EDBG.elog.push({ t: +s.t.toFixed(4), md: s.mode, u: +s.u.toFixed(3), du: +s.du.toFixed(2), e: +s.e.toFixed(3), we: +s.we.toFixed(1), p: +s.p.toFixed(4), wp: +s.wp.toFixed(1), b: +s.b.toFixed(3), wb: +s.wb.toFixed(1) });
        caught = true;
        break;
      }
    }
    if (caught) return;
  }
}

function gapAt(f: Face, tx: number, ty: number, pp: number, P: WatchPhysics): number {
  const c = Math.cos(pp), sn = Math.sin(pp);
  const ax = f.ax * c - f.ay * sn, ay = f.ax * sn + f.ay * c + P.forkPivot;
  const txw = f.tx * c - f.ty * sn, tyw = f.tx * sn + f.ty * c;
  const nxw = f.nx * c - f.ny * sn, nyw = f.nx * sn + f.ny * c;
  const rx = tx - ax, ry = ty - ay;
  const u = rx * txw + ry * tyw;
  if (u < -0.08 || u > f.len + 0.08) return -999;
  return rx * nxw + ry * nyw;
}

function substep(s: WatchState, P: WatchPhysics, dt: number) {
  const ev0 = EDBG.events;
  if (s.mode === 'LE' || s.mode === 'LX') substepLock(s, P, dt);
  else if (s.mode === 'SE' || s.mode === 'SX') substepSlide(s, P, dt);
  else substepDrop(s, P, dt);
  if (EDBG.events - ev0 > 8) EDBG.overcap++;
  const ab = Math.abs(s.b);
  if (ab > s.amp) s.amp = ab; else s.amp += (ab - s.amp) * dt * 0.5;
  s.wind = Math.max(0, s.wind - dt / P.reserveSeconds);
  s.lockHeld = s.mode === 'LE' || s.mode === 'LX';
  if (s.amp < 0.25 && Math.abs(s.wb) < 0.8 && s.wind <= 0.04) { s.stopped = true; s.seeded = false; }
}

export function stepWatch(s: WatchState, p: WatchPhysics, dtFrame: number) {
  s.acc = Math.min(s.acc + dtFrame, 0.12);
  const n = Math.floor(s.acc / p.fixedDt);
  for (let i = 0; i < n; i++) { substep(s, p, p.fixedDt); s.t += p.fixedDt; }
  s.acc -= n * p.fixedDt;
}
