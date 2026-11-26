// Run: node --test components/roulette-wheel/rouletteMath.test.mjs   (from packages/ui/src, Node 22+)
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.')&&!/\\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e}}`), import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";
const m = await import("./rouletteMath.ts");
const d = await import("./rouletteDesign.ts");

const run = (speed, seed) => {
  const w = m.createWorld(seed);
  m.launch(w, speed, seed * 977);
  m.simulateToRest(w, 90);
  return w;
};

test("the single-zero order has 37 distinct numbers and the usual colours", () => {
  assert.equal(new Set(m.ORDER).size, 37);
  assert.deepEqual([...m.ORDER].sort((a, b) => a - b), [...Array(37).keys()]);
  assert.equal(m.colorOf(0), "green");
  assert.equal(m.colorOf(32), "red");
  assert.equal(m.colorOf(15), "black");
  const reds = m.ORDER.filter((n) => m.colorOf(n) === "red").length;
  assert.equal(reds, 18);
});

test("a fast ball rides high on the track and a slow one rides low", () => {
  const radius = (speed) => {
    const w = m.createWorld(3);
    m.launch(w, speed, 5);
    for (let i = 0; i < 480; i++) m.step(w, 1 / 480);
    return Math.hypot(w.ball.x, w.ball.y);
  };
  assert.ok(radius(7.6) > radius(5.2));
});

test("the ball spirals inwards as drag takes its speed, then leaves the track", () => {
  const w = m.createWorld(2);
  m.launch(w, 6.4, 11);
  let r0 = null, drop = null, t = 0;
  while (t < 60 && !w.ball.locked) {
    m.step(w, 1 / 480);
    t += 1 / 480;
    if (t > 1 && r0 === null) r0 = Math.hypot(w.ball.x, w.ball.y);
    if (drop === null && w.phase !== "track") drop = t;
  }
  assert.ok(drop > 4 && drop < 30, `drop time ${drop}`);
  assert.ok(r0 > m.TRACK_IN);
  assert.ok(w.ball.locked);
});

test("the wheel only ever slows and never reverses", () => {
  const w = m.createWorld(1);
  m.launch(w, 6, 3);
  let prev = w.omega;
  for (let i = 0; i < 480 * 40; i++) {
    m.step(w, 1 / 480);
    assert.ok(w.omega <= 0 && w.omega >= prev - 1e-12, "omega stays negative and decays");
    prev = w.omega;
  }
});

test("every launch settles in a pocket and the result matches the pocket under the ball", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = run(4.8 + (seed % 9) * 0.4, seed);
    assert.ok(w.ball.locked, `seed ${seed} locked`);
    const r = Math.hypot(w.ball.x, w.ball.y);
    assert.ok(r > m.POCKET_IN && r < m.POCKET_OUT, `in the pocket ring, r=${r}`);
    const phi = Math.atan2(w.ball.y, w.ball.x);
    assert.equal(w.result, m.numberAt(m.pocketAt(w.theta, phi)));
    // the ball keeps turning with the wheel once locked
    const before = m.pocketAt(w.theta, Math.atan2(w.ball.y, w.ball.x));
    m.advance(w, 0.2);
    assert.equal(m.pocketAt(w.theta, Math.atan2(w.ball.y, w.ball.x)), before);
  }
});

test("the same launch gives the same result and different launches spread over many pockets", () => {
  assert.equal(run(6.4, 9).result, run(6.4, 9).result);
  const seen = new Set();
  for (let seed = 1; seed <= 120; seed++) seen.add(run(4.8 + (seed % 9) * 0.4, seed).result);
  assert.ok(seen.size >= 30, `only ${seen.size} different results`);
});

test("the ball never leaves the bowl or reaches the turret", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const w = m.createWorld(seed);
    m.launch(w, m.MAX_SPEED, seed);
    for (let i = 0; i < 480 * 30 && !w.ball.locked; i++) {
      m.step(w, 1 / 480);
      const r = Math.hypot(w.ball.x, w.ball.y);
      assert.ok(r <= m.WALL_R + 1e-6 && r >= m.POCKET_IN, `r=${r}`);
      assert.ok(Number.isFinite(w.ball.x) && Number.isFinite(w.ball.z));
    }
  }
});

test("a ball dropped on a fret from above leaves with a bounce, not through it", () => {
  const w = m.createWorld(4);
  w.omega = 0;
  w.theta = 0;
  const b = w.ball;
  b.live = true;
  const r = 0.4;
  // a fret sits at angle 0; come at it from one side at speed
  b.x = r * Math.cos(0.05); b.y = r * Math.sin(0.05);
  b.vx = 0; b.vy = -1.5; b.z = 0; b.vz = 0;
  for (let i = 0; i < 400; i++) m.step(w, 1 / 480);
  const phi = Math.atan2(b.y, b.x);
  assert.ok(phi > 0, "stays on the side it came from");
});

test("the draw list builds, is finite and grows only with the pockets", () => {
  const st = d.staticScene();
  assert.ok(st.back.length > 500 && st.front.length > 100);
  const w = m.createWorld(5);
  m.launch(w, 6.4, 8);
  m.advance(w, 1);
  const f = d.buildFrame(w, { power: 0.5, charging: true });
  assert.ok(f.dyn.length > 150 && f.dyn.length < 600);
  assert.ok(f.overlay.length > 10);
  for (const it of [...st.back, ...st.front, ...f.dyn, ...f.overlay]) {
    const nums = it.k === "poly" ? it.pts : [it.x, it.y, it.r];
    for (const n of nums) assert.ok(Number.isFinite(n));
  }
});
