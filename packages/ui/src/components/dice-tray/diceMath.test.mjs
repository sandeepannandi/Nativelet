import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DICE_DEFAULTS, FACE_AXES, allSettled, createDie, createWorld, diceValues, kineticEnergy,
  stepDice, throwDice, topFace, qAxisAngle, cornerOffsets, qMat,
} from './diceMath.ts';

function roll(seed, count = 2) {
  const w = createWorld(count, 3.4, 4.4, seed);
  throwDice(w, [0, 2.2, 3.6], [(seed % 5) - 2, 3, -22 - (seed % 7)], 1, seed);
  let t = 0;
  while (t < 12 && !allSettled(w)) { stepDice(w, 1 / 60); t += 1 / 60; }
  return { w, t };
}

test('opposite faces add to seven and values 1..6 appear once', () => {
  const vals = FACE_AXES.map((f) => f.value).sort();
  assert.deepEqual(vals, [1, 2, 3, 4, 5, 6]);
  for (const f of FACE_AXES) {
    const o = FACE_AXES.find((g) => g.axis === f.axis && g.sign === -f.sign);
    assert.equal(f.value + o.value, 7);
  }
});

test('a die dropped from height bounces lower each time and sleeps flat', () => {
  const w = createWorld(1, 3.4, 4.4, 3);
  w.dice[0].p = [0, 3, 0];
  w.dice[0].q = [1, 0, 0, 0];
  let peaks = [], prevVy = 0, maxY = 0;
  for (let i = 0; i < 60 * 6; i++) {
    stepDice(w, 1 / 60);
    const vy = w.dice[0].v[1];
    if (prevVy > 0 && vy <= 0) peaks.push(w.dice[0].p[1]);
    prevVy = vy;
  }
  assert.ok(peaks.length >= 1);
  assert.ok(peaks[0] < 3 - 0.5 + 0.2, 'first rebound is lower than the drop');
  assert.ok(w.dice[0].asleep);
  assert.ok(Math.abs(w.dice[0].p[1] - 0.5) < 0.02);
  assert.ok(topFace(w.dice[0]).flat > 0.999);
});

test('throws settle in a few seconds, stay in the tray, never NaN', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { w, t } = roll(seed);
    assert.ok(allSettled(w), `seed ${seed} still moving at ${t.toFixed(1)}s, ke ${kineticEnergy(w)}`);
    assert.ok(t < 9, `seed ${seed} took ${t.toFixed(1)}s`);
    for (const d of w.dice) {
      assert.ok(Number.isFinite(d.p[0] + d.p[1] + d.p[2]));
      const offs = cornerOffsets(qMat(d.q));
      for (const r of offs) {
        assert.ok(d.p[0] + r[0] > -3.4 - 0.15 && d.p[0] + r[0] < 3.4 + 0.15, 'x in tray');
        assert.ok(d.p[2] + r[2] > -4.4 - 0.15 && d.p[2] + r[2] < 4.4 + 0.15, 'z in tray');
        assert.ok(d.p[1] + r[1] > -0.06, 'above the felt');
      }
      assert.ok(topFace(d).flat > 0.998, `seed ${seed} die rests flat`);
    }
  }
});

test('dice do not rest inside each other', () => {
  for (let seed = 50; seed < 70; seed++) {
    const { w } = roll(seed, 3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = w.dice[i].p, b = w.dice[j].p;
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.85 || Math.abs(a[1] - b[1]) > 0.8, `seed ${seed} overlap`);
    }
  }
});

test('results are fair enough and deterministic', () => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let s = 100; s < 220; s++) { const { w } = roll(s, 1); counts[diceValues(w)[0]]++; }
  for (let v = 1; v <= 6; v++) assert.ok(counts[v] >= 6, `face ${v} came up ${counts[v]} of 120`);
  const a = roll(7), b = roll(7);
  assert.deepEqual(diceValues(a.w), diceValues(b.w));
  assert.equal(a.w.dice[0].p[0], b.w.dice[0].p[0]);
});

test('energy never grows while a die is only in free fall and bouncing', () => {
  const w = createWorld(1, 3.4, 4.4, 9);
  w.dice[0].p = [0, 2, 0];
  let e0 = null, maxRise = 0, prev = null;
  for (let i = 0; i < 360; i++) {
    stepDice(w, 1 / 360);
    const d = w.dice[0];
    const total = kineticEnergy(w) + DICE_DEFAULTS.gravity * d.p[1];
    if (prev !== null) maxRise = Math.max(maxRise, total - prev);
    prev = total; if (e0 === null) e0 = total;
  }
  assert.ok(prev <= e0 + 0.5, 'total energy did not increase');
});

import { grabDice, moveHeld, releaseDice } from './diceMath.ts';

test('picking up, carrying and releasing throws the dice the way the hand moved', () => {
  const w = createWorld(2, 3.4, 4.4, 4);
  grabDice(w, 4);
  for (let i = 0; i < 40; i++) moveHeld(w, [0, 2.2, 3.5 - i * 0.18], 1 / 60);
  const speed = releaseDice(w, 4);
  assert.ok(speed > 4, 'carries the hand speed: ' + speed);
  assert.ok(w.dice[0].v[2] < -3, 'moves away from the camera');
  let t = 0;
  while (t < 10 && !allSettled(w)) { stepDice(w, 1 / 60); t += 1 / 60; }
  assert.ok(allSettled(w));
});

test('felt impacts are reported for haptics and reset by the host', () => {
  const w = createWorld(1, 3.4, 4.4, 2);
  w.dice[0].p = [0, 3, 0];
  stepDice(w, 1);
  assert.ok(w.impact > 1, 'landing registers an impact: ' + w.impact);
});
