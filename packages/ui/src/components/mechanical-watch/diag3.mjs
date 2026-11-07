import { WATCH_DEFAULTS, createWatch } from './watchMath.ts';
// manual substep trace: replicate stepWatch loop with contact logging
const P = WATCH_DEFAULTS;
const s = createWatch(P);
// reach into module internals via a tiny hack: step 1/960 s at a time via stepWatch with dtFrame=1/960
let prevE = s.e, prevWe = s.we, prevP = s.p, prevWp = s.wp, prevB = s.b, prevWb = s.wb;
for (let i = 0; i < 240; i++) {
  const f = (await import('./watchMath.ts')).stepWatch;
  f(s, P, 1/960);
  if (i % 12 === 0 || Math.abs(s.we - prevWe) > 0.5) {
    console.log(`i=${i} e=${(s.e*57.3).toFixed(1)}deg we=${s.we.toFixed(3)} p=${s.p.toFixed(4)} wp=${s.wp.toFixed(2)} b=${s.b.toFixed(2)} wb=${s.wb.toFixed(1)}`);
  }
  prevE=s.e; prevWe=s.we; prevP=s.p; prevWp=s.wp; prevB=s.b; prevWb=s.wb;
}
