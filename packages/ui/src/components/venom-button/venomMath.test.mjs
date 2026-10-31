// node --experimental-strip-types --test venomMath.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAIN, GRAB, MAX_PULL, PILL_CX, PILL_CY, SENSE,
  anchorOf, createVenom, drainEvents, edgeDist, isAnimating,
  pointerDown, pointerMove, pointerUp, pillFrame, spikeCircles, stepVenom, strandCircles, strandRibbon,
} from "./venomMath.ts";

const step = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) stepVenom(s, 1 / 60); return s; };
const minTipDist = (s, p) => Math.min(...s.strands.map((t) => Math.hypot(t.tip.x - p.x, t.tip.y - p.y)));
const maxAnchorDist = (s) => Math.max(...s.strands.map((t, i) => { const a = anchorOf(s.finger, i); return Math.hypot(t.tip.x - a.x, t.tip.y - a.y); }));

test("a far touch reaches but does not connect", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, 10); // edge distance ~109: inside SENSE, outside GRAB
  assert.ok(edgeDist({ x: PILL_CX, y: 10 }) > GRAB && edgeDist({ x: PILL_CX, y: 10 }) <= SENSE);
  assert.equal(s.mode, "sense");
  step(s, 0.8);
  assert.ok(maxAnchorDist(s) > 8, "tendrils leave the pill");
  assert.ok(minTipDist(s, s.finger) > 15, "but they do not reach the finger");
  pointerUp(s);
});

test("a close touch lunges and wraps the finger", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, 40);
  assert.equal(s.mode, "grab");
  step(s, 0.6);
  assert.ok(minTipDist(s, s.finger) < 14, "tips converge on the finger");
  const grabCircles = strandCircles(s, 0);
  assert.equal(grabCircles.length, CHAIN + 1, "a bulb caps the tip while grabbed");
});

test("release snaps back, spikes, wobbles and settles", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, 40);
  step(s, 0.6);
  pointerUp(s);
  assert.equal(s.mode, "snap");
  assert.ok(s.spikes.length >= 3 && s.spikes.length <= 5, "a few spikes pop");
  assert.ok(spikeCircles(s).length > 0);
  step(s, 0.3);
  assert.ok(Math.abs(s.squash - 1) > 0.01 || Math.abs(s.squashVel) > 0.4, "the pill wobbles");
  step(s, 1.6);
  assert.equal(s.mode, "idle");
  assert.ok(maxAnchorDist(s) < 6, "tendrils melt back");
  assert.equal(s.spikes.length, 0, "spikes melt away");
  assert.equal(isAnimating(s), false, "the frame clock can stop");
});

test("pulling away tears the hold loose", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, 40);
  step(s, 0.4);
  pointerMove(s, PILL_CX + 320, PILL_CY);
  assert.equal(s.mode, "snap");
  assert.ok(drainEvents(s).includes("release"));
  step(s, 1.6);
  assert.equal(s.mode, "idle");
});

test("a quick tap presses without tendrils", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, PILL_CY);
  step(s, 0.1);
  pointerUp(s);
  const events = drainEvents(s);
  assert.ok(events.includes("press"));
  assert.ok(!events.includes("release"));
});

test("the pill stretch stays bounded on a hard drag", () => {
  const s = createVenom();
  pointerDown(s, PILL_CX, 40);
  for (let i = 0; i < 90; i++) { pointerMove(s, PILL_CX, 40 + i); stepVenom(s, 1 / 60); }
  const f = pillFrame(s);
  assert.ok(Math.hypot(f.cx - PILL_CX, f.cy - PILL_CY) <= MAX_PULL + 2);
});

test("reduced motion snaps straight to each pose", () => {
  const s = createVenom(true);
  pointerDown(s, PILL_CX, 40);
  step(s, 0.3);
  assert.ok(minTipDist(s, s.finger) < 1, "tips already on the finger");
  pointerUp(s);
  step(s, 0.05);
  assert.equal(s.mode, "idle");
  assert.equal(s.spikes.length, 0);
  assert.ok(maxAnchorDist(s) < 1, "no overshoot");
});

test("same inputs give the same frame", () => {
  const run = () => { const s = createVenom(); pointerDown(s, PILL_CX, 40); pointerMove(s, PILL_CX + 30, 60); step(s, 0.5); return JSON.stringify(s.strands.map((t) => [t.tip.x.toFixed(4), t.tip.y.toFixed(4)])); };
  assert.equal(run(), run());
});

test("strand ribbons have real fill area (regression: degenerate sliver)", () => {
  const s = createVenom();
  pointerDown(s, 30, 50);
  step(s, 1);
  for (let i = 0; i < s.strands.length; i++) {
    const pts = strandRibbon(s, i);
    let twice = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      twice += a.x * b.y - b.x * a.y;
    }
    const area = Math.abs(twice) / 2;
    // A zero-area sliver means both polygon edges collapsed onto one line,
    // which renders strands as invisible hairlines.
    assert.ok(area > 60, `strand ${i} ribbon area ${area.toFixed(1)} should be well above a degenerate sliver`);
  }
});
