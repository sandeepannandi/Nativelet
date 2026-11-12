// Polygon contact structural prototype (offline, no production change).
// Same consistent two-body impulse formulation as the v2 prototype
// (consistent-impulse-prototype.mjs), but tooth/pallet contact geometry is the
// MEASURED polygon geometry (polygon-geometry.mjs from reference-geometry.json)
// instead of the four abstract point-face segments. Restitution 0 (restitution
// route closed negative). Banking pin = infinite-mass 1-DOF constraint.
// Hypothesis under test: measured club-tooth vs slab geometry, solved with
// consistent impulses, sustains oscillation where the abstract point-face
// model could not. Nothing here is adopted. Gate results decide.
import { toothPolygon, slabPolygon, slabFaceContact, ARBOR } from './polygon-geometry.mjs';

const CONTACT_SKIN = 0.06;

export const DEFAULTS = {
  escapeTeeth: 15, escapeR: 10, forkPivot: 13.4, balancePivot: 12,
  rollerR: 2.5, hornR: 9.5, slotHalf: 0.5, bankAngle: 0.06,
  balanceHz: 3, balanceJ: 1, balanceDamp: 0.35, forkJ: 0.02,
  escapeJ: 0.5, driveTorque: 3000, torqueFloor: 0.28, friction: 0.12,
  reserveSeconds: 150, windPerTurn: 0.22, seedKick: 0.6,
};

export function createState(p) {
  const w0 = 2 * Math.PI * p.balanceHz;
  return {
    e: 0, we: 0, p: -p.bankAngle, wp: 0,
    b: 0, wb: w0 * 4.4, wind: 1, crown: 0, beats: 0, lockHeld: true,
    amp: 4.4, t: 0, seeded: true, stopped: false,
  };
}

// Calibrate the wheel angle so the wheel starts just locked on the entry slab
// (first touch when the wheel advances CW = e decreasing), fork held at its
// initial banking. Mirrors production's locked-at-rest initial condition.
export function calibrateWheel(s, p) {
  const pitch = 2 * Math.PI / p.escapeTeeth;
  const gap = e0 => {
    let g = Infinity;
    for (let k = 0; k < p.escapeTeeth; k++) {
      const c = slabFaceContact(toothPolygon(e0 + k * pitch), slabPolygon('entry', s.p), 50);
      if (c) g = Math.min(g, -c.depth);
    }
    return g;
  };
  // find a separated angle then advance CW to first touch (bisection)
  let eFree = s.e;
  while (gap(eFree) <= 0) eFree += pitch / 720;          // move to separated side
  let lo = eFree, hi = eFree;                            // gap(lo) > 0
  // decrease e (CW) until contact
  let eC = lo;
  while (gap(eC) > 0) { eC -= pitch / 720; if (lo - eC > pitch) break; }
  hi = eC; // gap(hi) <= 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > 0) lo = mid; else hi = mid;
  }
  s.e = lo;
}

