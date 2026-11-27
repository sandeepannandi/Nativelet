# Tear-off Ticket

An event ticket with a perforated stub. Press the stub and pull: the paper tears
along the perforation one bridge at a time, the stub peels away from the
ticket, and when the last bridge goes it comes free, follows your finger, and
falls like paper once you let go.

- The perforation is 32 ties. Each tie has its own strength, so the tear
  catches and lets go in little steps. The opening angle at the first unbroken
  tie is the tension on it; when it passes that tie's strength the tie breaks,
  the hinge moves on and the arm gets longer, so the same pull opens a smaller
  angle. A tear runs only as far as your pull can open it. A short pull tears a
  few ties and the stub stays bent where it was left; a long one takes it off.
- The free part of the stub is a strip of paper that keeps its length and
  bends about the hinge. Everything printed on it (the lettering, the barcode,
  the paper grain) bends with it.
- The torn edge is one curve shared by both halves. Where a bridge tore, the
  printed colour breaks away and the white paper core shows, so the ticket and
  the stub still fit back together.
- Once free the stub is a rigid body. A spring at the handle drags it after
  the finger and turns it about its centre. After release it falls with air
  drag, sways and tips like a sheet of paper, lands softly, slides and stops.
- The seed is fixed, so the same pull tears the same bridges on web, native
  and in the tests.
- Slow motion runs the paper four times slower. Reduce Motion tears the stub
  and shows it at rest without the fall.

## Usage

Copy `TearTicket.tsx`, `tearMath.ts` and `tearDesign.ts` together and keep the
LICENSE file. `Example.tsx` is optional. Needs `@shopify/react-native-skia` and
`react-native-gesture-handler`.

```tsx
<TearTicket
  onTorn={() => console.log("admitted")}
  onFeedback={(event, strength) => { /* 'grab' | 'tick' | 'detach' | 'land' | 'settle' - hook haptics here */ }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `width` | `340` | Layout width; the ticket keeps its proportions. |
| `slowMotion` | `false` | About 4x slower paper. |
| `reducedMotion` | system | Tears and settles without the fall. |
| `tearTick` | `0` | Increment to tear the stub for the user (a Tear button). |
| `resetTick` | `0` | Increment to bring a fresh ticket. |
| `onTorn` | - | Called when the stub comes free. |
| `onSettled` | - | Called when the stub has landed and stopped. |
| `onFeedback` | - | `'grab'`, `'tick'` (strength 0 to 1), `'detach'`, `'land'`, `'settle'`. |

Honest limits: the paper is a strip bent about one hinge in the ticket plane
with a drawn lift and shadow, not a full 3D sheet, so the stub never turns over
to show its back. The ticket body does not move. The ticket art is fixed. Physics
runs on the JS thread. Physical-device frame rate and feel unverified.
