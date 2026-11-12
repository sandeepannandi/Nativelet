// Test matrix for the momentum-contact discriminator prototype.
import { DEFAULTS, createState, makeSubstep, newInstr, runSeconds } from './momentum-contact-prototype.mjs';

const P = { ...DEFAULTS };
const pitch = (2 * Math.PI) / P.escapeTeeth;

function fmt(x, d = 3) { return typeof x === 'number' ? x.toFixed(d) : String(x); }

function summarizeArrests(instr) {
  const faces = { entry: 0, exit: 0, unknown: 0 };
  const intervals = [];
  for (let i = 0; i < instr.arrests.length; i++) {
    faces[instr.arrests[i].face]++;
    if (i > 0) intervals.push((instr.arrests[i].e - instr.arrests[i - 1].e) / (pitch / 2));
  }
  const near1 = intervals.filter(x => Math.abs(Math.abs(x) - 1) < 0.35).length;
  const near2 = intervals.filter(x => Math.abs(Math.abs(x) - 2) < 0.35).length;
  return { count: instr.arrests.length, faces, near1, near2, other: intervals.length - near1 - near2 };
}

function scenario(name, setup, seconds, opts, hz) {
  const p = { ...P };
  const s = createState(p);
  if (setup === 'empty-running') s.wind = 0;
  if (setup === 'empty-rest') { s.wind = 0; s.b = 0; s.wb = 0; s.amp = 0; s.stopped = true; s.seeded = false; }
  if (setup === 'powered-rest') { s.b = 0; s.wb = 0; s.amp = 0; s.stopped = true; s.seeded = false; s.wind = 0.6; }
  if (setup === 'one-restart') { s.wind = 0; s.b = 0; s.wb = 0; s.amp = 0; s.stopped = true; s.seeded = false; s.wind = 1; s.wb = 0.6 * 2 * Math.PI * p.balanceHz; s.stopped = false; s.seeded = true; }
  const sub = makeSubstep(opts);
  const instr = newInstr();
  const e0 = s.e;
  const windHitZeroAt = null;
  runSeconds(s, p, sub, seconds, hz, instr);
  const arr = summarizeArrests(instr);
  return {
    name, setup, hz, model: opts.contactModel, er: opts.restitution ?? 0, torque: opts.torqueMode,
    finalAmp: +s.amp.toFixed(4), finalWind: +s.wind.toFixed(4), stopped: s.stopped,
    wheelRad: +(s.e - e0).toFixed(4),
    arrests: arr.count, faces: arr.faces, near1: arr.near1, near2: arr.near2, otherInt: arr.other,
    contactEvents: instr.contactEvents,
    contactdKE: +instr.contactdKE.toFixed(4), predLoss: +instr.contactPredLoss.toFixed(4),
    posKE: instr.positiveKEEvents, posKEAmt: +instr.positiveKE.toFixed(6),
    pinEvents: instr.pinEvents, restEvents: instr.restitutionEvents,
    posPass: instr.posPassEvents, posPassAngle: +instr.posPassWheelAngle.toFixed(5), posPassBack: +instr.posPassBackward.toFixed(5),
  };
}

const mode = process.argv[2] || 'all';
const out = {};

if (mode === 'all' || mode === 'baseline') {
  // Port sanity: current model, floor torque, actual solver rates.
  out.baseline = [480, 960, 1920, 3840].map(hz =>
    scenario('factory10s', 'factory', 10, { contactModel: 'current', torqueMode: 'floor' }, hz));
}

if (mode === 'all' || mode === 'convergence') {
  // Run-14 style ACTUAL-rate convergence of the momentum model.
  out.convergence = [];
  for (const er of [0, 0.2, 0.4, 0.6]) {
    for (const hz of [480, 960, 1920, 3840, 7680, 15360]) {
      out.convergence.push(scenario('factory10s', 'factory', 10, { contactModel: 'momentum', restitution: er, vRest: 0.1, torqueMode: 'floor' }, hz));
    }
  }
  // principled grounding variants (not a sweep): how the pinned-fork contact is modeled
  out.groundVariants = [];
  for (const gm of ['wheel', 'none']) {
    for (const er of [0, 0.2]) {
      for (const hz of [480, 960, 1920, 3840, 7680, 15360]) {
        const r = scenario('factory10s', 'factory', 10, { contactModel: 'momentum', restitution: er, vRest: 0.1, torqueMode: 'floor', groundMode: gm }, hz);
        r.groundMode = gm;
        out.groundVariants.push(r);
      }
    }
  }
}

if (mode === 'all' || mode === 'scenarios') {
  // Unwind / rest / restart at 960 Hz across restitution grid and both torque modes.
  out.scenarios = [];
  for (const er of [0, 0.2, 0.4, 0.6]) {
    for (const torqueMode of ['floor', 'linear']) {
      const opts = { contactModel: 'momentum', restitution: er, vRest: 0.1, torqueMode };
      out.scenarios.push(scenario('natural-unwind', 'factory', 300, opts, 960));
      out.scenarios.push(scenario('empty-rest', 'empty-rest', 60, opts, 960));
      out.scenarios.push(scenario('powered-rest', 'powered-rest', 60, opts, 960));
      out.scenarios.push(scenario('one-restart', 'one-restart', 60, opts, 960));
    }
  }
}

console.log(JSON.stringify(out, null, 1));
