import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Canvas, Group, Picture, Skia, PaintStyle, StrokeCap, TileMode, type SkPicture } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createSling, slMove, slRelease, slScene, slTouch, fireDefault, reload, stepSl, SL_H, SL_W } from './slingMath';

export type SlingshotProps = { reducedMotion?: boolean; slowMotion?: boolean; style?: ViewStyle };

export function Slingshot({ reducedMotion, slowMotion = false, style }: SlingshotProps) {
  const windowWidth = useWindowDimensions().width;
  const [available, setAvailable] = useState(windowWidth - 32);
  const scale = Math.max(0.1, Math.min(1, available / SL_W));
  const sim = useRef(createSlingshot());
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const [systemReduce, setSystemReduce] = useState(false);
  const [slow, setSlow] = useState(false);
  const latest = useRef({ reduce: reducedMotion ?? systemReduce, slow: slowMotion || slow });
  latest.current = { reduce: reducedMotion ?? systemReduce, slow: slowMotion || slow };

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
      stepSl(sim.current, dt * (latest.current.slow ? 0.22 : 1) * (latest.current.reduce ? 0.55 : 1), latest.current.reduce);
      const recorder = Skia.PictureRecorder();
      const c = recorder.beginRecording({ x: 0, y: 0, width: SL_W, height: SL_H });
      for (const mark of slScene(sim.current)) {
        const path = Skia.Path.MakeFromSVGString(mark.path); if (!path) continue;
        const paint = Skia.Paint(); paint.setAntiAlias(true);
        if (mark.grad) {
          paint.setShader(Skia.Shader.MakeLinearGradient({ x: mark.grad.x0, y: mark.grad.y0 }, { x: mark.grad.x1, y: mark.grad.y1 }, mark.grad.stops.map(s => Skia.Color(s[1])), mark.grad.stops.map(s => s[0]), TileMode.Clamp));
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

  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin(e => { slTouch(sim.current, e.x / scale, e.y / scale); })
    .onUpdate(e => { slMove(sim.current, e.x / scale, e.y / scale); })
    .onFinalize(() => { slRelease(sim.current); });

  return <GestureHandlerRootView onLayout={e => setAvailable(e.nativeEvent.layout.width)} style={[styles.root, style]}>
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Slingshot. Drag the pouch back to stretch the rubber band, then release to launch the ball."
        accessibilityActions={[{ name: 'increment', label: 'Fire a medium shot' }, { name: 'decrement', label: 'Reload the ball' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'increment') fireDefault(sim.current); else reload(sim.current); }}
        style={[styles.panel, { width: SL_W * scale, height: SL_H * scale }]}>
        <Canvas style={{ width: SL_W * scale, height: SL_H * scale }}><Group transform={[{ scale }]}>{picture ? <Picture picture={picture} /> : null}</Group></Canvas>
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" onPress={() => fireDefault(sim.current)} style={styles.button}><Text style={styles.label}>Fire</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => reload(sim.current)} style={styles.button}><Text style={styles.label}>Reload</Text></Pressable>
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
