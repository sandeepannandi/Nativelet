import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production impact block, not a copy of its age/radius formula.
const source = fs.readFileSync(new URL('../../../../../app/components/glass-shatter.tsx', import.meta.url), 'utf8');
const impact = source.slice(source.indexOf('if (struckAt >= 0) {'), source.indexOf('if (dust.length) {'));
function drawImpact(now, struckAt) {
  const radii = [];
  const ctx = {
    createRadialGradient(...args) {
      assert.ok(args[5] >= 0, `negative radial gradient radius: ${args[5]}`);
      radii.push(args[5]);
      return { addColorStop() {} };
    },
    beginPath() {}, arc() {}, fill() {}, fillRect() {},
  };
  vm.runInNewContext(impact, { now, struckAt, ctx, hitX: 80, hitY: 130, craterSeed: 1, mulberry32: () => () => 0.5 });
  return radii;
}
test('a queued animation frame older than the strike cannot crash the impact flash', () => {
  assert.deepEqual(drawImpact(1000, 1048), [22]);
  assert.deepEqual(drawImpact(1000, 1300), [22]);
});
test('impact flash renders normally and expires after its duration', () => {
  assert.ok(drawImpact(1100, 1000)[0] > 22);
  assert.deepEqual(drawImpact(1600, 1000), []);
});
