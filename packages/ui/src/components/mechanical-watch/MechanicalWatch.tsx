import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, PixelRatio, Linking, View, type ViewStyle } from "react-native";
import { AlphaType, Canvas, ColorType, FilterMode, MipmapMode, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
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

// Measurement mode is opt-in via an explicit launch URL; normal rendering keeps
// adaptive resolution and SS1. No production SS2 default.
const WATCH_DIAGNOSTIC_PX = 384;
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();


/* Simulation, 3D render and rasterization run on the JS thread. The only thing
   that crosses to the UI thread is the finished pixel buffer plus its size and
   a frame counter, through shared values; the UI worklet is a pure blit
   (Skia.Data -> Image -> drawImageRect). Captured mutable module state must
   never be reassigned inside a worklet: the worklets plugin snapshots captures
   as const bindings and Hermes rejects the reassignment at parse time
   ("invalid assignment left-hand side"), which used to crash this route. */
const TRIS: Tri[] = [];
let PIX = new Uint8Array(0);

export function MechanicalWatch({ size = 340, reducedMotion, onBeat, label = "Mechanical watch", style }: MechanicalWatchProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const [diagnosticConfig, setDiagnosticConfig] = useState({ enabled: false, ss: 1 });
  const WATCH_DIAGNOSTICS = diagnosticConfig.enabled;
  const WATCH_DIAGNOSTIC_SS = diagnosticConfig.ss;
  useEffect(() => {
    let alive = true;
    Linking.getInitialURL().then(url => {
      if (alive && url && /[?&]watchDiagnostic=(1|2)(&|$)/.test(url)) {
        const ss = Number(url.match(/[?&]watchDiagnostic=(1|2)(&|$)/)![1]);
        setDiagnosticConfig({ enabled: true, ss });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setSystemReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  const reduce = reducedMotion ?? systemReduce;

  const scene = useMemo(() => buildWatchScene(), []);
  const pixSV = useSharedValue<Uint8Array | null>(null);  // latest rendered frame (RGBA, px*px*4)
  const pxSV = useSharedValue(0);                          // pixel buffer edge length
  const frameSV = useSharedValue(0);                       // frame counter: derived-value dependency
  const latest = useRef({ reduce, onBeat });
  latest.current = { reduce, onBeat };

  /* One finger: horizontal drag = yaw, vertical = pitch. A drag that starts on the
     crown (3 o'clock, projected per frame) winds vertically instead; a quick tap
     elsewhere toggles slow motion. All gesture and sim state lives on the JS
     thread - one runtime, no cross-thread sync. */
  const cam = useRef<Camera>({ ...CAM0 });
  const gesture = useRef({ yaw: CAM0.yaw, pitch: CAM0.pitch, mode: "orbit" as "orbit" | "wind", downAt: 0 });
  const crownScreen = useRef({ x: -1e9, y: -1e9 });
  const dragging = useRef(false);
  const windTurns = useRef(0);        // pending crown wind requests (turns, fractional ok)
  const slowmo = useRef(1);           // 1 normal, 0.12 slow motion (tap toggles)
  const diagnosticGesture = (phase: string) => {
    if (WATCH_DIAGNOSTICS) console.log("WATCH_GESTURE", JSON.stringify({ phase,
      gestureMode: gesture.current.mode, yaw: cam.current.yaw, pitch: cam.current.pitch,
      pendingWind: windTurns.current, slowmo: slowmo.current }));
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          gesture.current.yaw = cam.current.yaw;
          gesture.current.pitch = cam.current.pitch;
          gesture.current.downAt = Date.now();
          const { locationX, locationY } = e.nativeEvent;
          gesture.current.mode =
            Math.hypot(locationX - crownScreen.current.x, locationY - crownScreen.current.y) < 42
              ? "wind"
              : "orbit";
          dragging.current = true;
          diagnosticGesture("grant");
        },
        onPanResponderMove: (_e, gs) => {
          if (gesture.current.mode === "wind") {
            // vertical drag on the crown winds: 46px per turn; ratchet - only positive adds power
            windTurns.current += gs.dy / 46;
            return;
          }
          cam.current = {
            ...cam.current,
            yaw: gesture.current.yaw + gs.dx / 140,
            pitch: Math.max(-1.1, Math.min(1.3, gesture.current.pitch + gs.dy / 180)),
          };
        },
        onPanResponderRelease: (_e, gs) => {
          // quick tap (not on the crown) toggles slow motion
          if (gesture.current.mode === "orbit" && Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6 && Date.now() - gesture.current.downAt < 300) {
            slowmo.current = slowmo.current === 1 ? 0.12 : 1;
          }
          diagnosticGesture("release");
          dragging.current = false;
        },
        onPanResponderTerminate: () => { diagnosticGesture("terminate"); dragging.current = false; },
      }),
    [WATCH_DIAGNOSTICS],
  );

  useEffect(() => {
    const s: WatchState = createWatch(WATCH_DEFAULTS);
    let raf = 0;
    let last = 0;
    let lastBeats = 0;
    let tier = 1;
    let ema = 20;
    const diagnosticSamples: { sim: number; project: number; raster: number; publish: number; frame: number }[] = [];
    let diagnosticFrames = 0;
    let lastDiagnosticAt = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(48, last ? t - last : 16.7) / 1000;
      last = t;
      const simStart = WATCH_DIAGNOSTICS ? monotonicNow() : 0;
      if (!latest.current.reduce) {
        if (windTurns.current !== 0) {
          windCrown(s, WATCH_DEFAULTS, windTurns.current);
          windTurns.current = 0;
        }
        stepWatch(s, WATCH_DEFAULTS, dt * slowmo.current);
        if (s.beats !== lastBeats) {
          lastBeats = s.beats;
          latest.current.onBeat?.();
        }
        if (!dragging.current) {
          cam.current = { ...cam.current, yaw: cam.current.yaw + dt * 0.12 };   // idle turntable
        }
      }
      const t0 = Date.now();
      const simEnd = WATCH_DIAGNOSTICS ? monotonicNow() : 0;
      const px = WATCH_DIAGNOSTICS ? WATCH_DIAGNOSTIC_PX : TIERS[tier];
      if (PIX.length < px * px * 4) PIX = new Uint8Array(px * px * 4);
      const buf = PIX.length === px * px * 4 ? PIX : PIX.subarray(0, px * px * 4);
      TRIS.length = 0;
      const a = trainAngles(s.e);
      // sort=false: the painter order is unused - depth is resolved per-pixel.
      renderWatch(scene, {
        barrel: a.barrel, center: a.center, third: a.third, fourth: a.fourth, escape: a.escape,
        fork: s.p, balance: s.b, hour: -a.hour, minute: -a.minute, second: -a.second, crown: s.crown,
      }, cam.current, px, TRIS, false);
      // project the crown head into view coords for the wind hit zone
      {
        const cv = cam.current;
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
      const projectEnd = WATCH_DIAGNOSTICS ? monotonicNow() : 0;
      rasterizeZB(TRIS, px, WATCH_DIAGNOSTICS ? WATCH_DIAGNOSTIC_SS : 1, BG, buf, px / (2 * Math.tan(cam.current.fov / 2)));
      const rasterEnd = WATCH_DIAGNOSTICS ? monotonicNow() : 0;
      // Publish the frame: a typed array crosses as a copied shareable.
      pxSV.value = px;
      pixSV.value = buf;
      frameSV.value = frameSV.value + 1;
      if (WATCH_DIAGNOSTICS) {
        const now = monotonicNow();
        diagnosticSamples.push({ sim: simEnd - simStart, project: projectEnd - simEnd,
          raster: rasterEnd - projectEnd, publish: now - rasterEnd,
          frame: lastDiagnosticAt ? now - lastDiagnosticAt : 0 });
        lastDiagnosticAt = now;
        if (diagnosticSamples.length > 600) diagnosticSamples.shift();
        if (++diagnosticFrames % 30 === 0) {
          const timing = Object.fromEntries((["sim", "project", "raster", "publish", "frame"] as const).map(key => {
            const xs = diagnosticSamples.map(x => x[key]).sort((a, b) => a - b);
            return [key, { median: xs[Math.floor(xs.length * .5)], p95: xs[Math.min(xs.length - 1, Math.floor(xs.length * .95))], max: xs[xs.length - 1] }];
          }));
          console.log("WATCH_DIAGNOSTIC", JSON.stringify({ renderedAt: Date.now(), frames: diagnosticFrames, samples: diagnosticSamples.length,
            px, ss: WATCH_DIAGNOSTIC_SS, size, pixelRatio: PixelRatio.get(), timing, yaw: cam.current.yaw, pitch: cam.current.pitch,
            crown: s.crown, wind: s.wind, slowmo: slowmo.current, dragging: dragging.current,
            gestureMode: gesture.current.mode, beats: s.beats, simulationTime: s.t,
            crownScreen: crownScreen.current }));
        }
      }
      // Adaptive quality: rolling render cost steers the resolution tier.
      const ms = Date.now() - t0;
      ema = ema * 0.85 + ms * 0.15;
      if (!WATCH_DIAGNOSTICS && ema > 26 && tier < TIERS.length - 1) { tier++; ema = 20; }
      else if (!WATCH_DIAGNOSTICS && ema < 12 && tier > 0) { tier--; ema = 20; }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, size, pixSV, pxSV, frameSV, WATCH_DIAGNOSTICS, WATCH_DIAGNOSTIC_SS]);

  const picture = useDerivedValue(() => {
    frameSV.value;   // dependency: a new pixel buffer is ready
    const px = pxSV.value;
    const buf = pixSV.value;
    const rect = { x: 0, y: 0, width: size, height: size };
    const img = buf && px > 0
      ? Skia.Image.MakeImage(
          { width: px, height: px, alphaType: AlphaType.Opaque, colorType: ColorType.RGBA_8888 },
          Skia.Data.fromBytes(buf),
          px * 4,
        )
      : null;
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
