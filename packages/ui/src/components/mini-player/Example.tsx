// Nativelet Mini Player. MIT: retain the accompanying LICENSE.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MiniPlayer, type PlayerState, type PlayerTrack } from './MiniPlayer';
import { clamp01, formatClock } from './playerMath';

export const TRACKS: PlayerTrack[] = [
  { id: 'monsoon', title: 'Monsoon Drift', artist: 'Paper Lanterns', duration: 214, colors: ['#2f6b4f', '#8fd0a8'] },
  { id: 'terra', title: 'Terra Cotta', artist: 'Vega Bloom', duration: 186, colors: ['#b0552f', '#f2b279'] },
  { id: 'nightbus', title: 'Night Bus', artist: 'Low Orbit', duration: 243, colors: ['#2c3550', '#7f96d1'] },
  { id: 'saffron', title: 'Saffron Line', artist: 'Mina Rao', duration: 171, colors: ['#c98a1f', '#f4d35e'] },
  { id: 'tide', title: 'Glass Tide', artist: 'Harborline', duration: 228, colors: ['#1f6f7a', '#9adcd3'] },
];

/** Playlist demo. Playback is simulated on a timer: no audio is decoded or played. */
export default function Example({ onFeedback }: { onFeedback?: () => void }) {
  const [state, setState] = useState<PlayerState>('collapsed');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const track = TRACKS[index];

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p + 0.25 / Math.max(1, track.duration);
        if (next >= 1) {
          setIndex((i) => (i + 1) % TRACKS.length);
          return 0;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [playing, track.duration]);

  const pick = (i: number) => {
    onFeedback?.();
    setIndex(i);
    setProgress(0);
    setPlaying(true);
  };

  return (
    <MiniPlayer
      state={state}
      onStateChange={setState}
      track={track}
      playing={playing}
      onPlayingChange={setPlaying}
      progress={progress}
      onSeek={(ratio) => setProgress(clamp01(ratio))}
      onNext={() => { setIndex((index + 1) % TRACKS.length); setProgress(0); }}
      onPrevious={() => { setIndex((index - 1 + TRACKS.length) % TRACKS.length); setProgress(0); }}
      onFeedback={onFeedback}
      bottomOffset={0}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 8 }}>
        <Text style={{ color: '#456345', fontSize: 10, letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 }}>EVENING MIX</Text>
        <Text style={{ color: '#193f30', fontSize: 30, fontWeight: '700', letterSpacing: -1, marginBottom: 12 }}>Made for the demo</Text>
        {TRACKS.map((item, i) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title} by ${item.artist}`}
            onPress={() => pick(i)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
              backgroundColor: i === index ? '#e6edde' : 'transparent',
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.colors[0] }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#193f30', fontSize: 14, fontWeight: '600' }}>{item.title}</Text>
              <Text style={{ color: '#4b6053', fontSize: 12, marginTop: 1 }}>{item.artist}</Text>
            </View>
            <Text style={{ color: '#4b6053', fontSize: 12 }}>{formatClock(item.duration)}</Text>
          </Pressable>
        ))}
        <Text style={{ color: '#4b6053', fontSize: 12, lineHeight: 20, marginTop: 16 }}>
          Playback is simulated on a timer: no audio is decoded or played. Drag the bar up to open the player, down to close it.
        </Text>
      </ScrollView>
    </MiniPlayer>
  );
}
