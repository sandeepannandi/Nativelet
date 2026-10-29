import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR_COUNT, BAR_SAMPLE_S, CANCEL_DISTANCE, LOCK_DISTANCE, MAX_SECONDS, PRESS_DELAY_S,
  barSegment, cancelWash, clamp01, createRecorder, formatClock, levelAt,
  recorderLockedCancel, recorderLockedSend, recorderPressEnd, recorderPressMove, recorderPressStart,
  stepRecorder,
} from './recorderMath.ts';

const run = (s, seconds) => {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) stepRecorder(s, 1 / 60);
};

test('level is deterministic and bounded', () => {
  for (const t of [0, 0.05, 1.234, 7.77, 60.5]) {
    assert.equal(levelAt(t), levelAt(t));
    assert.ok(levelAt(t) >= 0 && levelAt(t) <= 1, `level in range at ${t}`);
  }
  // It actually moves like speech, not a flat line.
  const levels = Array.from({ length: 40 }, (_, i) => levelAt(i * 0.09));
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.3);
});

test('hold past the delay starts recording and samples on the grid', () => {
  const s = createRecorder();
  recorderPressStart(s);
  assert.equal(s.phase, 'pressing');
  run(s, PRESS_DELAY_S - 0.05);
  assert.equal(s.phase, 'pressing', 'no recording before the delay');
  run(s, 1.0);
  assert.equal(s.phase, 'recording');
  assert.ok(s.seconds > 0.9 && s.seconds < 1.2);
  const expected = Math.floor(s.seconds / BAR_SAMPLE_S);
  assert.ok(Math.abs(s.levels.length - expected) <= 1, 'samples land on the 90 ms grid');
  assert.equal(s.bars.length, BAR_COUNT, 'ring buffer stays at BAR_COUNT');
  assert.deepEqual(s.events.map((e) => e.type), ['start']);
});

test('slide left fills cancel and a full cancel discards the take', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 0.5);
  recorderPressMove(s, -CANCEL_DISTANCE * 0.5, 0);
  assert.ok(Math.abs(s.cancel - 0.5) < 0.02);
  recorderPressMove(s, -CANCEL_DISTANCE * 1.2, 0);
  assert.equal(s.cancel, 1);
  recorderPressEnd(s);
  assert.equal(s.phase, 'cancelling');
  assert.equal(s.events.at(-1).type, 'cancel');
  run(s, 1.0);
  assert.equal(s.phase, 'idle');
  assert.deepEqual(s.levels, []);
});

test('release without a full cancel sends duration and samples', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 2.0);
  recorderPressMove(s, -30, 0);
  recorderPressEnd(s);
  assert.equal(s.phase, 'sending');
  const sent = s.events.at(-1);
  assert.equal(sent.type, 'send');
  assert.ok(sent.seconds > 1.7, `recorded ${sent.seconds}s`);
  assert.ok(sent.samples.length > 15, 'samples ship with the message');
  run(s, 1.0);
  assert.equal(s.phase, 'idle');
});

test('drag up past the lock distance locks mid-gesture; buttons end it', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 0.5);
  recorderPressMove(s, 0, -LOCK_DISTANCE * 1.1);
  assert.equal(s.phase, 'locked');
  assert.equal(s.events.at(-1).type, 'lock');
  recorderPressEnd(s); // finger lifts, recording continues
  run(s, 0.6);
  assert.equal(s.phase, 'locked');
  recorderLockedSend(s);
  assert.equal(s.phase, 'sending');
  assert.equal(s.events.at(-1).type, 'send');
  run(s, 1.0);
  const s2 = createRecorder();
  recorderPressStart(s2);
  run(s2, 0.5);
  recorderPressMove(s2, 0, -LOCK_DISTANCE * 1.1);
  recorderPressEnd(s2);
  recorderLockedCancel(s2);
  assert.equal(s2.phase, 'cancelling');
});

test('a tap starts a locked recording (no-drag path)', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 0.05); // shorter than PRESS_DELAY_S
  recorderPressEnd(s);
  assert.equal(s.phase, 'locked');
  assert.deepEqual(s.events.map((e) => e.type), ['start', 'lock']);
});

test('dominant axis wins between cancel and lock', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 0.4);
  recorderPressMove(s, -40, -60);
  assert.ok(s.lock > s.cancel, 'vertical dominates');
  recorderPressMove(s, -100, -10);
  assert.ok(s.cancel > s.lock, 'horizontal dominates');
});

test('recording caps at MAX_SECONDS and auto-sends', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, MAX_SECONDS + 0.3);
  assert.ok(s.phase === 'sending' || s.phase === 'idle');
  assert.equal(s.events.at(-1).type, 'send');
});

test('mic spring converges and does not blow up', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 5);
  assert.ok(Math.abs(s.micScale - 1.22) < 0.02, `mic settled near 1.22, got ${s.micScale}`);
  recorderPressEnd(s);
  run(s, 5);
  assert.ok(Math.abs(s.micScale - 1) < 0.02, 'mic settles back to 1');
});

test('reduced motion lands without overshoot and finishes morphs instantly', () => {
  const s = createRecorder();
  s.reduced = true;
  recorderPressStart(s);
  run(s, 1.0);
  assert.equal(s.micScale, 1.22);
  recorderPressEnd(s);
  run(s, 0.1);
  assert.equal(s.phase, 'idle', 'send morph completes on the next step');
});

test('cancel wash only applies while cancelling', () => {
  const s = createRecorder();
  assert.deepEqual(cancelWash(s), { dx: 0, alpha: 0 });
  recorderPressStart(s);
  run(s, 0.5);
  recorderPressMove(s, -CANCEL_DISTANCE, 0);
  recorderPressEnd(s);
  const wash = cancelWash(s);
  assert.ok(wash.dx <= 0 && wash.alpha >= 0);
});

test('bar segments stay inside the waveform span', () => {
  const s = createRecorder();
  recorderPressStart(s);
  run(s, 1.5);
  for (let i = 0; i < BAR_COUNT; i++) {
    const seg = barSegment(s, i);
    assert.ok(seg.y0 < seg.y1 && seg.level >= 0 && seg.level <= 1);
  }
});

test('formatClock renders m:ss', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7.9), '0:07');
  assert.equal(formatClock(75.2), '1:15');
  assert.equal(formatClock(-3), '0:00');
});
