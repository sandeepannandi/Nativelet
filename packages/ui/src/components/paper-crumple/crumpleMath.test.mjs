import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CR_W, CR_H, CR_NT, CR_NV, CR_BALL_R, CR_BUCKETS,
  createCrumple, buildCrumple, stepCrumple, crumpleDown, crumpleMove, crumpleUp,
  crumplePinch, crumpleSmooth, crumpleBounds,
} from './crumpleMath.ts';

const run = (s, seconds) => { for (let f = 0; f < Math.round(seconds * 60); f++) stepCrumple(s, 1 / 60); };
const drag = (s, pts, t0 = 0, dtMs = 16) => {
  crumpleDown(s, pts[0][0], pts[0][1], t0);
  let t = t0;
  for (let i = 1; i < pts.length; i++) { t += dtMs; crumpleMove(s, pts[i][0], pts[i][1], t); stepCrumple(s, dtMs / 1000); }
  crumpleUp(s, t + 1);
  return t + 1;
};
const line = (x0, y0, x1, y1, n = 30) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const variance = (s) => { let m = 0; for (let t = 0; t < CR_NT; t++) m += s.bucket[t] % 10; m /= CR_NT; let v = 0; for (let t = 0; t < CR_NT; t++) v += (s.bucket[t] % 10 - m) ** 2; return v / CR_NT; };

test('deterministic by seed', () => {
  const a = createCrumple(7), b = createCrumple(7), c = createCrumple(8);
  assert.deepEqual([...a.zn], [...b.zn]);
  assert.notDeepEqual([...a.zn], [...c.zn]);
});

test('flat sheet is flat and evenly lit', () => {
  const s = createCrumple(); buildCrumple(s);
  for (let v = 0; v < CR_NV; v++) assert.ok(Math.abs(s.qz[v]) < 1e-9);
  assert.ok(variance(s) < 0.01, 'flat paper has one tone');
  for (let t = 0; t < CR_NT; t++) assert.ok(s.bucket[t] < CR_BUCKETS);
});

