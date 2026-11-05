# Galton Board

A wooden bean machine: brass pegs in a quincunx, a hopper up top, eleven
bins at the bottom. Tap to drop one bead, hold to pour the hopper, drag
sideways to tilt the whole board, swipe fast to sweep the bins clean.
Beads clatter down the pegs and pile into the bell curve the board is
famous for - with the dashed binomial curve drawn behind the piles once
enough beads have landed.

- Rigid-bead physics: circle-vs-peg deflections with restitution, real
  ball-ball impulses over a spatial hash, wall/divider/floor contacts, and
  a sleep state for piled beads woken by hard knocks or tilting.
- The bell curve is never scripted: it emerges from the collision
  geometry, tilting skews it exactly like tilting the real toy.
- 240 Hz fixed substeps keep the clatter stable at any frame rate.
- Shared `galtonMath.ts` drives both the Skia source and the Canvas2D web
  preview.

Copy `GaltonBoard.tsx`, `galtonMath.ts`, `galtonDesign.ts` and
`Example.tsx` together with `LICENSE`. Needs `@shopify/react-native-skia`
and `react-native-reanimated`. Impulse solver over circular contacts, not
a finite-element contact model. Physical-device performance untested.
