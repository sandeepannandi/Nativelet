import test from "node:test";
import assert from "node:assert/strict";
import {
  GS_H, GS_W, HANDLE_R, LOUPE_R, MAX_STOPS, PRESETS, RING_MID, SQ, TRACK_X0, TRACK_X1, TRACK_Y, WHEEL_CX, WHEEL_CY,
  addAtWidestGap, addStopAt, colorAt, createStudio, gradientRamp, gradientToCss, hexToRgb, hitTarget, hsvToRgb, hueFromPoint,
  isAnimating, mixOklab, moveSelected, oklabToRgb, overlayFor, pointerDown, pointerMove, pointerUp, posToX, removeSelected,
  resample, ringPoint, rgbToHex, rgbToHsv, rgbToOklab, selectNeighbour, selectedStop, sortedStops, startPreset, stepStudio,
  stopHex, svFromPoint, svPoint, xToPos,
} from "./gradientMath.ts";

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const run = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s = stepStudio(s, 1 / 60); return s; };

test("hsv <-> rgb round trips", () => {
  for (const [h, s, v] of [[0, 1, 1], [200, 0.5, 0.7], [300, 0.2, 0.9], [120, 1, 0.3]]) {
    const back = rgbToHsv(hsvToRgb(h, s, v));
    near(back.h, h, 0.01); near(back.s, s); near(back.v, v);
  }
  assert.equal(rgbToHex(hsvToRgb(0, 1, 1)), "#FF0000");
  assert.deepEqual(hexToRgb("#00ff00"), [0, 1, 0]);
});

test("oklab round trip and known values", () => {
  for (const c of ["#FF9966", "#3A3D9E", "#6FF0D8", "#808080"]) {
    const back = oklabToRgb(rgbToOklab(hexToRgb(c)));
    assert.equal(rgbToHex(back), c);
  }
  near(rgbToOklab([1, 1, 1])[0], 1, 1e-3);
  near(rgbToOklab([0, 0, 0])[0], 0, 1e-6);
});

test("oklab midpoint of black and white is perceptual mid grey, not sRGB 50%", () => {
  const mid = mixOklab([0, 0, 0], [1, 1, 1], 0.5);
  near(rgbToOklab(mid)[0], 0.5, 0.01);
  assert.ok(mid[0] < 0.46 && mid[0] > 0.33, `mid ${mid[0]}`);
});

test("colorAt hits stops exactly and clamps ends", () => {
  const s = createStudio();
  const list = sortedStops(s.stops);
  assert.equal(rgbToHex(colorAt(s.stops, list[0].pos)), stopHex(list[0]));
  assert.equal(rgbToHex(colorAt(s.stops, 1)), stopHex(list[2]));
  assert.equal(rgbToHex(colorAt(s.stops, 0.5)), stopHex(list[1]));
  assert.equal(rgbToHex(colorAt(s.stops, -3)), stopHex(list[0]));
});

test("gradientRamp is strictly increasing, spans 0..1 and keeps stop positions", () => {
  const s = createStudio();
  const r = gradientRamp(s.stops);
  assert.equal(r.colors.length, r.positions.length);
  assert.equal(r.positions[0], 0);
  assert.equal(r.positions[r.positions.length - 1], 1);
  for (let i = 1; i < r.positions.length; i++) assert.ok(r.positions[i] > r.positions[i - 1]);
  assert.ok(r.positions.includes(0.5));
});

