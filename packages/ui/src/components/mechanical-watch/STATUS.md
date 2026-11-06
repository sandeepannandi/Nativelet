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
