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
