# Galton Board

A wooden bean machine: brass pegs in a quincunx, a hopper up top, eleven
bins at the bottom. Tap to drop one bead, hold to pour the hopper, drag
sideways to tilt the whole board, swipe fast to sweep the bins clean.
Beads clatter down the pegs and pile into the bell curve the board is
famous for - with the dashed binomial curve drawn behind the piles once
enough beads have landed.

- Rigid-bead physics: geometric circle-vs-peg impulse deflections with
  restitution, real ball-ball impulses over a spatial hash,
  wall/divider/floor contacts, and a sleep state for piled beads woken by
  hard knocks or tilting.
- The bell curve is never scripted: no code picks a bin or nudges a bead
  toward one. The deflection direction at each peg comes from the contact
  geometry. Two explicitly stochastic terms stand in for wood grain,
  dents and spin: hard peg hits re-kick lateral velocity with a seeded
  random component (`pegJitter`), and a bead balanced directly on top of
  one neighbour gets a seeded sideways nudge every 0.4 s (up to six
  times) until it topples to a lean or proves stable - real grain and
  flat spots do this. Both are seeded, named here, and are the only
  randomness in the model.
- Measured model behaviour (not claimed as real-board behaviour): a
  full 15/s pour lands sd 1.70-1.88 across seeds, a slow 3/s pour lands
  ~1.50, and single beads dropped one at a time land ~1.8 (n=300) -
  all consistent with the 1.58 binomial ideal within sampling noise.
  (An earlier build measured far narrower, but that was count-by-x
  masking a frozen stream plus ad-hoc contact damping acting as
  unlimited static friction; both were removed.)
- Contacts are unilateral and impulse-based with named Coulomb friction
  (mu = 0.2, friction angle ~11 deg): tangential impulses are capped at
  mu times the normal impulse, so beads on steeper slopes keep sliding
  into pockets instead of being pinned by damping. Pile rest is
  geometric static stability for round beads: a bead sleeps only inside
  a bin, cradled by sleeping neighbours on BOTH sides (gravity through
  the contact span), or balanced almost directly atop one support after
  surviving six seeded nudges. A single off-side contact never grants
  sleep - that rule is what stops streams, arches and bridges from
  freezing mid-pile.
- Tilting skews the cascade exactly like tilting the real toy.
- 240 Hz fixed substeps keep the clatter stable at any frame rate.
- Shared `galtonMath.ts` drives both the Skia source and the Canvas2D web
  preview.

Copy `GaltonBoard.tsx`, `galtonMath.ts`, `galtonDesign.ts` and
`Example.tsx` together with `LICENSE`. Needs `@shopify/react-native-skia`
and `react-native-reanimated`. Impulse solver over circular contacts, not
a finite-element contact model with no spin or true friction. Physical-device performance untested.
