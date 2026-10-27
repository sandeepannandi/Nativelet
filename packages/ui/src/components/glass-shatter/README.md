# Glass Shatter

A clear glass pane over a picture. Tap it and it cracks outward from the hit, then about 360 shards let go, fall, spin and knock into each other.

## Use

Copy `GlassShatter.tsx`, `shatterMath.ts` and `shatterDesign.ts` (the design file only feeds the demo picture) and keep `LICENSE`. Needs `@shopify/react-native-skia` and `react-native-reanimated`.

```tsx
import { GlassShatter } from "./GlassShatter";

<GlassShatter image={skImage} imageScale={2} width={340} height={460} />
```

`image` is any `SkImage` for the picture behind the glass, drawn at `imageScale` pixels per point. See `Example.tsx` for building one with Skia.

Props: `shardCount` (default 360), `slowMotion`, `reducedMotion`, `resetToken` (change it to put a whole pane back), `onFeedback("hit")`.

## How it works

- **Fracture.** Voronoi cells from sites placed on rings around the impact point (spokes on each ring, jittered), plus a sparse far field. Cells near the hit are small, far cells larger. Cells are clipped convex polygons that tile the pane.
- **Release.** The crack front moves at 780 points per second. A shard lets go when it arrives and is flung out from the hit, hard when close and gently when far. Until then it hangs in place as a fixed obstacle.
- **Physics.** Each shard is a rigid body with its real polygon, area-based mass and polar moment of inertia. Contacts use separating-axis tests, incident-edge clipping for contact points, Coulomb friction, restitution and sequential impulses at a fixed 1/180 s step. Collision shapes are shrunk 1.2 points so touching cells start separate. No circle proxies.
- **Look.** The glass is clear. Each shard shows the picture behind where it is now, shifted by a tilt-driven offset (an approximation of refraction, not ray tracing) and tinted by a glint that follows its angle. Edges are drawn as thin bright lines.

## Honest limits

- Shards fall out of the frame. There is no floor, so no pile.
- A shard never splinters further.
- Refraction is an offset of the texture lookup, not ray tracing.
- Physical-device frame rate is unverified. The sim runs on the UI thread in JavaScript, so the shard count is the knob to turn if a device is slow.
- Reduce Motion cracks the pane and holds it still.
- The web preview shares `shatterMath.ts` and draws with Canvas2D, not Skia.

## Tests

`node --experimental-strip-types shatterMath.test.mjs`
