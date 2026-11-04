# Newton's Cradle

Five chrome balls on taut strings. Pull one back (or grab the second ball
from an end to lift a pair) and release: momentum clicks through the line
and the matching balls swing out the far side.

- RK4 pendulum dynamics on a real string-length scale, sequential pairwise
  impulse collisions (equal masses, restitution just under 1) so two balls
  in produce two balls out rather than one at twice the speed.
- Light viscous drag and the sub-1 restitution bleed energy until the toy
  settles to rest.
- Shared `cradleMath.ts` drives both the Skia source and the Canvas2D web
  preview.

Copy `NewtonsCradle.tsx`, `cradleMath.ts`, `cradleDesign.ts` and
`Example.tsx` together with `LICENSE`. Needs `@shopify/react-native-skia`
and `react-native-reanimated`. Impulse solver over separated contacts, not
a finite-element contact model. Physical-device performance untested.
