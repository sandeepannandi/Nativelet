import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import {
  Canvas,
  Fill,
  FilterMode,
  ImageShader,
  LinearGradient,
  MipmapMode,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Vertices,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { runOnJS, runOnUI, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { traceShatterSection } from "./shatterTrace";
import { createWorld, fillMesh, allShardsGone, type World } from "./shatterMath";

import { NATIVE_SHATTER, prepareNativeShatter, attachNative, disposeNative, advanceNative } from "./shatterNative";

import { ShatterUnavailable } from "./ShatterUnavailable";

export type GlassShatterProps = {
  /** The picture behind the glass, drawn at `imageScale` pixels per point. */
  image: SkImage;
  /** Development-only aggregated UI-thread timing; off for library users. */
  diagnostics?: boolean;
  imageScale?: number;
  width?: number;
  height?: number;
  /** About how many shards the pane breaks into. */
  shardCount?: number;
  /** Runs the fall about four times slower. Ignored while Reduce Motion is on. */
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Change this number to put a fresh, whole pane back (same as the Reset button). */
  resetToken?: number;
  /** Fired with "hit" when the pane is struck (hook haptics here). */
  onFeedback?: (event: "hit") => void;
  label?: string;
  style?: ViewStyle;
};

// Mutable physics graphs stay inside the UI runtime. Putting ~359 bodies and
// thousands of contact fields in a SharedValue makes each hot-loop access cross
// the shareable-value boundary. Only the small input/version scalars are shared.
// Local diagnostic A/B only. Baseline is unchanged unless both diagnostics and
// the exact opt-in mode are selected. CanvasKeepAlive is deliberately unchanged.
const TRACE_PHASES = process.env.EXPO_PUBLIC_SHATTER_TRACE === "1";
const QUIESCE_PHYSICS_MESH = process.env.EXPO_PUBLIC_SHATTER_TAIL === "physics-mesh";
const SAMPLE_UI = process.env.EXPO_PUBLIC_SHATTER_PROFILE === "1";
let nextWorldKey = 0;
function uiWorlds(): Record<number, World | null> {
  "worklet";
  const g = globalThis as typeof globalThis & { __nativeletShatterWorlds?: Record<number, World | null> };
  if (!g.__nativeletShatterWorlds) g.__nativeletShatterWorlds = {};
  return g.__nativeletShatterWorlds;
}

type Ev = { id: number; k: number; x: number; y: number };
type Mesh = { xy: { x: number; y: number }[]; tex: { x: number; y: number }[]; tint: { x: number; y: number }[]; path: ReturnType<typeof Skia.Path.Make> };

// Android stops presenting a canvas whose only change is internal on an idle
// screen. A 1 px layout change every frame keeps it drawing.
function CanvasKeepAlive() {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setBeat((b) => b + 1);
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, transform: [{ translateX: beat % 2 }] }}
    />
  );
}

// One-pixel strip: pixel x is white with alpha x/255 * 0.5. Each vertex maps its
// glint into the strip as a texture coordinate, so the GPU interpolates the
// tint across the shard. (Per-vertex colors do not combine with an image
// shader and render black on Android; this is the Cloth Banner pattern.)
function makeTintRamp() {
  const surface = Skia.Surface.MakeOffscreen(256, 1);
  if (!surface) throw new Error("Unable to prepare the tint ramp");
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.clear(Skia.Color("transparent"));
  for (let i = 0; i < 256; i++) {
    paint.setColor(Skia.Color(`rgba(255,255,255,${((i / 255) * 0.5).toFixed(4)})`));
    canvas.drawRect(Skia.XYWHRect(i, 0, 1, 1), paint);
  }
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const copy = snapshot.makeNonTextureImage();
  snapshot.dispose();
  surface.dispose();
  paint.dispose();
  if (!copy) throw new Error("Unable to copy the tint ramp");
  return copy;
}

