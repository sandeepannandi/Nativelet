import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allSettled, airborne, createWorld, groundHeight, holdGlobe, meanSpeed, moveGlobe, releaseGlobe,
  startShake, stepSnow, waterVelocity, sdSolid, TREES, HOUSE, LAMP,
} from './snowMath.ts';

const run = (w, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) stepSnow(w, dt); };

test('a fresh globe is calm: every flake lies on the ground inside the glass', () => {
  const w = createWorld(320, 3);
  assert.equal(allSettled(w), true);
  for (const f of w.flakes) {
    assert.ok(f.rest);
    assert.ok(Math.hypot(f.x, f.y, f.z) < 1, 'inside sphere');
    assert.ok(Math.abs(f.y - groundHeight(f.x, f.z)) < 0.02, 'on the ground');
  }
});

test('a shake lifts most of the snow and it all comes back down', () => {
  const w = createWorld(320, 5);
  startShake(w, 1);
  run(w, 1.2);
  const up = airborne(w);
  assert.ok(up > 250, `shake lifts snow, got ${up}`);
  let t = 1.2;
  while (t < 40 && !allSettled(w)) { run(w, 0.5); t += 0.5; }
  assert.ok(allSettled(w), `settles, still ${airborne(w)} up at ${t}s`);
  assert.ok(t > 6, `real snow globes take several seconds, settled at ${t}s`);
  assert.ok(t < 30, `settles in reasonable time, ${t}s`);
});

test('flakes never leave the glass and never go NaN, even under violent shaking', () => {
  const w = createWorld(320, 9);
  holdGlobe(w, 0, 0);
  for (let i = 0; i < 400; i++) {
    moveGlobe(w, Math.sin(i * 0.9) * 0.9, Math.cos(i * 1.3) * 0.6);
    stepSnow(w, 1 / 60);
    for (const f of w.flakes) {
      assert.ok(Number.isFinite(f.x + f.y + f.z + f.vx + f.vy + f.vz));
      assert.ok(Math.hypot(f.x, f.y, f.z) <= 1.0001, 'inside the glass');
      assert.ok(f.y >= groundHeight(f.x, f.z) - 0.001, 'above the ground');
    }
  }
  releaseGlobe(w);
  run(w, 3);
  assert.ok(Math.hypot(w.cx, w.cy) < 0.7);
});

test('big flakes fall faster than small ones (Stokes) and fall speed matches the model', () => {
  const w = createWorld(320, 4);
  const sorted = [...w.flakes].sort((a, b) => a.size - b.size);
  assert.ok(sorted[sorted.length - 1].vt > sorted[0].vt * 1.8);
  // Still water: a flake released at the top reaches its terminal speed.
  const f = sorted[sorted.length - 1];
  for (const g of w.flakes) { g.rest = true; }
  f.rest = false; f.x = 0.1; f.y = 0.6; f.z = 0.1; f.vx = f.vy = f.vz = 0;
  w.energy = 0; w.swirl = 0;
  for (let i = 0; i < 10; i++) stepSnow(w, 0.1);
  assert.ok(Math.abs(-f.vy - f.vt) < 0.05 * f.vt + 0.01, `vy ${f.vy} vs vt ${f.vt}`);
});

test('the water slows to nothing: energy and swirl only decay once the globe is still', () => {
  const w = createWorld(200, 6);
  startShake(w, 1);
  run(w, 1.2);
  let e = w.energy, s = Math.abs(w.swirl), prevE = e;
  for (let i = 0; i < 20; i++) {
    run(w, 0.5);
    assert.ok(w.energy <= prevE + 1e-6, 'energy does not grow');
    prevE = w.energy;
  }
  assert.ok(w.energy < e * 0.05 + 1e-3);
  assert.ok(Math.abs(w.swirl) < 0.05);
});

test('water velocity fades to zero at the glass and is finite inside', () => {
  const w = createWorld(10, 2);
  startShake(w, 1); run(w, 0.6);
  const out = [0, 0, 0];
  waterVelocity(w, 0.999, 0, 0, out);
  const wallSpeed = Math.hypot(...out);
  let inner = 0;
  for (const [x, y, z] of [[0.3, 0.1, 0], [0.2, 0.1, -0.3], [-0.4, 0.3, 0.2], [0, -0.2, 0.4]]) {
    waterVelocity(w, x, y, z, out);
    assert.ok(Number.isFinite(out[0] + out[1] + out[2]));
    inner = Math.max(inner, Math.hypot(...out));
  }
  assert.ok(inner > 0.1, `shaken water moves, ${inner}`);
  assert.ok(wallSpeed < 0.35 * inner, `wall ${wallSpeed} vs ${inner}`);
});

