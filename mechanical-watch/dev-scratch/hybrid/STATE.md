# Hybrid escapement state — 2026-11-06 19:03 IST

## Status: RUNNING LIMIT CYCLE, amplitude gate (3.5-5 rad) still FAILING (borderline 3.2-3.6 at tau=6500)

## Physics fixes landed this session (all in hyb/watchMath.ts, audited):
1. Unlock capture double-count: manifold effective mass now excludes the balance (was double-counted). → sustained limit cycle.
2. workTorque wrap artifact: ledger normalizes Δe to (-π,π] at wheel-angle wrap.
3. CORNER FIX (the big one): lock→impulse corner is now a plastic constraint SWITCH with momentum projection of ALL THREE bodies (incl. balance via persistent slot constraint) onto the new manifold: duI = (escapeJ·weO·dec + forkJ·wpO·dpc + balanceJ·wb·dbdI)/JeffI. Was: wheel+fork-only impulse + hard wb=dbdu·du set that destroyed 192 units/entry-beat. Amp 1.10 → 2.14, rate 5.13 → 5.83.
4. Slave engagement capture (slave-capture) added for false→true transitions (fires ~0 — unlock capture already consistent).
5. Impact losses tagged by site (IMP_TAGS export); EDBG.tr = per-substep trace when set.

## Verified (60s, dt 1/960 = 1/1920 = 1/3840 bit-identical):
- rate 5.83-5.87 beats/s (target 6), advance -0.2094 to -0.2097 rad/beat vs π/15=0.20944 (0.08%), per-beat sd 0.041, no drift.
- measure.mjs = 3-dt 60s harness (HALF sign fixed, advance is -e direction).

## Root cause of remaining amplitude shortfall: DROP GEOMETRY
- Drop = 0.092 rad ≈ 0.92mm at tooth tip (real Swiss: 0.05-0.15mm). Catch impulse plastically dumps τ·Δe_drop + wheel KE = 335-446/beat = 52-69% of drive work.
- Stone DEPTH sweep (0→1.0mm): WRONG LEVER — catch loss ~unchanged, amp drops, jams at 0.7+.
- Impulse-face LENGTH: 0.9/1.2 → 1.5/1.8 helps monotonically (catch 446→335, amp 2.31→2.58), advance stays exact; at 1.8/2.2+ the wheel TRIPS (advance doubles to full pitch). 1.5/1.8 BAKED as new defaults.
- driveTorque sizing (mechanism fixed): 3000→2.58 rad, 4500→3.05, 5500→3.23, 6500→3.53@30s but 60s shows 3.19-3.64 oscillation = borderline gate edge, not a pass.

## NEXT (in order):
1. Drop clearance redesign: stone angular phasing / tooth-tip path so the catch lands ~0.01 rad after impulse exit (DESIGN.md-level). This is the real fix; torque alone tops out borderline.
2. Wind sweep at candidate point (torqueFloor 0.28 → amp at wind=0) + 10-min sustained run.
3. Gate harness: point gate.mjs at hyb (currently points at g960/g1920/g3840 old variants).
4. Port hyb/watchMath.ts → repo mechanical-watch/ watchMath.ts, re-run repo checks, push to watch-build + parity/watch, native evidence via CI/emulator.

## Key file map (all /tmp/hybrid, VOLATILE):
- hyb/watchMath.ts: the solver (LOCK/SLIDE/DROP + events, audited).
- measure.mjs: 3-dt 60s gate metrics. facediag.mjs: per-face leverage. dropsweep.mjs: drop measurement.
- baseline-watchMath.ts: repo solver (proven non-salvageable).
- Repo: ~/Nativelet branch watch-build = parity/watch @ 5066eee, PR #227 UNMERGED.

## CI: run 42219103524 attempt 2 (last auto rerun per parent 6:45:22), started 18:44, completion wake armed (10-min cadence, trigger = attempt 2 completed).