export function GlassShatter({
  diagnostics = false,
  image,
  imageScale = 2,
  width = 340,
  height = 460,
  shardCount = 360,
  slowMotion = false,
  reducedMotion,
  resetToken = 0,
  onFeedback,
  label = "A pane of glass over a harbor at sunrise. Tap or flick it to shatter it; the shards fall away.",
  style,
}: GlassShatterProps) {
  const [nativeStatus, setNativeStatus] = useState(NATIVE_SHATTER ? "Preparing native Glass Shatter..." : "");
  useEffect(() => { let mounted=true;prepareNativeShatter().then(()=>{if(mounted)setNativeStatus("");},err=>{if(mounted)setNativeStatus(String(err.message ?? err));});return()=>{mounted=false;}; }, []);
  const reportNativeError = (message: string) => setNativeStatus(message);
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const worldKey = useMemo(() => ++nextWorldKey, []);
  useEffect(() => () => { runOnUI((key: number) => { "worklet"; disposeNative(uiWorlds()[key]); delete uiWorlds()[key]; })(worldKey); }, [worldKey]);
  const perf = useSharedValue({ count: 0, physics: 0, physicsMax: 0, mesh: 0, path: 0, copies: 0, interval: 0, intervalMax: 0, indices: 0, reported: false });
  const brokenId = useSharedValue(0);
  const frame = useSharedValue(0);
  const terminal = useSharedValue(false);
  const terminalObserved = useSharedValue(false);
  const finalMeshObserved = useSharedValue(false);
  const inputs = useSharedValue<Ev[]>([]);
  const seen = useSharedValue(0);
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const latest = useRef({ onFeedback });
  latest.current.onFeedback = onFeedback;
  const ring = useRef<Ev[]>([]);
  const counter = useRef(0);
  const brokenJS = useRef(false);
  const ramp = useMemo(() => makeTintRamp(), []);
  useEffect(() => () => ramp.dispose(), [ramp]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setSystemReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    slowM.value = slowMotion;
  }, [slowMotion, slowM]);
  useEffect(() => {
    reduceM.value = reduce;
  }, [reduce, reduceM]);

  const push = (k: number, x: number, y: number) => {
    counter.current += 1;
    const next = ring.current.concat({ id: counter.current, k, x, y }).slice(-12);
    ring.current = next;
    inputs.value = next;
  };
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    brokenJS.current = false;
    push(1, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const pan = useMemo(() => {
    const hit = (x: number, y: number) => {
      if (brokenJS.current || nativeStatus) return;
      brokenJS.current = true;
      push(0, Math.max(2, Math.min(width - 2, x)), Math.max(2, Math.min(height - 2, y)));
      latest.current.onFeedback?.("hit");
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => hit(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, nativeStatus]);

  const stopped = useSharedValue(false);
  const sampling = useSharedValue(0); // 0 not started, 1 active, 2 complete
  useFrameCallback((info) => {
    if (stopped.value) return;
    try {
    const evs = inputs.value;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.id <= seen.value) continue;
      seen.value = e.id;
      if (e.k === 0) {
        if (SAMPLE_UI && diagnostics && sampling.value === 0) {
          try { (globalThis as typeof globalThis & { _startProfiling: (hz: number) => void })._startProfiling(100); sampling.value = 1; console.log("SHATTER_PROFILE started hz=100"); }
          catch (err) { sampling.value = 2; console.log(`SHATTER_PROFILE error-start ${String(err)}`); }
        }
        terminalObserved.value = false;
        finalMeshObserved.value = false;
        terminal.value = false;
        perf.value = { count: 0, physics: 0, physicsMax: 0, mesh: 0, path: 0, copies: 0, interval: 0, intervalMax: 0, indices: 0, reported: false };
        disposeNative(uiWorlds()[worldKey]);
        uiWorlds()[worldKey] = traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/createWorld", () => {
          "worklet";
          if (NATIVE_SHATTER && (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096 || !Number.isInteger(shardCount) || shardCount < 3 || shardCount > 600)) throw new Error("Glass Shatter dimensions or shard count exceed native capacity.");
          const world = createWorld({ width, height, hitX: e.x, hitY: e.y, seed: (e.id * 7919) % 100000, target: shardCount });
          attachNative(world);
          return world;
        });
        brokenId.value = brokenId.value + 1;
      } else if (e.k === 1) {
        terminalObserved.value = false;
        finalMeshObserved.value = false;
        terminal.value = false;
        traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/reset", () => {
          "worklet";
          disposeNative(uiWorlds()[worldKey]);
          uiWorlds()[worldKey] = null;
        });
        brokenId.value = brokenId.value + 1;
      }
    }
    const w = uiWorlds()[worldKey];
    if (!w) return;
    // Keep the callback subscribed: it must still consume Reset and a new hit.
    // Do not use p.reported/count90: reporting can happen before all shards leave.
    if (diagnostics && QUIESCE_PHYSICS_MESH && terminal.value) return;
    let reachedTerminal = false;
    if (!reduceM.value) {
      const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
      const start = diagnostics ? performance.now() : 0;
      traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/stepWorld", () => {
        "worklet";
        advanceNative(w, dt * (slowM.value ? 0.25 : 1));
      });
      if (diagnostics) {
        const p = perf.value; const ms = performance.now() - start;
        p.physics += ms; p.physicsMax = Math.max(p.physicsMax, ms); p.count++;
        p.interval += info.timeSincePreviousFrame ?? 0; p.intervalMax = Math.max(p.intervalMax, info.timeSincePreviousFrame ?? 0);
        if (!p.reported && (p.count >= 90 || w.bodies.every((b) => b.gone))) {
          console.log(`SHATTER_UI frames=${p.count} physics_avg=${(p.physics / p.count).toFixed(2)} physics_max=${p.physicsMax.toFixed(2)} mesh_avg=${(p.mesh / p.count).toFixed(2)} path_avg=${(p.path / p.count).toFixed(2)} copies_avg=${(p.copies / p.count).toFixed(2)} interval_avg=${(p.interval / p.count).toFixed(2)} interval_max=${p.intervalMax.toFixed(2)} indices_builds=${p.indices}`);
          p.reported = true;
          if (SAMPLE_UI && sampling.value === 1) {
            try { const path = (globalThis as typeof globalThis & { _stopProfiling: () => string })._stopProfiling(); console.log(`SHATTER_PROFILE saved=${path}`); }
            catch (err) { console.log(`SHATTER_PROFILE error-stop ${String(err)}`); }
            sampling.value = 2;
          }
        }
      }
    }
    if (diagnostics && (QUIESCE_PHYSICS_MESH || TRACE_PHASES) && !reduceM.value) reachedTerminal = allShardsGone(w);
    if (diagnostics && TRACE_PHASES && reachedTerminal && !terminalObserved.value) {
      traceShatterSection(true, "SHATTER/allGone", () => { "worklet"; });
      terminalObserved.value = true;
    }
    // Always invalidate the all-gone frame once so fillMesh parks the last
    // vertices and the paths clear. Only subsequent callbacks are skipped.
    frame.value = frame.value + 1;
    if (QUIESCE_PHYSICS_MESH && reachedTerminal) terminal.value = true;
    } catch (error) {
      stopped.value = true;
      const world = uiWorlds()[worldKey];
      try { disposeNative(world); } catch { /* World may already have been invalidated. */ }
      uiWorlds()[worldKey] = null;
      seen.value = inputs.value.length ? inputs.value[inputs.value.length - 1].id : seen.value;
      brokenId.value = brokenId.value + 1;
      runOnJS(reportNativeError)(`Glass Shatter stopped: ${String(error)}`);
    }
  });

  // Triangle fans, one per shard, rebuilt only when the pane breaks or resets.
  const indices = useDerivedValue(() => {
    brokenId.value;
    const w = uiWorlds()[worldKey];
    const out: number[] = [];
    if (stopped.value || !w) return out;
    if (diagnostics) perf.value.indices++;
    let base = 0;
    for (let i = 0; i < w.bodies.length; i++) {
      const n = w.bodies[i].local.length;
      for (let t = 1; t < n - 1; t++) out.push(base, base + t, base + t + 1);
      base += n;
    }
    return out;
  });

  const mesh = useDerivedValue<Mesh>(() => {
    frame.value;
    brokenId.value;
    const w = uiWorlds()[worldKey];
    const path = Skia.Path.Make();
    if (stopped.value || !w) return { xy: [], tex: [], tint: [], path };
    const meshStart = diagnostics ? performance.now() : 0;
    traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/fillMesh", () => {
      "worklet";
      fillMesh(w, imageScale);
    });
    const filled = diagnostics ? performance.now() : 0;
    const xy = w.mxy as { x: number; y: number }[];
    const start = w.mstart as number[];
    traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/path", () => {
      "worklet";
      for (let i = 0; i < w.bodies.length; i++) {
        const b = w.bodies[i];
        if (b.gone) continue;
        const n = b.local.length;
        const s0 = start[i];
        path.moveTo(xy[s0].x, xy[s0].y);
        for (let k = 1; k < n; k++) path.lineTo(xy[s0 + k].x, xy[s0 + k].y);
        path.close();
      }
    });
    const pathed = diagnostics ? performance.now() : 0;
    // Copies of the reused buffers, so Skia sees a changed value every frame.
    const result = traceShatterSection(diagnostics && TRACE_PHASES, "SHATTER/copies", () => {
      "worklet";
      return { xy: xy.slice(), tex: (w.mtex as { x: number; y: number }[]).slice(), tint: (w.mtint as { x: number; y: number }[]).slice(), path };
    });
    // This marks completed CPU mesh preparation, NOT GPU presentation.
    if (diagnostics && TRACE_PHASES && !finalMeshObserved.value && allShardsGone(w)) {
      traceShatterSection(true, "SHATTER/finalMeshParked", () => { "worklet"; });
      finalMeshObserved.value = true;
    }
    if (diagnostics) { const p = perf.value; p.mesh += filled - meshStart; p.path += pathed - filled; p.copies += performance.now() - pathed; }
    return result;
  });
  const vertices = useDerivedValue(() => mesh.value.xy);
  const textures = useDerivedValue(() => mesh.value.tex);
  const tintTex = useDerivedValue(() => mesh.value.tint);
  const edges = useDerivedValue(() => mesh.value.path);
  const sheenOpacity = useDerivedValue(() => (brokenId.value >= 0 && uiWorlds()[worldKey] ? 0 : 1));

  if (nativeStatus) return <ShatterUnavailable message={nativeStatus} width={width} height={height} style={style} />;
  return (
    <View
      style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#0b1426" }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width, height }}>
        {/* The picture itself, always there behind the glass. */}
        <Rect x={0} y={0} width={width} height={height}>
          <ImageShader
            image={image}
            tx="clamp"
            ty="clamp"
            fit="fill"
            rect={{ x: 0, y: 0, width, height }}
            sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
          />
        </Rect>
        {/* Whole pane: a faint sheen and a bright rim. */}
        <RoundedRect x={0.5} y={0.5} width={width - 1} height={height - 1} r={18} opacity={sheenOpacity} color="transparent">
          <LinearGradient start={vec(0, 0)} end={vec(width * 0.8, height)} colors={["#ffffff26", "#ffffff08", "#ffffff1c"]} />
        </RoundedRect>
        <RoundedRect x={1} y={1} width={width - 2} height={height - 2} r={18} opacity={sheenOpacity} style="stroke" strokeWidth={1.2} color="#ffffff55" />
        {/* Broken pane: every shard shows the picture shifted by its tilt, with a tint that carries the glints. */}
        <Vertices vertices={vertices} textures={textures} indices={indices} mode="triangles">
          <ImageShader
            image={image}
            tx="clamp"
            ty="clamp"
            sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
          />
        </Vertices>
        <Vertices vertices={vertices} textures={tintTex} indices={indices} mode="triangles">
          <ImageShader image={ramp} tx="clamp" ty="clamp" sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }} />
        </Vertices>
        <Path path={edges} style="stroke" strokeWidth={0.9} strokeJoin="round" color="#ffffffcc" />
        <Path path={edges} style="stroke" strokeWidth={0.4} strokeJoin="round" color="#1b2a4a99" />
      </Canvas>
    </View>
  );
}
