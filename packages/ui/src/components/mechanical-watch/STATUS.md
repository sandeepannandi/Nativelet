# Mechanical Watch build - WIP status (end of run 1)

## Proven
- Train ratios exact & unit-verified: barrel 72->center pinion 12 (6:1),
  center 80->third 10 (8:1), third 75->fourth 10 (7.5:1), fourth 72->escape
  pinion 6 (12:1), hour = minute/12. 21,600 vph: 3 Hz balance, 6 beats/s,
  2 beats per escape tooth (30 beats/rev, 5 s/rev), fourth = seconds 1 rpm,
  center = minutes 1 rph. (watchMath.ts TRAIN + trainAngles, diag output)
- Escapement locking half works in sim: wheel locks solidly on the entry
  pallet locking face, draw holds the fork on its banking pin (banking as
  one-sided hard constraint, applied before contacts), no runaway.
- Balance oscillator runs (3 Hz), amplitude tracker works.
- Failure analysis: straight-fork pallet with pivot on the stone-bisector
  axis has an EMPTY feasibility cone for the exit stone (impulse torque
  sign). Confirmed by probe2.mjs cone search. The real Swiss lever needs
  the anchor-form pallet geometry from an actual layout, not intuition.

## Next run plan (decided)
1. Reference geometry: download Paletteankerhemmung.gif (Wikimedia,
   "Lever escapement" article animation), extract frames with ffmpeg,
   measure entry/exit stone positions + locking/impulse face angles vs
   wheel center across phases (lock/unlock/impulse/drop).
2. Replace point-face analytic contacts with generic polygon SAT contacts:
   club teeth and pallet stones as polygons traced from the measured
   reference; sequential impulses + banking + roller/horn as now.
3. Validation (watchMath.test.mjs): 6 beats/s +/-1 over 30 s; escape
   advance exactly half pitch per beat; winding raises amplitude; wind=0
   stops; slow-mo stable. Only then build renderers.
4. Renderers: watch3d.ts mesh engine (extruded gears, conic-gradient
   brushed metal, Geneva stripes, soft shadows), Skia Picture renderer
   (createPicture pattern from TextMorph), Canvas2D web adapter, wiring
   (registry 49, showcase route, card mini CSS, registry json).
5. CI: scripts/android-watch.sh + android-smoke.sh line = Contents-only.
   Workflow gate line 87 edit needs Workflows grant (main is asking user).
   Token rule: Nativelet Contents-only, short-lived, revoke after.

## Recovery if sandbox wiped
Branch watch-build (local only) had commit 126eeca. Full watchMath.ts
content is in the agent transcript (heredoc writes) and attached to the
run-1 status report to main. Re-clone github.com/sandeepannandi/Nativelet.

## Escapement geometry SOLVED (run 2, ~13:00 IST)
Reference: Wikimedia Paletteankerhemmung.gif, frame 1 + 8 (entry lift). Wheel
turns CLOCKWISE (screen) = clockwise in math y-up too (y-flip preserves CW here
when param by screen (cos t, sin t) -> math angle -t). Pivot ABOVE wheel with
long anchor arms was the missing ingredient; entry/exit faces verified by cone
analysis + probe3.mjs (all pass):
- Math frame: y-up, wheel e DECREASES (CW), center (0,0), R_tips = 1 (scaled).
- Pallet pivot (0, +2.5) (GIF 214/85 = 2.52).
- Entry stone polar 120 deg from wheel center; arm a = (-45,-135)/85.
- Exit stone polar 60 deg; arm a = (+45,-135)/85. 60 deg separation = 2.5
  pitches of 15-tooth wheel -> half-pitch stagger is structural.
- Engagement: +p (CCW fork) moves entry IN, exit OUT. Entry engaged at +bank,
  exit at -bank.
- entry LOCK face normal 198 deg (-0.951,-0.309): resist -0.98, draw tau +114
  (pulls fork to +bank). 12 deg draw tilt from -T.
- entry IMPULSE face = stone END face, normal (0,-1) (faces inward toward
  wheel): tooth presses up/out, tau -45 (drives fork -p, the unlock dir).
