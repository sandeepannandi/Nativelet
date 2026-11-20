import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Canvas, Group, Picture, Skia, PaintStyle, StrokeCap, TileMode, type SkPicture } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createPot, potCenters, potMove, potRelease, potScene, potTouch, stepPot, POT_BASE, POT_CX, POT_H, POT_W } from './potteryMath';

export type PotteryWheelProps = { reducedMotion?: boolean; slowMotion?: boolean; style?: ViewStyle };

export function PotteryWheel({ reducedMotion, slowMotion = false, style }: PotteryWheelProps) {
  const windowWidth = useWindowDimensions().width;
  const [available, setAvailable] = useState(windowWidth - 32);
  const scale = Math.max(0.1, Math.min(1, available / POT_W));
  const sim = useRef(createPot());
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const [systemReduce, setSystemReduce] = useState(false);
  const [slow, setSlow] = useState(false);
  const latest = useRef({ reduce: reducedMotion ?? systemReduce, slow: slowMotion || slow });
  latest.current = { reduce: reducedMotion ?? systemReduce, slow: slowMotion || slow };
  const clock = useRef(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setSystemReduce(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce);
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    let alive = true, raf = 0, last = 0;
    const draw = (now: number) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      stepPot(sim.current, dt * (latest.current.slow ? 0.22 : 1), latest.current.reduce);
      const recorder = Skia.PictureRecorder();
      const c = recorder.beginRecording({ x: 0, y: 0, width: POT_W, height: POT_H });
      for (const mark of potScene(sim.current)) {
        const path = Skia.Path.MakeFromSVGString(mark.path); if (!path) continue;
        const paint = Skia.Paint(); paint.setAntiAlias(true);
        if (mark.grad) {
          paint.setShader(Skia.Shader.MakeLinearGradient({ x: mark.grad.x0, y: 0 }, { x: mark.grad.x1, y: 0 }, mark.grad.stops.map(s => Skia.Color(s[1])), mark.grad.stops.map(s => s[0]), TileMode.Clamp));
          paint.setStyle(PaintStyle.Fill);
        } else {
          paint.setColor(Skia.Color(mark.color ?? '#000000'));
          if (mark.stroke) { paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(mark.stroke); if (mark.cap) paint.setStrokeCap(StrokeCap.Round); }
          else paint.setStyle(PaintStyle.Fill);
        }
        if (mark.alpha != null) paint.setAlphaf(mark.alpha);
        c.drawPath(path, paint);
      }
      setPicture(recorder.finishRecordingAsPicture());
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);

  const tick = () => { const now = Date.now(); const dt = clock.current ? Math.min(0.05, (now - clock.current) / 1000) : 1 / 60; clock.current = now; return dt; };
  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin(e => { clock.current = Date.now(); potTouch(sim.current, e.x / scale, e.y / scale); })
    .onUpdate(e => { potMove(sim.current, e.x / scale, e.y / scale, tick()); })
    .onFinalize(() => { potRelease(sim.current); clock.current = 0; });

  // Same shaping without a drag, for screen readers and the buttons: press the waist in or out.
  const nudge = (direction: 'in' | 'out') => {
    const s = sim.current; const { centers } = potCenters(s.r);
    const i = Math.floor(centers.length / 2); const y = POT_BASE - centers[i];
    potTouch(s, POT_CX + s.r[i], y);
    for (let k = 0; k < 45; k++) { potMove(s, POT_CX + (direction === 'in' ? s.r[i] - 30 : s.r[i] + 30), y, 1 / 60); stepPot(s, 1 / 60, latest.current.reduce); }
    potRelease(s);
  };

  return <GestureHandlerRootView onLayout={e => setAvailable(e.nativeEvent.layout.width)} style={[styles.root, style]}>
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Spinning clay. Drag across its side to shape it."
        accessibilityActions={[{ name: 'increment', label: 'Pull the waist out' }, { name: 'decrement', label: 'Press the waist in' }]}
        onAccessibilityAction={e => nudge(e.nativeEvent.actionName === 'increment' ? 'out' : 'in')}
        style={[styles.panel, { width: POT_W * scale, height: POT_H * scale }]}>
        <Canvas style={{ width: POT_W * scale, height: POT_H * scale }}><Group transform={[{ scale }]}>{picture ? <Picture picture={picture} /> : null}</Group></Canvas>
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" onPress={() => { sim.current = createPot(); }} style={styles.button}><Text style={styles.label}>New clay</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={slowMotion} accessibilityState={{ selected: slowMotion || slow, disabled: slowMotion }} onPress={() => setSlow(v => !v)} style={[styles.button, (slowMotion || slow) && styles.active]}><Text style={styles.label}>Slow motion</Text></Pressable>
    </View>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', width: '100%' },
  panel: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#ece7de' },
  controls: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  button: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#cad1c9' },
  active: { backgroundColor: '#e0e9de' },
  label: { fontSize: 12, color: '#31513b' },
});
