import assert from 'node:assert/strict';
import { WATCH_DEFAULTS, createWatch, stepWatch } from './watchMath.ts';

const HALF_PITCH = Math.PI / WATCH_DEFAULTS.escapeTeeth;

function runAssisted(substepHz, seconds = 10) {
  const p = { ...WATCH_DEFAULTS, fixedDt: 1 / substepHz };
  const s = createWatch(p);
  const e0 = s.e;
  for (let i = 0; i < Math.round(seconds * substepHz); i++) stepWatch(s, p, 1 / substepHz);
  return {
    beats: s.beats,
    wheelHalfPitches: Math.abs(s.e - e0) / HALF_PITCH,
    amp: s.amp,
    stopped: s.stopped,
  };
}

// A lock-arrest event must track measured escape-wheel phase at every supported
// substep rate. This is a physical phase-consistency check, not a nominal-rate
// target and not a threshold sweep.
for (const hz of [480, 960, 1920, 3840]) {
  const r = runAssisted(hz);
  assert.ok(r.wheelHalfPitches > 40, `${hz} Hz did not progress: ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.beats - r.wheelHalfPitches) <= 3,
    `${hz} Hz beats ${r.beats} diverge from wheel half-pitches ${r.wheelHalfPitches}`);
  assert.ok(r.amp > 1, `${hz} Hz did not sustain oscillation: ${JSON.stringify(r)}`);
  assert.equal(r.stopped, false);
}

console.log('adaptive contact step consistency passed');
