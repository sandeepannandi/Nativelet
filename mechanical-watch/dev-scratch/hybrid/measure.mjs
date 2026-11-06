// Multi-dt, long-run measurement for the hybrid escapement.
// Physical gate basis (Swiss lever, 15 club teeth):
//  - rate: balanceHz 3 -> 6 beats/s (21600 vph)
//  - advance: exactly one half-pitch per beat = pi/15 = 0.20944 rad
//  - amplitude: real movements run 220-320 deg one-side = 3.8-5.6 rad;
//    gate 3.5-5 rad sustained (original acceptance, restored).
import * as m from './hyb/watchMath.ts';

const P = m.WATCH_DEFAULTS;
const HALF = -Math.PI / 15;  // wheel advances in -e

function run(dt, seconds) {
  const s = m.createWatch(P);
  const n = Math.round(seconds / dt);
  let ePrev = s.e, eCum = 0;
  const beatE = [];        // eCum at each beat
  const ampHist = [];
  for (let f = 0; f < n; f++) {
    m.stepWatch(s, P, dt);
    let dE = s.e - ePrev;
    dE -= 2 * Math.PI * Math.round(dE / (2 * Math.PI));
    eCum += dE; ePrev = s.e;
    if (s.beats > beatE.length) beatE.push(eCum);
    if (f % Math.round(1 / dt) === 0) ampHist.push(s.amp);
  }
  const beats = s.beats;
  const settled = beatE.slice(10);                       // skip transient
  const adv = settled.map((v, i) => i ? v - settled[i - 1] : null).slice(1);
  const mean = adv.reduce((a, x) => a + x, 0) / adv.length;
  const sd = Math.sqrt(adv.reduce((a, x) => a + (x - mean) ** 2, 0) / adv.length);
  const cumErr = settled.length ? (settled[settled.length - 1] - settled[0]) - (settled.length - 1) * HALF : 0;
  const ampTail = ampHist.slice(-10).reduce((a, x) => a + x, 0) / 10;
  return { dt, t: seconds, beats, bps: beats / seconds,
    advMean: mean, advSd: sd, cumErrOverSettled: cumErr,
    ampEnd: s.amp, ampTail,
    work: m.EDBG.workTorque, impact: m.EDBG.impactLoss, damp: m.EDBG.dampLoss, jewelP: m.EDBG.jewelP };
}

for (const dt of [1 / 960, 1 / 1920, 1 / 3840]) {
  const r = run(dt, 60);
  console.log(JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
}
