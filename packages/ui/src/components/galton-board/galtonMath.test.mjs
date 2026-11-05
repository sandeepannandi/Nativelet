import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GALTON_DEFAULTS, createGalton, dropOne, resetGalton, setPouring, setTiltTarget, stepGalton, binCounts,
} from './galtonMath.ts';
import { BALL_R, BOARD_SCALE, CENTER_X, CENTER_Y, FLOOR_Y, GALTON_H, GALTON_W, WALL_L, WALL_R } from './galtonDesign.ts';

const P = GALTON_DEFAULTS;

function pourAll(s, pourSeconds = 14, settleSeconds = 45) {
  setPouring(s, true);
  for (let f = 0; f < pourSeconds * 60; f++) stepGalton(s, 1 / 60, P);
  setPouring(s, false);
  for (let f = 0; f < settleSeconds * 60; f++) stepGalton(s, 1 / 60, P);
}

function histogram(s) {
  const out = new Float64Array(P.rows + 1);
  binCounts(s, P, out);
  return [...out];
}

function stats(hist) {
  const n = hist.reduce((a, b) => a + b, 0);
  const mean = hist.reduce((a, c, k) => a + c * k, 0) / n;
  const sd = Math.sqrt(hist.reduce((a, c, k) => a + c * (k - mean) ** 2, 0) / n);
  return { n, mean, sd };
}

test('deterministic: same seed, same pour, same histogram', () => {
  const a = createGalton(P, 7);
  const b = createGalton(P, 7);
  pourAll(a);
  pourAll(b);
  assert.deepEqual(histogram(a), histogram(b));
  assert.equal(a.time, b.time);
});

test('a full pour spawns, settles and sleeps every bead', () => {
  const s = createGalton(P);
  pourAll(s);
  assert.equal(s.n, P.maxBalls);
  let sleeping = 0;
  for (let i = 0; i < s.n; i++) sleeping += s.sleep[i];
  assert.equal(sleeping, s.n);
  const { n } = stats(histogram(s));
  assert.equal(n, s.n, 'every settled bead is counted in a bin');
});

test('containment: beads stay inside the panel and never go non-finite', () => {
  const s = createGalton(P);
  setPouring(s, true);
  for (let f = 0; f < 40 * 60; f++) {
    stepGalton(s, 1 / 60, P);
    if (f === 9 * 60) setPouring(s, false);
    for (let i = 0; i < s.n; i++) {
      assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.y[i]), `bead ${i} finite at frame ${f}`);
      assert.ok(Number.isFinite(s.vx[i]) && Number.isFinite(s.vy[i]), `bead ${i} velocity finite at frame ${f}`);
      assert.ok(s.x[i] - BALL_R >= WALL_L - 0.6, `bead ${i} left wall at frame ${f}: ${s.x[i]}`);
      assert.ok(s.x[i] + BALL_R <= WALL_R + 0.6, `bead ${i} right wall at frame ${f}: ${s.x[i]}`);
      assert.ok(s.y[i] + BALL_R <= FLOOR_Y + 0.6, `bead ${i} floor at frame ${f}: ${s.y[i]}`);
      assert.ok(s.y[i] - BALL_R >= 0, `bead ${i} above panel at frame ${f}: ${s.y[i]}`);
    }
  }
});

test('the bell curve emerges from collisions, not from the spawn script', () => {
  const s = createGalton(P);
  pourAll(s);
  const { mean, sd } = stats(histogram(s));
  /* Ideal binomial for 10 rows: mean 5, sd = sqrt(10)/2 = 1.58. Measured
     poured-stream sd is ~1.1-1.3 (narrower than ideal; the cause within
     this model - stream crowding vs the seeded roughness kick vs cascaded
     sleep - is not separated, so this is a sanity band, not the statistical
     gate). The tight statistical gate is the single-bead test below. */
  assert.ok(Math.abs(mean - 5) < 0.6, `mean bin ${mean.toFixed(2)} near 5`);
  assert.ok(sd > 0.9 && sd < 2.1, `sd ${sd.toFixed(2)} is bell-like, not a spike or a smear`);
});

