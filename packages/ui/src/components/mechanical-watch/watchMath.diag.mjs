import { WATCH_DEFAULTS, createWatch, stepWatch, windCrown, trainAngles } from './watchMath.ts';
const P = WATCH_DEFAULTS;
const s = createWatch(P);
let minP = 9, maxP = -9, minWe = 9, maxWe = -9, maxAbsB = 0;
const beatsAt = [];
for (let f = 0; f < 10 * 60; f++) {
  stepWatch(s, P, 1 / 60);
  minP = Math.min(minP, s.p); maxP = Math.max(maxP, s.p);
  minWe = Math.min(minWe, s.we); maxWe = Math.max(maxWe, s.we);
  maxAbsB = Math.max(maxAbsB, Math.abs(s.b));
  if (f % 60 === 59) beatsAt.push(s.beats);
}
const pitch = (2 * Math.PI) / P.escapeTeeth;
console.log('beats/s each second:', beatsAt.map((b, i) => b - (beatsAt[i - 1] || 0)).join(','));
console.log('total beats (expect ~60):', s.beats);
console.log('escape advanced rev (expect ~2.0):', (s.e / (2 * Math.PI)).toFixed(3));
console.log('escape per beat vs pitch:', (s.e / Math.max(1, s.beats) / pitch).toFixed(3));
console.log('fork range rad (bank', P.bankAngle, '):', minP.toFixed(3), maxP.toFixed(3));
console.log('balance amp est rad (expect ~3.5-5):', s.amp.toFixed(3), 'maxAbsB', maxAbsB.toFixed(3));
console.log('we range:', minWe.toFixed(3), maxWe.toFixed(3));
console.log('wind after 10s:', s.wind.toFixed(3), 'stopped:', s.stopped);
const a = trainAngles(s.e);
console.log('ratios check: fourth/escape', (a.fourth / a.escape).toFixed(4), '(exp -0.1) center/escape', (a.center / a.escape).toFixed(5), '(exp -1/600=-0.00167) barrel', (a.barrel / a.escape).toFixed(6), '(exp 1/3600=0.000278) hour/center', (a.hour / a.center).toFixed(4), '(exp 0.0833)');
