import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRADLE_DEFAULTS, createCradle, releaseImpulse, stepCradleFixed, totalEnergy, pickBall, ballCenter,
} from './cradleMath.ts';
import { BALL_R, CRADLE_W, PIVOT_Y, STRING_LEN, pivotX } from './cradleDesign.ts';

/* The config the renderers actually use; viewport gates below run against it. */
const DESIGN_CFG = {
  pivotX: new Float32Array([0, 1, 2, 3, 4].map(pivotX)),
  pivotY: PIVOT_Y,
  lengthPx: STRING_LEN,
  ballRadiusPx: BALL_R,
  pixelsPerMeter: STRING_LEN / CRADLE_DEFAULTS.lengthM,
};

function assertInsideViewport(s, label) {
  const c = [0, 0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (let f = 0; f < 20 * 60; f++) {
    stepCradleFixed(s, DESIGN_CFG, 1 / 60, [], CRADLE_DEFAULTS);
    for (let i = 0; i < CRADLE_DEFAULTS.balls; i++) {
      ballCenter(s, DESIGN_CFG, i, c);
      minX = Math.min(minX, c[0]);
      maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]);
    }
  }
  assert.ok(minX - BALL_R >= 0, `${label}: left edge ${(minX - BALL_R).toFixed(1)}px`);
  assert.ok(maxX + BALL_R <= CRADLE_W, `${label}: right edge ${(CRADLE_W - maxX - BALL_R).toFixed(1)}px`);
  assert.ok(minY - BALL_R >= 0, `${label}: top edge ${(minY - BALL_R).toFixed(1)}px`);
  return { minX, maxX, minY };
}

const P = CRADLE_DEFAULTS;
const R = 15, LPX = 200;
const CFG = {
  pivotX: new Float32Array([0, 1, 2, 3, 4].map((i) => 170 + (i - 2) * 2 * R)),
  pivotY: 40,
  lengthPx: LPX,
  ballRadiusPx: R,
  pixelsPerMeter: LPX / P.lengthM,
};
const ANGLE = 0.6;
const VIN = Math.sqrt(2 * P.gravity * P.lengthM * (1 - Math.cos(ANGLE)));

function run(count, seconds, side = 'left') {
  const s = createCradle(P);
  releaseImpulse(s, side, count, ANGLE);
  const peaks = new Array(P.balls).fill(0);
  const maxOm = new Array(P.balls).fill(0);
  let maxE = -Infinity;
  const e0 = totalEnergy(s, P);
  for (let f = 0; f < seconds * 60; f++) {
    stepCradleFixed(s, CFG, 1 / 60, [], P);
    for (let i = 0; i < P.balls; i++) {
      peaks[i] = Math.max(peaks[i], Math.abs(s.th[i]));
      maxOm[i] = Math.max(maxOm[i], Math.abs(s.om[i]));
    }
    maxE = Math.max(maxE, totalEnergy(s, P));
  }
  return { s, peaks, maxOm, e0, maxE };
}

test('one ball in sends exactly one ball out at nearly the entry speed', () => {
  const { peaks, maxOm } = run(1, 3);
  assert.ok(peaks[4] > 0.9 * ANGLE, `far ball peak ${peaks[4]}`);
  for (const i of [1, 2, 3]) assert.ok(peaks[i] < 0.08 * ANGLE, `middle ball ${i} peak ${peaks[i]}`);
  const ratio = (maxOm[4] * P.lengthM) / VIN;
  assert.ok(ratio > 0.9 && ratio < 1.02, `exit/entry speed ${ratio}`);
});

test('two balls in send two balls out, not one at double speed', () => {
  const { peaks, maxOm } = run(2, 3);
  assert.ok(peaks[3] > 0.9 * ANGLE && peaks[4] > 0.9 * ANGLE, `peaks ${peaks}`);
  assert.ok(peaks[2] < 0.12 * ANGLE, `middle peak ${peaks[2]}`);
  const ratio = (maxOm[4] * P.lengthM) / VIN;
  assert.ok(ratio > 0.85 && ratio < 1.1, `far-ball speed ratio ${ratio} (double would be ~2)`);
});

test('three balls in send three balls out', () => {
  const { peaks } = run(3, 3);
  for (const i of [2, 3, 4]) assert.ok(peaks[i] > 0.9 * ANGLE, `ball ${i} peak ${peaks[i]}`);
});

test('left and right drops behave symmetrically', () => {
  const l = run(1, 3, 'left');
  const r = run(1, 3, 'right');
  assert.ok(Math.abs(l.peaks[4] - r.peaks[0]) < 0.02, `left ${l.peaks[4]} right ${r.peaks[0]}`);
});

test('collisions never create energy', () => {
  for (const count of [1, 2, 3]) {
    const { e0, maxE } = run(count, 3);
    assert.ok(maxE <= e0 * 1.0001, `count ${count}: maxE ${maxE} e0 ${e0}`);
  }
});

test('energy decays and the cradle settles to rest', () => {
  const s = createCradle(P);
  releaseImpulse(s, 'left', 1, ANGLE);
  let last = totalEnergy(s, P);
  let monotonic = true;
  let restAt = -1;
  for (let f = 0; f < 180 * 60; f++) {
    stepCradleFixed(s, CFG, 1 / 60, [], P);
    const e = totalEnergy(s, P);
    if (e > last + 1e-9) monotonic = false;
    last = e;
    if (s.resting && restAt < 0) restAt = s.time;
  }
  assert.ok(monotonic, 'energy rose without input');
  assert.ok(restAt > 5 && restAt < 150, `rested at ${restAt}s`);
});

