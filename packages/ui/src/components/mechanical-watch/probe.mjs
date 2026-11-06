import { WATCH_DEFAULTS } from './watchMath.ts';
const P = WATCH_DEFAULTS;
// re-derive stone geometry exactly as stones() does
const ENTRY_POLAR = (-30*Math.PI)/180, EXIT_POLAR = (30*Math.PI)/180;
function stones(fork) {
  const c = Math.cos(fork), s = Math.sin(fork), F = P.forkPivot, R = P.escapeR - P.stoneIn;
  const draw = P.drawDeg*Math.PI/180, imp = P.impulseDeg*Math.PI/180;
  return [ENTRY_POLAR, EXIT_POLAR].map(pol => {
    const cx0 = R*Math.cos(pol), cy0 = R*Math.sin(pol);
    const rx = cx0-F, ry = cy0;
    const wx = rx*c - ry*s + F, wy = rx*s + ry*c;
    const radx = Math.cos(pol), rady = Math.sin(pol), tanx = -Math.sin(pol), tany = Math.cos(pol);
    const cd = Math.cos(draw), sd = Math.sin(draw);
    const lnx = (-tanx)*cd - (-tany)*sd, lny = (-tanx)*sd + (-tany)*cd;
    let ltx = lny, lty = -lnx;
    if (ltx*radx + lty*rady < 0) { ltx = -ltx; lty = -lty; }
    const ci = Math.cos(imp), si = Math.sin(imp);
    const idx = tanx*ci - tany*si, idy = tanx*si + tany*ci;
    const inx = -idy, iny = idx;
    return { pol: pol*180/Math.PI, corner:[wx,wy],
      lock: {a:[wx,wy], n:[lnx,lny], t:[ltx,lty], len:0.95},
      impulse: {a:[wx,wy], n:[inx,iny], t:[idx,idy], len:2.3} };
  });
}
function probeFace(tx, ty, f) {
  const rx = tx-f.a[0], ry = ty-f.a[1];
  return { u: rx*f.t[0]+ry*f.t[1], d: rx*f.n[0]+ry*f.n[1] };
}
const pitch = 2*Math.PI/15;
// fork at -bank (entry engaged). Sweep a tooth through the entry corner.
for (const fork of [-P.bankAngle, 0, P.bankAngle]) {
  const [en, ex] = stones(fork);
  console.log(`fork=${fork.toFixed(3)} entry corner=(${en.corner.map(v=>v.toFixed(2))}) exit corner=(${ex.corner.map(v=>v.toFixed(2))})`);
}
console.log('--- tooth sweep past entry corner, fork=-bank ---');
const [en] = stones(-P.bankAngle);
for (let deg = -40; deg <= -18; deg += 1) {
  const a = deg*Math.PI/180;
  const tx = 10*Math.cos(a), ty = 10*Math.sin(a);
  const L = probeFace(tx,ty,en.lock), I = probeFace(tx,ty,en.impulse);
  console.log(`tooth@${deg}  lock d=${L.d.toFixed(3)} u=${L.u.toFixed(3)}  impulse d=${I.d.toFixed(3)} u=${I.u.toFixed(3)}`);
}