test('single beads track the binomial spread', () => {
  const hist = new Float64Array(P.rows + 1);
  for (let run = 0; run < 300; run++) {
    const s = createGalton(P, 1000 + run);
    dropOne(s, P);
    for (let f = 0; f < 25 * 60; f++) stepGalton(s, 1 / 60, P);
    const h = histogram(s);
    const total = h.reduce((a, b) => a + b, 0);
    if (total === 1) hist[h.indexOf(1)]++;
  }
  const { n, mean, sd } = stats([...hist]);
  assert.ok(n >= 250, `${n}/300 single beads reached a bin`);
  assert.ok(Math.abs(mean - 5) < 0.5, `single-bead mean ${mean.toFixed(2)} near 5`);
  assert.ok(Math.abs(sd - Math.sqrt(10) / 2) < 0.4, `single-bead sd ${sd.toFixed(2)} near ${(Math.sqrt(10) / 2).toFixed(2)}`);
});

test('resting beads do not interpenetrate beyond slop', () => {
  const s = createGalton(P);
  pourAll(s);
  for (let i = 0; i < s.n; i++) {
    for (let j = i + 1; j < s.n; j++) {
      const d = Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]);
      assert.ok(d > BALL_R * 2 - 1.8, `beads ${i},${j} overlap ${d.toFixed(2)}`);
    }
  }
});

test('tilting the board skews the distribution toward the tilt', () => {
  /* The strong tilt effect, same as the real toy: beads poured while the
     board leans cascade off-centre. (Slumping an already-settled pile needs
     more than the 0.12 rad drag limit, which is also physical - bead piles
     have an angle of repose.) */
  const s = createGalton(P);
  setTiltTarget(s, P, P.tiltMax);
  for (let f = 0; f < 3 * 60; f++) stepGalton(s, 1 / 60, P);
  pourAll(s);
  const { mean } = stats(histogram(s));
  assert.ok(mean > 5.4, `tilted-pour mean bin ${mean.toFixed(2)} shifted right of 5`);

  const s2 = createGalton(P);
  setTiltTarget(s2, P, -P.tiltMax);
  for (let f = 0; f < 3 * 60; f++) stepGalton(s2, 1 / 60, P);
  pourAll(s2);
  const { mean: meanL } = stats(histogram(s2));
  assert.ok(meanL < 4.6, `counter-tilted pour mean bin ${meanL.toFixed(2)} shifted left of 5`);
});

test('hard knocks wake sleeping beads and the pile re-settles', () => {
  const s = createGalton(P);
  pourAll(s);
  const before = s.settled;
  setTiltTarget(s, P, P.tiltMax);
  for (let f = 0; f < 12 * 60; f++) stepGalton(s, 1 / 60, P);
  setTiltTarget(s, P, 0);
  for (let f = 0; f < 25 * 60; f++) stepGalton(s, 1 / 60, P);
  let sleeping = 0;
  for (let i = 0; i < s.n; i++) sleeping += s.sleep[i];
  assert.equal(sleeping, s.n, 'everything falls back asleep after the knock');
  assert.ok(s.settled > before * 0.85, 'most beads remain counted after re-settling');
});

test('reset clears the board and the hopper cap holds', () => {
  const s = createGalton(P);
  pourAll(s);
  resetGalton(s);
  assert.equal(s.n, 0);
  assert.equal(s.settled, 0);
  for (let k = 0; k < P.maxBalls + 20; k++) dropOne(s, P);
  assert.equal(s.n, P.maxBalls, 'spawn cap respected');
});

test('viewport invariant: full board at max tilt stays inside the canvas', () => {
  const t = P.tiltMax;
  const ex = BOARD_SCALE * (CENTER_X * Math.cos(t) + CENTER_Y * Math.sin(t));
  const ey = BOARD_SCALE * (CENTER_X * Math.sin(t) + CENTER_Y * Math.cos(t));
  assert.ok(ex <= GALTON_W / 2, `x extent ${ex.toFixed(1)} <= ${GALTON_W / 2}`);
  assert.ok(ey <= GALTON_H / 2, `y extent ${ey.toFixed(1)} <= ${GALTON_H / 2}`);
});
