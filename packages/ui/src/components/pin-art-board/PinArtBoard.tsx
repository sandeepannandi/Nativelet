import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from 'react-native';
import { Canvas, Fill, LinearGradient, Points, RoundedRect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { PA_H, PA_W, PIN_COLORS, PIN_WIDTHS, createPins, pinPoints, pressPins, stepPins, wipePins, type PinState } from './pinMath';
export type PinArtBoardProps = { erase?: boolean; resetKey?: number; slowMotion?: boolean; reducedMotion?: boolean; onFeedback?: () => void; style?: ViewStyle };
function PinPass({ sim, frame, pass }: { sim: { value: PinState }; frame: { value: number }; pass: number }) {
  const points = useDerivedValue(() => { frame.value; return pinPoints(sim.value, pass); });
  return <Points points={points} mode={pass < 2 ? 'lines' : 'points'} color={PIN_COLORS[pass]} style="stroke" strokeWidth={PIN_WIDTHS[pass]} strokeCap="round" />;
}
export function PinArtBoard({ erase = false, resetKey = 0, slowMotion = false, reducedMotion, onFeedback, style }: PinArtBoardProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue(createPins());
  const frame = useSharedValue(0);
  const pointer = useSharedValue({ x: 0, y: 0, down: false, erase: false });
  const settings = useSharedValue({ reduce, slowMotion });
  const latest = useRef({ erase, onFeedback }); latest.current = { erase, onFeedback };
  const previous = useRef(resetKey);
  // Canvas-only worklet changes can be missed by Android when its UI is idle.
  const [beat,setBeat]=useState(0);
  useEffect(()=>{let active=true,id=0;const tick=()=>{if(!active)return;setBeat(v=>v+1);id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>{active=false;cancelAnimationFrame(id);};},[]);
  useEffect(() => { let alive = true; AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setSystemReduce(v); }).catch(() => {}); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce); return () => { alive = false; sub.remove(); }; }, []);
  useEffect(() => { settings.value = { reduce, slowMotion }; }, [reduce, slowMotion, settings]);
  useEffect(() => { if (previous.current === resetKey) return; previous.current = resetKey; if (reduce) sim.value = createPins(false); else { const s = sim.value; wipePins(s); sim.value = { ...s }; } frame.value++; }, [resetKey, reduce, sim, frame]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => { pointer.value = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, down: true, erase: latest.current.erase }; latest.current.onFeedback?.(); },
    onPanResponderMove: e => { pointer.value = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, down: true, erase: latest.current.erase }; },
    onPanResponderRelease: () => { pointer.value = { ...pointer.value, down: false }; },
    onPanResponderTerminate: () => { pointer.value = { ...pointer.value, down: false }; },
    onPanResponderTerminationRequest: () => false,
  }), [pointer]);
  useFrameCallback(info => {
    const s = sim.value, p = pointer.value, opts = settings.value;
    if (p.down) pressPins(s, p.x, p.y, p.erase);
    stepPins(s, Math.min(40, info.timeSincePreviousFrame ?? 16.7) / 1000 * (opts.slowMotion ? .25 : 1), opts.reduce);
    frame.value++;
  });
  return <View {...pan.panHandlers} style={[{ width: PA_W, height: PA_H, borderRadius: 20, overflow: 'hidden', backgroundColor: '#10161b' }, style]} accessible accessibilityRole="adjustable" accessibilityLabel="Pin art board. Drag to raise a lasting impression. Use erase mode to press pins flat, or Wipe flat to clear the board." accessibilityActions={[{ name: 'increment', label: 'Make a centre impression' }, { name: 'decrement', label: 'Flatten board' }]} onAccessibilityAction={e => { const s = sim.value; if (e.nativeEvent.actionName === 'increment') pressPins(s, 170, 210); else wipePins(s); sim.value = { ...s }; frame.value++; }}>
    <View pointerEvents="none" style={{position:"absolute",width:1,height:1,opacity:0,transform:[{translateX:beat%2}]}}/>
    <Canvas pointerEvents="none" style={{ width: PA_W, height: PA_H }}>
      <Fill color="#10161b" />
      <RoundedRect x={16} y={25} width={308} height={364} r={13}><LinearGradient start={vec(16,25)} end={vec(324,389)} colors={['#b6bfc5','#3c464e','#172027','#839098']} positions={[0,.12,.84,1]} /></RoundedRect>
      <RoundedRect x={23} y={32} width={294} height={350} r={8} color="#070d12" />
      {[0,1,2,3,4,5].map(pass => <PinPass key={pass} sim={sim} frame={frame} pass={pass} />)}
      {[[22,31],[318,31],[22,383],[318,383]].map(([x,y],i) => <RoundedRect key={i} x={x-2} y={y-2} width={4} height={4} r={2} color="#c1cbd0" />)}
    </Canvas>
  </View>;
}
