// Consistent-impulse structural prototype v2 (offline, no production change).
// Targets the two measured defects: (1) grounded-pin impulse sized with cf=0
// but applied to the fork (energy pump); (2) positional pass driving the
// wheel backward. Formulation: true two-body effective mass everywhere,
// banking pin as an infinite-mass 1-DOF constraint projection, positional
// pass optional/off. Restitution 0 (restitution route already rejected).
// ---- derived from momentum-contact-prototype.mjs ----
// Hypothesis under test: replacing the escapement tooth contact's
// velocity-projection + positional split with a momentum-conserving impulse
// along the measured tooth-contact normal, with restitution from a physical
// range for hardened steel / pallet-stone impacts, removes the solver's
// timestep sensitivity (Run 14 non-convergence) without breaking the Run 11
// trace, natural unwind, or rest behavior.
//
// The impulse j = -(1+e_r)*vn/meff is collinear and equal-and-opposite on
// wheel and fork, so two-body angular momentum is conserved exactly; the
// restitution threshold vRest treats sub-threshold contact as plastic
// (oil-filmed, low-speed horological contact), which is the standard and
// physically defensible split. Banking-pin grounding (cf=0) transfers
// momentum to the mainplate; that is recorded as plate absorption, not
// treated as wheel/fork energy.
//
// Nothing here is adopted. Grid results decide whether the route lives.

// ---- geometry + defaults copied verbatim from watchMath.ts (09bc1e4) ----
const ENTRY_LOCK = { ax: -4.738, ay: -4.674, tx: -0.292, ty: 0.957, nx: -0.957, ny: -0.292, len: 1.1 };
const ENTRY_IMP  = { ax: -4.738, ay: -4.674, tx: 1, ty: 0, nx: 0, ny: -1, len: 0.9 };
const EXIT_LOCK  = { ax: 5.514, ay: -5.316, tx: 0.743, ty: 0.669, nx: -0.669, ny: 0.743, len: 1.4 };
const EXIT_IMP   = { ax: 5.625, ay: -5.216, tx: 0.342, ty: -0.940, nx: -0.940, ny: -0.342, len: 1.2 };
const CONTACT_SKIN = 0.06;

export const DEFAULTS = {
  escapeTeeth: 15, escapeR: 10, forkPivot: 13.4, balancePivot: 12,
  rollerR: 2.5, hornR: 9.5, slotHalf: 0.5, bankAngle: 0.06,
  balanceHz: 3, balanceJ: 1, balanceDamp: 0.35, forkJ: 0.02,
  escapeJ: 0.5, driveTorque: 3000, torqueFloor: 0.28, friction: 0.12,
  reserveSeconds: 150, windPerTurn: 0.22, seedKick: 0.6,
};

function rotFace(local, c, s, F, out) {
  out.ax = local.ax * c - local.ay * s;
  out.ay = local.ax * s + local.ay * c + F;
  out.tx = local.tx * c - local.ty * s;
  out.ty = local.tx * s + local.ty * c;
  out.nx = local.nx * c - local.ny * s;
  out.ny = local.nx * s + local.ny * c;
  out.len = local.len;
}
function newFace() { return { ax: 0, ay: 0, nx: 0, ny: 0, tx: 0, ty: 0, len: 0 }; }
function rawDist(tx, ty, f) {
  const rx = tx - f.ax, ry = ty - f.ay;
  const u = rx * f.tx + ry * f.ty;
  if (u < -0.08 || u > f.len + 0.08) return null;
  return rx * f.nx + ry * f.ny;   // signed distance along normal (<= skin = touching)
}
function contactFace(tx, ty, f) {
  const rx = tx - f.ax, ry = ty - f.ay;
  const u = rx * f.tx + ry * f.ty;
  if (u < -0.08 || u > f.len + 0.08) return -1;
  const d = rx * f.nx + ry * f.ny;
  return d <= CONTACT_SKIN && d >= -0.5 ? -d : -1;
}

export function createState(p) {
  const w0 = 2 * Math.PI * p.balanceHz;
  return {
    e: -0.2796, we: 0, p: -p.bankAngle, wp: 0,
    b: 0, wb: w0 * 4.4, wind: 1, crown: 0, beats: 0, lockHeld: true,
    amp: 4.4, t: 0, seeded: true, stopped: false,
  };
}

