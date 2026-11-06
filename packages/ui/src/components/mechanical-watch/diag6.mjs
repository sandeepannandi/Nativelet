import { WATCH_DEFAULTS, createWatch, stepWatch } from './watchMath.ts';
for (const fj of [0.012, 0.015, 0.02]) {
  for (const tq of [1500, 2200, 3000]) {
    const p = { ...WATCH_DEFAULTS, eImpLen: 1.2, xImpLen: 1.2, forkJ: fj, driveTorque: tq };
    const s = createWatch(p);
    let b10 = 0, e10 = 0;
    for (let i = 0; i < 30 * 60; i++) {
      stepWatch(s, p, 1 / 60);
      if (i === 600) { b10 = s.beats; e10 = s.e; }
    }
    const pitch = 2 * Math.PI / 15;
    const pps = (e10 - s.e) / 20 / pitch;
    console.log(`forkJ=${fj} T=${tq} beats/s=${(b10/10).toFixed(1)} pitch/s(10-30s)=${pps.toFixed(2)} amp10=${s.amp < 9 ? '' : ''}${(function(){return ''})()}amp@10..30: see30=${s.amp.toFixed(2)} beats30=${s.beats}`);
  }
}
