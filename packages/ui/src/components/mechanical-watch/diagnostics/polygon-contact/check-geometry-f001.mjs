// Locking-support check: sweep wheel angle, find the FIRST touch (gap crosses
// zero) between any tooth and the entry slab; report contact point vs slab
// faces, and exit-slab clearance at that configuration.
import { toothPolygon, slabPolygon, polyDist } from './polygon-geometry.mjs';
const TEETH = 15, pitch = 2 * Math.PI / TEETH;
const p = -0.883 * Math.PI / 180;
const entry = slabPolygon('entry', p), exit = slabPolygon('exit', p);
const dMin = e0 => Math.min(...Array.from({ length: TEETH }, (_, k) => polyDist(toothPolygon(e0 + k * pitch), entry)));
// approach: start from a separated angle, advance until touch
let prevE = 0, prevD = dMin(0), hit = null;
for (let e0 = 0; e0 < pitch; e0 += pitch / 1440) {
  const d = dMin(e0);
  if (prevD > 0 && d <= 0) { hit = (prevE + e0) / 2; break; }
  prevE = e0; prevD = d;
}
if (hit === null) { console.log('no entry contact across a full pitch - geometry does NOT support locking as reconstructed'); process.exit(0); }
const dExit = Math.min(...Array.from({ length: TEETH }, (_, k) => polyDist(toothPolygon(hit + k * pitch), exit)));
// which tooth + where on the slab (project centroid-to-contact onto slab axes)
let bk = 0, bd = Infinity;
for (let k = 0; k < TEETH; k++) { const d = polyDist(toothPolygon(hit + k * pitch), entry); if (d < bd) { bd = d; bk = k; } }
console.log('first entry touch at wheel e0 =', hit.toFixed(4), 'tooth', bk);
console.log('exit slab min distance then:', dExit.toFixed(4), dExit > 0.1 ? '(clear)' : '(NOT clear)');