test("css export lists stops in position order", () => {
  const css = gradientToCss(createStudio().stops);
  assert.match(css, /^linear-gradient\(in oklab 90deg, #FF9966 0%, #C2509C 50%, #3A3D9E 100%\)$/);
});

test("hue and sv geometry round trip", () => {
  for (const h of [0, 45, 90, 181, 270, 359]) near(hueFromPoint(ringPoint(h).x, ringPoint(h).y), h, 1e-6);
  const p = svPoint(0.25, 0.75);
  const sv = svFromPoint(p.x, p.y);
  near(sv.s, 0.25); near(sv.v, 0.75);
  const out = svFromPoint(WHEEL_CX + 500, WHEEL_CY - 500);
  assert.deepEqual(out, { s: 1, v: 1 });
});

test("hit testing: handle beats ring beats square beats empty track", () => {
  const s = createStudio();
  const mid = s.stops[1];
  assert.deepEqual(hitTarget(s, posToX(mid.pos), TRACK_Y), { kind: "stop", id: mid.id });
  assert.deepEqual(hitTarget(s, posToX(mid.pos) + HANDLE_R + 6, TRACK_Y + 4), { kind: "stop", id: mid.id });
  assert.equal(hitTarget(s, posToX(0.25), TRACK_Y).kind, "track");
  const rp = ringPoint(30);
  assert.equal(hitTarget(s, rp.x, rp.y).kind, "hue");
  assert.equal(hitTarget(s, WHEEL_CX, WHEEL_CY).kind, "sv");
  assert.equal(hitTarget(s, 4, 500).kind, null);
});

test("dragging the hue ring and square edits only the selected stop", () => {
  let s = createStudio();
  const before = s.stops.map((t) => ({ ...t }));
  const rp = ringPoint(200);
  s = pointerDown(s, rp.x, rp.y);
  s = pointerMove(s, ringPoint(260).x, ringPoint(260).y);
  s = pointerUp(s);
  near(selectedStop(s).h, 260, 1e-6);
  for (const t of s.stops) if (t.id !== s.selected) assert.deepEqual(t, before.find((b) => b.id === t.id));
  const p = svPoint(0.2, 0.9);
  s = pointerDown(s, p.x, p.y);
  s = pointerMove(s, WHEEL_CX - 500, WHEEL_CY + 500);
  s = pointerUp(s);
  assert.equal(selectedStop(s).s, 0); assert.equal(selectedStop(s).v, 0);
});

test("dragging a stop clamps to the track and keeps the grab offset", () => {
  let s = createStudio();
  const st = s.stops[0];
  s = pointerDown(s, posToX(st.pos) + 5, TRACK_Y);
  s = pointerMove(s, posToX(0.3) + 5, TRACK_Y + 3);
  near(s.stops[0].pos, 0.3, 1e-6);
  s = pointerMove(s, 9999, TRACK_Y);
  assert.equal(s.stops[0].pos, 1);
  s = pointerUp(s);
  assert.equal(s.stops.length, 3);
  assert.equal(s.selected, st.id);
});

test("pulling a stop away removes it on release; pulling back cancels", () => {
  let s = createStudio();
  const st = s.stops[2];
  s = pointerDown(s, posToX(st.pos), TRACK_Y);
  s = pointerMove(s, posToX(st.pos), TRACK_Y + 80);
  assert.equal(s.drag.remove, true);
  assert.equal(overlayFor(run(s, 0.3)).remove, true);
  s = pointerMove(s, posToX(st.pos), TRACK_Y + 5);
  assert.equal(s.drag.remove, false);
  s = pointerUp(s);
  assert.equal(s.stops.length, 3);
  s = pointerDown(s, posToX(st.pos), TRACK_Y);
  s = pointerMove(s, posToX(st.pos), TRACK_Y - 90);
  s = pointerUp(s);
  assert.equal(s.stops.length, 2);
  assert.ok(s.stops.some((t) => t.id === s.selected));
});

test("never drops below two stops", () => {
  let s = createStudio();
  s = removeSelected(s); s = removeSelected(s); s = removeSelected(s);
  assert.equal(s.stops.length, 2);
  const a = s.stops[0];
  s = pointerDown(s, posToX(a.pos), TRACK_Y);
  s = pointerMove(s, posToX(a.pos), TRACK_Y + 120);
  assert.equal(s.drag.remove, false);
});

test("tapping empty track adds a stop sampled from the ramp; a drag does not", () => {
  let s = createStudio();
  const x = posToX(0.25);
  const expected = rgbToHex(colorAt(s.stops, 0.25));
  s = pointerDown(s, x, TRACK_Y);
  s = pointerUp(s);
  assert.equal(s.stops.length, 4);
  near(selectedStop(s).pos, 0.25, 1e-6);
  assert.ok(Math.abs(parseInt(stopHex(selectedStop(s)).slice(1, 3), 16) - parseInt(expected.slice(1, 3), 16)) <= 2);
  let t = createStudio();
  t = pointerDown(t, x, TRACK_Y);
  t = pointerMove(t, x + 40, TRACK_Y);
  t = pointerUp(t);
  assert.equal(t.stops.length, 3);
});

test("stop count is capped", () => {
  let s = createStudio();
  for (let i = 0; i < 10; i++) s = addAtWidestGap(s);
  assert.equal(s.stops.length, MAX_STOPS);
  assert.equal(addStopAt(s, 0.4).stops.length, MAX_STOPS);
});

test("keyboard paths: move, select, remove", () => {
  let s = createStudio();
  s = moveSelected(s, 0.1);
  near(selectedStop(s).pos, 0.6, 1e-9);
  s = moveSelected(s, 5);
  assert.equal(selectedStop(s).pos, 1);
  const first = selectNeighbour(s, 1).selected;
  assert.notEqual(first, s.selected);
  assert.equal(removeSelected(s).stops.length, 2);
});

test("loupe lifts while dragging on the wheel, stays inside the canvas and settles away", () => {
  let s = createStudio();
  const p = svPoint(0.5, 0.5);
  s = pointerDown(s, p.x, p.y);
  s = run(s, 0.5);
  assert.ok(s.lift > 0.95);
  const o = overlayFor(s);
  assert.equal(o.kind, "loupe");
  assert.ok(o.ly < s.py && o.lx >= LOUPE_R && o.lx <= GS_W - LOUPE_R);
  s = pointerMove(s, 2, 30);
  s = run(s, 0.4);
  const edge = overlayFor(s);
  assert.ok(edge.lx >= LOUPE_R && edge.ly >= LOUPE_R && edge.ly <= GS_H - LOUPE_R);
  s = pointerUp(s);
  s = run(s, 1);
  assert.equal(overlayFor(s), null);
  assert.equal(isAnimating(s), false);
});

test("pin bubble follows a dragged stop", () => {
  let s = createStudio();
  const st = s.stops[0];
  s = pointerDown(s, posToX(st.pos), TRACK_Y);
  s = run(pointerMove(s, posToX(0.2), TRACK_Y), 0.4);
  const o = overlayFor(s);
  assert.equal(o.kind, "pin");
  near(o.x, posToX(0.2), 1e-6);
  assert.equal(o.hex, stopHex(s.stops[0]));
});

test("preset tween lands exactly, and a touch mid-flight interrupts it", () => {
  const preset = PRESETS[2];
  let s = startPreset(createStudio(), preset);
  assert.ok(s.tween);
  s = run(s, 0.3);
  assert.ok(s.tween);
  const mid = s.stops.map((t) => stopHex(t));
  s = run(s, 1);
  assert.equal(s.tween, null);
  assert.deepEqual(sortedStops(s.stops).map(stopHex), preset.colors);
  assert.notDeepEqual(mid, preset.colors);
  let t = startPreset(createStudio(), preset);
  t = run(t, 0.25);
  const frozen = t.stops.map((x) => ({ ...x }));
  const rp = ringPoint(10);
  t = pointerDown(t, rp.x, rp.y);
  assert.equal(t.tween, null);
  t = run(t, 0.5);
  for (let i = 0; i < 3; i++) if (i !== 1) near(t.stops[i].pos, frozen[i].pos, 1e-9);
});

test("preset start does not jump the picture", () => {
  const s0 = createStudio();
  const s1 = startPreset(s0, PRESETS[1]);
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    const a = colorAt(s0.stops, x);
    const b = colorAt(s1.stops, x);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.08, `x=${x}`);
  }
});

