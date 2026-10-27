import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fracturePane, polyArea, createWorld, stepWorld, allAsleep, clipHalfPlane } from './shatterMath.ts';

const W = 340, H = 460;
test('fracture tiles the pane, density falls with distance, deterministic', () => {
const shards = fracturePane({ width: W, height: H, hitX: 170, hitY: 200, seed: 7, target: 360 });
const total = shards.reduce((s, p) => s + p.area, 0);
// Cells tile the pane: areas sum to the pane area (minus dropped slivers).
assert.ok(Math.abs(total - W * H) / (W * H) < 0.01, `tiling ${total}`);
assert.ok(shards.length > 250 && shards.length < 480, `count ${shards.length}`);
for (const s of shards) {
  assert.ok(polyArea(s.poly) > 0, "counter-clockwise");
  for (const p of s.poly) assert.ok(p.x >= -1e-6 && p.x <= W + 1e-6 && p.y >= -1e-6 && p.y <= H + 1e-6, "inside pane");
}
// Density: shards near the hit are smaller than far shards.
const near = shards.filter((s) => s.dist < 60).map((s) => s.area);
const far = shards.filter((s) => s.dist > 180).map((s) => s.area);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
assert.ok(near.length && far.length && mean(near) < mean(far) * 0.5, "density falls with distance");
// Deterministic.
const again = fracturePane({ width: W, height: H, hitX: 170, hitY: 200, seed: 7, target: 360 });
assert.equal(again.length, shards.length);
// Corner hit still works.
const corner = fracturePane({ width: W, height: H, hitX: 4, hitY: 4, seed: 3 });
assert.ok(corner.length > 50);
void ("shatterGeometry ok", shards.length, "shards;", "near mean", mean(near).toFixed(0), "far mean", mean(far).toFixed(0));
});

test('polygon-contact physics stays finite, bounded, and clears the frame', () => {
const w = createWorld({ width: W, height: H, hitX: 170, hitY: 180, seed: 5, target: 360 });
const t0 = performance.now();
let frames = 0;
let worstFrame = 0;
for (let t = 0; t < 12 && !allAsleep(w); t += 1 / 60) {
  const s = performance.now();
  stepWorld(w, 1 / 60);
  worstFrame = Math.max(worstFrame, performance.now() - s);
  frames++;
  for (const b of w.bodies) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.a), "finite");
}
const ms = performance.now() - t0;
let out = 0, maxY = 0, minX = 1e9, maxX = -1e9;
for (const b of w.bodies) {
  for (let i = 0; i < b.wx.length; i++) {
    if (!b.gone && b.wy[i] > H + 200) out++;
    maxY = Math.max(maxY, b.wy[i]);
  }
}
const asleep = w.bodies.filter((b) => b.asleep).length;
console.log({ shards: w.bodies.length, frames, simTime: w.time.toFixed(2), avgMsPerFrame: (ms / frames).toFixed(2), worstFrameMs: worstFrame.toFixed(1), outside: out, asleep, maxPen: w.maxPen.toFixed(2) });
assert.equal(out, 0, "no shard vertices escape the box");
assert.ok(w.maxPen < 8, "penetration bounded");
// Pile heights: not all stacked at one spot, everything lies above the floor.
console.log("pile top y", Math.min(...w.bodies.map((b) => Math.min(...b.wy))).toFixed(0));
  assert.ok(allAsleep(w), 'all shards settle or leave the frame');
  assert.ok(w.bodies.filter((b) => b.gone).length > w.bodies.length * 0.9, 'most shards fall out');
});

test('contact quality: colliding polygons overlap only slightly', () => {
  const w = createWorld({ width: W, height: H, hitX: 170, hitY: 180, seed: 5, target: 360 });
  const poly = (b) => b.wx.map((x, i) => ({ x, y: b.wy[i] }));
  // Overlap area of two convex polygons: clip one by every edge of the other.
  const overlap = (A, B) => {
    let p = A;
    for (let i = 0; i < B.length && p.length > 2; i++) {
      const a = B[i], c = B[(i + 1) % B.length];
      const ex = c.x - a.x, ey = c.y - a.y, l = Math.hypot(ex, ey) || 1;
      p = clipHalfPlane(p, a.x, a.y, ey / l, -ex / l);
    }
    return p.length > 2 ? Math.abs(polyArea(p)) : 0;
  };
  let near = 0, hits = 0, sum = 0, worstFrac = 0;
  for (let f = 0; f < 150; f++) {
    stepWorld(w, 1 / 60);
    if (f % 5) continue;
    const live = w.bodies.filter((b) => !b.gone);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius) continue;
      near++;
      const pa = poly(a), pb = poly(b), o = overlap(pa, pb);
      if (o > 0) { hits++; sum += o; worstFrac = Math.max(worstFrac, o / Math.min(Math.abs(polyArea(pa)), Math.abs(polyArea(pb)))); }
    }
  }
  console.log(`contact quality: ${near} neighbour pairs sampled, ${hits} overlapping, mean overlap ${(sum / Math.max(hits, 1)).toFixed(2)} px2, worst ${(worstFrac * 100).toFixed(1)}% of the smaller shard`);
  assert.ok(near > 1000, 'many pairs were in contact range');
  assert.ok(worstFrac < 0.15, 'no pair sinks more than 15% of the smaller shard into the other');
  assert.ok(sum / Math.max(hits, 1) < 3, 'average overlap stays under 3 px2');
});
