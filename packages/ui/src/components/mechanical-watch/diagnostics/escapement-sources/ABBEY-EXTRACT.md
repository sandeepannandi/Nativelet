# Abbeyclock drafting-course extraction (2026-11-12)

Source: abbeyclock.com escapement drawing course (free), chapters 12/13/14/22
(local: abbey12.txt, abbey13.txt, abbey14.txt, abbey22.txt). Role: explicit
drafting METHOD cross-check for Playtner's parameters; where numeric choices
differ, Playtner (primary) wins.

## ch12 - club tooth wheel
- 3 circles d=4/6/7.5in; 6in = primitive (locking corner sits on it).
- First tooth radial at 30° from vertical (2.5-tooth pallet span, 15T wheel).
- Tooth impulse face: line at 45° to radial through the primitive point.
- Pallet radius line: another 45° (perpendicular to impulse face at tip ->
  90° between tooth force and pallet radius: max efficiency).
- Lock: rotate pallet radius line by 3° at drawing (author: ideal 1°, uses 3°
  for simulation visibility) -> implement as 1.5° pallet-frame per Playtner.
- Tooth locking face: 24° forward lean (matches Playtner 24°).
- Club curve via ellipse template; thin tooth for pallet clearance.

## ch13 - pallets (equidistant impulse)
- Rays at +-30° (lines 2/9); pallet radius lines perpendicular to rays at the
  primitive points -> both pass through A on the vertical center line at
  R/cos30° (matches Playtner center distance exactly).
- Wheel budget per beat: 12° = 2° drop + 2° tooth impulse-face span + 8°
  pallet span. (Playtner's division: 1.5 + 4.5 + 6 = 12. Same total.)
- Stone angular width: +-4° around each 30° ray (8° span).
- Locking face: 15° draw (line rotated 15°); Playtner says 12° sufficient.
- Impulse face: at 45°, bisecting escape radius and pallet radius.
- Identical pallets: duplicate, rotate 60°, place mid-impulse-face point on
  the opposite ray/pallet-radius intersection.

## ch14 - variants + out-of-angle
- Equidistant-LOCK variant: rotate stone edges 4°; locking faces 15°;
  lift reduced to ~14°; impulse faces no longer 45°.
- KEY WARNING: with identical pallets, exit pallet releases ~1° early
  ("out of angle") - symmetric placement alone is NOT correct.

## ch22 - out-of-angle correction + roller/banking design
- Correction: rotate fork+roller 0.5° about pallet center, OR change impulse
  faces 45°->49° (equalizes per-pallet lift, ~0.5% efficiency loss).
- Double roller (their drawing scale, fork length 3in):
  roller jewel radius X = 3*sin(13°)/sin(15°) = 2.607;
  pallet-to-roller center distance T = X*cos15 + 3*cos13 = 2.519+2.923 = 5.442.
  (i.e. jewel radius = L*sin(half fork angle)/sin(half jewel angle);
  their drawing: fork 26° while engaged with jewel, jewel 30°.)
- Safety roller radius 1.522, guard pin radius 4.113, guard depth 0.192.
- Bankings: rotate pallets to tooth-release ("drop-lock") position, +2°
  slide -> banking at 11° from vertical in their 18°-lift drawing.
- Design rules: lock/drop-lock/run must be SYMMETRIC both sides; draw keeps
  guard pin off the safety roller; fork slot slightly wider than roller
  jewel; need slot-corner/horn/guard freedoms; prioritize symmetry over
  efficiency.

## Implication for analytic-geometry.mjs
- Arm placement cannot be simple y-axis mirror of one stone: that leaves
  exit release ~1° early (ch14). Implement the 0.5° fork+roller rotation
  correction (ch22 method 1) or place exit arm from the exit-side drop-lock
  condition directly (numerically: fork angle at exit release must be
  exactly half-pitch wheel rotation from entry release).
- Verify with the contact-sequence mapper: entry and exit drop-lock
  positions symmetric (same lock, same drop) - ch22's symmetry rule.
