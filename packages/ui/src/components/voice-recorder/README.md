# Voice Recorder

A chat voice-recording bar, the kind messaging apps ship. Press and hold the
mic: the bar morphs into a recording strip with a pulsing record dot, a
timer and a live waveform. Slide left to cancel (the strip fills red and
flushes away), drag up to lock the recording hands free, or simply release
to send - the take lands in the thread as a playable voice-message pill. A
plain tap on the mic starts a locked recording, so the whole flow works
without dragging (screen readers, switch control, keyboards).

## Files

- `VoiceRecorder.tsx` - the control: gestures, springs, Skia drawing.
- `recorderMath.ts` - pure state machine, simulated audio model and
  geometry. No React and no Skia: native, the Canvas2D web preview and the
  unit tests all step the same state, so every surface draws the same frame.
- `recorderDesign.ts` - palette.
- `Example.tsx` - a chat thread demo with playable sent pills.
- `recorderMath.test.mjs` - state-machine, audio-model and geometry tests
  (`node --experimental-strip-types --test recorderMath.test.mjs`).

## Use

```tsx
import { VoiceRecorder } from "./VoiceRecorder";

<VoiceRecorder
  onSend={({ seconds, samples }) => saveVoiceMessage(seconds, samples)}
  onCancel={() => {}}
  onFeedback={(event) => lightHaptic(event)}
/>
```

Dependencies: `react`, `react-native`, `@shopify/react-native-skia`,
`react-native-reanimated`. `expo-haptics` is used by the showcase adapter
only, through `onFeedback`.

## Honest limits

- The waveform is a deterministic simulated speech envelope (`levelAt`),
  not microphone input. This package never requests the mic permission,
  records no audio and plays no audio; `onSend` hands you the duration and
  the samples that were on screen - wire your own recorder (for example
  `expo-av`) to the same state machine if you ship it.
- Gestures use the core `PanResponder`, so the control has no
  gesture-handler dependency.
- Web preview on the site shares the math and draws with Canvas2D, not
  Skia. Physical-device frame rate, iOS gestures and haptics need device
  verification; Android emulator behavior is checked in CI.
- System Reduce Motion removes the springs and morphs; the state machine,
  timer and events are unchanged.
