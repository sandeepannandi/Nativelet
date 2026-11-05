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
- Poured streams measurably narrow the distribution in this model:
  beads poured 15/s from one spout collide in flight here, so their peg
  choices correlate. Measured model behaviour (200-bead pour): sd
  0.79-0.92 across seeds vs the 1.58 binomial ideal; slowing the pour
  widens it monotonically (3/s -> sd ~1.2, 2/s -> ~1.55), converging on
  the ideal as the simulated stream thins; single beads dropped one at
  a time measure sd ~1.8 (n=300). That dose response is this model's
  pour-rate dependence - whether a real fast-fed board narrows the same
  way is NOT claimed; all numbers above are measured properties of this
  model, not real-board behaviour.
- Pile rest is geometric: a bead sleeps only inside a bin, cradled on at
  least two sleeping neighbours, leaning on one neighbour off to the
  side, or balanced after surviving the six nudges. A single contact
  directly below never puts a bead to sleep - that rule is what stops a
  pouring stream from freezing into a standing column.
- Tilting skews the cascade exactly like tilting the real toy.
- 240 Hz fixed substeps keep the clatter stable at any frame rate.
- Shared `galtonMath.ts` drives both the Skia source and the Canvas2D web
  preview.

Copy `GaltonBoard.tsx`, `galtonMath.ts`, `galtonDesign.ts` and
`Example.tsx` together with `LICENSE`. Needs `@shopify/react-native-skia`
and `react-native-reanimated`. Impulse solver over circular contacts, not
a finite-element contact model with no spin or true friction. Physical-device performance untested.
