# Momentum-contact discriminator - offline prototype findings (2026-11-12)

Scope: parent-approved offline route B. Question: does replacing the
escapement tooth contact's velocity projection with a momentum-conserving
impulse along the measured tooth-contact normal, with restitution from a
physical range for hardened steel / pallet-stone impacts, repair the Run 14
timestep non-convergence while preserving the Run 11 trace, natural unwind
and rest? Verdict: NO - negative result. Nothing adopted, no production
change, no dispatch.

## Method
- Standalone port of watchMath.ts substep (09bc1e4), verified faithful:
  ported current model reproduces Run 11/14 numbers exactly (960 Hz: 38
  arrests 29E/9X; 3840 Hz: 57 arrests, wheel -11.8086 rad; 480 Hz: 252
  arrests; 1920 Hz: stall after 2).
- Impulse j = -(1+e_r)*vn/meff, collinear and opposite on wheel/fork
  (two-body angular momentum conserved exactly). Restitution applied only
  above impact threshold vRest=0.1 units/s (sub-threshold treated plastic,
  standard for oil-filmed low-speed horological contact). e_r grid
  0/0.2/0.4/0.6 spans the defensible range for polished hard steel/stone
  impacts; nothing was fitted to a trace.
- ACTUAL solver rates 480..15360 Hz (Run 14 style), factory start, 10 s.
- Per-impulse energy bookkeeping: measured d(KE_wheel+KE_fork) vs predicted
  inelastic/restitution loss 1/2*meff*vn^2*(1-e^2); positive-KE events
  counted. Positional pass wheel-angle contributions tracked with sign.

## Result 1 (primary): convergence fails at every restitution
- All e_r in {0,0.2,0.4,0.6}: 15360 Hz stalls (amp ~0.9, wheel ~-0.2 rad
  over 10 s despite wind=0.93), 1920 Hz degrades, 480 Hz chatters (~250
  arrests). Same qualitative failure as the current model.
- e_r > 0 actively degrades the Run 11 trace: arrests shift to
  unknown/unidentifiable faces (e.g. e_r=0.4 at 3840 Hz: 694 arrests, 481
  unknown), advance becomes erratic, and at e_r=0.6 the natural-unwind
  case drifts the wheel BACKWARD +10.45 rad after wind=0.
- Grounding variants (combined / wheel-only-vn / no grounding) do not
  change the conclusion; wheel-only-vn is byte-identical to combined
  (banking pre-clamp already zeroes fork velocity at those contacts).

## Result 2 (diagnostic gain): the energy pump is precisely located
- All grounded variants inject net positive wheel+fork KE through contact
  impulses (thousands of positive events; cumulative up to ~1e6 units over
  10 s at 3840 Hz). With consistent impulse application (no cf=0
  grounding), positive-KE events collapse to ~0 total.
- Mechanism: when the fork is on its banking pin the code sizes the
  impulse with cf=0 (fork treated as immovable) but then still applies
  that same impulse to the fork's velocity. The impulse is oversized for
  the two-body system and momentum/energy bookkeeping breaks exactly
  there. This is a concrete, measured candidate source of the Run 12
  zero-wind sustained motion.
- Removing grounding is NOT a repair: without it, coarse rates lose
  locking (480 Hz: wheel -160 rad runaway), though 7680 Hz recovers the
  57-arrest trace. Reported as diagnosis only.

## Result 3 (diagnostic gain): positional pass drives the wheel backward
- The positional depenetration pass contributes net POSITIVE (backward,
  anti-drive) escape-wheel angle in every configuration: up to +478 rad
  cumulative over a 300 s unwind at 960 Hz, +20 rad over 10 s at 480 Hz.
  This matches the mechanism of Run 12's positive wheel drift when drive
  torque was zeroed.

## Unwind / rest / restart (momentum model, 960 Hz actual)
- natural-unwind stops in all variants (amp -> ~0, stopped=true) - but at
  e_r=0.6 with backward wheel drift (+10 rad), physically wrong.
- empty-rest stays at rest; linear torque (driveTorque*wind, no floor)
  additionally removes all rest chatter arrests (0 vs ~3.6k) in the
  ported model at this rate - noted, not adopted.
- one-restart does not sustain at e_r<=0.2 (same as production); at
  e_r>=0.4 it sustains spuriously via restitution rattling (4-7k
  arrests/60 s) - not evidence of correct behavior.

## Conclusion
The momentum-conserving restitution impulse fails the discriminator:
no convergence at any physical restitution, trace degradation with
bounce, and a backward-drift failure mode at high restitution. The route
produced two precisely measured defect locations instead:
(1) grounded-pin impulse sized with cf=0 but applied to the fork -
    net energy injection;
(2) positional pass pushing the wheel backward - the Run 12 drift.
Any next candidate must fix the impulse application consistency AND the
positional pass direction before convergence can be meaningfully
re-tested; both are structural, not tunable parameters. No watch
dispatch, no production change, no threshold or seed changes.

## Artifacts
- momentum-contact-prototype.mjs (ported substep + instrumentation)
- test-momentum.mjs (matrix runner)
- conv.json / conv2.json (baseline + convergence + grounding variants)
- scen.json (unwind/rest/restart matrix)

## Addendum (2026-11-12, same session): consistent-impulse v2 prototypes
Parent direction: structural repair research on the two measured defects,
not restitution tuning. Two further formulations tested on the same harness
(consistent-impulse-prototype.mjs, test-v2.mjs; results in evidence-matrices
runner output, reproduced in the agent report):

- V2 consistent impulses (true two-body effective mass everywhere, banking
  pin as infinite-mass 1-DOF projection, restitution 0, positional pass off
  or fork-only): both measured defects DISAPPEAR (positive-KE contact events
  ~0 at all rates 480-15360 Hz; positional backward drift 0). Dynamic gates
  FAIL: balance amplitude collapses 4.4 -> 0.06-0.7 over 10 s at all rates,
  480 Hz loses locking without the positional pass (wheel -388 rad/10 s),
  rate dependence persists (10 s advance -388 to -4.2 rad).
- V2 iterative (3 velocity iterations) + speculative contact margins:
  bookkeeping stays clean but dynamics fail identically (amp to 0.05-0.71,
  480 Hz -230 rad, rate-dependent). A first speculative implementation had
  a sign bug that exploded (amp 272, wheel at clamp); the energy
  bookkeeping caught it before interpretation; fixed and rerun.

Structural conclusion: the production behavior was partly an artifact of
the energy-injecting grounded impulse - in the consistent point-face
variants tested here, the escapement does not sustain oscillation at any
tested rate. This establishes the defect plus failure of the tested
alternatives, not that every consistent formulation must fail; the causal
question stays open. Local fixes cannot separate the defect from the
behavior.
Remaining grounded route: polygon contacts from measured reference
geometry (club tooth + stone slabs), now in progress.

## Reference geometry digitization (2026-11-12)
Re-fetched Paletteankerhemmung.gif (540 frames, 260x368). Color-segmented
digitization of frame f001 (see reference-geometry.json): wheel center
(122.0,262.1) px, tip radius 88.8 px = 10 units; entry stone slab centroid
world (-4.20,10.33), len 3.61 x wid 1.16 units; exit slab (7.42,10.15),
3.59 x 1.21; fork line -0.88 deg at f001; club-tooth profile (leading face
near-radial, trailing club overhang r9.6->8.35 over da 0.4-7.2 deg).
Cross-checks against the model's probe4-verified faces are consistent
(stone centroids sit above the modeled corners along the slab lengths).
