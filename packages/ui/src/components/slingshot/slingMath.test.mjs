import assert from 'node:assert/strict';
import * as m from './slingMath.ts';

// A harder pull launches higher than a gentle one.
function peak(pullY) {
  const s = m.createSling();
  assert.equal(m.slTouch(s, 180, 290), 'grab');
  m.slMove(s, 180, pullY); m.slRelease(s);
  let top = 1e9;
  for (let i = 0; i < 120; i++) { m.stepSl(s, 1 / 60); top = Math.min(top, s.p.y); }
  return top;
}
assert(peak(394) < peak(350), 'harder pull flies higher');

// Pull is clamped and a tiny pull does not fire.
const c = m.clampPull(180, 900);
assert(Math.hypot(c.x - m.ANCHOR.x, c.y - m.ANCHOR.y) <= m.MAX_PULL + 1e-9);
const tiny = m.createSling(); m.slTouch(tiny, 180, 290); m.slMove(tiny, 182, 295); m.slRelease(tiny);
assert.equal(tiny.mode, 'ready');

// A shot flies, comes to rest, and is reloaded.
const s = m.createSling(); m.slTouch(s, 180, 290); m.slMove(s, 130, 385); m.slRelease(s);
const seen = new Set();
for (let i = 0; i < 60 * 14; i++) { m.stepSl(s, 1 / 60); seen.add(s.mode); assert(Number.isFinite(s.p.x) && Number.isFinite(s.p.y)); }
for (const mode of ['pull', 'flight', 'rest', 'ready']) assert(seen.has(mode), 'passes through ' + mode);
assert.equal(s.mode, 'ready');

// The aim path is predicted only while held.
const a = m.createSling(); m.slTouch(a, 180, 290); m.slMove(a, 180, 380);
assert(m.predict(a).length > 5);
m.slRelease(a); assert.equal(m.predict(a).length, 0);

// Band thins as it stretches and the scene always draws.
const r = m.createSling();
const w0 = m.slScene(r).filter(k => k.stroke && k.color === '#262523')[0].stroke;
m.slTouch(r, 180, 290); m.slMove(r, 180, 394);
const w1 = m.slScene(r).filter(k => k.stroke && k.color === '#262523')[0].stroke;
assert(w1 < w0, 'band thins under tension');
console.log('slingshot ok');
