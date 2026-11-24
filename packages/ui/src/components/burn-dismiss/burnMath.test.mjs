import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASH_STRIDE,
  BURN_DEFAULTS,
  EMBER_STRIDE,
  burnAt,
  burnPointerDown,
  burnPointerUp,
  burntFraction,
  createBurn,
  fbm2,
  hash01,
  packBurn,
  rand,
  startRestore,
  stepBurn,
} from './burnMath.ts';

const CFG = { cols: 96, rows: 128, width: 340, height: 460 };
const OPTS = { ...BURN_DEFAULTS };

function fresh(seed) {
  return createBurn(CFG, OPTS, seed);
}

function run(sim, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepBurn(sim, CFG, dt, OPTS);
}

test('createBurn starts unburnt with deterministic fuel', () => {
  const a = fresh();
  const b = fresh();
  assert.equal(a.mode, 0);
  assert.equal(a.burnt, 0);
  assert.equal(burntFraction(a), 0);
  assert.deepEqual(Array.from(a.fuel.slice(0, 64)), Array.from(b.fuel.slice(0, 64)));
  for (let i = 0; i < 200; i++) assert.ok(a.fuel[i] >= 0.8 && a.fuel[i] <= 1.4);
});

test('hash01, rand and fbm2 are deterministic and bounded', () => {
  const s = fresh();
  for (let i = 0; i < 300; i++) {
    const h = hash01(i, 7);
    assert.ok(h >= 0 && h < 1);
    const r = rand(s);
    assert.ok(r >= 0 && r < 1);
    const n = fbm2(i * 0.1, i * 0.05, 3);
    assert.ok(n >= 0 && n <= 1.01);
  }
  const a = fresh();
  const b = fresh();
  assert.equal(rand(a), rand(b));
});

test('a touch ignites the core and the front spreads outward', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  assert.equal(s.mode, 1);
  const ci = Math.floor(230 / (CFG.height / CFG.rows)) * CFG.cols + Math.floor(170 / (CFG.width / CFG.cols));
  assert.ok(s.igniteT[ci] >= 0);
  run(s, 2);
  assert.ok(s.burnt > 0, 'some cells fully burnt after 2s');
  run(s, 1.5);
  // The fire reached cells away from the core.
  const far = Math.floor(200 / (CFG.height / CFG.rows)) * CFG.cols + Math.floor(120 / (CFG.width / CFG.cols));
  assert.ok(s.igniteT[far] >= 0, 'front spread at least 50px');
});

test('burn level is a pure function of the clock', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  run(s, 1);
  for (let i = 0; i < s.igniteT.length; i++) {
    const b = burnAt(s, i);
    assert.ok(b >= 0 && b <= 1);
  }
});

test('holding keeps feeding heat; release does not stop the fire', () => {
  const held = fresh();
  burnPointerDown(held, CFG, 170, 230, OPTS);
  run(held, 1.5);
  const heldIgnited = held.igniteT.reduce((acc, t) => acc + (t >= 0 ? 1 : 0), 0);
  burnPointerUp(held);
  run(held, 2);
  const afterRelease = held.burnt;
  assert.ok(afterRelease > 0);

  const tapped = fresh();
  burnPointerDown(tapped, CFG, 170, 230, OPTS);
  burnPointerUp(tapped);
  run(tapped, 1.5);
  const tapIgnited = tapped.igniteT.reduce((acc, t) => acc + (t >= 0 ? 1 : 0), 0);
  assert.ok(heldIgnited > tapIgnited, 'a held finger ignites a wider area than a tap');
});

test('fire climbs faster upward than downward', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  run(s, 2.5);
  let up = 0;
  let down = 0;
  for (let r = 0; r < CFG.rows; r++) {
    for (let c = 0; c < CFG.cols; c++) {
      const i = r * CFG.cols + c;
      if (s.igniteT[i] < 0) continue;
      const y = (r + 0.5) * (CFG.height / CFG.rows);
      if (y < 230 - 30) up += 1;
      if (y > 230 + 30) down += 1;
    }
  }
  assert.ok(up > down, `up ${up} should beat down ${down}`);
});

