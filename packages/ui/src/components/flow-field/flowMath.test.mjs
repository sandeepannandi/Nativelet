import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_COUNT, FLOW_DEFAULTS as O, FLOW_H, FLOW_W,
  createFlow, stepFlowFrame, flowPointer,
  flowAvgSpeed, flowMaxSpeed, flowEscaped, flowFieldLock, flowDivergence,
} from './flowMath.ts';

const run = (s, seconds, opts = O) => {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) stepFlowFrame(s, 1 / 60, opts);
};

test('same seed gives the same river', () => {
  const a = createFlow(O, 400, 7);
  const b = createFlow(O, 400, 7);
  run(a, 4);
  run(b, 4);
  for (let i = 0; i < a.n; i++) {
    assert.equal(a.x[i], b.x[i]);
    assert.equal(a.vy[i], b.vy[i]);
  }
});

test('particles stay finite and inside the wrapped torus', () => {
  const s = createFlow(O, 600);
  run(s, 3);
  // Stir hard for 3 s, then let go.
  let t = 0;
  for (let f = 0; f < 180; f++) {
    t += 1 / 60;
    flowPointer(s, 160 + Math.cos(t * 6) * 90, 190 + Math.sin(t * 6) * 90, true);
    stepFlowFrame(s, 1 / 60);
  }
  flowPointer(s, 0, 0, false);
  run(s, 6);
  assert.equal(flowEscaped(s), 0);
  for (let i = 0; i < s.n; i++) {
    assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.vy[i]), `particle ${i} NaN`);
  }
  assert.ok(flowMaxSpeed(s) <= O.maxSpeed + 1e-3, 'speed cap holds');
});

test('the ambient current is alive, coherent and locked to the field', () => {
  const s = createFlow(O, FLOW_COUNT);
  run(s, 3);
  const avg = flowAvgSpeed(s);
  assert.ok(avg > 14 && avg < 60, `ambient avg speed ${avg} px/s out of band`);
  const lock = flowFieldLock(s);
  // Random jitter would sit near 0; inertia (response 2.4/s) lags the
  // field on curves by design, so tracers ride at roughly 0.8, not 1.
  assert.ok(lock > 0.75, `tracers should ride the field, lock ${lock}`);
});

test('the ambient field is divergence-free (curl noise floor)', () => {
  const s = createFlow(O, 200);
  run(s, 1);
  const d = flowDivergence(s, O);
  assert.ok(d < 0.08, `normalised divergence ${d} - the field leaks`);
});

test('the fingertip paddle injects energy, and the flow heals after release', () => {
  const s = createFlow(O, FLOW_COUNT);
  run(s, 3);
  const ambient = flowAvgSpeed(s);
  let t = 0;
  for (let f = 0; f < 120; f++) {
    t += 1 / 60;
    flowPointer(s, 160 + Math.cos(t * 5) * 70, 190 + Math.sin(t * 5) * 70, true);
    stepFlowFrame(s, 1 / 60);
  }
  const stirred = flowAvgSpeed(s);
  assert.ok(stirred > ambient * 1.5, `stirring should energise, ${ambient} -> ${stirred}`);
  flowPointer(s, 0, 0, false);
  run(s, 5);
  const healed = flowAvgSpeed(s);
  assert.ok(healed < ambient * 1.3, `flow should heal back toward ambient, ${healed}`);
});

test('respawns keep the population constant and ages bounded', () => {
  const s = createFlow(O, 500);
  run(s, 20);
  assert.equal(s.n, 500);
  let newborns = 0;
  for (let i = 0; i < s.n; i++) {
    assert.ok(s.age[i] <= s.life[i] + 1 / 30, `age ${s.age[i]} past life ${s.life[i]}`);
    if (s.age[i] < 1) newborns++;
  }
  assert.ok(newborns > 0, 'some particles should have respawned in 20 s');
});

test('a held-still finger stops injecting energy', () => {
  const s = createFlow(O, 600);
  run(s, 2);
  flowPointer(s, 160, 190, true);
  run(s, 0.3);
  const early = flowAvgSpeed(s);
  run(s, 3); // finger down but not moving
  const late = flowAvgSpeed(s);
  assert.ok(late < early * 1.35, `still finger should not keep pumping, ${early} -> ${late}`);
});

test('settled spawn is a valid still picture inside the card', () => {
  const s = createFlow(O, 600, 20261025, true);
  assert.equal(flowEscaped(s), 0);
  assert.ok(flowAvgSpeed(s) > 10, 'settled picture still rides the current');
  assert.ok(FLOW_W > 0 && FLOW_H > 0);
});
