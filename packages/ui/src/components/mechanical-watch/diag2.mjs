import { WATCH_DEFAULTS, createWatch, stepWatch } from './watchMath.ts';
const P = WATCH_DEFAULTS;
const s = createWatch(P);
const pitch = (2*Math.PI)/P.escapeTeeth;
let lastBeats = 0, lastE = 0;
for (let f = 0; f < 10*60; f++) {
  stepWatch(s, P, 1/60);
  if (f % 30 === 29) {
    const dB = s.beats - lastBeats, dE = s.e - lastE;
    console.log(`t=${(f/60).toFixed(1)}s beats+${dB} e+${(dE/pitch).toFixed(2)}pitch amp=${s.amp.toFixed(2)} wb=${s.wb.toFixed(1)} p=${s.p.toFixed(3)} we=${s.we.toFixed(2)}`);
    lastBeats = s.beats; lastE = s.e;
  }
}
