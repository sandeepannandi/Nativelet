# Venom Button

A glossy black pill that behaves like a symbiote. Touch the stage and
tendrils ooze out of the button and feel toward your finger; bring it close
and they lunge, each one wrapping the fingertip while the pill stretches
toward it. Pull away or let go and the tendrils snap back with an overshoot,
melt into the button, and the pill wobbles and throws up a few spikes that
melt away. A quick tap on the pill is a press.

## Files

- `VenomButton.tsx` - the control: gestures, Skia goo drawing, accessibility.
- `venomMath.ts` - pure state machine: tendril springs, the pill pull and
  squash wobble, spikes. No React and no Skia: native, the Canvas2D web
  preview and the unit tests all step the same state, so every surface draws
  the same frame.
- `venomDesign.ts` - palette.
- `Example.tsx` - the control plus a slow-motion toggle.
- `venomMath.test.mjs` - reach, grab, tear, snap-back, tap, bounds,
  reduced-motion and determinism tests
  (`node --experimental-strip-types --test venomMath.test.mjs`).

## Use

```tsx
import { VenomButton } from "./VenomButton";

<VenomButton
  label="Hold me"
  onPress={() => submit()}                  // a quick tap
  onFeedback={(event) => lightHaptic(event)} // sense | grab | release | press
  slowMotion={false}                         // 4x slower goo, off with Reduce Motion
/>
```

Dependencies: `react`, `react-native`, `@shopify/react-native-skia`.
`expo-haptics` is used by the showcase adapter only, through `onFeedback`.

## How it works

- Seven thick strands and seven fine hairs root around the pill edge, fanned
  toward the finger. Each strand is a chain of circles (thick root to thin
  tip, with a sideways bow) blurred and thresholded by a Skia goo matrix, so
  overlapping circles merge into one liquid surface; a bulb caps each tip
  while it holds the finger.
- In sense range the tips spring toward the finger along their own direction
  but only part of the way; inside grab range the springs stiffen onto the
  fingertip with a slow orbit, and the pill stretches up to 16 points toward
  the hold. Dragging too far tears the hold loose.
- Release (or a tear) switches every strand to a stiff under-damped spring
  home, pops three to five spikes out of the pill edge and kicks a squash
  wobble through the pill. Everything steps at a fixed 240 Hz, so the web
  preview and the native control draw the same frame.
- Reduce Motion skips the springs: tendrils snap straight to each pose, no
  wobble and no spikes. Honest limits: the goo is a blur-threshold illusion,
  not fluid simulation; gloss highlights sit on the pill only, not on the
  tendrils; physical-device frame rate and haptics are unverified.
