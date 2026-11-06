import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, useWindowDimensions, type ViewStyle } from "react-native";
import { Canvas, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { WATCH_DEFAULTS, createWatch, stepWatch, trainAngles, windCrown, type WatchState } from "./watchMath";
import { buildWatchScene, renderWatch, type Camera, type Tri } from "./watch3d";

export type MechanicalWatchProps = {
  /** Render size in points (square). */
  size?: number;
  reducedMotion?: boolean;
  /** Beat haptics: fired on each escapement lock arrest. */
  onBeat?: () => void;
  label?: string;
  style?: ViewStyle;
};

const CAM0: Camera = { yaw: 0.35, pitch: 0.55, dist: 150, fov: 0.73, cx: 0, cy: 0 };

export function MechanicalWatch({ size = 340, reducedMotion, onBeat, label = "Mechanical watch", style }: MechanicalWatchProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setSystemReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  const reduce = reducedMotion ?? systemReduce;

  const scene = useMemo(() => buildWatchScene(), []);
  const sim = useSharedValue<WatchState>(createWatch(WATCH_DEFAULTS));
  const frame = useSharedValue(0);
  const camSV = useSharedValue<Camera>({ ...CAM0 });
  const dragging = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const windCmd = useSharedValue(0);       // crown wind requests (turns)
  const lastBeat = useSharedValue(0);
  const latest = useRef({ reduce, onBeat });
  latest.current = { reduce, onBeat };
  useEffect(() => { reduceM.value = reduce; }, [reduce, reduceM]);

  /* drag orbits the camera; vertical two-finger... keep it one finger:
     horizontal drag = yaw, vertical = pitch; quick flick on the crown edge
     winds (later: dedicated crown hit zone). */
  const gesture = useRef({ yaw: CAM0.yaw, pitch: CAM0.pitch });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current.yaw = camSV.value.yaw;
          gesture.current.pitch = camSV.value.pitch;
          dragging.value = true;
        },
        onPanResponderMove: (_e, gs) => {
          camSV.value = {
            ...camSV.value,
            yaw: gesture.current.yaw + gs.dx / 140,
            pitch: Math.max(-1.1, Math.min(1.3, gesture.current.pitch + gs.dy / 180)),
          };
        },
        onPanResponderRelease: () => { dragging.value = false; },
        onPanResponderTerminate: () => { dragging.value = false; },
      }),
    [camSV, dragging],
  );

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    while (windCmd.value > 0) { windCrown(s, WATCH_DEFAULTS, 0.5); windCmd.value -= 1; }
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepWatch(s, WATCH_DEFAULTS, dt);
    if (!dragging.value) {
      const c = camSV.value;
      camSV.value = { ...c, yaw: c.yaw + dt * 0.12 };   // idle turntable
    }
    frame.value = frame.value + 1;
  });

  const picture = useDerivedValue(() => {
    frame.value;
    const rect = { x: 0, y: 0, width: size, height: size };
    const s = sim.value;
    const a = trainAngles(s.e);
    const tris: Tri[] = [];
    renderWatch(scene, {
      barrel: a.barrel, center: a.center, third: a.third, fourth: a.fourth, escape: a.escape,
      fork: s.p, balance: s.b, hour: -a.hour, minute: -a.minute, second: -a.second,
    }, camSV.value, size, tris);
    return createPicture((canvas) => {
      const bg = Skia.Paint();
      bg.setAntiAlias(true);
      bg.setColor(Float32Array.of(0.035, 0.035, 0.045, 1));
      canvas.drawRect(rect, bg);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      const path = Skia.Path.Make();
      let cr = -1, cg = -1, cb = -1;
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        // 12-bit color bucket: flush the run when the quantized color changes
        const qr = (t.r * 15) | 0, qg = (t.g * 15) | 0, qb = (t.b * 15) | 0;
        if (qr !== cr || qg !== cg || qb !== cb) {
          if (cr >= 0) { canvas.drawPath(path, paint); path.rewind(); }
          cr = qr; cg = qg; cb = qb;
          paint.setColor(Float32Array.of((qr + 0.5) / 15, (qg + 0.5) / 15, (qb + 0.5) / 15, 1));
        }
        path.moveTo(t.x0, t.y0);
        path.lineTo(t.x1, t.y1);
        path.lineTo(t.x2, t.y2);
        path.close();
      }
      if (cr >= 0) canvas.drawPath(path, paint);
    }, rect);
  }, [size]);

  return (
    <View style={[{ width: size, height: size }, style]} {...pan.panHandlers} accessibilityLabel={label}>
      <Canvas pointerEvents="none" style={{ width: size, height: size }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

export default MechanicalWatch;
