import test from "node:test";
import assert from "node:assert/strict";
import { MODEL, CREASES, STEP_COUNT, THICK, pose, facetArea } from "./foldMath.ts";

const inside = (p, pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    if (s === 0) s = Math.sign(c);
    else if (Math.sign(c) !== s) return false;
  }
  return true;
};
const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

test("paper area is conserved through every fold", () => {
  for (const st of MODEL.states) {
    const a = st.reduce((t, f) => t + facetArea(f), 0);
    assert.ok(Math.abs(a - 4) < 1e-6, `area ${a}`);
  }
});

test("every fold cuts something and pieces keep counter-clockwise winding", () => {
  for (let i = 0; i < CREASES.length; i++) assert.ok(MODEL.cuts[i].some((f) => f.move), `step ${i} moves nothing`);
  for (const st of MODEL.states) for (const f of st) {
    let a = 0;
    for (let i = 0; i < f.pts.length; i++) { const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    assert.ok(a > 0, "clockwise facet");
  }
});

test("overlapping facets never share a layer", () => {
  for (const st of MODEL.states) {
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i], b = st[j];
      if (inside(centroid(a.pts), b.pts) || inside(centroid(b.pts), a.pts)) assert.notEqual(a.layer, b.layer);
    }
  }
});

test("folded flap lands flat, flipped and above the pile", () => {
  for (let s = 0; s < STEP_COUNT; s++) {
    const end = pose(s + 1 - 1e-9);
    const stay = end.filter((f) => !f.moving);
    const top = Math.max(...stay.map((f) => f.pts[0][2]));
    for (const f of end.filter((f) => f.moving)) {
      assert.ok(Math.min(...f.pts.map((p) => p[2])) >= top - 1e-6, "flap below the pile");
      assert.ok(f.normals[0][2] * (f.flipped ? -1 : 1) < -0.99, "flap is not face down");
    }
  }
});

test("fold is continuous: pose at step boundaries matches the flat states", () => {
  for (let s = 0; s <= STEP_COUNT; s++) {
    const p = pose(s);
    const flatArea = (s === STEP_COUNT ? MODEL.states[STEP_COUNT] : MODEL.states[s]).reduce((t, f) => t + facetArea(f), 0);
    const posedArea = p.reduce((t, f) => {
      let a = 0;
      for (let i = 0; i < f.pts.length; i++) { const q = f.pts[i], r = f.pts[(i + 1) % f.pts.length]; a += q[0] * r[1] - r[0] * q[1]; }
      return t + Math.abs(a / 2);
    }, 0);
    assert.ok(Math.abs(flatArea - 4) < 1e-6 && Math.abs(posedArea - 4) < 1e-6, `step ${s}: ${posedArea}`);
    if (s < STEP_COUNT) for (const f of p) for (const v of f.pts) assert.ok(Math.abs(v[2] - f.layer * THICK) < 1e-9 || f.moving);
  }
});

test("mid-fold the flap is lifted above the sheet", () => {
  const p = pose(0.5);
  const maxZ = Math.max(...p.flatMap((f) => f.pts.map((v) => v[2])));
  assert.ok(maxZ > 0.5, `max z ${maxZ}`);
});