test('the water stays incompressible: the grid velocity has small divergence after projection', () => {
  const w = createWorld(10, 3);
  startShake(w, 1); run(w, 1.0);
  assert.ok(w.energy > 0.2, `energy ${w.energy}`);
  // Net flux through a sphere of radius 0.5 should be about zero for an incompressible flow.
  const out = [0, 0, 0];
  let flux = 0, mag = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const a = Math.acos(1 - 2 * ((i + 0.5) / 400)), b = i * 2.399963;
    const nx = Math.sin(a) * Math.cos(b), ny = Math.cos(a), nz = Math.sin(a) * Math.sin(b);
    waterVelocity(w, nx * 0.5, ny * 0.5, nz * 0.5, out);
    flux += out[0] * nx + out[1] * ny + out[2] * nz; mag += Math.hypot(...out); n++;
  }
  assert.ok(Math.abs(flux / n) < 0.35 * (mag / n), `flux ${flux / n} vs mean speed ${mag / n}`);
});

test('shaking the globe makes the water swirl and a drag stirs it less than a shake', () => {
  const a = createWorld(200, 8), b = createWorld(200, 8);
  startShake(b, 1); run(b, 0.9);
  holdGlobe(a, 0.4, 0); run(a, 0.9);
  assert.ok(b.energy > 0.2, `shake ${b.energy}`);
  assert.ok(b.energy > a.energy, `shake ${b.energy} beats drag ${a.energy}`);
});

test('solids are solid: a flake dropped on the roof, a pine tier or the lamp does not fall through', () => {
  const dropOn = (x, z, y0) => {
    const w = createWorld(4, 31);
    for (const g of w.flakes) g.rest = true;
    const f = w.flakes[0];
    f.rest = false; f.x = x; f.y = y0; f.z = z; f.vx = f.vy = f.vz = 0;
    run(w, 4);
    return { f, w };
  };
  // Roof of the cottage, a little off the ridge.
  const { f: roofFlake } = dropOn(HOUSE.x, HOUSE.z - 0.04, 0.2);
  assert.ok(roofFlake.rest && roofFlake.on === HOUSE.id, `roof flake on ${roofFlake.on}, rest ${roofFlake.rest}`);
  assert.ok(roofFlake.y > groundHeight(HOUSE.x, HOUSE.z) + 0.15, `roof flake y ${roofFlake.y}`);
  // The big pine's top tier.
  const t = TREES[2];
  const { f: treeFlake } = dropOn(t.x + 0.02, t.z, groundHeight(t.x, t.z) + t.h + 0.1);
  assert.ok(treeFlake.y > groundHeight(t.x, t.z) + t.h * 0.3, `tree flake fell through to ${treeFlake.y}`);
  assert.ok(sdSolid(t.id, treeFlake.x, treeFlake.y, treeFlake.z) > -0.003, 'tree flake not inside the tree');
  // Nothing ends up inside any solid after a violent shake.
  const w = createWorld(480, 17);
  startShake(w, 1.4); run(w, 6);
  let inside = 0;
  for (const g of w.flakes) {
    for (let id = 1; id <= 7; id++) if (sdSolid(id, g.x, g.y, g.z) < -0.012) inside++;
  }
  assert.ok(inside <= 3, `${inside} flakes inside solids`);
});

test('some snow settles on the trees and the roof, not only the ground', () => {
  const w = createWorld(720, 7);
  startShake(w, 1); run(w, 40);
  let perched = 0;
  for (const f of w.flakes) if (f.rest && f.on > 0) perched++;
  assert.ok(perched >= 6, `only ${perched} flakes perched`);
});

test('simulation is deterministic for a seed', () => {
  const a = createWorld(120, 21), b = createWorld(120, 21);
  startShake(a, 1); startShake(b, 1);
  run(a, 3); run(b, 3);
  for (let i = 0; i < a.flakes.length; i++) assert.equal(a.flakes[i].y, b.flakes[i].y);
});

test('speeds stay plausible: nothing flies faster than a couple of radii per second', () => {
  const w = createWorld(320, 12);
  startShake(w, 1.4);
  let max = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    stepSnow(w, 1 / 60);
    for (const f of w.flakes) max = Math.max(max, Math.hypot(f.vx, f.vy, f.vz));
  }
  assert.ok(max < 2.6, `max speed ${max}`);
  assert.ok(max > 0.5, `shake moves things, ${max}`);
});
