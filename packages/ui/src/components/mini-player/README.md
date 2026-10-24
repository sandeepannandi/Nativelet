# Mini Player

A mini player bar that morphs into a full now-playing screen as you drag it up, and collapses back as you drag it down. The artwork scales from a thumbnail into a hero square, the page behind sinks and dims, a Skia waveform scrubs the track, and release velocity decides whether the player opens or snaps shut. Tapping the bar toggles it. Grabbing it mid-animation continues from where it is.

React Native with Reanimated, Skia and `PanResponder`. No other dependencies.

## Copy

Copy `MiniPlayer.tsx` and `playerMath.ts` together into your app, and keep `LICENSE`. `Example.tsx` is a playlist usage sample and `playerMath.test.mjs` tests the pure helpers (`node --test playerMath.test.mjs`).

## Use

```tsx
<MiniPlayer
  state={state}                 // 'collapsed' | 'expanded'
  onStateChange={setState}
  track={track}                 // { id, title, artist, duration, colors: [a, b] }
  playing={playing}
  onPlayingChange={setPlaying}
  progress={progress}           // 0..1 through the track
  onSeek={setProgress}
  onNext={next}
  onPrevious={previous}
>
  <YourScreen />
</MiniPlayer>
```

- The morph position is a single value from 0 (bar) to 1 (full player). Every size, position, radius, scale and crossfade is a pure function of it (`playerMath.ts`), so the drag can start, stop and reverse at any point.
- The waveform is drawn from a deterministic hash of the track id, so every platform draws the same bars for the same track. Feed real amplitudes from your decoder if you have them.
- `onFeedback` fires on user-initiated state and transport changes. Wire haptics there (for example `expo-haptics` in your app). The component itself has no haptics dependency, and your adapter should swallow its own errors.
- `reducedMotion` jumps to the end state with no spring. Pass your app's Reduce Motion setting; when omitted the player always animates.
- `bottomOffset` lifts the collapsed bar above a tab bar.
- Artwork is a generated gradient from `track.colors`. Swap `Artwork` for an `Image` if your app has real covers.

## This is not a media player

The component renders UI only. It does not decode, buffer or play audio, and it has no audio-session or lock-screen integration. The example advances progress on a timer. Drive `progress` and `playing` from your own playback engine (for example `expo-av` or `react-native-track-player`) in a real app.

## Accessibility

The surface is one button with Expand and Collapse actions, so drag is never required. Play, previous and next are labelled buttons. The waveform is an adjustable seek control: swipe up or down with a screen reader to move ten seconds. The page behind the player is removed from touch while the player is open.

## Status

Checked: TypeScript, the helper tests and a React Native Web render. Physical-device frame rate, iOS gestures and haptics require verification.
