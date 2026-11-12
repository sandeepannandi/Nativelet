# Polygon contact route - findings (2026-11-12)

Scope: offline structural repair research for the measured grounded-impulse
inconsistency and positional drift. Restitution route stayed closed (negative).
No production adoption. Gates unchanged: timestep convergence, natural unwind,
rest, restart, energy accounting, visual fidelity.

## Artifacts
- polygon-geometry.mjs - measured escapement geometry (reference-geometry.json):
  club-tooth polygons (11-point digitized profile), pallet slabs as measured
  rectangles rotating about the measured arbor, SAT + feature-distance contact
  (polyContact), slab-face-constrained contact (slabFaceContact).
- polygon-contact-prototype.mjs - v2 consistent two-body impulse solver +
  pin-aware grounding + swept speculative detection, on polygon geometry.
- test-polygon.mjs - same conv/scen gate matrices as the point-face prototypes.
- check-geometry-f001.mjs - geometry support verification.

## What was verified about the measured geometry
1. Arbor and tip radius match production exactly: measured fork arbor lands at
   world (0, 13.4) = production forkPivot; measured tip radius 10 = escapeR.
2. Isolated locking exists: first-touch sweep at the f001 fork angle finds
   entry-slab contact with the exit slab clear by 0.83 units.
3. f001 visual ground truth (540-frame re-fetch, frame crop inspected): at f001
   the nearest tooth is ~3.5px off the entry stone - mid-flight, not contact.
   The digitization agrees with the image (0.39 units = 3.5px). No digitization
   error at that level.
4. The locking-face normal (slab bottom short edge) is near-radial: force line
   passes within ~0.5 units of the wheel arbor. Physically correct lock
   geometry (statically determinate hold).
5. Impulse delivery exists via the physically correct face: entry long edge
   (impulse plane) delivered +3000 units of work to the fork in the first
   second of a factory run; net fork work +751/s.

## Solver defects found and fixed in my own first polygon iteration
- SAT separated-axis misuse: used the weakest separating axis as the gap;
  corrected to min vertex-edge feature distance. The wrong metric fabricated
  "contacts" at 0.4-unit separation.
- Corner-contact normal chatter: SAT min-penetration axis at a corner flips
  between faces frame-to-frame; replaced with slab-face-constrained normals
  (physical faces only).
- Grounded-pin energy pump, third form: pin-aware grounding (cf=0, no fork
  impulse) but with fork velocity still inside vn created +1.3M dKE. Fixed by
  the wheel-only approach velocity when the pin holds the fork (the pin
  constraint absorbs the fork share separately). Result: posKE = 0 across all
  runs.

## Gate results (consistent physics, restitution 0, posMode off)
- Convergence: the model CONVERGES - dKE halves per rate doubling
  (-177k @480Hz to -8.4k @15360Hz, O(dt) resting-contact artifact) and wheel
  advance converges (-14.0 to -0.58 rad/10s). But it converges to a DEAD-LOCKED
  state: amplitude collapses (4.4 to 0.04-0.23 in 10s at all rates), beats fall
  to 2-12 per 10s.
- fork swings pin-to-pin (|p| reaches 0.06, |wp| up to 114) but is on-pin 89.6%
  of the time; the balance receives no phase-coherent energy and dies.
- Sensitivity probes (diagnostic, not tuning): friction=0 does not rescue
  (amp 0.118 vs 0.079 base; impulse work lower).
- Scenario matrix: natural-unwind runaway (-3910 rad, wheel free-runs once
  unlocked), powered-rest holds positionally but grinds (contact every
  substep), one-restart does not restart.
- forkOnly positional pass: catastrophic (-771 to -1049 rad runaways) - the
  positional pass unlocks the escapement; back=0 invariant holds.

## Conclusion
The formulation chain no longer creates energy in any tested probe (posKE=0),
the lock geometry is physically shaped (near-radial locking-face normal), and
the impulse is delivered by the correct face. Solver correctness is NOT
established by these checks alone: three implementation defects were found
and fixed in the first polygon iteration, and although the remaining residual
decreases with rate (-177k dKE @480Hz to -8.4k @15360Hz), all dynamic gates
still fail. Independent qualification of the solver's energy/convergence
metrics beyond posKE=0 remains open work.

HYPOTHESIS (not established): the remaining failure is dynamic - the
escapement free-runs off the balance's phase - and the digitized draw/locking
geometry (1px = 0.11 units quantization on a 1.16-unit-wide stone) cannot
resolve the draw angle to the precision that decides whether wheel pressure
holds the fork on its pin. If true, the GIF source is a reference-fidelity
ceiling for this digitization, and further solver variants against it are
uninformative. Alternative explanations are not excluded: residual solver
defects, contact-model formulation limits, or an incorrect escapement
dynamic design in the measurement itself.

Also established earlier and standing: the point-face production model
sustains oscillation only through an energy-pump artifact.

Next routes within scope: (1) source-backed higher-fidelity escapement
geometry or an analytic physical escapement design (manufacturer dimensions,
horology references, patents; free/read-only); (2) independent solver
energy/convergence qualification. No further arbitrary variant matrix against
the same low-fidelity source.
