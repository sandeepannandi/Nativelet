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
  const windCmd = useSharedValue(0);       // crown wind requests (turns, fractional ok)
  const slowmo = useSharedValue(1);        // 1 normal, 0.12 slow motion (tap toggles)
  const lastBeat = useSharedValue(0);
  const latest = useRef({ reduce, onBeat });
  latest.current = { reduce, onBeat };
  useEffect(() => { reduceM.value = reduce; }, [reduce, reduceM]);

  /* One finger: horizontal drag = yaw, vertical = pitch. A drag that starts on the
     crown (3 o'clock, projected per frame) winds vertically instead; a quick tap
     elsewhere toggles slow motion. */
  const gesture = useRef({ yaw: CAM0.yaw, pitch: CAM0.pitch, mode: "orbit" as "orbit" | "wind", downAt: 0 });
  const crownScreen = useRef({ x: -1e9, y: -1e9 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          gesture.current.yaw = camSV.value.yaw;
          gesture.current.pitch = camSV.value.pitch;
          gesture.current.downAt = Date.now();
          const { locationX, locationY } = e.nativeEvent;
          gesture.current.mode =
            Math.hypot(locationX - crownScreen.current.x, locationY - crownScreen.current.y) < 42
              ? "wind"
              : "orbit";
          dragging.value = true;
        },
        onPanResponderMove: (_e, gs) => {
          if (gesture.current.mode === "wind") {
            // vertical drag on the crown winds: 46px per turn; ratchet - only positive adds power
            windCmd.value += gs.dy / 46;
            return;
          }
          camSV.value = {
            ...camSV.value,
            yaw: gesture.current.yaw + gs.dx / 140,
            pitch: Math.max(-1.1, Math.min(1.3, gesture.current.pitch + gs.dy / 180)),
          };
        },
        onPanResponderRelease: (_e, gs) => {
          // quick tap (not on the crown) toggles slow motion
          if (gesture.current.mode === "orbit" && Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6 && Date.now() - gesture.current.downAt < 300) {
            slowmo.value = slowmo.value === 1 ? 0.12 : 1;
          }
          dragging.value = false;
        },
        onPanResponderTerminate: () => { dragging.value = false; },
      }),
    [camSV, dragging, slowmo, windCmd],
  );

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    const wq = windCmd.value;
    if (wq !== 0) { windCrown(s, WATCH_DEFAULTS, wq); windCmd.value = 0; }
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepWatch(s, WATCH_DEFAULTS, dt * slowmo.value);
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
      fork: s.p, balance: s.b, hour: -a.hour, minute: -a.minute, second: -a.second, crown: s.crown,
    }, camSV.value, px, TRIS, false);
    // project the crown head into view coords for the wind hit zone
    {
      const cv = camSV.value;
      const cyw = Math.cos(cv.yaw), syw = Math.sin(cv.yaw);
      const cp = Math.cos(cv.pitch), sp = Math.sin(cv.pitch);
      const f = px / (2 * Math.tan(cv.fov / 2));
      const x2 = 53.5 * cyw, yw = 53.5 * syw, zc = yw * sp - 4 * cp + cv.dist;
      const ys = yw * cp + 4 * sp;
      crownScreen.current = {
        x: (px / 2 + (x2 * f) / zc) * (size / px),
        y: (px / 2 - (ys * f) / zc) * (size / px),
      };
    }
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
