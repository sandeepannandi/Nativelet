# Burn Dismiss

A postcard you dismiss by burning it. Touch the card and the paper ignites
under your finger: a noise-warped front creeps outward in tongues and bites
with a glowing white-yellow-orange-red edge, heat shimmers warm just ahead
of the flame, the paper browns, chars black behind it, lifts into a lit
curling rim and is eaten away to nothing, while soft smoke rises, embers
burst off the front and the cracking char, cool as they climb, and ash
flutters down. Hold to keep feeding the fire, drag to steer it, and
Restore rewinds the exact same front.

- React Native Skia: one runtime shader composites the card texture with a
  per-frame burn field (burn level, glow flicker, ember-crack pulse) that
  the combustion simulation packs every frame at 96x128. The glow band,
  scorch, char streaks, paper fibre and the curling rim are all shaded in
  SkSL from fractal value noise. Embers and ash are drawn into one Skia
  picture per frame, additively for the embers, blurred for the smoke.
- Real spread model on a fixed timestep: cells heat from burning neighbours
  (fire climbs faster than it descends), ignite past a threshold and burn
  through at a rate set by low-frequency paper-grain fuel, so the front
  eats in bites, not a circle.
- Reversible by construction: every cell's burn level is a pure function of
  the sim clock, `burn = clamp((clock - igniteT) * rate, 0, 1)`, so Restore
  just runs the clock backward and the glowing edge recedes the way it came.
- Deterministic: a seeded generator drives ignition, spawns and turbulence,
  so web, native and tests agree frame for frame.
- Pass any prepared SkImage as the card. The Example draws an original
  sunset postcard with Skia (Geist, SIL OFL).
- Slow motion runs the fire about five times slower; Reduce Motion freezes
  the unburnt card.

## Usage

Copy `BurnDismiss.tsx` and `burnMath.ts` together and keep the LICENSE
file. `burnDesign.ts` is only needed if you want the Example's artwork.

```tsx
<BurnDismiss
  image={card}
  width={340}
  height={460}
  restoreTick={restoreTick}
  onDismissed={() => { /* the card is fully burned away */ }}
  onFeedback={(event) => { /* 'ignite' | 'release' | 'restore' - hook haptics here */ }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `image` | required | Prepared SkImage of the card. |
| `width` / `height` | `340` / `460` | Card size. |
| `cols` / `rows` | `96` / `128` | Burn field resolution. |
| `slowMotion` | `false` | ~5x slower fire for demos. |
| `reducedMotion` | system | Frozen card, no ignition. |
| `restoreTick` | `0` | Increment to rewind the burn. |
| `onDismissed` | - | Fires once when every cell is consumed. |
| `onFeedback` | - | `'ignite'` / `'release'` / `'restore'`. |
| `label` | long card description | Accessibility label. |

The component is a single Skia canvas; the burn texture is re-uploaded each
frame at 96x128 and the simulation runs on the JS thread, which also keeps
the render pipeline awake on a quiet screen. Honest limits: the curl is a
shading illusion on the charred rim, not a mesh bend; the smoke is a soft
particle puff, not a fluid sim; physical-device frame rate unverified.
