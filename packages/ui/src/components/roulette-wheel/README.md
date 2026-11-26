# Roulette Wheel

A lit 3D roulette wheel with a chrome ball. Tap to spin the wheel and launch
the ball, or press and drag away from where you touched to set how hard the
ball is thrown. The ball circles the lacquered track, climbs the wall while it
is fast, spirals in as it slows, drops past the diamond deflectors onto the
turning rotor, hops between the frets and settles in a pocket.

- The ball is a mass rolling on the same height profile that is drawn, so the
  pull towards the middle is gravity along the surface slope. A circular orbit
  appears by itself where v squared over r equals g times the slope, a faster
  ball sits higher on the wall and a slowing ball spirals down, with air drag
  and rolling resistance.
- The wheel is a rotating frame with bearing friction and viscous drag. The
  ball is thrown the opposite way, so it meets the turning frets head on.
- Eight fixed brass diamonds on the shelf scatter the ball as it leaves the
  track. The 37 frets turn with the wheel and are solved as moving
  obstacles, so the contact uses the fret's own velocity.
- A hop dimension: hard hits kick the ball up, it flies over low frets, lands
  with a damped bounce and grips the rotor a little. A ball that stays slow
  relative to the wheel for 0.4 s locks into its pocket and the number is read
  from the frets.
- Fixed 1/480 s steps and a seeded generator: the same launch gives the same
  result on web, native and in the tests. All 37 pockets are reachable.
- Rendering is a perspective projection of the real bowl geometry into a draw
  list that Skia paints: lacquered walnut and polished brass lit by one lamp
  (the lamp highlight on the track stays put while the wheel turns under it),
  a chrome ball with a dark rim, reflected wood and a window highlight, a
  blurred shadow that softens as the ball hops, and a streak behind a fast
  ball. The near rim is drawn over the ball.
- Slow motion runs the physics four times slower. Reduce Motion skips the
  spin and shows the settled result.

## Usage

Copy `RouletteWheel.tsx`, `rouletteMath.ts` and `rouletteDesign.ts` together
and keep the LICENSE file. `Example.tsx` is optional. Needs
`@shopify/react-native-skia` and `react-native-gesture-handler`.

```tsx
<RouletteWheel
  onSettled={({ number, color }) => console.log(number, color)}
  onFeedback={(event, strength) => { /* 'launch' | 'drop' | 'deflector' | 'fret' | 'settle' - hook haptics here */ }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `width` | `340` | Layout width; the wheel keeps its proportions. |
| `slowMotion` | `false` | About 4x slower physics. |
| `reducedMotion` | system | Skips the spin and shows the settled result. |
| `spinTick` | `0` | Increment to spin for the user (for a Spin button). |
| `onLaunch` | - | Called when a ball is launched. |
| `onSettled` | - | `{ number, color }` once the ball is in a pocket. |
| `onFeedback` | - | `'launch'`, `'drop'`, `'deflector'` and `'fret'` hits (strength 0 to 1), `'settle'`. |

Honest limits: the ball is a point mass with a third dimension for hops, not a
full rigid sphere, and it rolls without a spin model. The pockets carry no
printed numbers (the result is shown outside the wheel). The wheel is not
slowed by the ball. Physics runs on the JS thread. Physical-device frame rate
unverified.
