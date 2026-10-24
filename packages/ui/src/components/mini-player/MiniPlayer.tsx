// Nativelet Mini Player. MIT: retain the accompanying LICENSE.
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Circle, Group, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  backdropOpacity, clamp01, collapseFade, contentScale, dragProgress, expandFade,
  formatClock, hashSeed, lerp, resolveTarget, waveformBars, artSize,
} from './playerMath';

export type PlayerState = 'collapsed' | 'expanded';

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  colors: [string, string]; // artwork gradient
};

export const BAR_HEIGHT = 64;
export const BAR_RADIUS = 18;
export const SHEET_RADIUS = 30;
const BAR_MARGIN = 12;
const ART_MINI = 40;
const ART_TOP = 76;
const WAVE_BARS = 56;
const WAVE_HEIGHT = 72;

const SPRING = { stiffness: 260, damping: 26, mass: 0.9 };

function Artwork({ track, size }: { track: PlayerTrack; size: number }) {
  const seed = hashSeed(track.id);
  const cx = size * (0.25 + (seed % 50) / 100);
  const cy = size * (0.2 + ((seed >> 8) % 40) / 100);
  const dx = size * (0.55 + ((seed >> 16) % 30) / 100);
  const dy = size * (0.6 + ((seed >> 24) % 30) / 100);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        <RoundedRect x={0} y={0} width={size} height={size} r={0}>
          <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={track.colors} />
        </RoundedRect>
        <Circle cx={cx} cy={cy} r={size * 0.34} color="rgba(255,255,255,0.22)" />
        <Circle cx={dx} cy={dy} r={size * 0.22} color="rgba(0,0,0,0.16)" />
      </Group>
    </Canvas>
  );
}

