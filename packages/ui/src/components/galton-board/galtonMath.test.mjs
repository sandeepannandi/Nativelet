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
  /* Ideal binomial for 10 rows: mean 5, sd = sqrt(10)/2 = 1.58. With
     named Coulomb friction (mu 0.2) the measured full-rate pour lands
     sd 1.70-1.88 across seeds, the slow pour ~1.50 and single beads
     ~1.8 - all consistent with the ideal within sampling noise, with no
     significant pour-rate dependence. (An earlier build measured sd
     0.8-0.9 here, but that was ad-hoc contact damping acting as
     unlimited static friction plus count-by-x masking of a frozen
     stream - both removed.) This test asserts an honest bell band; the
     single-bead test below is the tight statistical gate. */
  assert.ok(Math.abs(mean - 5) < 0.6, `mean bin ${mean.toFixed(2)} near 5`);
  assert.ok(sd > 0.6 && sd < 2.0, `sd ${sd.toFixed(2)} is bell-like, not a spike or a smear`);
});

test('a slow pour converges on the ideal binomial spread', () => {
  const slow = { ...P, pourRate: 3 };
  const s = createGalton(slow, 7);
  setPouring(s, true);
  for (let f = 0; f < 40 * 60; f++) stepGalton(s, 1 / 60, slow);
  setPouring(s, false);
  for (let f = 0; f < 45 * 60; f++) stepGalton(s, 1 / 60, slow);
  const { n, mean, sd } = stats(histogram(s));
  assert.ok(n >= 100, `${n} beads poured at 3/s`);
  assert.ok(Math.abs(mean - 5) < 0.6, `slow-pour mean ${mean.toFixed(2)} near 5`);
  assert.ok(Math.abs(sd - Math.sqrt(10) / 2) < 0.55,
    `slow-pour sd ${sd.toFixed(2)} near ideal ${(Math.sqrt(10) / 2).toFixed(2)} once stream correlation is gone`);
});

/* Independent geometric audit of the settled positions. binCounts tallies
   by x alone, so a bead frozen mid-air would still "count" - these checks
   re-derive support from the final coordinates and can catch what count-
   by-x masks: floating piles, frozen pour streams, beads sleeping above
   the bin mouths with nothing under them. */
function auditSettledPile(s, label) {
  const r = P.ballR;
  const touch = 2 * r + 1; /* contact distance plus slop */
  const binMouth = P.binTop + 12;
  let sleeping = 0;
  for (let i = 0; i < s.n; i++) sleeping += s.sleep[i];
  assert.equal(sleeping, s.n, `${label}: every bead asleep`);
  const below = (i) => {
    let two = 0;
    let lean = 0;
    let best = -1;
    let bestDy = -1;
    for (let j = 0; j < s.n; j++) {
      if (j === i || !s.sleep[j]) continue;
      const dx = s.x[j] - s.x[i];
      const dy = s.y[j] - s.y[i];
      if (dy <= 2) continue; /* level or higher neighbours do not support */
      if (dx * dx + dy * dy > touch * touch) continue;
      two++;
      if (Math.abs(dx) > 4) lean++;
      if (dy > bestDy) { bestDy = dy; best = j; }
    }
    return { two, lean, best };
  };
  const onPeg = (i) => {
    for (let row = 1; row <= P.rows; row++) {
      const py = P.pegY0 + (row - 1) * P.sy;
      for (let j = 0; j < row; j++) {
        const px = P.cx + (j - (row - 1) / 2) * P.sx;
        const dx = s.x[i] - px;
        const dy = s.y[i] - py;
        if (dy > 4) continue; /* peg must be under the bead */
        if (dx * dx + dy * dy <= (P.pegR + r + 1) ** 2) return true;
      }
    }
    return false;
  };
  const onDividerTop = (i) => {
    if (s.y[i] < P.binTop - r - 3) return false;
    for (let k = 0; k < P.rows; k++) {
      const xd = P.cx + (k - (P.rows - 1) / 2) * P.sx;
      if (Math.abs(s.x[i] - xd) <= r + 4) return true;
    }
    return false;
  };
  /* support rule (static stability for unilateral frictionless round
     contacts): gravity must pass through the contact span - one
     supporting contact on EACH side, or one almost directly under the
     centre, or resting on a peg / divider top. An arch bead held by a
     single off-side touch is NOT stable and must not be sleeping */
  const supported = (i) => {
    if (onPeg(i) || onDividerTop(i)) return true;
    let left = 0, right = 0, under = 0;
    for (let j = 0; j < s.n; j++) {
      if (j === i || !s.sleep[j]) continue;
      const dx = s.x[j] - s.x[i];
      const dy = s.y[j] - s.y[i];
      if (dy <= 2) continue;
      if (dx * dx + dy * dy > touch * touch) continue;
      if (dx < -1) left = 1;
      else if (dx > 1) right = 1;
      if (dx >= -4 && dx <= 4) under++;
    }
    return (left && right) || under >= 1;
  };
  let aloft = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.y[i] > binMouth) continue;
    if (!supported(i)) {
      aloft++;
      assert.fail(`${label}: bead ${i} sleeping at (${s.x[i].toFixed(0)},${s.y[i].toFixed(0)}) with no support under it`);
    }
  }
  assert.equal(aloft, 0);
  /* grounding: follow each bead's lowest support contact downward; the
     chain is acyclic (each hop moves strictly down) and must reach the
     bins or a static within n hops - a floating island cannot terminate */
  for (let i = 0; i < s.n; i++) {
    let cur = i;
    const seen = new Set();
    for (let hop = 0; hop <= s.n; hop++) {
      if (s.y[cur] > binMouth || onPeg(cur) || onDividerTop(cur)) break;
      assert.ok(!seen.has(cur), `${label}: support cycle at bead ${cur}`);
      seen.add(cur);
      const b = below(cur);
      assert.ok(b.best >= 0, `${label}: bead ${cur} support chain dead-ends mid-air`);
      cur = b.best;
    }
  }
  return sleeping;
}

test('settled pile is physically grounded - normal pour path', () => {
  const s = createGalton(P);
  pourAll(s);
  auditSettledPile(s, 'normal pour');
});

test('settled pile is physically grounded - reduced-motion preRun window', () => {
  /* the reduce-motion toggle runs 14s pour + 26s settle synchronously, so
     that exact window must end fully settled and grounded */
  const s = createGalton(P);
  pourAll(s, 14, 26);
  auditSettledPile(s, 'preRun window');
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