test('dragging a corner to the middle crumples into a ball', () => {
  const s = createCrumple();
  drag(s, line(CR_W / 2 + 110, CR_H / 2 + 140, CR_W / 2, CR_H / 2));
  run(s, 1.5);
  assert.equal(Math.round(s.c * 100) / 100, 1);
  buildCrumple(s);
  const b = crumpleBounds(s);
  assert.ok(b.w < CR_BALL_R * 2.7 && b.h < CR_BALL_R * 2.7, `ball ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
  assert.ok(b.w > CR_BALL_R * 1.3, 'not collapsed to a point');
  assert.ok(variance(s) > 1.2, 'facets are visibly shaded differently');
});

test('crumpling shrinks the sheet monotonically', () => {
  let prev = Infinity;
  for (const c of [0, 0.25, 0.5, 0.75, 1]) {
    const s = createCrumple(); s.c = c; s.target = c; buildCrumple(s);
    const b = crumpleBounds(s); const area = b.w * b.h;
    assert.ok(area < prev, `area at c=${c}`); prev = area;
  }
});

test('a half-crumpled sheet holds its shape on release', () => {
  const s = createCrumple();
  drag(s, line(CR_W / 2 + 110, CR_H / 2 + 140, CR_W / 2 + 50, CR_H / 2 + 60));
  run(s, 2);
  assert.ok(s.c > 0.15 && s.c < 0.75, `c=${s.c}`);
});

test('smoothing out leaves permanent faint creases', () => {
  const fresh = createCrumple(); buildCrumple(fresh);
  const s = createCrumple();
  drag(s, line(CR_W / 2 + 110, CR_H / 2 + 140, CR_W / 2, CR_H / 2)); run(s, 1);
  crumpleSmooth(s); run(s, 3); buildCrumple(s);
  assert.ok(s.c < 0.001);
  assert.ok(s.mem > 0.95);
  assert.ok(variance(s) > variance(fresh) + 0.02, 'creases remain');
  const ball = createCrumple(); ball.c = 1; ball.target = 1; buildCrumple(ball);
  assert.ok(variance(s) < variance(ball) * 0.6, `fainter than the ball: ${variance(s).toFixed(2)} vs ${variance(ball).toFixed(2)}`);
  const b = crumpleBounds(s);
  assert.ok(b.w > 200, 'full sheet size again');
});

test('flicking the ball tosses it, it bounces and settles inside the card', () => {
  const s = createCrumple(); s.c = 1; s.target = 1; s.mem = 1;
  drag(s, line(CR_W / 2, CR_H / 2, CR_W / 2 + 90, CR_H / 2 - 40, 6), 0, 12);
  assert.ok(Math.hypot(s.vx, s.vy) > 400, `toss speed ${Math.hypot(s.vx, s.vy)}`);
  let maxX = 0;
  for (let f = 0; f < 60 * 10; f++) {
    stepCrumple(s, 1 / 60);
    maxX = Math.max(maxX, s.bx);
    assert.ok(s.bx >= CR_BALL_R - 1e-6 && s.bx <= CR_W - CR_BALL_R + 1e-6);
    assert.ok(s.by >= CR_BALL_R - 1e-6 && s.by <= CR_H - CR_BALL_R + 1e-6);
  }
  assert.ok(s.bounces >= 1, 'hit a wall');
  assert.equal(Math.hypot(s.vx, s.vy), 0, 'came to rest');
});

test('a slow release does not toss', () => {
  const s = createCrumple(); s.c = 1; s.target = 1;
  drag(s, line(CR_W / 2, CR_H / 2, CR_W / 2 + 30, CR_H / 2, 30), 0, 40);
  assert.equal(Math.hypot(s.vx, s.vy), 0);
});

test('rolling turns the facets', () => {
  const s = createCrumple(); s.c = 1; s.target = 1; buildCrumple(s);
  const before = Array.from(s.bucket);
  s.vx = 600; s.vy = 0; run(s, 0.4); buildCrumple(s);
  let changed = 0; for (let t = 0; t < CR_NT; t++) if (s.bucket[t] !== before[t]) changed++;
  assert.ok(changed > CR_NT * 0.2, `${changed} facets changed shade or layer`);
});

test('double tap on the ball smooths it open', () => {
  const s = createCrumple(); s.c = 1; s.target = 1;
  let t = 0;
  for (let n = 0; n < 2; n++) { crumpleDown(s, s.bx, s.by, t); crumpleUp(s, t + 60); t += 200; }
  assert.equal(s.target, 0);
});

test('pinch in crumples, pinch out opens', () => {
  const s = createCrumple();
  crumplePinch(s, 0.9, true); crumplePinch(s, 0.5, true); crumplePinch(s, 0.3, true); crumplePinch(s, 0.3, false);
  run(s, 2); assert.equal(s.c, 1);
  crumplePinch(s, 1.0, true); crumplePinch(s, 1.7, true); crumplePinch(s, 1.7, false);
  run(s, 2); assert.ok(s.c < 0.3, `c=${s.c}`);
});

test('every bucket id stays in range and layers split a ball front to back', () => {
  const s = createCrumple(); s.c = 1; s.target = 1; buildCrumple(s);
  const layers = new Set();
  for (let t = 0; t < CR_NT; t++) { assert.ok(s.bucket[t] < CR_BUCKETS); layers.add(Math.floor(s.bucket[t] / 20)); }
  assert.equal(layers.size, 3);
});

test('counting sort groups every triangle exactly once', () => {
  const s = createCrumple(); s.c = 0.6; s.target = 0.6; buildCrumple(s);
  assert.equal(s.bstart[CR_BUCKETS], CR_NT);
  const seen = new Uint8Array(CR_NT);
  for (let b = 0; b < CR_BUCKETS; b++) for (let k = s.bstart[b]; k < s.bstart[b + 1]; k++) { assert.equal(s.bucket[s.order[k]], b); seen[s.order[k]]++; }
  assert.ok(seen.every((n) => n === 1));
});