// opts: { restitution, vRest, torqueMode: 'floor'|'linear', contactModel: 'current'|'momentum',
//         groundMode: 'combined' (production: cf=0 but vn includes fork velocity),
//                   'wheel' (grounded contact = tooth vs plate: vn from wheel only),
//                   'none' (no grounding; fork keeps its inertia) }
export function makeSubstep(opts) {
  const er = opts.restitution ?? 0;
  const vRest = opts.vRest ?? 0.1;
  const momentum = opts.contactModel === 'momentum';
  const linear = opts.torqueMode === 'linear';

  return function substep(s, p, dt, geo, instr) {
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

    const c = Math.cos(s.p), sn = Math.sin(s.p);
    rotFace(ENTRY_LOCK, c, sn, F, geo[0]);
    rotFace({ ...ENTRY_IMP, len: p.eImpLen || ENTRY_IMP.len }, c, sn, F, geo[1]);
    rotFace(EXIT_LOCK, c, sn, F, geo[2]);
    rotFace({ ...EXIT_IMP, len: p.xImpLen || EXIT_IMP.len }, c, sn, F, geo[3]);

    const pitch = (2 * Math.PI) / p.escapeTeeth;
    let lockNow = false;
    const spec = !!opts.speculative;
    const iters = opts.velIters || 1;
    for (let it = 0; it < iters; it++)
    for (let kTooth = 0; kTooth < p.escapeTeeth; kTooth++) {
      const a = s.e + kTooth * pitch;
      const tx = p.escapeR * Math.cos(a), ty = p.escapeR * Math.sin(a);
      const vtx = -s.we * ty, vty = s.we * tx;
      for (let i = 0; i < 4; i++) {
        const face = geo[i];
        let pen = contactFace(tx, ty, face);
        const cpx = face.ax, cpy = face.ay - F;
        const fvx = -s.wp * cpy, fvy = s.wp * cpx;
        const rvx = vtx - fvx, rvy = vty - fvy;
        let vn = rvx * face.nx + rvy * face.ny;
        if (pen < 0) {
          if (!spec || it > 0) continue;
          const d = rawDist(tx, ty, face);
          if (d === null || d > CONTACT_SKIN) continue;
          // speculative: activate if the approach would cross the face this substep
          if (vn >= -d / Math.max(dt, 1e-9) * 0 - 0) { /* compute below */ }
          const gap = d - CONTACT_SKIN;               // positive: gap to close
          if (gap <= 0) continue;                     // tunneled or already inside: not speculative's job
          const closing = -vn;                        // positive when approaching
          if (closing * dt < gap) continue;           // cannot reach this step
          pen = 0;
          // speculative target: arrive at the surface at end of step, not stop dead
          vn = vn + gap / Math.max(dt, 1e-9);         // excess approach velocity only
        }
        if (i === 0 || i === 2) lockNow = true;
        if (vn >= 0 && pen < 0.02) continue;
        const reX = tx, reY = ty;
        const ce = (reX * face.ny - reY * face.nx) ** 2 / p.escapeJ;
        let cf = (cpx * face.ny - cpy * face.nx) ** 2 / p.forkJ;
        const cn = cpx * face.ny - cpy * face.nx;
        const dwpSign = -cn;
        // consistent formulation: no effective-mass grounding. The banking
        // pin is its own infinite-mass constraint (see pin projection below);
        // tooth contacts always solve with the true two-body effective mass.
        const onPin = false;
        const meff = ce + cf;
        if (meff <= 0) continue;
        // grounded contact = tooth vs plate: approach speed is the wheel's own
        const vnC = onPin && gm === 'wheel' ? vtx * face.nx + vty * face.ny : vn;

        // momentum-conserving impulse along the measured face normal.
        // restitution only for genuine impacts; sub-threshold = plastic.
        const eEff = momentum && vnC < -vRest ? er : 0;
        let j = -(1 + eEff) * vnC / meff;
        if (j < 0) j = 0;

        const tnx = -face.ny, tny = face.nx;
        const vt = rvx * tnx + rvy * tny;
        const ceT = (reX * tny - reY * tnx) ** 2 / p.escapeJ;
        let cfT = (cpx * tny - cpy * tnx) ** 2 / p.forkJ;
        if (onPin) cfT = 0;
        let jt = -vt / (ceT + cfT + 1e-9);
        const cap = p.friction * j;
        if (jt > cap) jt = cap; else if (jt < -cap) jt = -cap;

        if (instr && j > 0) {
          // energy bookkeeping: predicted normal-mode loss vs measured
          const keBefore = 0.5 * p.escapeJ * s.we * s.we + 0.5 * p.forkJ * s.wp * s.wp;
          const ix = face.nx * j + tnx * jt, iy = face.ny * j + tny * jt;
          const dwe = (reX * iy - reY * ix) / p.escapeJ;
          const dwp = -(cpx * iy - cpy * ix) / p.forkJ;
          const we0 = s.we, wp0 = s.wp;
          s.we += dwe; s.wp += dwp;
          const keAfter = 0.5 * p.escapeJ * s.we * s.we + 0.5 * p.forkJ * s.wp * s.wp;
          const predLoss = 0.5 * meff * vnC * vnC * (1 - eEff * eEff);
          const dKE = keAfter - keBefore;
          instr.contactEvents++;
          instr.contactdKE += dKE;
          instr.contactPredLoss += predLoss;
          if (dKE > 1e-9) { instr.positiveKEEvents++; instr.positiveKE += dKE; }
          if (onPin) instr.pinEvents++;
          if (eEff > 0) instr.restitutionEvents++;
          // arrest trace: a lock face contact begins (rising edge handled by caller via lockHeld)
          continue;
        }
        const ix = face.nx * j + tnx * jt, iy = face.ny * j + tny * jt;
        s.we += (reX * iy - reY * ix) / p.escapeJ;
        s.wp -= (cpx * iy - cpy * ix) / p.forkJ;
      }
    }

    // positional depenetration: posMode 'off' removes it (velocity impulses
    // carry the contact), 'forkOnly' never moves the wheel backward
    const posMode = opts.posMode || 'off';
    for (let kTooth = 0; posMode !== 'off' && kTooth < p.escapeTeeth; kTooth++) {
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
        if (pinned || posMode === 'forkOnly') {
          if (posMode === 'forkOnly') {
            // wheel never position-corrected; the fork takes the whole split
            s.p += dP;
            if (instr) { instr.posPassEvents++; }
          } else if (Math.abs(rn) > 1e-6) {
            const dE = (0.8 * Math.min(pen - 0.004, 0.3)) / rn;
            s.e += dE;
            if (instr) { instr.posPassEvents++; instr.posPassWheelAngle += dE; if (dE > 0) instr.posPassBackward += dE; }
          }
        } else {
          const lambda = 0.4 * Math.min(pen - 0.004, 0.3) / meff;
          const dE = (rn / p.escapeJ) * lambda;
          s.e += dE;
          s.p += dP;
          if (instr) { instr.posPassEvents++; instr.posPassWheelAngle += dE; if (dE > 0) instr.posPassBackward += dE; }
        }
      }
    }

    // roller jewel vs fork slot walls (unchanged from production)
    {
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
        // identify which lock face arrested: entry (0) or exit (2)
        let which = 'unknown';
        outer: for (let kTooth = 0; kTooth < p.escapeTeeth; kTooth++) {
          const a2 = s.e + kTooth * pitch;
          const txx = p.escapeR * Math.cos(a2), tyy = p.escapeR * Math.sin(a2);
          for (const [idx, name] of [[0, 'entry'], [2, 'exit']]) {
            if (contactFace(txx, tyy, geo[idx]) >= 0) { which = name; break outer; }
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
    arrests: [],
  };
}

// Run at an ACTUAL solver rate (no internal microstep): this is the Run 14
// style convergence check, not a partition-consistency check.
export function runSeconds(s, p, substep, seconds, solverHz, instr) {
  const geo = [newFace(), newFace(), newFace(), newFace()];
  const dt = 1 / solverHz;
  const n = Math.round(seconds * solverHz);
  for (let i = 0; i < n; i++) { substep(s, p, dt, geo, instr); s.t += dt; }
  return s;
      }
