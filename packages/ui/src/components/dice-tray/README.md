# 3D Dice Tray

Casino dice you pick up and throw onto a felt tray. They tumble with real
rigid-body physics, bounce off the padded rails, knock into each other and
settle on a face, which is read out as the result.

- Real 3D rotation: every die is a unit cube with a quaternion orientation,
  angular momentum and an isotropic inertia tensor. Hitting an edge sends it
  spinning, a corner hit tips it over, and a die that lands on a corner
  falls onto a face instead of balancing.
- Sequential-impulse contacts at the eight corners against the felt and the
  four rail walls, then corners against the other dice, on a fixed 1/360 s
  step: restitution (dead on felt, livelier off the rails), Coulomb friction
  that makes dice grip and roll, rolling resistance, and sleeping once a die
  is flat and still. Dice can knock each other and stack on a crowded tray.
- Rendering is a perspective projection into a draw list that Skia paints:
  glossy red acrylic with bevelled edges, per-vertex lighting from a point
  light, a soft window reflection that slides across each face as it turns,
  drilled white pips with a rim of shadow, directional shadows that soften as
  a die rises, contact occlusion, red light bleeding onto the felt, and felt
  fibres scattered on the plane so they foreshorten with the camera.
- Gesture: touch to pick all dice up, drag to carry them over the felt (they
  tilt and rattle in your hand), release to throw with the speed and
  direction of your finger. The Roll button throws them for you.
- Deterministic: the same throw gives the same result on web, native and in
  the tests.
- Slow motion runs the physics four times slower; Reduce Motion skips the
  tumble and shows the settled throw.

## Usage

Copy `DiceTray.tsx`, `diceMath.ts` and `diceDesign.ts` together and keep the
LICENSE file. `Example.tsx` is optional.

```tsx
<DiceTray
  count={2}
  onSettled={(values) => console.log(values)}
  onFeedback={(event, strength) => { /* 'pickup' | 'throw' | 'impact' | 'settle' - hook haptics here */ }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `count` | `2` | 1 to 3 dice. |
| `width` | `340` | Layout width; the tray keeps its proportions. |
| `slowMotion` | `false` | About 4x slower physics. |
| `reducedMotion` | system | Skips the tumble. |
| `rollTick` | `0` | Increment to throw the dice for the user. |
| `onSettled` | - | Face values once every die is at rest. |
| `onFeedback` | - | `'pickup'`, `'throw'`, `'impact'` (felt or rail hit, strength 0 to 1), `'settle'`. |

Honest limits: dice collide corner against face, so edge against edge
contacts between two dice are approximate. Pips are painted on the faces (the
recess is a shaded rim, not a mesh). The physics runs on the JS thread.
Physical-device frame rate unverified.
