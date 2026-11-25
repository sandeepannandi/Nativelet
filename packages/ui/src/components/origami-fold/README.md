# Origami Fold

A sheet of two-sided paper on a desk that you fold any way you like. Press
anywhere on the paper and drag in any direction. The crease is the line halfway
between where you grabbed and where your finger is, so it follows the finger.
The grabbed part lifts and swings over in 3D. Let go past the halfway mark and
it lands flat; let go early and it springs back. Folds stack on the folded
shape, so you can keep going, and Undo plays the last fold backwards.

- Geometry, not a canned animation: the sheet is a list of convex facets in
  layers. A crease cuts each facet it crosses into two convex pieces. The pieces
  behind the crease rotate about it by up to pi, are reflected, flip colour and
  stack on top of the pile in reversed order. The tests fold along random creases
  and check that paper area and winding are conserved and that overlapping pieces
  never share a layer, and drive real drags from several corners and edges.
- While the flap is still lifting the crease stays a fixed reach from the grab
  point and the flap angle follows how far the finger has travelled; once the
  flap is flat the crease follows the midpoint, so the grabbed point sits under
  the finger.
- A hinged flap does not move like a rigid plate: it lags its crease early and
  leads it late by a few degrees, so the sheet curls as it turns.
- Rendering is a perspective projection into a draw list that Skia paints:
  matte vermilion and cream paper lit from a lamp, whichever face looks at the
  camera shaded for its own normal, soft shadows on the desk, a shadow cast by
  the flap onto the paper it covers, creases that appear as the paper bends and
  a camera that recentres and zooms as the shape changes.
- Slow motion runs the settle four times slower; Reduce Motion lands or undoes
  folds with no animation (and ignores drags).

## Usage

```tsx
import { OrigamiFold, type OrigamiFoldHandle } from "./OrigamiFold";

const paper = useRef<OrigamiFoldHandle>(null);
<OrigamiFold ref={paper} onFoldsChange={setFolds} onFeedback={(e) => e === "crease" && haptics()} />;
paper.current?.undo();
```

Copy `OrigamiFold.tsx`, `foldMath.ts`, `foldController.ts` and `foldDesign.ts`
together and keep `LICENSE`. Requires `@shopify/react-native-skia`.

## Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `width` | `340` | Layout width; keeps a 340 x 420 ratio. |
| `slowMotion` | `false` | Run the settle four times slower. |
| `reducedMotion` | system | Land and undo folds with no animation. |
| `onFoldsChange` | | Called when a fold lands or is undone, with the fold count. |
| `onFeedback` | | `grab`, `crease` (a fold lands), `release`, `undo`, for haptics. |

The ref exposes `undo()` and `reset()`.

## Honest limits

Facets are rigid convex pieces with an analytic bend, not a cloth simulation.
A fold always takes every layer on the grabbed side (like folding the whole
stack), and paper does not collide with itself mid-fold. Rendering runs on the
JS thread. Web preview is a Canvas2D adapter fed by the same draw list; the
native Skia render has not been run on a physical device.
