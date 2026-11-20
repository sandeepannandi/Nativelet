import assert from 'node:assert/strict';
import * as m from './potteryMath.ts';
const vol = s => s.r.reduce((a, r) => a + m.sliceHeight(r) * Math.PI * r * r, 0);
let s = m.createPot(); const v0 = vol(s), h0 = m.potHeight(s.r);
// outside the clay: no grab
assert.equal(m.potTouch(s, 10, 20), false);
// press in the middle of the side: radius there falls, clay climbs, volume is conserved
const I = 30, mid = m.POT_BASE - m.potCenters(s.r).centers[I];
assert(m.potTouch(s, m.POT_CX + s.r[I] + 4, mid));
const r30 = s.r[I];
for (let i = 0; i < 90; i++) { m.potMove(s, m.POT_CX + 34, mid, 1 / 60); m.stepPot(s, 1 / 60); }
assert(s.r[I] < r30 - 20, 'waist forms');
assert(m.potHeight(s.r) > h0 + 20, 'clay climbs as it narrows');
assert(Math.abs(vol(s) - v0) < 1e-6, 'slice volume conserved');
const wob = m.potWobble(s); assert(wob > 0.2, 'push excites wobble: ' + wob);
m.potRelease(s);
let t = 0; while (m.potWobble(s) > 0.05 && t < 20) { m.stepPot(s, 1 / 60); t += 1 / 60; }
assert(t < 12, 'wobble settles in ' + t);
// pull the waist back out: radius grows and total height falls
const hn = m.potHeight(s.r);
m.potTouch(s, m.POT_CX + s.r[I], m.POT_BASE - m.potCenters(s.r).centers[I]);
for (let i = 0; i < 120; i++) { m.potMove(s, m.POT_CX + 70, m.POT_BASE - m.potCenters(s.r).centers[I], 1 / 60); m.stepPot(s, 1 / 60); }
assert(m.potHeight(s.r) < hn, 'wall sinks when pulled out');
// height cap and radius bounds under abuse
s = m.createPot();
for (let k = 0; k < 40; k++) {
  m.potTouch(s, m.POT_CX + 80, m.POT_BASE - 40);
  for (let j = 0; j < 30; j++) { m.potMove(s, m.POT_CX + 20 + 90 * Math.sin(j + k), m.POT_BASE - 30 - ((j * 37 + k * 11) % 300), 1 / 60); m.stepPot(s, 1 / 60); }
  m.potRelease(s);
}
assert(m.potHeight(s.r) <= m.POT_HMAX + 1e-6, 'height cap ' + m.potHeight(s.r));
assert(s.r.every(v => v >= m.POT_RMIN - 1e-9 && v <= m.POT_RMAX + 1e-9 && Number.isFinite(v)));
assert(s.ex.every(Number.isFinite) && m.potWobble(s) <= 16.0001);
assert(Math.abs(vol(s) - v0) < 1e-4);
assert(m.potScene(s).every(k => !k.path.includes('NaN')));
// timestep convergence of wobble decay and rotation
let a = m.createPot(), b = m.createPot(); a.vx[40] = 50; b.vx[40] = 50;
for (let i = 0; i < 60; i++) m.stepPot(a, 1 / 60); for (let i = 0; i < 120; i++) m.stepPot(b, 1 / 120);
assert(Math.abs(a.theta - b.theta) < 1e-6 && Math.abs(a.ex[40] - b.ex[40]) < 1e-6);
// reduced motion: no wobble
a.vx[40] = 50; m.stepPot(a, .1, true); assert.equal(m.potWobble(a), 0);
console.log('PASS: no grab off clay, waist and climb, volume conserved, wobble excites and settles, pull out sinks wall, height cap, bounds, finite geometry, timestep convergence, reduced motion');
