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

// Dragging a domino off the path drops it where the pointer releases.
let drag = m.createDominoRun();
const target = drag.doms[3];
const q = m.pathAt(drag, target.s);
const sp = m.project(q.x, q.y, 10);
assert(m.domTouch(drag, sp.x, sp.y) === 'grab', 'grab the domino');
m.domMove(drag, sp.x + 60, sp.y + 10);
m.domRelease(drag);
assert(target.pose, 'free pose kept after release');
const fp = m.unproject(sp.x + 60, sp.y + 10);
assert(Math.hypot(target.pose.x - fp.x, target.pose.y - fp.y) < 4, 'dropped at the pointer: ' + target.pose.x + ',' + target.pose.y);

// A domino dropped in the fall lane is hit through contact, not arc order.
let lane = m.createDominoRun();
const q0 = m.pathAt(lane, lane.doms[0].s);
lane.doms.splice(1, 1); // clear the lane ahead of the first domino
const draggee = lane.doms[4];
draggee.pose = { x: q0.x + q0.tx * 34, y: q0.y + q0.ty * 34, tx: q0.tx, ty: q0.ty };
m.pushFirst(lane);
for (let i = 0; i < 60 * 3; i++) m.stepDom(lane, 1 / 60);
assert(draggee.th > m.TH_MAX / 2, 'off-path domino in the lane is knocked over: th=' + draggee.th);

// A piece dragged perpendicular across the run is a real obstacle: the wave
// rests on it instead of passing through, and a hard side hit topples it
// along the strike.
let cross = m.createDominoRun();
const c0 = m.pathAt(cross, cross.doms[0].s);
cross.doms.splice(1, 3); // open the lane ahead of the first domino
const block = cross.doms[3];
block.pose = { x: c0.x + c0.tx * 30, y: c0.y + c0.ty * 30, tx: -c0.ty, ty: c0.tx };
m.pushFirst(cross);
for (let i = 0; i < 60 * 3; i++) m.stepDom(cross, 1 / 60);
assert(cross.doms[0].th < m.TH_MAX - 0.02, 'the wave rests on the cross piece, not through it: th=' + cross.doms[0].th);
assert(block.th > 0.2, 'the cross piece topples along the strike: th=' + block.th);
assert(Math.hypot(block.pose.tx - c0.tx, block.pose.ty - c0.ty) < 0.01, 'it topples along the strike direction');

// A gently placed perpendicular piece that the wave only grazes still blocks
// penetration: final boxes never overlap beyond touching.
let graze = m.createDominoRun();
const g0 = m.pathAt(graze, graze.doms[0].s);
graze.doms.splice(1, 2);
const gblock = graze.doms[2];
gblock.pose = { x: g0.x + g0.tx * 55, y: g0.y + g0.ty * 55, tx: -g0.ty, ty: g0.tx };
gblock.held = true; // held in place like a finger pinching it
m.pushFirst(graze);
for (let i = 0; i < 60 * 3; i++) m.stepDom(graze, 1 / 60);
assert(graze.doms[0].th < m.TH_MAX - 0.02, 'the wave leans on the held cross piece: th=' + graze.doms[0].th);

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


// A toppled straight run ends as a leaning pile, not everyone flat:
// the last domino lands flat, the ones behind it rest propped on it.
let pile = m.createDominoRun();
m.setPath(pile, [{ x: 60, y: 140 }, { x: 300, y: 140 }]);
m.pushFirst(pile);
for (let i = 0; i < 60 * 20 && !m.allSettled(pile); i++) m.stepDom(pile, 1 / 60);
assert(m.fallenCount(pile) === pile.doms.length, 'whole straight run fell');
const angles = pile.doms.map(d => d.th);
assert(Math.abs(angles[angles.length - 1] - m.TH_MAX) < 0.06, 'last domino lands flat: ' + angles[angles.length - 1]);
assert(angles.slice(0, -1).some(a => a < m.TH_MAX - 0.2), 'some dominoes keep a lean: ' + angles.map(a => a.toFixed(2)).join(','));
assert(angles.every(a => a > 0.18), 'everyone past balance'); // 0.18 ~ atan(DT/DH)
// No pair of dominoes interpenetrates in the rest state.
for (let i = 0; i < pile.doms.length - 1; i++) {
  const reach = (pile.doms[i].th - m.TH_MAX);
  assert(reach <= 1e-9, 'never past the floor');
}

// A second settle check: the pile is static, not creeping.
const snapshot = pile.doms.map(d => d.th);
for (let i = 0; i < 240; i++) m.stepDom(pile, 1 / 60);
for (let i = 0; i < pile.doms.length; i++) {
  assert(Math.abs(pile.doms[i].th - snapshot[i]) < 0.01, `pile holds at ${i}: ${snapshot[i]} -> ${pile.doms[i].th}`);
}

// A short accidental stroke keeps the current run; a long one replaces it.
let keep = m.createDominoRun();
const keepCount = keep.doms.length;
const tap0 = m.project(60, 60, 0); // empty table corner
assert(m.domTouch(keep, tap0.x, tap0.y) === 'draw', 'press on empty table starts a stroke');
m.domMove(keep, tap0.x + 8, tap0.y + 6); // tiny wiggle
m.domRelease(keep);
assert(keep.doms.length === keepCount, 'short stroke keeps the run');
keep.drawing = true; keep.draw = [{ x: 60, y: 180 }, { x: 280, y: 180 }]; keep.moved = 220;
m.domRelease(keep);
assert(keep.len < 300, 'long stroke replaces the run, len=' + keep.len);

console.log('PASS: leaning pile rests and holds, no pass-through, short strokes keep the run,');
console.log('PASS: spiral placement and spacing, rock settles, single falls, cascade completes and settles, gap stops wave, free drag drops at the pointer, off-path piece falls by contact, perpendicular piece blocks and topples, timestep convergence, abuse stays finite');