- exit LOCK face = stone upper end, normal (-0.1,+0.995): tau -31 (draw to
  -bank).
- exit IMPULSE face = upper-left side, normal (-0.5,+0.866): tau +28.5
  (drives fork +p).
Beat sequence: +bank entry locked -> unlock -p -> entry impulse drives -p ->
drop tooth onto exit lock (-bank) -> unlock +p -> exit impulse +p -> drop on
entry. 2 beats per tooth pitch (24 deg), wheel advances 12 deg per beat,
15 teeth x 2 = 30 beats per escape revolution = 12 s at 6 beats/s (train-locked
fourth wheel 1 rpm: escape pinion 12:1 -> 60/12 = 5 s/rev?? CHECK: escape
wheel 15 teeth, 30 beats/rev; at 6 beats/s -> 5 s per escape rev. Standard is
6 beats/s, escape rev = 5 s. OK consistent.)
NEXT: rewrite escapement in watchMath.ts as polygon contacts with these exact
faces (stones as oriented boxes; tooth tip as small circle/box; SAT + impulse
solver, fork banking clamps +-forkLimit). Stone bodies: slabs ~14 x 4 (GIF),
tilt entry slab 59 deg screen -> math -59 deg at corner 120 deg; exit slab
mirror-ish by cone (exit lock near-horizontal => slab ~85 deg).
Then diag validation, then mesh/render.

## Dynamic sim status (run 3, ~13:24 IST) - locking HOLDS, unlock stalls
watchMath.ts rewritten to the measured anchor geometry (fork pivot ABOVE wheel
at (0,25.2), CW wheel, measured stone faces). Three solver bugs found+fixed:
1. Baumgarte velocity bias pumped energy into a resting contact (0.25/dt at
   960 Hz) and spun the wheel backward through the lock -> REMOVED, replaced
   with a separate positional pseudo-impulse pass (no KE injection).
2. Positional pass split correction by inverse mass even when the fork is
   pinned on a banking: the clamp ate the fork's share and the wheel
   position-walked through the lock -> when the contact presses the fork into
   its pin, the WHEEL takes the whole correction.
3. Thin-wall faces accepted unbounded penetration; a tooth starting on the
   far side of a face was "resolved" violently -> penetration capped at 0.35
   (deeper = tunneled, release; a dropped lock recoils, next tooth locks).
4. Velocity contacts now treat a fork pressed into its banking pin as
   grounded (cf=0 for that contact): the pin is a bilateral constraint at
   its limit, not the fork's tiny free inertia. This made locking SOLID:
   we ~ 0, wheel holds against full-wind torque indefinitely.
5. Start conditions: tooth 3 seeded resting on the engaged exit shelf
   (e0 = -0.1117), balance starts GENTLE (0.3 x resonance) - the escapement
   must pump amplitude up by itself; that is the energy validation.

REMAINING FAILURE (next run): unlock stalls. The balance's jewel pushes the
fork from -bank to p ~ 0 but never across; the system then sits in a static
double-locked equilibrium (both stones half-dipped at p~0, wheel held, amp
decays to 0). Next: instrument the unlock attempt (jewel torque vs draw
torque at the locked tooth), then tune in order: lock depth (0.5 -> less),
slot clearance (0.6 vs rollerR 3.0 path), banking angle, draw tilt. Watch for
double-lock: stagger may need the exit shelf shifted ~0.1. Diags: diag2.mjs
(10s overview), diag3.mjs (substep trace). Committing as WIP.

