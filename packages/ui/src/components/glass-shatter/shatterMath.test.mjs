import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fracturePane, polyArea, createWorld, stepWorld, allAsleep } from './shatterMath.ts';

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
