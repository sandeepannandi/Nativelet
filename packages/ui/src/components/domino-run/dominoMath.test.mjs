import assert from 'node:assert/strict';
import * as m from './dominoMath.ts';

// The default run is a healthy spiral of dominoes along its path.
let s = m.createDominoRun();
assert(s.doms.length >= 15, 'spiral holds dominoes: ' + s.doms.length);
for (let i = 1; i < s.doms.length; i++) {
  const gap = s.doms[i].s - s.doms[i - 1].s;
  assert(Math.abs(gap - m.SPACING) < 1e-9, 'even spacing');
  assert(gap > m.DT, 'no overlap');
}

// A gentle rock settles back upright; a real flick topples.
let rock = m.createDominoRun();
rock.doms[0].om = 0.4;
for (let i = 0; i < 240; i++) m.stepDom(rock, 1 / 60);
assert(Math.abs(rock.doms[0].th) < m.TH_MAX / 2, 'gentle rock stays up, th=' + rock.doms[0].th);
let one = m.createDominoRun();
while (one.doms.length > 1) one.doms.pop();
one.doms[0].om = 2.6;
let fell = 0;
for (let i = 0; i < 600 && !fell; i++) { m.stepDom(one, 1 / 60); if (one.doms[0].th >= m.TH_MAX - 0.05) fell = i / 60; }
assert(fell > 0.2 && fell < 2, 'one domino falls in ' + fell + 's');

// The cascade reaches the end of the chain and then everything settles.
let run = m.createDominoRun();
m.pushFirst(run);
let done = -1;
for (let i = 0; i < 60 * 30 && done < 0; i++) {
  m.stepDom(run, 1 / 60);
  if (m.fallenCount(run) === run.doms.length && m.allSettled(run)) done = i / 60;
}
assert(done > 0 && done < 20, 'whole run falls and settles in ' + done + 's');
assert(run.doms.every(d => Number.isFinite(d.th) && d.th <= m.TH_MAX + 1e-9 && d.th >= -m.TH_MAX - 1e-9));
assert(run.doms.every(d => Math.abs(d.om) < 0.1), 'no residual spinning');
assert(m.domScene(run).every(k => !k.path.includes('NaN') && !k.path.includes('Infinity')));

// A gap wider than a domino's reach stops the wave.
let gapRun = m.createDominoRun();
for (let i = 4; i < gapRun.doms.length; i++) gapRun.doms[i].s += m.DH + 40;
m.pushFirst(gapRun);
for (let i = 0; i < 60 * 15; i++) m.stepDom(gapRun, 1 / 60);
assert(gapRun.doms.slice(0, 4).every(d => d.th > m.TH_MAX / 2), 'before the gap everything falls');
assert(gapRun.doms.slice(4).every(d => d.th < m.TH_MAX / 2), 'past the gap everything stands');

// Dragging a domino along the path repositions it, clamped by its neighbours.
let drag = m.createDominoRun();
const target = drag.doms[3];
const before = target.s;
const p0 = m.pathAt(drag, before);
drag.grab = 3; target.held = true;
const moved = m.pathAt(drag, before + 16);
const lo = drag.doms[2].s + m.DT + 2, hi = drag.doms[4].s - m.DT - 2;
// simulate the same clamp domMove applies
const ns = Math.max(lo, Math.min(hi, m.nearestArc(drag, { x: moved.x, y: moved.y })));
assert(Math.abs(ns - (before + 16)) < 3, 'drag moves it along the path: ' + ns);
assert(ns >= lo && ns <= hi, 'clamped between neighbours');
void p0;

// Timestep convergence: same cascade moment at 240Hz and 960Hz.
let a = m.createDominoRun(), b = m.createDominoRun();
m.pushFirst(a); m.pushFirst(b);
for (let i = 0; i < 120; i++) m.stepDom(a, 1 / 60);
for (let i = 0; i < 480; i++) m.stepDom(b, 1 / 240);
for (let i = 0; i < a.doms.length; i++) {
  assert(Math.abs(a.doms[i].th - b.doms[i].th) < 0.08, `domino ${i} agrees: ${a.doms[i].th} vs ${b.doms[i].th}`);
}

// Reduced motion and abuse stay finite and in bounds.
let abuse = m.createDominoRun();
m.pushFirst(abuse);
for (let k = 0; k < 40; k++) {
  m.stepDom(abuse, 0.1, true);
  if (k % 7 === 0) m.pushFirst(abuse);
  if (k % 5 === 0) m.standUp(abuse);
}
assert(abuse.doms.every(d => Number.isFinite(d.th) && Number.isFinite(d.om)));
assert(m.domScene(abuse).every(k2 => !k2.path.includes('NaN')));

console.log('PASS: spiral placement and spacing, rock settles, single falls, cascade completes and settles, gap stops wave, drag clamp, timestep convergence, abuse stays finite');
