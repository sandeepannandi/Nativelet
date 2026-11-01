import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CYM_COUNT, CYM_DEFAULTS as O, CYM_MODE_COUNT,
  createCymatics, stepCymatics, cymPointer, cymScatter,
  cymMeanAmp, cymFracSettled, cymAvgSpeed, cymMaxSpeed, cymEscaped, cymHz, cymModePair,
} from './cymaticsMath.ts';

const run = (s, seconds, opts = O) => {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) stepCymatics(s, 1 / 60, opts);
};

test('same seed gives the same figure', () => {
  const a = createCymatics(O, 400, 7);
  const b = createCymatics(O, 400, 7);
  run(a, 4);
  run(b, 4);
  for (let i = 0; i < a.n; i++) {
    assert.equal(a.x[i], b.x[i]);
    assert.equal(a.vy[i], b.vy[i]);
  }
});

test('grains stay finite and on the plate', () => {
  const s = createCymatics(O, 600);
  run(s, 3);
  cymScatter(s);
  run(s, 3);
  assert.equal(cymEscaped(s), 0);
  for (let i = 0; i < s.n; i++) {
    assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.y[i]));
    assert.ok(Number.isFinite(s.vx[i]) && Number.isFinite(s.vy[i]));
  }
});

test('a scattered plate settles onto the nodal lines and stays', () => {
  const s = createCymatics(O, 1500);
  const before = cymMeanAmp(s);
  const early = cymFracSettled(s);
  run(s, 12);
  const after = cymMeanAmp(s);
  const settled = cymFracSettled(s);
  assert.ok(after < before * 0.45, `mean amplitude ${before} -> ${after}`);
  assert.ok(settled > 0.55, `settled fraction ${settled} (early ${early})`);
  // The figure is stable: two more seconds do not lift it off the lines.
  run(s, 2);
  assert.ok(cymFracSettled(s) > 0.5);
});

test('settling works across the mode ladder', () => {
  for (const u of [0, 3.5, CYM_MODE_COUNT - 1]) {
    const s = createCymatics(O, 900, 11, false, u);
    run(s, 12);
    assert.ok(cymFracSettled(s) > 0.5, `u=${u} settled ${cymFracSettled(s)}`);
  }
});

test('a tap scatters the figure and it reforms', () => {
  const s = createCymatics(O, 1200);
  run(s, 12);
  const settled = cymFracSettled(s);
  cymScatter(s);
  run(s, 0.5);
  const kicked = cymFracSettled(s);
  assert.ok(kicked < settled * 0.9, `tap barely moved the figure: ${settled} -> ${kicked}`);
  run(s, 12);
  assert.ok(cymFracSettled(s) > 0.5, 'figure did not reform after a tap');
});

test('dragging retunes the drive and the figure re-forms at the new mode', () => {
  const s = createCymatics(O, 1200, 21, false, 1);
  run(s, 6);
  // Drag right across half the plate, in per-frame pointer feeds.
  cymPointer(s, 0.25, 0.5, true);
  for (let f = 0; f < 90; f++) {
    cymPointer(s, 0.25 + (0.5 * (f + 1)) / 90, 0.5, true);
    stepCymatics(s, 1 / 60);
  }
  cymPointer(s, 0.75, 0.5, false);
  assert.ok(s.u > 4, `drag did not climb the ladder: u=${s.u}`);
  run(s, 12);
  assert.ok(cymFracSettled(s) > 0.5, `no figure at new mode: ${cymFracSettled(s)}`);
  const [m, n] = cymModePair(s);
  assert.ok(m >= 1 && n > m, `bad mode pair ${m},${n}`);
  assert.ok(cymHz(s) > cymHz(createCymatics(O, 10, 21, false, 0)), 'frequency did not climb');
});

test('a held-still finger changes neither tuning nor energy', () => {
  const s = createCymatics(O, 400, 5);
  cymPointer(s, 0.4, 0.6, true);
  run(s, 0.5);
  for (let f = 0; f < 120; f++) {
    cymPointer(s, 0.4, 0.6, true);
    stepCymatics(s, 1 / 60);
  }
  cymPointer(s, 0.4, 0.6, false);
  assert.equal(s.u, 2);
  assert.equal(s.r, -1);
  assert.equal(s.excite, 0);
});

test('speed cap holds under repeated scatter', () => {
  const s = createCymatics(O, 500);
  for (let k = 0; k < 5; k++) {
    cymScatter(s);
    run(s, 0.5);
    assert.ok(cymMaxSpeed(s) <= O.maxSpeed + 1e-6, `speed ${cymMaxSpeed(s)}`);
  }
});

test('full grain count settles and keeps its population', () => {
  const s = createCymatics();
  assert.equal(s.n, CYM_COUNT);
  run(s, 8);
  assert.equal(s.n, CYM_COUNT);
  assert.ok(cymFracSettled(s) > 0.5);
  assert.ok(cymAvgSpeed(s) < 0.2, `still energetic after settling: ${cymAvgSpeed(s)}`);
});