function Waveform({ track, progress, onSeek, width }: { track: PlayerTrack; progress: number; onSeek?: (ratio: number) => void; width: number }) {
  const bars = useMemo(() => waveformBars(track.id + track.title, WAVE_BARS), [track.id, track.title]);
  const gap = width / WAVE_BARS;
  const barWidth = Math.max(2, gap * 0.55);
  const played = clamp01(progress);
  const scrub = useRef({ width });
  scrub.current.width = width;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onSeek?.(clamp01(e.nativeEvent.locationX / scrub.current.width)),
      onPanResponderMove: (e) => onSeek?.(clamp01(e.nativeEvent.locationX / scrub.current.width)),
    }),
  ).current;
  return (
    <View
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={`Seek. ${formatClock(progress * track.duration)} of ${formatClock(track.duration)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = 10 / Math.max(1, track.duration);
        if (e.nativeEvent.actionName === 'increment') onSeek?.(clamp01(progress + step));
        if (e.nativeEvent.actionName === 'decrement') onSeek?.(clamp01(progress - step));
      }}
      style={{ width, height: WAVE_HEIGHT }}
    >
      <Canvas style={{ width, height: WAVE_HEIGHT }} pointerEvents="none">
        {bars.map((amp, i) => {
          const h = Math.max(3, amp * (WAVE_HEIGHT - 8));
          const x = i * gap + (gap - barWidth) / 2;
          const lit = (i + 0.5) / WAVE_BARS <= played;
          return (
            <RoundedRect
              key={i}
              x={x}
              y={(WAVE_HEIGHT - h) / 2}
              width={barWidth}
              height={h}
              r={barWidth / 2}
              color={lit ? '#193f30' : 'rgba(25,63,48,0.28)'}
            />
          );
        })}
      </Canvas>
    </View>
  );
}

function PlayGlyph({ playing, color, size }: { playing: boolean; color: string; size: number }) {
  if (playing) {
    const bar = size * 0.22;
    return (
      <View style={{ width: size, height: size, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: size * 0.17 }}>
        <View style={{ width: bar, height: size, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: bar, height: size, borderRadius: 2, backgroundColor: color }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 0, height: 0, marginLeft: size * 0.12,
        borderTopWidth: size * 0.5, borderBottomWidth: size * 0.5, borderLeftWidth: size * 0.82,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color,
      }}
    />
  );
}

function SkipGlyph({ direction, color, size }: { direction: -1 | 1; color: string; size: number }) {
  const tri = (
    <View
      style={{
        width: 0, height: 0,
        borderTopWidth: size * 0.34, borderBottomWidth: size * 0.34,
        borderTopColor: 'transparent', borderBottomColor: 'transparent',
        borderLeftWidth: direction === 1 ? size * 0.44 : 0,
        borderRightWidth: direction === -1 ? size * 0.44 : 0,
        borderLeftColor: color, borderRightColor: color,
      }}
    />
  );
  const bar = <View style={{ width: 2.5, height: size * 0.68, borderRadius: 2, backgroundColor: color }} />;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {direction === -1 ? <>{bar}{tri}{tri}</> : <>{tri}{tri}{bar}</>}
    </View>
  );
}

export function MiniPlayer({
  state,
  onStateChange,
  track,
  playing,
  onPlayingChange,
  progress,
  onSeek,
  onNext,
  onPrevious,
  onFeedback,
  reducedMotion,
  bottomOffset = 0,
  children,
  accessibilityLabel,
}: {
  state: PlayerState;
  onStateChange?: (state: PlayerState) => void;
  track: PlayerTrack;
  playing: boolean;
  onPlayingChange?: (playing: boolean) => void;
  progress: number; // 0..1 through the track
  onSeek?: (ratio: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onFeedback?: () => void;
  reducedMotion?: boolean;
  bottomOffset?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  const expanded = state === 'expanded';
  const t = useSharedValue(expanded ? 1 : 0);
  const range = useSharedValue(480);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const drag = useRef({ active: false, start: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const settle = (target: number, velocity = 0) => {
    if (reducedMotion) t.value = target;
    else t.value = withSpring(target, { ...SPRING, velocity: velocity * 1000 });
  };

  useEffect(() => {
    if (!drag.current.active) settle(expanded ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, reducedMotion]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        drag.current = { active: true, start: t.value };
      },
      onPanResponderMove: (_, g) => {
        if (!drag.current.active) return;
        t.value = dragProgress(drag.current.start, -g.dy, range.value);
      },
      onPanResponderRelease: (_, g) => {
        if (!drag.current.active) return;
        drag.current.active = false;
        const target = resolveTarget(t.value, -g.vy / range.value);
        const next: PlayerState = target === 1 ? 'expanded' : 'collapsed';
        if (next !== stateRef.current) {
          onFeedback?.();
          onStateChange?.(next);
        } else {
          settle(target, -g.vy / range.value);
        }
      },
      onPanResponderTerminate: () => {
        drag.current.active = false;
        settle(stateRef.current === 'expanded' ? 1 : 0);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setDims({ width, height });
    range.value = Math.max(220, height * 0.55);
  };

  const artBig = artSize(dims.width, dims.height);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity(t.value) }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: contentScale(t.value) }] }));

  const surfaceStyle = useAnimatedStyle(() => {
    const heightNow = lerp(BAR_HEIGHT, dims.height || BAR_HEIGHT, t.value);
    return {
      left: lerp(BAR_MARGIN, 0, t.value),
      right: lerp(BAR_MARGIN, 0, t.value),
      top: (dims.height || 0) - lerp(bottomOffset + BAR_MARGIN, 0, t.value) - heightNow,
      height: heightNow,
      borderRadius: lerp(BAR_RADIUS, SHEET_RADIUS, t.value),
    };
  });

  const artWrapStyle = useAnimatedStyle(() => {
    const artSizeNow = lerp(ART_MINI, artSize(dims.width, dims.height), t.value);
    return {
      width: artSizeNow,
      height: artSizeNow,
      left: lerp(12, (dims.width - artSize(dims.width, dims.height)) / 2, t.value),
      top: lerp((BAR_HEIGHT - ART_MINI) / 2, ART_TOP, t.value),
      borderRadius: lerp(10, 24, t.value),
    };
  });

  const artScaleStyle = useAnimatedStyle(() => {
    const big = artSize(dims.width, dims.height);
    const scale = lerp(ART_MINI, big, t.value) / big;
    return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale }] };
  });

  const barRowStyle = useAnimatedStyle(() => ({ opacity: collapseFade(t.value) }));
  const fullStyle = useAnimatedStyle(() => ({
    opacity: expandFade(t.value),
    transform: [{ translateY: lerp(24, 0, expandFade(t.value)) }],
  }));

  const toggle = () => {
    onFeedback?.();
    onStateChange?.(expanded ? 'collapsed' : 'expanded');
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <Animated.View style={[{ flex: 1 }, contentStyle]} pointerEvents={expanded ? 'none' : 'auto'}>
        {children}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#0d1f16' }, backdropStyle]}
      />
      {dims.width > 0 && (
        <Animated.View
          {...pan.panHandlers}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `${track.title} by ${track.artist}. Mini player`}
          accessibilityState={{ expanded }}
          accessibilityActions={[{ name: 'expand' }, { name: 'collapse' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'expand' && !expanded) toggle();
            if (e.nativeEvent.actionName === 'collapse' && expanded) toggle();
          }}
          style={[
            {
              position: 'absolute',
              backgroundColor: '#fdfef9',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(25,63,48,0.14)',
              shadowColor: '#0d1f16',
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            },
            surfaceStyle,
          ]}
        >
          <Pressable onPress={toggle} accessibilityLabel={expanded ? 'Collapse player' : 'Expand player'} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', overflow: 'hidden' }, artWrapStyle]}>
            <Animated.View style={[{ width: artBig, height: artBig, transformOrigin: 'top left' }, artScaleStyle]}>
              <Artwork size={artBig} track={track} />
            </Animated.View>
          </Animated.View>
          <Animated.View pointerEvents={expanded ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: BAR_HEIGHT }, barRowStyle]}>
            <View style={{ position: 'absolute', left: 0, top: 0, height: 2, width: `${clamp01(progress) * 100}%`, backgroundColor: '#193f30' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', height: BAR_HEIGHT, paddingLeft: 12 + ART_MINI + 12, paddingRight: 10 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: '#193f30', fontSize: 14, fontWeight: '700' }}>{track.title}</Text>
                <Text numberOfLines={1} style={{ color: '#4b6053', fontSize: 12, marginTop: 1 }}>{track.artist}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Pause' : 'Play'}
                onPress={() => { onFeedback?.(); onPlayingChange?.(!playing); }}
                hitSlop={10}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <PlayGlyph playing={playing} color="#193f30" size={18} />
              </Pressable>
            </View>
          </Animated.View>
          <Animated.View pointerEvents={expanded ? 'box-none' : 'none'} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, fullStyle]}>
            <View style={{ position: 'absolute', left: 36, right: 36, top: ART_TOP + artBig + 26 }}>
              <Text numberOfLines={1} style={{ color: '#193f30', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>{track.title}</Text>
              <Text numberOfLines={1} style={{ color: '#4b6053', fontSize: 14, marginTop: 3 }}>{track.artist}</Text>
              <View style={{ marginTop: 18, alignItems: 'center' }}>
                <Waveform track={track} progress={progress} onSeek={onSeek} width={artBig} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: artBig, marginTop: 6 }}>
                  <Text style={{ color: '#4b6053', fontSize: 11 }}>{formatClock(progress * track.duration)}</Text>
                  <Text style={{ color: '#4b6053', fontSize: 11 }}>{formatClock(track.duration)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 34 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous track" onPress={() => { onFeedback?.(); onPrevious?.(); }} hitSlop={12} style={{ padding: 8 }}>
                  <SkipGlyph direction={-1} color="#193f30" size={24} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Pause' : 'Play'}
                  onPress={() => { onFeedback?.(); onPlayingChange?.(!playing); }}
                  style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#193f30', alignItems: 'center', justifyContent: 'center' }}
                >
                  <PlayGlyph playing={playing} color="#f6f8f4" size={24} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Next track" onPress={() => { onFeedback?.(); onNext?.(); }} hitSlop={12} style={{ padding: 8 }}>
                  <SkipGlyph direction={1} color="#193f30" size={24} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
