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
  geometry. One explicitly stochastic term stands in for wood grain,
  dents and spin: hard peg hits re-kick lateral velocity with a seeded
  random component (`pegJitter`). Poured streams measurably narrow the
  distribution (sd ~1.1 bins vs the 1.58 binomial ideal; single beads
  measure ~1.59) - reported as a measured property of this model, not
  claimed as real-board behaviour.
- Tilting skews the cascade exactly like tilting the real toy.
- 240 Hz fixed substeps keep the clatter stable at any frame rate.
- Shared `galtonMath.ts` drives both the Skia source and the Canvas2D web
  preview.

Copy `GaltonBoard.tsx`, `galtonMath.ts`, `galtonDesign.ts` and
`Example.tsx` together with `LICENSE`. Needs `@shopify/react-native-skia`
and `react-native-reanimated`. Impulse solver over circular contacts, not
a finite-element contact model with no spin or true friction. Physical-device performance untested.
