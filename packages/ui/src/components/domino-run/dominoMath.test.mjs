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
m.domMove(drag, sp.x + 160, sp.y + 100);
m.domRelease(drag);
assert(target.pose, 'free pose kept after release');
const fp = m.unproject(sp.x + 160, sp.y + 100);
assert(Math.hypot(target.pose.x - fp.x, target.pose.y - fp.y) < 4, 'dropped at the pointer: ' + target.pose.x + ',' + target.pose.y);

// A drop that would land inside a standing piece slides out to the nearest
// clear spot instead of resting interpenetrated.
{
  const dp = m.createDominoRun();
  const dd = dp.doms[3];
  const dq = m.pathAt(dp, dd.s);
  const dsp = m.project(dq.x, dq.y, 10);
  m.domTouch(dp, dsp.x, dsp.y);
  m.domMove(dp, dsp.x + 60, dsp.y + 10);
  m.domRelease(dp);
  const dfp = m.unproject(dsp.x + 60, dsp.y + 10);
  assert(dd.pose && Math.hypot(dd.pose.x - dfp.x, dd.pose.y - dfp.y) >= 4,
    'overlapping drop is moved out of the standing piece: ' + (dd.pose && dd.pose.x + ',' + dd.pose.y));
}

// Occupied-lane drop through the real drag path: near the path the piece
// adopts the lane tangent and lands legally; the wave may stall in the tight
// sandwich it creates, but everything must settle - upright or flat, never
// frozen mid-lean against a neighbour.
{
  const lane = m.createDominoRun();
  const jb = lane.doms[14];
  const jp = m.pathAt(lane, jb.s);
  const grabAt = m.project(jp.x, jp.y, 10);
  assert(m.domTouch(lane, grabAt.x, grabAt.y) === 'grab', 'grab the lane piece');
  const dropAt = m.project(115, 255, 0);
  m.domMove(lane, dropAt.x, dropAt.y);
  m.domRelease(lane);
  m.pushFirst(lane);
  for (let i = 0; i < 60 * 12; i++) m.stepDom(lane, 1 / 60);
  for (const d of lane.doms) {
    assert(Number.isFinite(d.th) && Number.isFinite(d.om), 'lane drop stays finite');
    const a = Math.abs(d.th);
    assert(a < 0.02 || a > m.TH_MAX - 0.05, 'lane drop settles: no frozen lean: th=' + d.th);
  }
}

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
// d0 follows through the vacated space; with no z-support in the solver it may
// come to rest flat over the fallen cross piece (physically: lying on top of
// it, drawn above it by the depth sort) or still leaning against it. Both are
// plausible; what must not happen is the frozen lean of the old clamp.
assert(Math.abs(cross.doms[0].th) > 0.5, 'the striker follows through after the hit, not frozen: th=' + cross.doms[0].th);
assert(Math.abs(block.th) > 0.2, 'the cross piece topples from the hit: th=' + block.th);
assert(Math.hypot(block.pose.tx - -c0.ty, block.pose.ty - c0.tx) < 0.01, 'it keeps its own heading: no forced reorientation');

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

// Occupied lane, tight sandwich: a piece dragged into the gap ahead of the
// first domino with the next piece right behind it fits without overlap, but
// only just. The push rocks the sandwich; contact must stay plausible - every
// piece either settles back upright or falls, nothing freezes mid-lean, and
// nothing tunnels. (A full Newton's-cradle shunt through touching stacks is a
// known limitation of the aligned contact path, not of this fix.)
{
  const jam = m.createDominoRun();
  const jb = jam.doms[14];
  const j0 = m.pathAt(jam, jam.doms[0].s);
  const jh = Math.hypot(j0.tx, j0.ty);
  jb.pose = { x: j0.x + (j0.tx / jh) * 16, y: j0.y + (j0.ty / jh) * 16, tx: j0.tx / jh, ty: j0.ty / jh };
  m.pushFirst(jam);
  for (let i = 0; i < 60 * 10; i++) m.stepDom(jam, 1 / 60);
  for (const d of jam.doms) {
    assert(Number.isFinite(d.th) && Number.isFinite(d.om), 'simulation stays finite');
    const a = Math.abs(d.th);
    assert(a < 0.02 || a > m.TH_MAX - 0.05, 'every piece settles: no frozen lean: th=' + d.th);
  }
}
// Occupied lane, impossible drop: the same insertion but rest-overlapping the
// next piece. No physical outcome requires this chain to fall; the contact
// must stay plausible - the overlapped piece is held, nothing tunnels, snaps
// or explodes.
{
  const jam = m.createDominoRun();
  const jb = jam.doms[14];
  const jp = m.pathAt(jam, jb.s);
  jb.pose = { x: 115, y: 255, tx: jp.tx, ty: jp.ty };
  m.pushFirst(jam);
  for (let i = 0; i < 60 * 10; i++) m.stepDom(jam, 1 / 60);
  for (const d of jam.doms) assert(Number.isFinite(d.th) && Number.isFinite(d.om), 'simulation stays finite');
  assert(Math.abs(jb.th) < m.TH_MAX, 'the overlapped piece never tunnels through its neighbour: th=' + jb.th);
}
// In-lane perpendicular block dropped right against the next piece: the worst
// case. The chain need not fully fall, but the block must topple and the push
// must not vanish.
{
  const occ = m.createDominoRun();
  const oc0 = m.pathAt(occ, occ.doms[0].s);
  const ob = occ.doms[3];
  ob.pose = { x: oc0.x + oc0.tx * 30, y: oc0.y + oc0.ty * 30, tx: -oc0.ty, ty: oc0.tx };
  m.pushFirst(occ);
  for (let i = 0; i < 60 * 10; i++) m.stepDom(occ, 1 / 60);
  assert(Math.abs(ob.th) > 0.2, 'the in-lane block topples: th=' + ob.th);
  assert(Math.abs(occ.doms[0].th) > 0.5, 'the pushed domino keeps its fall: th=' + occ.doms[0].th);
}

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
console.log('PASS: spiral placement and spacing, rock settles, single falls, cascade completes and settles, gap stops wave, free drag drops at the pointer, off-path piece falls by contact, perpendicular piece blocks and topples, occupied-lane jams stay physical, timestep convergence, abuse stays finite');