## Run 4 (~13:30 IST): escapement RUNS and sustains amplitude - beat geometry still wrong
Torque-scale fix: fork+balance reflected inertia about the pallet arbor is
~18.8 (J_b x (hornR/rollerR)^2) vs forkJ 0.0045, so the old driveTorque 0.028
was ~1e5 too weak to lift the fork during a beat. Now driveTorque 3000,
escapeJ 0.5 (bounds free-flight drop speed so locks don't tunnel),
balanceDamp 0.35, tunnel cap 0.5. Unlock needs the balance at running
amplitude (draw torque ~= 2x wheel torque at the fork) - gentle start cannot
self-start; start restored to amp 4.4. RESULT: wheel turns CW (correct),
impulse DELIVERS energy (amplitude sustained ~3.5 indefinitely against
damping), lock holds between beats. Banking hard stop added at integration
(post-contact wp could jump the pin in one substep).
REMAINING: (a) wheel advances ~1 pitch/beat instead of half-pitch - the
alternate-stone arrest lands late or misses (stagger timing); (b) beat rate
irregular 2-4 per 0.5s and intermittent fork rattle episodes with the wheel
streaming at the -40 clamp (suspect jewel leaves the slot gate at high
amplitude, freeing the fork; also drop impacts at clamp speed). NEXT RUN:
trace one full beat cycle (diag4) at 960 Hz: check which face each tooth
lands on after each drop; verify exit-entry stagger (2.5-pitch corner
separation) against actual contact polar angles; check jewel-in-slot
coverage through the full swing; then tune.

## Run 5 (~13:40 IST): exit-lock topology finding (the real bug)
diag5.mjs lock-event trace (960 Hz): the entry lock works (arrests every other
tooth); the EXIT lock never engages - arriving teeth always land on X-imp,
which pushes the fork +p (unlock direction), so the wheel streams half a
pitch extra per cycle and the fork rattles. Analysis: at the exit corner
(polar ~57 deg) the tooth's travel reaction -T is at ~147 deg; a corner seat
between a draw-correct lock face (~87 deg) and the impulse face (~152 deg)
puts the reaction almost entirely on the IMPULSE face -> the corner cannot
hold, it unlocks. A horizontal shelf lock face catches the tooth only within
a tiny radial window and slides straight into the same corner. CONCLUSION:
my idealized exit stone topology is wrong, not just its parameters. The real
exit-stone/tooth contact must use the tooth's club tip shape (contact on the
tooth's trailing face), which the point-tip model cannot represent.
NEXT RUN (decisive grounding, no more cone guessing): digitize the exit
region of reference frame f001 (and f040/f080 for phase) at high
magnification from /tmp/anker_frames (re-fetch the GIF from Wikimedia if
wiped: upload.wikimedia.org/wikipedia/commons/7/75/Paletteankerhemmung.gif):
extract actual exit stone outline + contacting tooth outline + contact
point; reproduce those true shapes as face lists, incl. a club-tooth polygon
for the wheel (tooth becomes 2-3 contact points, or SAT polygon-vs-polygon).
Also still open: jewel slot coverage at high amplitude (rattle episodes).

## Run 6 (~13:48 IST): PIVOT CORRECTION - arbor is ~1.3-1.6R above the wheel, not 2.52R
Digitized the exit contact from the reference frames (f001/f008, 8x crops):
- EXIT LOCK = tooth TIP vs the stone's LONG SIDE face (not an end shelf):
  measured face normal ~139 deg (math frame) at contact polar ~57 deg, r ~ R.
  That gives near-full normal resistance to tooth travel (no friction creep)
  - the exit lock topology my model was missing.
- Zero-motion analysis of the blue fork across 40 frames puts the pallet
  ARBOR at ~y=110-130 orig px above the wheel center: 1.3-1.6 x R. My run-2
  "2.52R" measured the slot neck, not the arbor - wrong, correcting.
  (Original pre-rewrite forkPivot 13.4 was accidentally right.)
- Draw sign at exit is marginal and pivot-distance-critical; with the short
  arbor a face near 132 deg gives solid draw to -bank AND 0.96 resist AND
  0.27 creep ratio (all good). Entry faces must be re-derived for the new
  arbor as well (corner-cone split changes sign of net draw with old faces).
NEXT RUN: re-derive all four faces for pivot (0,13.4): extend probe3.mjs into
a feasibility checker (resist / draw-to-engaged-bank / corner-cone contains
-T with margin toward the lock edge / creep ratio < 0.35) using measured GIF
angles as anchors; new fork tail proportions (hornR ~9, rollerR ~2.5,
balancePivot ~12); retune driveTorque (reflected inertia drops ~(13/18.8)^2);
validate diag5 (exit arrests on lock face, half-pitch/beat) + diag2.

## Run 7 (~13:56 IST): exit lock HOLDS; entry clearance defect remains
All four faces re-derived for the corrected arbor (0,13.4) and verified by
probe4.mjs (ALL PASS: resist/draw-sign/creep/corner-cone margin):
  E-lock n=197, E-imp n=270, X-lock n=132, X-imp n=200 (deg, math frame);
  corners (-4.82,-4.72) pol 119 / (5.72,-5.23) pol 55; fork tail hornR 9.5,
  rollerR 2.5, balancePivot 12, slotHalf 0.5; e0=-0.2904 (tooth 3 on X-lock).
diag5 steady-state cycle (~1/3 s = 2 beats, pace already ~6 beats/s):
exit lock ARRESTS and HOLDS the tooth (we ~ 0 while the fork flaps) - the
digitized geometry works. Remaining defect: after exit release the wheel
runs ~1.5 pitches and is caught by ENTRY faces TWICE (tooth on E-imp, next
on E-lock while fork still heading to -bank) instead of one half-pitch
arrest -> 2 pitches advance per 2 beats (want 1.0). Cause: entry faces too
long/tilted, so at the DISengaged bank the entry lock plane still passes
within ~0.15 of the tooth circle (nominal clearance 0.25) and catches teeth.
NEXT RUN: (a) entry faces shorter (len 1.5 -> 0.9 / imp 1.2 -> 0.8) and/or
lock depth 0.4 -> 0.3, bankAngle 0.05 -> 0.06 for real clearance; (b) count
beats on lock-ARREST events (contact begins on a lock face), not fork sign
crossings; (c) re-validate diag2 (6/s sustained, half-pitch/beat, amp
sustained, unwind stops). Also note: amplitude decayed slowly (4.0 -> 1.1
over 10s) - check energy balance after arrest fix (impulse may be short).

## Run 8 (~14:04 IST): alternating arrests + honest beats; impulse timing is the remaining defect
Changes: corner polars set to entry 118.5 / exit 55.5 (separation 63 deg =
10.5 half-pitches: alternating arrests now each advance the wheel ~half a
pitch, measured deltas alternate 0.43/0.57). Impulse faces flipped to extend
INWARD from the stone corners (real topology: contact migrates from corner
into the stone; nothing pokes through the tooth circle at engagement, so
arriving teeth now hit the LOCK face first). Beats now counted on
lock-ARREST events, not fork sign flips. bankAngle 0.06.
diag2: 6 beats/s sustained, ~1 pitch per 2 beats, unwind still stops.
diag5: clean alternating X-lock / E-lock arrests.
KNOWN DEFECTS (next run):
1. Fork flip completes in ~2ms but tooth slide on the impulse face needs
   ~10-20ms; once the fork pins on the far bank the departing tooth DRAGS
   on the (inward) impulse face for ~300ms at creep speed, and the impulse
   energy goes into the banking pin (cf=0) instead of the balance. Conseq:
   amplitude decays 4.2 -> 2.4 over 10s (escapement feeds back too little).
2. Arrests come in pairs 5ms apart every 333ms (mid-flip catch + final
   catch) and the fork flips at 1.5 Hz (half the balance frequency) - one
   unlock per full balance swing succeeds, not one per half-swing. Likely
   the entry draw (tau 3.08 vs exit 0.69) is too strong to unlock on one
   side; check E-lock draw angle (n=197) and driveTorque.
3. Tried shorter imp faces (0.45/0.6) to kill the disengaged-bank drag:
   REVERTED - machine-gun runaway (36-68 beats/s), the short faces let
   teeth slip past. The fix is flip timing, not face length.
Levers: forkJ (slow the flip toward ~10ms), imp face angle = impulse ratio,
driveTorque, possibly don't ground the fork (cf=0) for IMP-face contacts.
