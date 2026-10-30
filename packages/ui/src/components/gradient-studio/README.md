# Gradient Studio

A gradient editor, the kind design tools ship. A live gradient sits over a
track of color stops. Drag a stop to move it, tap the track to add one, pull a
stop away from the track to remove it. Select a stop, then drag the hue ring
or the saturation and value square to recolor it: a magnifying loupe lifts
above your finger and shows the exact pixels under it, so you can land on a
color without covering it with your thumb. Preset chips animate every stop to
a new palette, and touching the editor mid-flight takes over from wherever the
animation is.

## Files

- `GradientStudio.tsx` - the control: gestures, Skia drawing, accessibility.
- `gradientMath.ts` - pure state machine, Oklab color math, geometry and
  springs. No React and no Skia: native, the Canvas2D web preview and the unit
  tests all step the same state, so every surface draws the same frame.
- `gradientDesign.ts` - palette.
- `Example.tsx` - the control plus a live CSS readout.
- `gradientMath.test.mjs` - color, hit-testing, gesture, loupe and preset
  tests (`node --experimental-strip-types --test gradientMath.test.mjs`).

## Use

```tsx
import { GradientStudio } from "./GradientStudio";

<GradientStudio
  onChange={(stops, css) => save(stops)} // [{ position: 0..1, color: "#RRGGBB" }]
  onFeedback={(event) => lightHaptic(event)} // touch | select | add | remove | preset
/>
```

Dependencies: `react`, `react-native`, `@shopify/react-native-skia`.
`expo-haptics` is used by the showcase adapter only, through `onFeedback`.

## How it works

- Colors are stored as hue, saturation and value so the wheel, the square and
  the handles always agree. Stops blend in Oklab: the gradient is sampled
  densely in Oklab and drawn as a plain linear gradient, so mid-tones keep
  their lightness instead of going muddy the way an sRGB blend does between
  saturated hues. `onChange` also returns a CSS string that uses
  `linear-gradient(in oklab 90deg, ...)`.
- The loupe re-draws the same ring and square at 3x inside a circular clip
  and follows the finger; it flips below the finger near the top edge.
- Animation (the loupe lift, handle pop, preset tweens) runs on springs inside
  the pure module and is stepped from a frame loop that only runs while
  something is moving. A touch mid-tween cancels it and the stops keep their
  current values.
- Two to six stops. Dragging a stop 52 points away from the track marks it for
  removal (it fades and the pin turns red); dragging back cancels.

## Honest limits

- Gestures use the core `PanResponder` and a React state frame loop, not
  Reanimated or Gesture Handler, so there is no extra native dependency. The
  scene is small (a few shapes), but physical-device frame rate has not been
  measured.
- Accessibility: the editor is one adjustable element. Increment and decrement
  move the selected stop, activate selects the next stop, and custom actions
  add and remove stops. The color wheel itself is touch-only; screen reader
  recoloring needs native verification.
- Web preview on the site shares the math and draws with Canvas2D, not Skia.
  Physical-device frame rate, iOS gestures and haptics need device
  verification; Android emulator behavior is checked in CI.
- System Reduce Motion removes the springs and tweens; presets apply at once.
