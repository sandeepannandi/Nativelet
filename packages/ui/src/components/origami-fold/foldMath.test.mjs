// Run: node --test components/origami-fold/foldMath.test.mjs   (from packages/ui/src, Node 22+)
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.')&&!/\\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e}}`), import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";
const { flatSheet, cutSheet, applyCut, poseCuts, sheetArea, pointInFacet, THICK, facetArea } = await import("./foldMath.ts");
const { FoldController } = await import("./foldController.ts");
const { screenToSheet, flatView } = await import("./foldDesign.ts");

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const randCrease = () => {
  const a = rnd() * Math.PI * 2;
  return { nx: Math.cos(a), ny: Math.sin(a), d: (rnd() - 0.5) * 1.2 };
};
const ccw = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a > 0; };
const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const shrink = (pts, k = 0.8) => { const c = centroid(pts); return pts.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]); };

test("any sequence of random folds conserves paper area and winding", () => {
  let sheet = flatSheet();
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const c = randCrease();
    const cuts = cutSheet(sheet, c);
    if (!cuts) continue;
    sheet = applyCut(cuts, c);
    n++;
    assert.ok(Math.abs(sheetArea(sheet) - 4) < 1e-6, `area ${sheetArea(sheet)} after ${n}`);
    for (const f of sheet) assert.ok(ccw(f.pts), "clockwise facet");
  }
  assert.ok(n >= 10, `only ${n} folds landed`);
});

test("overlapping facets never share a layer", () => {
  let sheet = flatSheet();
  for (let i = 0; i < 25; i++) {
    const c = randCrease();
    const cuts = cutSheet(sheet, c);
    if (cuts) sheet = applyCut(cuts, c);
  }
  for (let i = 0; i < sheet.length; i++) for (let j = i + 1; j < sheet.length; j++) {
    const a = sheet[i], b = sheet[j];
    if (pointInFacet(centroid(shrink(a.pts)), b.pts) || pointInFacet(centroid(shrink(b.pts)), a.pts)) assert.notEqual(a.layer, b.layer);
  }
});

test("a crease that misses the paper folds nothing", () => {
  assert.equal(cutSheet(flatSheet(), { nx: 1, ny: 0, d: 3 }), null);
  assert.equal(cutSheet(flatSheet(), { nx: 1, ny: 0, d: -3 }), null);
});

test("mid-fold the flap is lifted, and fully folded it lies flat on top, face down", () => {
  const c = { nx: 0.6, ny: 0.8, d: 0.1 };
  const cuts = cutSheet(flatSheet(), c);
  const mid = poseCuts(cuts, c, Math.PI / 2);
  assert.ok(Math.max(...mid.flatMap((f) => f.pts.map((v) => v[2]))) > 0.5);
  const end = poseCuts(cuts, c, Math.PI);
  const top = Math.max(...end.filter((f) => !f.moving).map((f) => f.pts[0][2]));
  for (const f of end.filter((f) => f.moving)) {
    assert.ok(Math.min(...f.pts.map((p) => p[2])) >= top - 1e-6);
    assert.ok(f.normals[0][2] * (f.flipped ? -1 : 1) < -0.99);
  }
  for (const phi of [0, 0.7, 1.6, 2.5, Math.PI]) {
    const area = poseCuts(cuts, c, phi).reduce((t, f) => { let a = 0; for (let i = 0; i < f.pts.length; i++) { const q = f.pts[i], r = f.pts[(i + 1) % f.pts.length]; a += q[0] * r[1] - r[0] * q[1]; } return t + Math.abs(a / 2); }, 0);
    assert.ok(area <= 4 + 1e-6 && area > 1.5, `phi ${phi} area ${area}`);
  }
});

/* ---- drag gestures through the controller ---- */
// screen point of a sheet point on the flat desk, found by search so the test does not depend on the camera
function toScreen(p) {
  let best = [170, 210], bd = 1e9;
  for (let x = 0; x <= 340; x += 2) for (let y = 0; y <= 420; y += 2) {
    const q = screenToSheet(x, y, flatView());
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
const settle = (c) => { for (let i = 0; i < 600 && c.busy; i++) c.update(1 / 60); };

test("drag from a corner in any direction folds it, and the crease follows the finger", () => {
  for (const [from, to] of [[[0.8, -0.8], [-0.2, -0.3]], [[-0.8, 0.8], [0.3, 0.1]], [[0.0, 0.9], [0.1, -0.7]], [[-0.9, -0.2], [0.8, 0.5]]]) {
    const c = new FoldController();
    c.update(1 / 60);
    const a = toScreen(from), b = toScreen(to);
    assert.ok(c.down(a[0], a[1]));
    for (let i = 1; i <= 20; i++) { c.move(a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20); c.update(1 / 60); }
    c.up();
    settle(c);
    assert.equal(c.folds, 1, "fold did not land");
    assert.ok(Math.abs(sheetArea(c.sheet) - 4) < 1e-6);
    const f = screenToSheet(b[0], b[1], flatView());
    assert.ok(c.sheet.some((s) => s.flipped && pointInFacet(f, s.pts)), "flap did not land under the finger");
  }
});

test("a short drag springs back and changes nothing", () => {
  const c = new FoldController();
  c.update(1 / 60);
  const a = toScreen([0.8, -0.8]);
  c.down(a[0], a[1]);
  c.move(a[0] - 14, a[1] - 6);
  c.update(1 / 60);
  c.up();
  settle(c);
  assert.equal(c.folds, 0);
  assert.equal(c.sheet.length, 1);
});

test("a press outside the paper does not grab", () => {
  const c = new FoldController();
  assert.equal(c.down(4, 4), false);
});

test("folds stack: fold, fold again, then undo and reset restore the sheet", () => {
  const c = new FoldController();
  c.update(1 / 60);
  const drag = (f, t) => {
    const a = toScreen(f), b = toScreen(t);
    assert.ok(c.down(a[0], a[1]));
    for (let i = 1; i <= 20; i++) { c.move(a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20); c.update(1 / 60); }
    c.up();
    settle(c);
  };
  drag([0.8, -0.8], [-0.4, 0.2]);
  assert.equal(c.folds, 1);
  const afterOne = c.sheet.length;
  drag([-0.6, 0.6], [0.2, 0.0]);
  assert.ok(c.folds >= 1);
  assert.ok(Math.abs(sheetArea(c.sheet) - 4) < 1e-6);
  const n = c.folds;
  c.undo();
  settle(c);
  assert.equal(c.folds, n - 1);
  if (n === 2) assert.equal(c.sheet.length, afterOne);
  c.reset();
  settle(c);
  assert.equal(c.folds, 0);
  assert.equal(c.sheet.length, 1);
  assert.ok(c.frame().length > 5);
});

test("facet area helper", () => assert.ok(Math.abs(facetArea(flatSheet()[0]) - 4) < 1e-9));
void THICK;
