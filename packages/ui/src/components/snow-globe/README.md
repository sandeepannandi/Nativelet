# Snow Globe

A glass snow globe with a cottage, pines and a lamp. Drag the globe or shake it
and a blizzard swirls through the water, then settles flake by flake onto the
snow.

- Water that lags: the globe is simulated in its own frame, so moving it makes
  the water slosh the other way. The flow is a bulk slosh, a swirl that spins
  down like stirred water, and a divergence-free turbulent field (an ABC
  flow) whose strength is the energy you put in and viscosity takes out. All
  of it fades to zero at the glass.
- Each flake follows the water and sinks at its own terminal speed. Fall speed
  grows with the square of the flake's diameter (Stokes), so big flakes drop
  first and small ones hang and drift for seconds.
- Flakes bounce softly off the glass, slide on the ground and lie still once the
  water around them has calmed. A strong shake lifts them again, the loosest
  first.
- Rendering is a draw list that Skia paints: a painted night backdrop, hills,
  a lit cottage and pines that hide the flakes behind them, a lamp glow that
  warms nearby flakes, near flakes that blur, glass with a fresnel edge, a
  window reflection and a brass collar on a walnut base.
- Gesture: touch the globe and drag, the globe follows your finger and springs
  back. The Shake button rattles it for you.
- Slow motion runs the physics four times slower; Reduce Motion freezes the
  snow on the ground and ignores drags.

## Usage

Copy `SnowGlobe.tsx`, `snowMath.ts` and `snowDesign.ts` together and keep the
LICENSE file. `Example.tsx` is optional.

```tsx
<SnowGlobe
  onSettled={() => console.log("calm")}
  onFeedback={(event, strength) => { /* 'grab' | 'shake' | 'settle' - hook haptics here */ }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `flakes` | `480` | Number of flakes. Use fewer on slow phones. |
| `width` | `340` | Layout width; the scene keeps its proportions. |
| `slowMotion` | `false` | About 4x slower physics. |
| `reducedMotion` | system | Freezes the snow. |
| `shakeTick` | `0` | Increment to shake the globe for the user. |
| `onSettled` | - | Called once the water is calm and every flake is at rest. |
| `onFeedback` | - | `'grab'`, `'shake'`, `'settle'`. |

Honest limits: the water is a closed-form flow field, not a fluid solver, so it
does not react to the flakes or to the cottage. Flakes pass through the trees
and roofs instead of landing on them. The scene is a 2.5D projection, not a 3D
render. The physics runs on the JS thread. Native rendering and physical-device
frame rate unverified.
