// Run with: node --test playerMath.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backdropOpacity, clamp01, collapseFade, contentScale, dragProgress, expandFade,
  formatClock, hashSeed, resolveTarget, waveformBars,
artSize, } from './playerMath.ts';

test('drag follows the finger and resists past the ends', () => {
  assert.equal(dragProgress(0, 100, 200), 0.5);
  assert.ok(dragProgress(0.9, 100, 200) < 1.4);
  assert.ok(dragProgress(0.9, 100, 200) > 1);
  assert.ok(dragProgress(0.1, -100, 200) < 0);
  assert.ok(dragProgress(0.1, -100, 200) > -0.5);
  assert.equal(dragProgress(0.4, 0, 200), 0.4);
});

test('release settles by position, flick always wins', () => {
  assert.equal(resolveTarget(0.6, 0), 1);
  assert.equal(resolveTarget(0.4, 0), 0);
  assert.equal(resolveTarget(0.2, 0.01), 1);
  assert.equal(resolveTarget(0.8, -0.01), 0);
  assert.equal(resolveTarget(0.4, 0.002), 1); // momentum projected past halfway
});

test('crossfades partition the morph', () => {
  assert.equal(collapseFade(0), 1);
  assert.equal(collapseFade(0.5), 0);
  assert.equal(expandFade(0.5), 0);
  assert.equal(expandFade(0.9), 1);
  assert.equal(backdropOpacity(1), 0.45);
  assert.equal(contentScale(0), 1);
  assert.ok(contentScale(1) < 1);
});

test('waveform is deterministic and bounded', () => {
  const a = waveformBars('Night Bus', 64);
  const b = waveformBars('Night Bus', 64);
  const c = waveformBars('Glass Tide', 64);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 64);
  for (const v of a) { assert.ok(v >= 0.18 && v <= 1); }
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

test('clock formats minutes and seconds', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(84), '1:24');
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(NaN), '0:00');
});

test('clamp01 guards bad input', () => {
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(2), 1);
});

test('artwork fits width on phones and height on short stages', () => {
  assert.equal(artSize(390, 844), 318);
  assert.equal(artSize(380, 600), 240);
  assert.equal(artSize(200, 300), 140);
});
