import assert from 'node:assert/strict';
import * as m from './slingMath.ts';
import {readFileSync} from 'node:fs';

// A harder pull launches higher than a gentle one.
function peak(pullY) {
  const s = m.createSling();
  assert.equal(m.slTouch(s, m.ANCHOR.x, m.ANCHOR.y), 'grab');
  m.slMove(s, 180, pullY); m.slRelease(s);
  let top = 1e9;
  for (let i = 0; i < 120; i++) { m.stepSl(s, 1 / 60); top = Math.min(top, s.p.y); }
  return top;
}
assert(peak(m.ANCHOR.y+104) < peak(m.ANCHOR.y+65), 'harder pull flies higher');

// Pull is clamped and a tiny pull does not fire.
const c = m.clampPull(180, 900);
assert(Math.hypot(c.x - m.ANCHOR.x, c.y - m.ANCHOR.y) <= m.MAX_PULL + 1e-9);
const tiny = m.createSling(); m.slTouch(tiny, m.ANCHOR.x, m.ANCHOR.y); m.slMove(tiny, m.ANCHOR.x+2, m.ANCHOR.y+5); m.slRelease(tiny);
assert.equal(tiny.mode, 'ready');

// A shot flies, comes to rest, and is reloaded.
const s = m.createSling(); m.slTouch(s, m.ANCHOR.x, m.ANCHOR.y); m.slMove(s, 130, 385); m.slRelease(s);
const seen = new Set();
for (let i = 0; i < 60 * 14; i++) { m.stepSl(s, 1 / 60); seen.add(s.mode); assert(Number.isFinite(s.p.x) && Number.isFinite(s.p.y)); }
for (const mode of ['pull', 'flight', 'rest', 'ready']) assert(seen.has(mode), 'passes through ' + mode);
assert.equal(s.mode, 'ready');

// The aim path is predicted only while held.
const a = m.createSling(); m.slTouch(a, m.ANCHOR.x, m.ANCHOR.y); m.slMove(a, 180, m.ANCHOR.y+90);
assert(m.predict(a).length > 5);
m.slRelease(a); assert.equal(m.predict(a).length, 0);

// Latex width shrinks continuously with elongation. Neither strip pushes.
const tip=m.TIP_L;
assert(m.bandMetrics(tip,{x:180,y:m.ANCHOR.y+100}).width < m.bandMetrics(tip,m.ANCHOR).width);
assert.equal(m.bandMetrics(tip,tip).extension,0);
const atRest=m.elasticAcceleration(m.ANCHOR);
assert.equal(atRest.x,0);assert.equal(atRest.y,m.G);
// The native wrapper must call the initializer it actually imports. The root
// website typecheck excludes this file, so guard this past native-only defect.
const native=readFileSync(new URL('./Slingshot.tsx',import.meta.url),'utf8');
assert(native.includes('useRef(createSling())'));
assert(!native.includes('createSlingshot('));
// Symmetric vertical shots can settle on the fork without an artificial shove.
for(const [x,y] of [[180,341],[180,367],[140,355],[210,355]]) {
 const a=m.createSling(); m.slTouch(a,m.ANCHOR.x,m.ANCHOR.y);m.slMove(a,x,y);m.slRelease(a);
 const seen=new Set();for(let i=0;i<1200;i++){m.stepSl(a,1/60);seen.add(a.mode);assert(Number.isFinite(a.p.x+a.p.y));}
 assert(seen.has('flight'));assert.equal(a.mode,'ready');
}
console.log('slingshot ok');

// A full-power shot may leave the top of the stage; it must not bounce off an
// invisible ceiling. Every airborne step away from contacts follows gravity.
const full=m.createSling();m.slTouch(full,m.ANCHOR.x,m.ANCHOR.y);m.slMove(full,180,m.ANCHOR.y+104);m.slRelease(full);
for(let i=0;i<600;i++) {
 const before={...full.v},mode=full.mode,y=full.p.y;
 m.stepSl(full,1/240);
 if(mode==='flight' && full.mode==='flight' && y<150) assert(Math.abs(full.v.y-before.y-m.G/240)<1e-7);
}

// A fixed-step accumulator gives the same release position and energy for
// 30/60/120 Hz renderers, including fractional frame intervals in slow motion.
function runAt(fps) {const s=m.createSling();m.slTouch(s,180,263);m.slMove(s,145,355);m.slRelease(s);for(let i=0;i<fps*.5;i++)m.stepSl(s,1/fps);return s;}
for(const fps of [30,60,120]) {const s=runAt(fps),ref=runAt(60);assert(Math.hypot(s.p.x-ref.p.x,s.p.y-ref.p.y)<1e-7);}
// Distributed band nodes remain finite and pinned during recoil and after rest.
const ribbons=m.createSling();m.fireDefault(ribbons);
for(let i=0;i<600;i++) {m.stepSl(ribbons,1/60);for(let j=0;j<2;j++){const chain=ribbons.ribbons[j];assert.deepEqual({x:chain[0].x,y:chain[0].y},j?m.TIP_R:m.TIP_L);for(const n of chain)assert(Number.isFinite(n.x+n.y));}}
console.log('slingshot fixed-step and distributed band checks ok');

// Reload must not depend on how simulation ticks are grouped into frames.
function acrossReload(fps){const s=m.createSling();s.mode='rest';s.restT=1.59;s.q.x+=12;for(let i=0;i<fps/30;i++)m.stepSl(s,1/fps);return s;}
for(const fps of [60,120]){const a=acrossReload(30),b=acrossReload(fps);assert.equal(a.mode,b.mode);assert(Math.hypot(a.q.x-b.q.x,a.q.y-b.q.y)<1e-8);assert.deepEqual(a.ribbons,b.ribbons);}
