import { WATCH_DEFAULTS, createWatch, stepWatch } from './watchMath.ts';
const P = WATCH_DEFAULTS;
const s = createWatch(P);
const F = P.forkPivot;
const faces = [
  { ax: -5.975, ay: -17.23, tx: 0, ty: 1, nx: -1, ny: 0, len: 3.2, name: 'E-lock' },
  { ax: -5.975, ay: -17.23, tx: 1, ty: 0, nx: 0, ny: -1, len: 0.9, name: 'E-imp' },
  { ax: 4.5, ay: -16.58, tx: 1, ty: 0, nx: 0, ny: 1, len: 0.6, name: 'X-lock' },
  { ax: 5.1, ay: -16.58, tx: 0.423, ty: 0.906, nx: -0.906, ny: 0.423, len: 0.8, name: 'X-imp' },
];
function contacts() {
  const c = Math.cos(s.p), sn = Math.sin(s.p);
  const pitch = (2*Math.PI)/P.escapeTeeth;
  const hits = [];
  for (let k = 0; k < P.escapeTeeth; k++) {
    const a = s.e + k*pitch;
    const tx = P.escapeR*Math.cos(a), ty = P.escapeR*Math.sin(a);
    for (const lf of faces) {
      const ax = lf.ax*c - lf.ay*sn, ay = lf.ax*sn + lf.ay*c + F;
      const txx = lf.tx*c - lf.ty*sn, tyy = lf.tx*sn + lf.ty*c;
      const nx = lf.nx*c - lf.ny*sn, ny = lf.nx*sn + lf.ny*c;
      const rx = tx-ax, ry = ty-ay;
      const u = rx*txx + ry*tyy;
      if (u < -0.08 || u > lf.len+0.08) continue;
      const d = rx*nx + ry*ny;
      if (d <= 0.06 && d >= -0.5) hits.push(k + lf.name);
    }
  }
  return hits.join(',');
}
const pitch = (2*Math.PI)/P.escapeTeeth;
let prev = '', prevBeats = 0;
for (let i = 0; i < 960*3; i++) {
  stepWatch(s, P, 1/960);
  const cur = contacts();
  if (cur !== prev || s.beats !== prevBeats) {
    console.log(`t=${(i/960).toFixed(3)} e=${(s.e/pitch).toFixed(2)}p p=${s.p.toFixed(3)} we=${s.we.toFixed(1)} beats=${s.beats} [${cur}]`);
    prev = cur; prevBeats = s.beats;
  }
}
