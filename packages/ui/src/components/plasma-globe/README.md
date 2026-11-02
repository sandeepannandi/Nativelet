# Plasma Globe

A dark glass sphere with a glowing electrode at its centre. Nine branching
violet and pink filaments run from the electrode to the glass, wander
around it, and now and then re-strike somewhere new. Touch the glass and
most of the filaments gather at your fingertip, with a bright contact glow;
drag and they follow. Release and they scatter back into wandering arcs
with a brief flash. Two of the nine stay free while you touch, as in a
real globe.

## Files

- `PlasmaGlobe.tsx` - Skia/Reanimated component (glass sphere, additive three-pass filaments, fingertip glow, stand).
- `plasmaMath.ts` - the filament model: pure worklets, no imports, seeded and deterministic so web, native and the unit tests agree.
- `plasmaDesign.ts` - palette and stroke widths.
- `Example.tsx` - demo wiring (slow-motion switch, haptics hook).

## Use

```tsx
import { PlasmaGlobe } from "./PlasmaGlobe";

<PlasmaGlobe slowMotion={false} onFeedback={(e) => {}} />
```

Props: `slowMotion`, `reducedMotion`, `onFeedback("touch" | "release")`,
`label`, `style`.

## How it works

Each bolt is a polyline from the electrode to a point on the glass. The
shape is the straight line plus a perpendicular displacement built from
two slow sines (the waviness) and a random kink table that is re-rolled
about 14 times a second and blended between rolls (the flicker). Three
short branches per bolt grow off the main line and re-form roughly every
0.3 s; one of them is a fan branch that moves to the tip while you touch,
so the arcs spray out where they land. The glass end of each bolt wanders
by a random walk in angle with occasional re-strikes and a gentle
repulsion between bolts. A touch eases each non-free bolt's end toward the
fingertip, with a small per-bolt landing spread, and the end then chases
the finger at about 14 per second. Filaments are drawn additively in three
passes (violet halo, pink body, white core) so overlaps glow rather than
cover. Slow motion steps the clock about five times slower, which is the
easiest way to watch the branching. Reduce Motion shows a fixed picture.

The unit tests check determinism, that every point stays finite and on the
glass (including a finger far outside the sphere), that free bolts wander,
that a touch gathers the attracted ends within a few pixels of the finger,
that they follow a drag, that release scatters them and fires a decaying
flash, and that slow motion keeps the same model.

Honest limits: this is a visual approximation of electrical filaments, not
a plasma or electric-field simulation; the bolts do not branch physically
or carry charge; filament paths are noise, not field lines; physical-device
frame rate is unverified (Android emulator CI only). The web preview shares
this math module and draws with Canvas2D, not Skia.

## License

MIT - see LICENSE. Keep the license with the files when you copy them.