test("preset switch changes stop count cleanly", () => {
  let s = createStudio();
  s = addAtWidestGap(s); s = addAtWidestGap(s);
  assert.equal(s.stops.length, 5);
  s = run(startPreset(s, PRESETS[3]), 1.2);
  assert.equal(s.stops.length, 3);
  assert.ok(s.stops.some((t) => t.id === s.selected));
});

test("reduced motion applies presets at once and never leaves the loupe animating", () => {
  let s = startPreset(createStudio(PRESETS[0], true), PRESETS[1]);
  assert.equal(s.tween, null);
  assert.deepEqual(sortedStops(s.stops).map(stopHex), PRESETS[1].colors);
  const p = svPoint(0.5, 0.5);
  s = stepStudio(pointerDown(s, p.x, p.y), 1 / 60);
  assert.equal(s.lift, 1);
});

test("resample keeps endpoints", () => {
  const r = resample(createStudio().stops, 5);
  assert.equal(r.length, 5);
  assert.equal(r[0].pos, 0); assert.equal(r[4].pos, 1);
  assert.equal(rgbToHex(r[4].rgb), "#3A3D9E");
});

test("track x mapping is its own inverse", () => {
  for (const p of [0, 0.3, 1]) near(xToPos(posToX(p)), p, 1e-9);
  assert.equal(posToX(0), TRACK_X0); assert.equal(posToX(1), TRACK_X1);
  assert.ok(RING_MID > SQ * Math.SQRT2);
});