test('restore rewinds the front back to a pristine card', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  run(s, 3);
  assert.ok(s.burnt > 0);
  startRestore(s);
  assert.equal(s.mode, 2);
  run(s, 6);
  assert.equal(s.mode, 0);
  assert.equal(s.burnt, 0);
  assert.equal(burntFraction(s), 0);
  for (let i = 0; i < s.igniteT.length; i++) assert.equal(s.igniteT[i], -1);
});

test('a touch during restore drops the un-burnt future', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  run(s, 2);
  startRestore(s);
  run(s, 0.5);
  burnPointerDown(s, CFG, 60, 60, OPTS);
  assert.equal(s.mode, 1);
  for (let i = 0; i < s.igniteT.length; i++) {
    assert.ok(s.igniteT[i] < 0 || s.igniteT[i] <= s.clock + 1e-6);
  }
});

test('two runs with the same inputs match frame for frame', () => {
  const a = fresh();
  const b = fresh();
  burnPointerDown(a, CFG, 100, 300, OPTS);
  burnPointerDown(b, CFG, 100, 300, OPTS);
  burnPointerUp(a);
  burnPointerUp(b);
  run(a, 2.5);
  run(b, 2.5);
  assert.deepEqual(Array.from(a.igniteT.slice(0, 400)), Array.from(b.igniteT.slice(0, 400)));
  assert.equal(a.emberCount, b.emberCount);
  assert.deepEqual(Array.from(a.embers.slice(0, 80)), Array.from(b.embers.slice(0, 80)));
});

test('embers and ash stay finite, capped and inside their lifetimes', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  run(s, 6);
  assert.ok(s.emberCount > 0, 'embers spawned');
  assert.ok(s.ashCount > 0, 'ash spawned');
  assert.ok(s.emberCount <= OPTS.maxEmbers);
  assert.ok(s.ashCount <= OPTS.maxAsh);
  for (let i = 0; i < s.emberCount * EMBER_STRIDE; i++) assert.ok(Number.isFinite(s.embers[i]));
  for (let i = 0; i < s.ashCount * ASH_STRIDE; i++) assert.ok(Number.isFinite(s.ash[i]));
});

test('the whole card can burn away', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  // Hold in the middle so the fire never starves.
  run(s, 30);
  burnPointerUp(s);
  run(s, 20);
  assert.equal(s.burnt, CFG.cols * CFG.rows, 'every cell consumed');
  assert.equal(burntFraction(s), 1);
});

test('packBurn encodes burn, glow and crack bands', () => {
  const s = fresh();
  burnPointerDown(s, CFG, 170, 230, OPTS);
  burnPointerUp(s);
  run(s, 1.2);
  const bytes = packBurn(s, CFG, new Uint8Array(CFG.cols * CFG.rows * 4));
  let glowCells = 0;
  let burntCells = 0;
  for (let i = 0; i < CFG.cols * CFG.rows; i++) {
    const b = bytes[i * 4];
    if (bytes[i * 4 + 1] > 0) glowCells += 1;
    if (b === 255) burntCells += 1;
    assert.equal(bytes[i * 4 + 3], 255);
  }
  assert.ok(glowCells > 0, 'glow band present');
  assert.ok(burntCells > 0, 'consumed cells present');
});

test('slow motion scaling is the caller multiplying dt', () => {
  const a = fresh();
  const b = fresh();
  burnPointerDown(a, CFG, 170, 230, OPTS);
  burnPointerDown(b, CFG, 170, 230, OPTS);
  burnPointerUp(a);
  burnPointerUp(b);
  run(a, 1);
  const steps = Math.round(1 / (1 / 60));
  for (let i = 0; i < steps; i++) stepBurn(b, CFG, (1 / 60) * 0.22, OPTS);
  assert.ok(b.clock < a.clock);
  assert.ok(Math.abs(b.clock - a.clock * 0.22) < 0.05);
});
