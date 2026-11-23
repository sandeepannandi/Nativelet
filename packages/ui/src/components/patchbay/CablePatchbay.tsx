import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Canvas, Group, Picture, Skia, PaintStyle, StrokeCap, TileMode, type SkPicture } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createBay, moveCable, releaseCable, bayScene, grabCable, cycleConnection, stepBay, CH, CW } from './cableMath';

export type CablePatchbayProps = { reducedMotion?: boolean; slowMotion?: boolean; style?: ViewStyle };

export function CablePatchbay({ reducedMotion, slowMotion = false, style }: CablePatchbayProps) {
  const windowWidth = useWindowDimensions().width;
  const [available, setAvailable] = useState(windowWidth - 32);
  const scale = Math.max(0.1, Math.min(1, available / CW));
  const sim = useRef(createBay());
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
      stepBay(sim.current, dt * (latest.current.slow ? 0.22 : 1));
      const recorder = Skia.PictureRecorder();
      const c = recorder.beginRecording({ x: 0, y: 0, width: CW, height: CH });
      for (const mark of bayScene(sim.current, latest.current.reduce)) {
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
    .onBegin(e => { grabCable(sim.current, e.x / scale, e.y / scale); })
    .onUpdate(e => { moveCable(sim.current, e.x / scale, e.y / scale); })
    .onEnd(() => { releaseCable(sim.current); }).onFinalize(() => { releaseCable(sim.current, true); });

  return <GestureHandlerRootView onLayout={e => setAvailable(e.nativeEvent.layout.width)} style={[styles.root, style]}>
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Cable Patchbay. Drag a plug to reconnect a cable. Cables hang with gravity. Use Reroute to move the gold plug to the next free socket."
        accessibilityActions={[{ name: 'increment', label: 'Reroute gold cable' }, { name: 'decrement', label: 'Reset cables' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'increment') cycleConnection(sim.current); else sim.current=createBay(); }}
        style={[styles.panel, { width: CW * scale, height: CH * scale }]}>
        <Canvas style={{ width: CW * scale, height: CH * scale }}><Group transform={[{ scale }]}>{picture ? <Picture picture={picture} /> : null}</Group></Canvas>
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" onPress={() => cycleConnection(sim.current)} style={styles.button}><Text style={styles.label}>Reroute</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => {sim.current=createBay();}} style={styles.button}><Text style={styles.label}>Reset</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={slowMotion} accessibilityState={{ selected: slowMotion || slow, disabled: slowMotion }} onPress={() => setSlow(v => !v)} style={[styles.button, (slowMotion || slow) && styles.active]}><Text style={styles.label}>Slow motion</Text></Pressable>
    </View>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', width: '100%' },
  panel: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#ecefe6' },
  controls: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  button: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#cad1c9' },
  active: { backgroundColor: '#e0e9de' },
  label: { fontSize: 12, color: '#31513b' },
});
