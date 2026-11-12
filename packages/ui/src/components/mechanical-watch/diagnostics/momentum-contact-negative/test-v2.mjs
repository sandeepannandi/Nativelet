import { DEFAULTS, createState, makeSubstep, newInstr, runSeconds } from './consistent-impulse-prototype.mjs';
const P = { ...DEFAULTS };
const pitch = (2 * Math.PI) / P.escapeTeeth;
function summarizeArrests(instr) {
  const faces = { entry: 0, exit: 0, unknown: 0 }; const intervals = [];
  for (let i = 0; i < instr.arrests.length; i++) {
    faces[instr.arrests[i].face]++;
    if (i > 0) intervals.push((instr.arrests[i].e - instr.arrests[i-1].e) / (pitch/2));
  }
  const near1 = intervals.filter(x => Math.abs(Math.abs(x)-1) < 0.35).length;
  return { count: instr.arrests.length, faces, near1 };
}
function run(label, setup, seconds, opts, hz) {
  const p = { ...P }; const s = createState(p);
  if (setup === 'empty-running') s.wind = 0;
  if (setup === 'empty-rest') { s.wind = 0; s.b = 0; s.wb = 0; s.amp = 0; s.stopped = true; s.seeded = false; }
  if (setup === 'powered-rest') { s.b = 0; s.wb = 0; s.amp = 0; s.stopped = true; s.seeded = false; s.wind = 0.6; }
  if (setup === 'one-restart') { s.wind = 1; s.b = 0; s.wb = 0.6*2*Math.PI*p.balanceHz; s.amp = 0; s.stopped = false; s.seeded = true; }
  const sub = makeSubstep(opts); const instr = newInstr(); const e0 = s.e;
  runSeconds(s, p, sub, seconds, hz, instr);
  const a = summarizeArrests(instr);
  console.log(JSON.stringify({ label, hz, setup, amp: +s.amp.toFixed(3), wind: +s.wind.toFixed(3), stopped: s.stopped,
    wheel: +(s.e-e0).toFixed(3), arrests: a.count, faces: a.faces, near1: a.near1,
    posKE: instr.positiveKEEvents, posKEAmt: +instr.positiveKE.toFixed(3), dKE: +instr.contactdKE.toFixed(2),
    posPass: instr.posPassEvents, back: +instr.posPassBackward.toFixed(3) }));
}
const mode = process.argv[2] || 'conv';
if (mode === 'conv') {
  for (const [tag, extra] of [['spec', { speculative: true }], ['spec-it3', { speculative: true, velIters: 3 }]])
    for (const hz of [480, 960, 1920, 3840, 7680, 15360])
      run(`v2-${tag}`, 'factory', 10, { contactModel: 'current', torqueMode: 'floor', posMode: 'off', ...extra }, hz);
}
if (mode === 'scen') {
  for (const posMode of ['off', 'forkOnly'])
    for (const [nm, secs] of [['natural-unwind', 300], ['empty-rest', 60], ['powered-rest', 60], ['one-restart', 60]])
      run(`v2-${posMode}`, nm === 'natural-unwind' ? 'factory' : nm, secs, { contactModel: 'current', torqueMode: 'floor', posMode }, 960);
}
