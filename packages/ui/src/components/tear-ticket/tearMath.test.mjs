// Run: node --test components/tear-ticket/tearMath.test.mjs   (from packages/ui/src, Node 22+)
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.')&&!/\\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e}}`), import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";
const m = await import("./tearMath.ts");
const d = await import("./tearDesign.ts");

const pull = (down, side = 0, frames = 60, seed = 3) => {
  const w = m.createWorld(seed);
  assert.ok(m.grab(w, 80, 270));
  for (let i = 1; i <= frames; i++) {
    m.drag(w, 80 + (side * i) / frames, 270 + (down * i) / frames);
    m.advance(w, 1 / 60);
  }
  for (let i = 0; i < 40; i++) m.advance(w, 1 / 60);
  return w;
};

test("a pull in the plane of the ticket does nothing", () => {
  const w = m.createWorld(3);
  assert.ok(m.grab(w, 120, 280));
  for (let i = 1; i <= 30; i++) { m.drag(w, 120 - i, 280 - i * 0.5); m.advance(w, 1 / 60); }
  assert.equal(w.broken, 0);
});

test("the further you pull the further it tears", () => {
  const a = pull(25).broken, b = pull(60).broken, c = pull(100).broken;
  assert.ok(a >= 1 && a < b && b < c, `${a} ${b} ${c}`);
  assert.equal(pull(100).mode, "attached");
});

test("a long pull takes the stub off and it comes to rest on the table", () => {
  const w = pull(260, 20, 80);
  assert.equal(w.mode, "free");
  m.release(w);
  for (let i = 0; i < 60 * 8; i++) m.advance(w, 1 / 60);
  assert.ok(w.rest);
  assert.equal(w.body.z, 0);
  assert.ok(w.body.x >= 104 && w.body.x <= m.TW - 104);
  assert.ok(w.body.y <= m.TH - 50 && w.body.y >= 100);
});

test("a released partial tear stays bent where it was left", () => {
  const w = pull(70);
  m.release(w);
  for (let i = 0; i < 90; i++) m.advance(w, 1 / 60);
  const ties = w.broken;
  assert.ok(w.psi > 0.1 && w.psi < 1.2, `psi ${w.psi}`);
  for (let i = 0; i < 90; i++) m.advance(w, 1 / 60);
  assert.equal(w.broken, ties);
});

test("ties only ever break, one by one, and the tear can be picked up again", () => {
  const w = pull(50);
  const k = w.broken;
  m.release(w);
  for (let i = 0; i < 30; i++) m.advance(w, 1 / 60);
  assert.equal(w.broken, k);
  const c = m.currentCurve(w);
  const p = { x: 0, y: 0 };
  m.mapBent(c, 10, 40, p);
  assert.ok(m.grab(w, p.x, p.y));
  for (let i = 1; i <= 60; i++) { m.drag(w, p.x, p.y + i * 3); m.advance(w, 1 / 60); }
  assert.ok(w.broken > k);
});

test("the scripted tear completes and is deterministic", () => {
  const a = m.createWorld(5), b = m.createWorld(5);
  m.fullTear(a); m.fullTear(b);
  assert.equal(a.mode, "free");
  assert.equal(a.body.x, b.body.x);
  assert.equal(a.body.ang, b.body.ang);
});

test("the torn edge is shared and closes on the slit edges", () => {
  const w = m.createWorld(3);
  for (let k = 0; k < m.NT; k++) {
    assert.equal(m.fracture(w, k, 0), 0);
    assert.equal(m.fracture(w, k, 1), 0);
    for (let i = 0; i <= 8; i++) assert.ok(Math.abs(m.fracture(w, k, i / 8)) <= 2.4 + 1e-9);
  }
});

test("the bent strip keeps its length", () => {
  const c = m.buildCurve(120, 1, 1.1);
  let len = 0;
  for (let i = 1; i <= c.n; i++) len += Math.hypot(c.cx[i] - c.cx[i - 1], c.cy[i] - c.cy[i - 1]);
  assert.ok(Math.abs(len - c.n) < 0.2, `${len} vs ${c.n}`);
});

test("drawing: every frame is finite and the body changes only when a tie breaks", () => {
  const w = pull(80);
  const f = d.buildFrame(w);
  for (const list of [f.stub, f.stubShadow, f.overlay]) {
    for (const it of list) {
      const all = it.k === "poly" ? [it.pts, ...(it.extra ?? [])].flat() : [it.x, it.y, it.r];
      assert.ok(all.every(Number.isFinite));
    }
  }
  const key = d.mainKey(w);
  m.advance(w, 1 / 60);
  assert.equal(d.mainKey(w), key);
  const free = pull(260, 20, 80);
  m.release(free);
  for (let i = 0; i < 300; i++) {
    m.advance(free, 1 / 60);
    for (const it of d.buildFrame(free).stub) {
      if (it.k === "poly") assert.ok(it.pts.every(Number.isFinite));
    }
  }
});