export function makeSubstep(opts) {
  const er = 0;                                       // restitution route closed
  const vRest = opts.vRest ?? 0.1;
  const linear = opts.torqueMode === 'linear';

  return function substep(s, p, dt, cache, instr) {
    const k = (2 * Math.PI * p.balanceHz) ** 2 * p.balanceJ;
    const torque = linear ? p.driveTorque * s.wind
                          : p.driveTorque * (p.torqueFloor + (1 - p.torqueFloor) * s.wind);
    const F = p.forkPivot;

    s.we += (-torque / p.escapeJ) * dt;
    s.we *= 1 - 0.04 * dt * 60 * 0.001;
    s.wb += ((-k * s.b - p.balanceDamp * s.wb) / p.balanceJ) * dt;
    s.wp *= 1 - 2.2 * dt;

    if (s.p >= p.bankAngle && s.wp > 0) s.wp = 0;
    if (s.p <= -p.bankAngle && s.wp < 0) s.wp = 0;

    // measured polygons for this substep
    const pitch = (2 * Math.PI) / p.escapeTeeth;
    if (!cache.teeth) { cache.teeth = []; cache.slabs = []; }
    for (let kT = 0; kT < p.escapeTeeth; kT++) cache.teeth[kT] = toothPolygon(s.e + kT * pitch);
    cache.slabs[0] = slabPolygon('entry', s.p);
    cache.slabs[1] = slabPolygon('exit', s.p);

    let lockNow = false;
    const spec = !!opts.speculative;
    const iters = opts.velIters || 1;
    for (let it = 0; it < iters; it++)
    for (let kT = 0; kT < p.escapeTeeth; kT++) {
      const T = cache.teeth[kT];
      for (let si = 0; si < 2; si++) {
        const reach = spec ? CONTACT_SKIN + (Math.abs(s.we) * p.escapeR + Math.abs(s.wp) * 15) * dt : CONTACT_SKIN;
        let c = slabFaceContact(T, cache.slabs[si], reach);
        if (!c) continue;
        // pin state first (geometric): when grounded, the pin holds the fork,
        // so the contact approach velocity is the wheel's own motion only;
        // the pin constraint absorbs the fork's residual velocity separately.
        const cpx0 = c.x - ARBOR.x, cpy0 = c.y - ARBOR.y;
        const cn0 = cpx0 * c.ny - cpy0 * c.nx;
        const pushesNeg0 = cn0 > 0;
        const grounded0 = (s.p <= -p.bankAngle + 1e-6 && pushesNeg0) || (s.p >= p.bankAngle - 1e-6 && !pushesNeg0);
        let vn, vt;
        const vel = () => {
          const reX = c.x, reY = c.y;
          const vtx = -s.we * reY, vty = s.we * reX;
          const fvx = grounded0 ? 0 : -s.wp * cpy0, fvy = grounded0 ? 0 : s.wp * cpx0;
          const rvx = vtx - fvx, rvy = vty - fvy;
          vn = rvx * c.nx + rvy * c.ny;
          vt = rvx * -c.ny + rvy * c.nx;
        };
        vel();
        if (c.depth < 0) {
          if (!spec || it > 0) continue;
          const gap = -c.depth;
          const closing = -vn;
          if (closing * dt < gap) continue;            // cannot reach this step
          vn = vn + gap / Math.max(dt, 1e-9);          // arrive at surface
        }
        lockNow = true;
        if (vn >= 0 && c.depth < 0.02) continue;

        const reX = c.x, reY = c.y;
        const cpx = c.x - ARBOR.x, cpy = c.y - ARBOR.y;
        const ce = (reX * c.ny - reY * c.nx) ** 2 / p.escapeJ;
        let cf = (cpx * c.ny - cpy * c.nx) ** 2 / p.forkJ;
        // Pin-aware grounding: the banking pin is a unilateral constraint. When
        // the fork rests on a pin AND this contact's impulse would drive it
        // further into the pin, the pin carries the fork's share: the fork is
        // immovable for this solve (cf = 0) and receives NO impulse. Unlike the
        // production defect (cf=0 sizing but impulse still applied to the
        // fork), grounding here removes the fork term from both the effective
        // mass and the application, so no energy is created.
        const grounded = grounded0;
        if (grounded) cf = 0;
        const meff = ce + cf;
        if (meff <= 0) continue;
        const eEff = 0;                                 // plastic horological contact
        let j = -(1 + eEff) * vn / meff;
        if (j < 0) j = 0;

        const tnx = -c.ny, tny = c.nx;
        const ceT = (reX * tny - reY * tnx) ** 2 / p.escapeJ;
        let cfT = (cpx * tny - cpy * tnx) ** 2 / p.forkJ;
        if (grounded) cfT = 0;
        let jt = -vt / (ceT + cfT + 1e-9);
        const cap = p.friction * j;
        if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;

        if (instr && j > 0) {
          const keBefore = 0.5 * p.escapeJ * s.we * s.we + 0.5 * p.forkJ * s.wp * s.wp;
          const wp0 = s.wp;
          const ix = c.nx * j + tnx * jt, iy = c.ny * j + tny * jt;
          s.we += (reX * iy - reY * ix) / p.escapeJ;
          if (!grounded) s.wp -= (cpx * iy - cpy * ix) / p.forkJ;
          else if (instr) instr.pinEvents++;
          const keAfter = 0.5 * p.escapeJ * s.we * s.we + 0.5 * p.forkJ * s.wp * s.wp;
          const predLoss = 0.5 * meff * vn * vn * (1 - eEff * eEff);
          const dKE = keAfter - keBefore;
          instr.contactEvents++;
          instr.contactdKE += dKE;
          instr.contactPredLoss += predLoss;
          if (dKE > 1e-9) { instr.positiveKEEvents++; instr.positiveKE += dKE; }
          if (instr.faceCount) instr.faceCount[si === 0 ? 'entry' : 'exit']++;
          if (instr.impulseWork !== undefined && !grounded) {
            // work delivered to the fork by this contact (impulse phase only)
            const wpAfter = s.wp;
            instr.impulseWork += 0.5 * p.forkJ * (wpAfter * wpAfter - wp0 * wp0);
            const key = (si === 0 ? 'entry' : 'exit') + ':f' + c.face;
            instr.faceWork[key] = (instr.faceWork[key] || 0) + (0.5 * p.forkJ * (wpAfter * wpAfter - wp0 * wp0));
          }
          continue;
        }
        const ix = c.nx * j + tnx * jt, iy = c.ny * j + tny * jt;
        s.we += (reX * iy - reY * ix) / p.escapeJ;
        if (!grounded) s.wp -= (cpx * iy - cpy * ix) / p.forkJ;
      }
    }

    // positional depenetration: 'off' (velocity impulses carry contact) or
    // 'forkOnly' (never moves the wheel backward)
    const posMode = opts.posMode || 'off';
    if (posMode !== 'off') {
      for (let kT = 0; kT < p.escapeTeeth; kT++) {
        const T = cache.teeth[kT];
        for (let si = 0; si < 2; si++) {
          const c = slabFaceContact(T, cache.slabs[si], 0);
          if (!c || c.depth <= 0.005) continue;
          const reX = c.x, reY = c.y;
          const cpx = c.x - ARBOR.x, cpy = c.y - ARBOR.y;
          const ce = (reX * c.ny - reY * c.nx) ** 2 / p.escapeJ;
          const cf = (cpx * c.ny - cpy * c.nx) ** 2 / p.forkJ;
          const meff = ce + cf;
          if (meff <= 0) continue;
          const cn = cpx * c.ny - cpy * c.nx;
          const dP = -((cn / p.forkJ) * 0.4 * Math.min(c.depth - 0.004, 0.3)) / meff;
          if (posMode === 'forkOnly') {
            s.p += dP;
            if (instr) instr.posPassEvents++;
          } else {
            const rn = reX * c.ny - reY * c.nx;
            const lambda = 0.4 * Math.min(c.depth - 0.004, 0.3) / meff;
            const dE = (rn / p.escapeJ) * lambda;
            s.e += dE; s.p += dP;
            if (instr) { instr.posPassEvents++; instr.posPassWheelAngle += dE; if (dE > 0) instr.posPassBackward += dE; }
          }
        }
      }
    }

    // roller jewel vs fork slot walls (unchanged from production)
    {
      const c = Math.cos(s.p), sn = Math.sin(s.p);
      const Bx = 0, By = F + p.balancePivot;
      const ja = s.b;
      const jx = Bx + p.rollerR * Math.sin(ja), jy = By - p.rollerR * Math.cos(ja);
      const hx0 = 0, hy0 = p.hornR;
      const hx = hx0 * c - hy0 * sn, hy = hx0 * sn + hy0 * c + F;
      const ax = -sn, ay = c;
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
          const cf2 = (cpx * ny - cpy * nx) ** 2 / p.forkJ;
          const meff = cb + cf2;
          if (meff > 0 && (vn < 0 || penS > 0.02)) {
            let j = -vn / meff;
            if (j < 0) j = 0;
            s.wb += (rjX * (ny * j) - rjY * (nx * j)) / p.balanceJ;
            s.wp -= (cpx * (ny * j) - cpy * (nx * j)) / p.forkJ;
          }
        }
      }
    }

    if (s.p > p.bankAngle) { s.p = p.bankAngle; if (s.wp > 0) s.wp = 0; }
    if (s.p < -p.bankAngle) { s.p = -p.bankAngle; if (s.wp < 0) s.wp = 0; }
    if ((s.p >= p.bankAngle && s.wp > 0) || (s.p <= -p.bankAngle && s.wp < 0)) s.wp = 0;
    if (s.p + s.wp * dt > p.bankAngle) { s.p = p.bankAngle; s.wp = 0; }
    else if (s.p + s.wp * dt < -p.bankAngle) { s.p = -p.bankAngle; s.wp = 0; }
    if (s.we > 40) s.we = 40; else if (s.we < -40) s.we = -40;
    if (s.wp > 120) s.wp = 120; else if (s.wp < -120) s.wp = -120;
    s.e += s.we * dt;
    s.p += s.wp * dt;
    s.b += s.wb * dt;

    if (instr) {
      if (lockNow && !s.lockHeld) {
        let which = 'unknown';
        outer: for (let kT = 0; kT < p.escapeTeeth; kT++) {
          for (const [si, name] of [[0, 'entry'], [1, 'exit']]) {
            const c2 = slabFaceContact(cache.teeth[kT], cache.slabs[si], CONTACT_SKIN);
            if (c2) { which = name; break outer; }
          }
        }
        instr.arrests.push({ t: s.t, face: which, e: s.e });
      }
    }
    if (lockNow && !s.lockHeld) s.beats++;
    s.lockHeld = lockNow;

    const ab = Math.abs(s.b);
    if (ab > s.amp) s.amp = ab; else s.amp += (ab - s.amp) * dt * 0.5;

    s.wind = Math.max(0, s.wind - dt / p.reserveSeconds);
    if (s.amp < 0.25 && Math.abs(s.wb) < 0.8 && s.wind <= 0.04) {
      s.stopped = true; s.seeded = false;
    }
  };
}

export function newInstr() {
  return {
    contactEvents: 0, contactdKE: 0, contactPredLoss: 0,
    positiveKEEvents: 0, positiveKE: 0, pinEvents: 0, restitutionEvents: 0,
    posPassEvents: 0, posPassWheelAngle: 0, posPassBackward: 0,
    arrests: [], faceCount: { entry: 0, exit: 0 }, impulseWork: 0, faceWork: {},
  };
}

export function runSeconds(s, p, substep, seconds, solverHz, instr) {
  const cache = {};
  const dt = 1 / solverHz;
  const n = Math.round(seconds * solverHz);
  for (let i = 0; i < n; i++) { substep(s, p, dt, cache, instr); s.t += dt; }
  return s;
}
