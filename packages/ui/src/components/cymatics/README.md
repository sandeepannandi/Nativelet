# Cymatics

A square steel plate holding about 4,200 grains of sand, driven at one
pure frequency. The plate's surface follows the classic Chladni equation,
so the grains bounce where the metal rings and gather on the nodal lines
where it does not move - the same figures Ernst Chladni drew with a
violin bow. Drag sideways and you retune the drive: the figure shatters
into dancing sand and reorganizes into the next resonance as you climb
the mode ladder from 107 Hz to 1.14 kHz. Drag up or down to blend the two
degenerate orientations of the current mode (a real plate rings in a
mix). Tap the plate to scatter the sand and watch the figure reform.

## Files

- `Cymatics.tsx` — Skia/Reanimated component (steel plate, two-pass sand, finger halo).
- `cymaticsMath.ts` — the simulation: pure worklets, no imports, seeded and
  deterministic so web, native and the unit tests agree.
- `cymaticsDesign.ts` — palette and grain geometry.
- `Example.tsx` — demo wiring (slow-motion switch, plate/frequency readout, haptics hook).

## Use

```tsx
import { Cymatics } from "./Cymatics";

<Cymatics slowMotion={false} onFeedback={(e) => {}} onTune={(hz, m, n) => {}} />
```

Props: `slowMotion`, `reducedMotion`, `onFeedback("touch" | "release" |
"scatter")`, `onTune(hz, m, n)` (throttled to tuning changes), `label`,
`style`.

## Physics

The plate displacement on the unit square is g(x, y) = cos(m*pi*x) *
cos(n*pi*y) + r * cos(n*pi*x) * cos(m*pi*y): the (m, n) resonance mode
blended with its degenerate orientation by r in [-1, 1]. The drive
frequency follows the thin-plate law f ~ sqrt(m^4 + n^4), and the ten
modes are ordered by it, so one horizontal sweep climbs the real
resonance ladder; between two modes the field is a smooth interpolation,
which is why the figure dissolves and reforms instead of snapping. Each
frame, every grain samples the vibration amplitude |g| and its gradient
(bilinear from a 72x72 sampling of the exact equation, recomputed only
when the tuning changes). Grains walk down the amplitude slope, faster
where the plate rings harder, and receive random vibration kicks that
grow with |g|; near a nodal line both die out, so the sand comes to rest
on the figure. Retuning injects the change as extra kick energy that
dissipates over about a second. A tap gives every grain one sharp
impulse, scaled by local amplitude. Grains bounce off the rim with a
deadened rebound. The unit tests check determinism, containment, the
speed cap, that a scattered plate settles most grains onto nodal lines
and stays settled, that a tap un-settles and the figure reforms, that
retuning re-forms the figure at the new mode, and that a held-still
finger changes neither the tuning nor the energy. Slow motion steps the
clock about five times slower; Reduce Motion shows the fully formed
figure as a still.

Honest limits: the modal fields are the exact Chladni equation sampled
on a 72x72 grid, not a live PDE solve - between grid nodes the field is
bilinear interpolation; grains do not collide with each other (real sand
piles and slips); the frequency readout is the modal ladder value, not a
microphone measurement; the blend parameter is a modeling convenience
for degenerate-mode mixing, not a second physical dial a plate would
have; physical-device frame rate is unverified (Android emulator CI
only). The web preview shares this physics module and draws with
Canvas2D, not Skia.

## License

MIT — see LICENSE. Keep the license with the files when you copy them.
