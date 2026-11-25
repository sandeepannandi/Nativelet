# Origami Fold

A sheet of two-sided paper on a desk. Drag sideways to fold it through four
creases, drag back to unfold it. Each fold swings a flap over the pile and
lands it flat, with the paper bending a little on the way.

- Geometry, not a canned animation: every crease cuts each facet it crosses
  into two convex pieces. The far pieces rotate about the crease by up to pi,
  are reflected, flip colour and stack on top of the pile in reversed order.
  The same data folds forward and unfolds back, and the tests check that paper
  area is conserved and that overlapping pieces never share a layer.
- A hinged flap does not move like a rigid plate: it lags its crease early and
  leads it late by a few degrees, so the sheet curls as it turns.
- Rendering is a perspective projection into a draw list that Skia paints:
  matte vermilion and cream paper lit from a lamp, whichever face looks at the
  camera shaded for its own normal, soft shadows on the desk, a shadow cast by
  the flap onto the paper it covers, creases that appear as the paper bends and
  a camera that recentres and zooms as the shape shrinks.
- Gesture: drag sideways to fold or unfold, release to settle on the nearest
  step on a lightly under-damped spring, flick to carry on to the next step.
- Slow motion runs the settle four times slower; Reduce Motion jumps between
  steps with no animation.

## Usage

```tsx
import { OrigamiFold } from "./OrigamiFold";

<OrigamiFold step={step} onStepChange={setStep} onFeedback={(e) => e === "crease" && haptics()} />
```

Copy `OrigamiFold.tsx`, `foldMath.ts` and `foldDesign.ts` together and keep
`LICENSE`. Requires `@shopify/react-native-skia`.

## Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `step` | `0` | Step to rest at, 0 (flat) to 4. Change it to fold or unfold. |
| `width` | `340` | Layout width; keeps a 340 x 420 ratio. |
| `slowMotion` | `false` | Run the settle four times slower. |
| `reducedMotion` | system | Jump between steps with no animation. |
| `onStepChange` | | Called when the paper rests on a step. |
| `onFeedback` | | `grab`, `crease` (a fold lands) and `release`, for haptics. |

## Honest limits

Facets are rigid convex pieces with an analytic bend, not a cloth simulation.
Layers are ordered by an exact pile model but paper does not collide with
itself mid-fold. Rendering runs on the JS thread. Web preview is a Canvas2D
adapter fed by the same draw list; the native Skia render has not been run on
a physical device.
