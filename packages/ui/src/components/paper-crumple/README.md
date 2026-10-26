# Paper Crumple

A sheet of ruled paper you crumple with your fingers. Drag a corner toward
the middle, or pinch, and it wraps into a creased paper ball that is shaded
facet by facet. Flick the ball and it rolls, bounces off the card edges and
settles. Double tap it, or pinch out, and it opens again - but the paper
remembers: the deepest crumple it reached leaves faint creases behind.

## Files

- `PaperCrumple.tsx` - Skia/Reanimated component (triangle-mesh sheet drawn as shade-bucketed facet paths, soft shadow, PanResponder with one- and two-finger gestures).
- `crumpleMath.ts` - the geometry and physics: pure worklets, no imports,
  seeded and deterministic so web, native and the unit tests agree.
- `crumpleDesign.ts` - paper and ruled-band palettes.
- `Example.tsx` - demo wiring (smooth-out button, slow-motion switch, haptics hook).

## Use

```tsx
import { PaperCrumple } from "./PaperCrumple";

<PaperCrumple slowMotion={false} smoothToken={0} onFeedback={(e) => {}} />
```

Props: `slowMotion`, `reducedMotion`, `smoothToken` (change the number to
smooth the paper open), `onFeedback("touch" | "release")`, `label`, `style`.

## Gestures

- One finger on the flat sheet: the distance from your finger to the sheet
  centre drives the crumple. Pull a corner inward to crumple, outward to
  open. Let go past about 78% and it snaps shut into a ball; let go earlier
  and it holds its half-crumpled shape.
- Two fingers: pinch in to crumple, pinch out to open.
- One finger on the ball: carry it. Release with speed to toss it.
- Double tap the ball: smooth it back out.

## How it works

The sheet is a 40 x 52 vertex grid (4,160 triangles). Crumpling blends each
vertex from its flat position toward a point on a ball, mapping distance
from the centre to polar angle, so the edges fold around to the far pole
the way a hand gathers paper. The relief that makes it look crumpled is a
sum of three cellular (Worley F2 - F1) octaves: cell borders become sharp
valleys and each cell a distinct facet. Heights are applied along the
blended surface normal, so the same field produces gentle wrinkles at low
crumple and hard creases at high crumple.

Every triangle is shaded flat from its own normal against a fixed light,
darkened where it sits in a valley, and quantised to ten tones for either
plain paper or a pale ruled band. Triangles are grouped by tone and by
three depth layers, and each group is one Skia path, so a frame is 60 path
fills rather than thousands of draws. The ruled bands exist to make the
distortion readable while the sheet folds.

The toss is a point mass with wall bounces (restitution 0.55) and
exponential rolling drag. As the ball moves, its rotation matrix is
advanced about the axis perpendicular to its velocity by distance divided
by the ball radius, which is rolling without slipping, so the facets turn
under the light.

The unit tests check determinism, a flat evenly lit start, the corner drag
reaching a ball of the expected size, monotonic shrink, a half-crumple
holding on release, permanent faint creases after smoothing, a toss that
bounces inside the card and comes to rest, a slow release that does not
toss, rolling that changes the shading, double-tap smoothing, pinch both
ways and the bucket sort.

Honest limits: this is a convincing approximation, not a paper simulation.
There is no real self-contact or collision between folds, no paper
stiffness or fracture, and the ball is a wrapped sphere with relief rather
than a true crumpled volume. The wrap stretches the sheet a little near the
rim. The ruled bands are drawn per facet row, so they are coarse. The
sheet is always a single fixed crease pattern per seed. Physical-device
frame rate, haptics and TalkBack are unverified; the Android emulator CI
covers launch, gestures and crashes only. The web preview shares this math
and draws with Canvas2D, not Skia.

## License

MIT - see LICENSE. Keep the license with the files when you copy them.
