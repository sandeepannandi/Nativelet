import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PG_BOLTS, GL_CX, GL_CY, GL_R,
  createPlasma, stepPlasma, plasmaPointer, plasmaMeanTipDist, plasmaOutside,
} from './plasmaMath.ts';

const run = (s, seconds, scale = 1) => {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) stepPlasma(s, (1 / 60) * scale, 1);
};

test('same seed gives the same filaments', () => {
  const a = createPlasma(7);
  const b = createPlasma(7);
  run(a, 3);
  run(b, 3);
  for (let i = 0; i < a.main.length; i++) assert.equal(a.main[i], b.main[i]);
  for (let i = 0; i < a.branches.length; i++) assert.equal(a.branches[i], b.branches[i]);
});

test('different seeds give different filaments', () => {
  const a = createPlasma(1);
  const b = createPlasma(2);
  run(a, 1);
  run(b, 1);
  let diff = 0;
  for (let i = 0; i < a.main.length; i++) diff += Math.abs(a.main[i] - b.main[i]);
  assert.ok(diff > 100);
});

test('every point stays finite and inside the glass, touched or not', () => {
  const s = createPlasma();
  run(s, 3);
  assert.equal(plasmaOutside(s), 0);
  plasmaPointer(s, 20, 20, true);   // finger far outside the sphere
  run(s, 2);
  assert.equal(plasmaOutside(s), 0);
  plasmaPointer(s, 20, 20, false);
  run(s, 2);
  assert.equal(plasmaOutside(s), 0);
});

test('left alone the bolt ends wander and re-strike', () => {
  const s = createPlasma();
  run(s, 1);
  const x0 = Array.from(s.tipX);
  const y0 = Array.from(s.tipY);
  run(s, 4);
  let moved = 0;
  for (let i = 0; i < PG_BOLTS; i++) moved += Math.hypot(s.tipX[i] - x0[i], s.tipY[i] - y0[i]);
  assert.ok(moved / PG_BOLTS > 40, `mean move ${moved / PG_BOLTS}`);
});

test('a touch pulls the attracted filaments onto the finger', () => {
  const s = createPlasma();
  run(s, 2);
  const before = plasmaMeanTipDist(s, 220, 130);
  plasmaPointer(s, 220, 130, true);
  run(s, 1);
  const after = plasmaMeanTipDist(s, 220, 130);
  assert.ok(before > 50, `before ${before}`);
  assert.ok(after < 14, `after ${after}`);
});

test('two bolts in nine stay free of the finger', () => {
  const s = createPlasma();
  plasmaPointer(s, 220, 130, true);
  run(s, 2);
  const free = plasmaMeanTipDist(s, 220, 130, true) * PG_BOLTS;
  const caught = plasmaMeanTipDist(s, 220, 130) * (PG_BOLTS - 2);
  assert.ok(free - caught > 40, 'free bolts are not at the finger');
  let nFree = 0;
  for (let i = 0; i < PG_BOLTS; i++) if (s.weight[i] === 0) nFree++;
  assert.equal(nFree, 2);
});

test('the filaments follow a drag', () => {
  const s = createPlasma();
  plasmaPointer(s, 120, 120, true);
  run(s, 1);
  for (let k = 0; k <= 30; k++) {
    plasmaPointer(s, 120 + k * 3.3, 120 + k * 1.2, true);
    run(s, 1 / 30);
  }
  run(s, 0.4);
  const d = plasmaMeanTipDist(s, 120 + 99, 120 + 36);
  assert.ok(d < 16, `distance after drag ${d}`);
});

test('release scatters the filaments back into wandering arcs', () => {
  const s = createPlasma();
  plasmaPointer(s, 200, 150, true);
  run(s, 1.2);
  const held = plasmaMeanTipDist(s, 200, 150);
  plasmaPointer(s, 200, 150, false);
  run(s, 3);
  const after = plasmaMeanTipDist(s, 200, 150);
  assert.ok(held < 14);
  assert.ok(after > 50, `after ${after}`);
  assert.ok(s.attract < 0.05);
});

test('release triggers a brightness flash that decays', () => {
  const s = createPlasma();
  plasmaPointer(s, 200, 150, true);
  run(s, 1);
  plasmaPointer(s, 200, 150, false);
  assert.equal(s.flash, 1);
  run(s, 3);
  assert.ok(s.flash < 0.01);
  assert.ok(s.glow > 0.7 && s.glow <= 1.15);
});

test('slow motion steps the same model about five times slower', () => {
  const a = createPlasma(3);
  const b = createPlasma(3);
  run(a, 1);
  run(b, 5, 0.2);
  assert.ok(Math.abs(a.t - b.t) < 0.05);
});

test('settled start is a finished picture with long bolts', () => {
  const s = createPlasma(5, true);
  assert.equal(plasmaOutside(s), 0);
  for (let i = 0; i < PG_BOLTS; i++) {
    const d = Math.hypot(s.tipX[i] - GL_CX, s.tipY[i] - GL_CY);
    assert.ok(d > GL_R * 0.4 && d <= GL_R);
  }
});
