import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import { AlphaType, Canvas, ColorType, FilterMode, MipmapMode, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { WATCH_DEFAULTS, createWatch, stepWatch, trainAngles, windCrown, type WatchState } from "./watchMath";
import { buildWatchScene, renderWatch, rasterizeZB, type Camera, type Tri } from "./watch3d";

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
const BG: [number, number, number] = [9, 9, 14];   // #09090e, matches the old flat fill

/* Software render cost varies widely by device, so the bitmap resolution is
   adaptive: start mid-tier and walk down when the rolling render time exceeds
   a frame budget, back up when there is headroom. The final image is upscaled
   with linear sampling, so a lower tier costs sharpness, not correctness. */
const TIERS = [448, 384, 320, 256];
const TRIS: Tri[] = [];
let PIX = new Uint8ClampedArray(0);
let qTier = 1;
let qEma = 20;

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
    const t0 = Date.now();
    const rect = { x: 0, y: 0, width: size, height: size };
    const s = sim.value;
    const a = trainAngles(s.e);
    const px = TIERS[qTier];
    if (PIX.length < px * px * 4) PIX = new Uint8ClampedArray(px * px * 4);
    const buf = PIX.length === px * px * 4 ? PIX : PIX.subarray(0, px * px * 4);
    TRIS.length = 0;
    // sort=false: the painter order is unused - depth is resolved per-pixel.
    renderWatch(scene, {
      barrel: a.barrel, center: a.center, third: a.third, fourth: a.fourth, escape: a.escape,
      fork: s.p, balance: s.b, hour: -a.hour, minute: -a.minute, second: -a.second,
    }, camSV.value, px, TRIS, false);
    rasterizeZB(TRIS, px, 1, BG, buf);
    const data = Skia.Data.fromBytes(buf);
    const img = Skia.Image.MakeImage(
      { width: px, height: px, alphaType: AlphaType.Opaque, colorType: ColorType.RGBA_8888 },
      data,
      px * 4,
    );
    // Adaptive quality: rolling render cost steers the resolution tier.
    const ms = Date.now() - t0;
    qEma = qEma * 0.85 + ms * 0.15;
    if (qEma > 26 && qTier < TIERS.length - 1) { qTier++; qEma = 20; }
    else if (qEma < 12 && qTier > 0) { qTier--; qEma = 20; }
    return createPicture((canvas) => {
      if (img) {
        canvas.drawImageRectOptions(
          img,
          { x: 0, y: 0, width: px, height: px },
          rect,
          FilterMode.Linear,
          MipmapMode.None,
        );
      } else {
        const bg = Skia.Paint();
        bg.setColor(Float32Array.of(0.035, 0.035, 0.045, 1));
        canvas.drawRect(rect, bg);
      }
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
