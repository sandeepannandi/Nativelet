# Flow Field

A dark card of about 1,400 glowing particles riding a live fluid current.
The ambient motion is not random drift: the particles are tracers advected
through a divergence-free velocity field (the curl of a drifting two-octave
Perlin potential), so they swirl, braid and converge the way real fluid
does. Drag a finger through the card and it becomes a paddle: it shoves the
current along its own velocity, sheds a rim vortex at its edge and pushes a
little pressure ahead of itself. Let go and the momentum bleeds back into
the ambient flow - the current visibly heals.

## Files

- `FlowField.tsx` — Skia/Reanimated component (additive glow passes, speed-bucketed streaks, finger halo).
- `flowMath.ts` — the simulation: pure worklets, no imports, seeded and
  deterministic so web, native and the unit tests agree.
- `flowDesign.ts` — palette, speed buckets and streak geometry.
- `Example.tsx` — demo wiring (slow-motion switch, haptics hook).

## Use

```tsx
import { FlowField } from "./FlowField";

<FlowField slowMotion={false} onFeedback={(e) => {}} />
```

Props: `slowMotion`, `reducedMotion`, `onFeedback("touch" | "release")`,
`label`, `style`.

## Physics

Each frame, every particle samples the ambient field at its position: the
velocity is the curl of a scalar potential (two Perlin octaves drifting at
different velocities), which is exactly divergence-free - no sources or
sinks, so the flow braids instead of clumping. The field magnitude is
eased toward a ceiling so flat spots in the potential stay slow. Particles
carry momentum: their velocity relaxes exponentially toward the local
field (response 2.4/s), which is what gives the motion weight and lag on
curves.

The fingertip is a moving impulse paddle, not an attractor. Its velocity
is derived frame to frame and smoothed; a held-still finger stops pushing
instead of injecting phantom energy (the unit tests check that). Each
particle inside the 96 px influence radius gets a Gaussian-weighted shove
along the finger's velocity, a rim vortex term around the contact and a
small outward pressure term. Speeds are capped at 260 px/s. Streak tails
are the particle's own displacement over a 55 ms window, clamped between a
dot and 15 px, so slow particles read as dots and fast ones as comets -
a long-exposure look without storing any history.

Particles age out (7-16 s) and respawn at rest at a seeded random spot, so
births grow from a dot instead of popping in with a full tail. Edges wrap
on a 10 px torus margin. The unit tests check determinism, containment and
the speed cap, that the ambient flow is alive and locked to the field,
that the field's numeric divergence stays at the finite-difference floor,
that stirring at least doubles the mean energy and that the flow heals
back to ambient within seconds of release, and that respawns keep the
population constant. Slow motion steps the clock about five times slower;
Reduce Motion shows a pre-run still of the current.

Honest limits: these are tracer particles in an analytic field, not a
Navier-Stokes solver - particles do not push on each other, so stirred
energy decays by relaxation, not by turbulent cascade; the rim vortex is a
local forcing term, not a persistent eddy; particle size is bucketed into
two render classes; physical-device frame rate is unverified (Android
emulator CI only). The web preview shares this physics module and draws
with Canvas2D, not Skia.

## License

MIT — see LICENSE. Keep the license with the files when you copy them.