test('a dropped ball reaches the line in the analytic quarter period', () => {
  const s = createCradle(P);
  s.th[0] = -0.1;
  s.resting = 0;
  let hit = -1;
  for (let f = 0; f < 5 * 60; f++) {
    stepCradleFixed(s, CFG, 1 / 60, [], P);
    if (s.lastCollisionAt > 0) { hit = s.lastCollisionAt; break; }
  }
  const analytic = (Math.PI / 2) * Math.sqrt(P.lengthM / P.gravity);
  assert.ok(Math.abs(hit - analytic) < 0.02, `hit ${hit}s analytic ${analytic}s`);
});

test('grabbing and flinging a ball through the pack stays finite and safe', () => {
  const s = createCradle(P);
  const ptr = [{ id: 1, x: 0, y: 0, ball: 4 }];
  for (let f = 0; f < 240; f++) {
    const t = f / 60;
    ptr[0].x = 170 + 120 * Math.sin(t * 2);
    ptr[0].y = 240;
    stepCradleFixed(s, CFG, 1 / 60, ptr, P);
  }
  ptr.length = 0;
  for (let f = 0; f < 600; f++) stepCradleFixed(s, CFG, 1 / 60, ptr, P);
  for (let i = 0; i < P.balls; i++) {
    assert.ok(Number.isFinite(s.th[i]) && Number.isFinite(s.om[i]), `ball ${i} NaN`);
    assert.ok(Math.abs(s.th[i]) <= P.maxTheta + 0.01, `ball ${i} angle ${s.th[i]}`);
  }
});

test('grabbing the second ball from an end scoops a pair', () => {
  const s = createCradle(P);
  const ptr = [{ id: 1, x: 110 - 160, y: 140, ball: 1 }];
  for (let f = 0; f < 120; f++) stepCradleFixed(s, CFG, 1 / 60, ptr, P);
  assert.ok(s.th[0] < -0.3 && s.th[1] < -0.3, `scooped angles ${s.th[0]} ${s.th[1]}`);
  assert.ok(Math.abs(s.th[2]) < 0.05 && Math.abs(s.th[4]) < 0.05, 'far side untouched');
});

test('pickBall finds the nearest ball and rejects far taps', () => {
  const s = createCradle(P);
  assert.equal(pickBall(s, CFG, 170, 240, R * 2.4), 2);
  assert.equal(pickBall(s, CFG, 116, 236, R * 2.4), 0);
  assert.equal(pickBall(s, CFG, 20, 40, R * 2.4), -1);
});

test('the drag clamp keeps the max swing inside the design viewport', () => {
  const reach = STRING_LEN * Math.sin(CRADLE_DEFAULTS.maxTheta);
  assert.ok(pivotX(0) - reach - BALL_R >= 0, `static left margin ${(pivotX(0) - reach - BALL_R).toFixed(1)}px`);
  assert.ok(pivotX(4) + reach + BALL_R <= CRADLE_W, `static right margin ${(CRADLE_W - pivotX(4) - reach - BALL_R).toFixed(1)}px`);
  assert.ok(PIVOT_Y + STRING_LEN * Math.cos(CRADLE_DEFAULTS.maxTheta) - BALL_R >= 0, 'static top margin');
});

test('max-angle releases (1/2/3 balls, both sides) stay inside the viewport', () => {
  for (const [count, side] of [[1, 'left'], [2, 'left'], [3, 'left'], [1, 'right'], [2, 'right'], [3, 'right']]) {
    const s = createCradle(CRADLE_DEFAULTS);
    releaseImpulse(s, side, count, 99); // clamps to maxTheta, the old clipping case
    assertInsideViewport(s, `${count}-${side}`);
  }
});

test('symmetric max releases from both sides stay inside the viewport', () => {
  const s = createCradle(CRADLE_DEFAULTS);
  s.th[0] = s.th[1] = -CRADLE_DEFAULTS.maxTheta;
  s.th[3] = s.th[4] = CRADLE_DEFAULTS.maxTheta;
  s.resting = 0;
  assertInsideViewport(s, '2v2-symmetric');
});

test('held balls never pass the drag clamp during a violent pointer sweep', () => {
  const s = createCradle(CRADLE_DEFAULTS);
  const ptr = [{ id: 1, x: 0, y: 0, ball: 4 }];
  let maxHeld = 0;
  for (let f = 0; f < 360; f++) {
    const t = f / 60;
    ptr[0].x = 288 + 560 * Math.sin(t * 9); // whipped far past the canvas edge
    ptr[0].y = 100 + 90 * Math.cos(t * 7);
    stepCradleFixed(s, DESIGN_CFG, 1 / 60, ptr, CRADLE_DEFAULTS);
    for (let i = 0; i < CRADLE_DEFAULTS.balls; i++) {
      if (s.grabbed[i] > 0.5) maxHeld = Math.max(maxHeld, Math.abs(s.th[i]));
    }
  }
  assert.ok(maxHeld <= CRADLE_DEFAULTS.maxTheta + 0.01, `max held angle ${maxHeld}`);
  for (let i = 0; i < CRADLE_DEFAULTS.balls; i++) {
    assert.ok(Number.isFinite(s.th[i]) && Number.isFinite(s.om[i]), `ball ${i} NaN`);
  }
});
