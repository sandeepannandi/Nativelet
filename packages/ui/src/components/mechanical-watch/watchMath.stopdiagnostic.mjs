// Negative-evidence diagnostic, not an acceptance test. No production changes.
// Run with Node 22+ from this directory: node watchMath.stopdiagnostic.mjs
import { WATCH_DEFAULTS as p, createWatch, stepWatch, windCrown } from './watchMath.ts';
const results=[];
for (const kind of ['natural-unwind','empty-running','empty-rest','powered-rest','one-restart']) {
  const s=createWatch(p);
  if (kind!=='natural-unwind') s.wind=kind==='powered-rest'?1:0;
  if (['empty-rest','powered-rest','one-restart'].includes(kind))
    Object.assign(s,{b:0,wb:0,amp:0,stopped:true,seeded:false});
  if (kind==='one-restart') windCrown(s,p,1);
  const initial={...s}; let last={...s}; const windows=[];
  const duration=kind==='natural-unwind'?300:60;
  for (let sec=1;sec<=duration;sec++) {
    for (let f=0;f<60;f++) stepWatch(s,p,1/60);
    if (sec%15===0) {
      windows.push({t:s.t,wind:s.wind,amp:s.amp,wb:s.wb,stopped:s.stopped,
        seeded:s.seeded,counterIncrements:s.beats-last.beats,
        escapeRadians:s.e-last.e,balanceRadians:s.b});
      last={...s};
    }
  }
  results.push({kind,initial,end:{...s},windows});
}
console.log(JSON.stringify({scope:'Diagnostic only. Counter is not a motion oracle. See STATUS Run 12 for known failures.',results},null,2));
