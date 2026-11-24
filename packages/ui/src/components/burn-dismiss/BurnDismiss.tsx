import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  PanResponder,
  View,
  type ViewStyle,
} from "react-native";
import {
  AlphaType,
  BlendMode,
  BlurStyle,
  Canvas,
  ColorType,
  FilterMode,
  Group,
  MipmapMode,
  Picture,
  Rect,
  Skia,
  TileMode,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkRuntimeEffect,
  type SkShader,
} from "@shopify/react-native-skia";
import {
  ASH_STRIDE,
  BURN_DEFAULTS,
  EMBER_STRIDE,
  SMOKE_STRIDE,
  burnPointerDown,
  burnPointerUp,
  createBurn,
  packBurn,
  startRestore,
  stepBurn,
  type BurnConfig,
  type BurnState,
} from "./burnMath";
import { CARD_H, CARD_W } from "./burnDesign";

export type BurnDismissProps = {
  /** The card to burn, drawn once with Skia (see Example). */
  image: SkImage;
  /** Card size in layout points. */
  width?: number;
  height?: number;
  /** Burn field resolution. */
  cols?: number;
  rows?: number;
  /** Runs the fire about five times slower. Ignored while Reduce Motion is on. */
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Increment to restore the card (the burn front rewinds). */
  restoreTick?: number;
  /** Fired with 'ignite', 'release' and 'restore' (hook haptics here). */
  onFeedback?: (event: "ignite" | "release" | "restore") => void;
  /** Called once the card has burned away completely. */
  onDismissed?: () => void;
  label?: string;
  style?: ViewStyle;
};

const SKSL = `
uniform shader sceneSharp;
uniform shader burnTex;
uniform float2 dstSize;
uniform float2 texSize;
uniform float2 sceneSize;
uniform float time;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float2 uv = xy / dstSize;
  float2 tuv = uv * texSize;
  float4 bt = burnTex.eval(tuv);
  float burn = bt.r;
  float gflick = bt.g;
  float crack = bt.b;

  // Noise-warped front: the edge eats in bites, not a circle.
  float warp = fbm(uv * float2(7.0, 9.0) + float2(0.0, time * 0.05));
  float warp2 = fbm(uv * float2(23.0, 29.0) - float2(time * 0.03, 0.0));
  float warpAmp = 0.22 * smoothstep(-0.06, 0.3, burn) * (1.0 - smoothstep(0.7, 0.92, burn));
  float bw = burn + (warp - 0.5) * warpAmp + (warp2 - 0.5) * warpAmp * 0.35;

  half3 scene = sceneSharp.eval(uv * sceneSize).rgb;

  // Paper fibre on the unburnt card.
  float fibre = fbm(uv * float2(46.0, 7.0));
  scene *= 0.965 + 0.07 * fibre;

  if (bw > 0.001) {
    // Heat glow: air shimmers warm just ahead of the flame band.
    float heatTint = smoothstep(0.001, 0.012, bw) * (1.0 - smoothstep(0.012, 0.045, bw));
    scene = mix(scene, half3(0.66, 0.30, 0.09), heatTint * (0.22 + 0.35 * gflick));

    // Scorch: paper browns ahead of the char.
    float scorch = smoothstep(0.001, 0.10, bw) * (1.0 - smoothstep(0.10, 0.30, bw));
    scene = mix(scene, half3(0.42, 0.24, 0.10), scorch * 0.7);

    // Glow band: white -> yellow -> orange -> red across the burning edge.
    float gb = smoothstep(0.02, 0.06, bw) * (1.0 - smoothstep(0.16, 0.34, bw));
    half3 glowCol = half3(1.0, 0.97, 0.86);
    glowCol = mix(glowCol, half3(1.0, 0.82, 0.24), smoothstep(0.02, 0.10, bw));
    glowCol = mix(glowCol, half3(1.0, 0.45, 0.10), smoothstep(0.10, 0.20, bw));
    glowCol = mix(glowCol, half3(0.78, 0.12, 0.02), smoothstep(0.20, 0.34, bw));
    float glow = gb * (0.35 + 0.65 * gflick);
    scene = mix(scene, glowCol * 1.35, clamp(glow * 1.25, 0.0, 1.0));

    // Char: blackened fibre with hot cracks.
    float ch = smoothstep(0.30, 0.48, bw);
    float streak = fbm(float2(uv.x * 60.0, uv.y * 9.0));
    half3 charCol = mix(half3(0.16, 0.10, 0.06), half3(0.05, 0.03, 0.02), smoothstep(0.48, 0.9, bw));
    charCol *= 0.85 + 0.3 * streak;
    charCol += half3(0.9, 0.25, 0.05) * crack * 0.8;
    scene = mix(scene, charCol, ch);

    // Curl: the charred rim lifts - lit crest, then shadow at the eaten edge.
    float2 e = 1.0 / texSize;
    float bx = burnTex.eval(tuv + float2(e.x, 0.0)).r - burnTex.eval(tuv - float2(e.x, 0.0)).r;
    float by = burnTex.eval(tuv + float2(0.0, e.y)).r - burnTex.eval(tuv - float2(0.0, e.y)).r;
    float crest = smoothstep(0.80, 0.90, bw) * (1.0 - smoothstep(0.90, 0.965, bw));
    float litEdge = clamp((bx * -0.55 + by * -0.83) * 8.0, -1.0, 1.0);
    scene += half3(0.5, 0.34, 0.18) * crest * max(litEdge, 0.0);
    scene *= 1.0 - 0.6 * crest * max(-litEdge, 0.0);

    // Lifted curl: the peeling paper catches a warm highlight on its crest.
    float lift = smoothstep(0.55, 0.68, bw) * (1.0 - smoothstep(0.68, 0.85, bw));
    scene += half3(0.85, 0.62, 0.38) * lift * max(litEdge, 0.0) * 0.5;

    // Ash-grey dusting at the consumed rim.
    float rim = smoothstep(0.92, 0.97, bw);
    scene = mix(scene, half3(0.32, 0.30, 0.28), rim * 0.45 * (1.0 - smoothstep(0.97, 0.99, bw)));
  }

  // Hole: the paper is gone.
  float alpha = 1.0 - smoothstep(0.965, 0.995, bw);
  return half4(scene, alpha);
}
`;

// Compiled once per app lifetime; null means SkSL unsupported -> static card.
let cachedEffect: SkRuntimeEffect | null | undefined;
function getEffect(): SkRuntimeEffect | null {
  if (cachedEffect === undefined) cachedEffect = Skia.RuntimeEffect.Make(SKSL);
  return cachedEffect;
}

type Frame = { paint: SkPaint; picture: SkPicture };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function emberColor(t: number): [number, number, number] {
  if (t < 0.35) return [lerp(1, 1, t / 0.35), lerp(0.95, 0.6, t / 0.35), lerp(0.75, 0.18, t / 0.35)];
  if (t < 0.75) {
    const u = (t - 0.35) / 0.4;
    return [1, lerp(0.6, 0.18, u), lerp(0.18, 0.03, u)];
  }
  const u = (t - 0.75) / 0.25;
  return [lerp(1, 0.4, u), lerp(0.18, 0.06, u), lerp(0.03, 0.02, u)];
}

/** Draw the ember and ash layers into one picture for this frame. */
function recordParticles(sim: BurnState, width: number, height: number): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setBlendMode(BlendMode.Plus);
  const core = Skia.Paint();
  core.setAntiAlias(true);
  core.setBlendMode(BlendMode.Plus);
  const ash = Skia.Paint();
  ash.setAntiAlias(true);
  const smoke = Skia.Paint();
  smoke.setAntiAlias(true);
  const smokeBlur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true);
  smoke.setMaskFilter(smokeBlur);
  for (let s = 0; s < sim.smokeCount; s++) {
    const i = s * SMOKE_STRIDE;
    const t = sim.smoke[i + 4] / sim.smoke[i + 5];
    const fadeIn = Math.min(1, t / 0.15);
    const fade = t > 0.45 ? (1 - t) / 0.55 : 1;
    const rad = sim.smoke[i + 6] * (0.7 + t * 2.6);
    smoke.setColor(Skia.Color(`rgba(148,138,126,${(0.07 * fadeIn * fade).toFixed(3)})`));
    canvas.drawCircle(sim.smoke[i], sim.smoke[i + 1], rad, smoke);
  }
  for (let s = 0; s < sim.emberCount; s++) {
    const i = s * EMBER_STRIDE;
    const t = sim.embers[i + 4] / sim.embers[i + 5];
    const flick = 0.72 + 0.28 * Math.sin(sim.clock * 21 + sim.embers[i + 7]);
    const fade = t > 0.8 ? (1 - t) / 0.2 : 1;
    const [r, g, b] = emberColor(t);
    const x = sim.embers[i];
    const y = sim.embers[i + 1];
    const rad = sim.embers[i + 6] * (1 - t * 0.55);
    glow.setColor(Skia.Color(`rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${(0.34 * flick * fade).toFixed(3)})`));
    canvas.drawCircle(x, y, rad * 3.1, glow);
    core.setColor(Skia.Color(`rgba(255,${Math.round(lerp(240, 120, t))},${Math.round(lerp(190, 40, t))},${(0.95 * fade).toFixed(3)})`));
    canvas.drawCircle(x, y, Math.max(0.4, rad), core);
  }
  for (let s = 0; s < sim.ashCount; s++) {
    const i = s * ASH_STRIDE;
    const t = sim.ash[i + 4] / sim.ash[i + 5];
    const fade = t > 0.72 ? (1 - t) / 0.28 : 1;
    ash.setColor(Skia.Color(`rgba(74,60,46,${(0.7 * fade).toFixed(3)})`));
    canvas.save();
    canvas.translate(sim.ash[i], sim.ash[i + 1]);
    canvas.rotate((sim.ash[i + 7] * 180) / 3.1416, 0, 0);
    const w = sim.ash[i + 6];
    canvas.drawRect(Skia.XYWHRect(-w, -w * 0.6, w * 2, w * 1.2), ash);
    canvas.restore();
  }
  const picture = recorder.finishRecordingAsPicture();
  glow.dispose();
  core.dispose();
  ash.dispose();
  smoke.dispose();
  smokeBlur.dispose();
  return picture;
}

export function BurnDismiss({
  image,
  width = CARD_W,
  height = CARD_H,
  cols = 96,
  rows = 128,
  slowMotion = false,
  reducedMotion,
  restoreTick = 0,
  onFeedback,
  onDismissed,
  label = "A postcard you can burn away. Touch and hold to ignite the paper at your finger, drag to spread the fire, and restore to bring it back",
  style,
}: BurnDismissProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;

  const cfg: BurnConfig = useMemo(() => ({ cols, rows, width, height }), [cols, rows, width, height]);
  const opts = useMemo(() => BURN_DEFAULTS, []);
  const simRef = useRef<BurnState | null>(null);
  if (!simRef.current) simRef.current = createBurn(cfg, opts);
  const bytesRef = useRef<Uint8Array | null>(null);
  if (!bytesRef.current) bytesRef.current = new Uint8Array(cols * rows * 4);

  const effect = getEffect();
  const sceneShader = useMemo(() => {
    if (!effect) return null;
    return image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
  }, [effect, image]);
  useEffect(() => () => sceneShader?.dispose(), [sceneShader]);

  const [frame, setFrame] = useState<Frame | null>(null);
  const latest = useRef({ slowMotion, reduce, onFeedback, onDismissed });
  latest.current = { slowMotion, reduce, onFeedback, onDismissed };
  const restoreSeen = useRef(restoreTick);

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

  // A size or grid change rebuilds the card unburnt.
  useEffect(() => {
    simRef.current = createBurn(cfg, opts);
    bytesRef.current = new Uint8Array(cfg.cols * cfg.rows * 4);
  }, [cfg, opts]);

  // External restore requests.
  useEffect(() => {
    if (restoreTick !== restoreSeen.current) {
      restoreSeen.current = restoreTick;
      const sim = simRef.current;
      if (sim && sim.mode === 1) {
        startRestore(sim);
        latest.current.onFeedback?.("restore");
      }
    }
  }, [restoreTick]);

  // JS-thread frame loop: steps the sim, packs the burn texture and publishes
  // a fresh runtime-shader paint plus the particle layer. The per-frame
  // Fabric commits keep the render pipeline awake on a quiet Android screen,
  // the same mechanism as Fogged Glass, so no separate keep-alive is needed.
  useEffect(() => {
    if (!effect || !sceneShader) return;
    let alive = true;
    let last = 0;
    let dismissed = false;
    let prevImage: SkImage | null = null;
    let prevBurnShader: SkShader | null = null;
    let prev: Frame | null = null;
    const loop = (now: number) => {
      if (!alive) return;
      const sim = simRef.current!;
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (!latest.current.reduce) {
        stepBurn(sim, cfg, dt * (latest.current.slowMotion ? 0.22 : 1), opts);
      }
      if (!dismissed && sim.burnt >= cfg.cols * cfg.rows) {
        dismissed = true;
        latest.current.onDismissed?.();
      }
      const bytes = packBurn(sim, cfg, bytesRef.current!);
      const burnImage = Skia.Image.MakeImage(
        { width: cfg.cols, height: cfg.rows, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
        Skia.Data.fromBytes(bytes),
        cfg.cols * 4,
      );
      if (burnImage) {
        const burnShader = burnImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
        const next = Skia.Paint();
        next.setShader(
          effect.makeShaderWithChildren(
            [0, 0, cfg.width, cfg.height, cfg.cols, cfg.rows, image.width(), image.height(), sim.clock],
            [sceneShader, burnShader],
          ),
        );
        const picture = recordParticles(sim, cfg.width, cfg.height);
        setFrame({ paint: next, picture });
        prev?.paint.dispose();
        prev?.picture.dispose();
        prevBurnShader?.dispose();
        prevImage?.dispose();
        prev = { paint: next, picture };
        prevBurnShader = burnShader;
        prevImage = burnImage;
      }
      requestAnimationFrame(loop);
    };
    const raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      prev?.paint.dispose();
      prev?.picture.dispose();
      prevBurnShader?.dispose();
      prevImage?.dispose();
    };
  }, [effect, sceneShader, cfg, opts, image]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.reduce,
        onPanResponderGrant: (evt) => {
          const sim = simRef.current;
          if (sim) burnPointerDown(sim, cfg, evt.nativeEvent.locationX, evt.nativeEvent.locationY, opts);
          latest.current.onFeedback?.("ignite");
        },
        onPanResponderMove: (evt) => {
          const sim = simRef.current;
          if (sim) burnPointerDown(sim, cfg, evt.nativeEvent.locationX, evt.nativeEvent.locationY, opts);
        },
        onPanResponderRelease: () => {
          const sim = simRef.current;
          if (sim) burnPointerUp(sim);
          latest.current.onFeedback?.("release");
        },
        onPanResponderTerminate: () => {
          const sim = simRef.current;
          if (sim) burnPointerUp(sim);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [cfg, opts],
  );

  return (
    <View
      style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#241d16" }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      <Canvas pointerEvents="none" style={{ width, height }}>
        <Group>
          {frame ? (
            <>
              <Rect x={0} y={0} width={width} height={height} paint={frame.paint} />
              <Picture picture={frame.picture} />
            </>
          ) : (
            <Rect x={0} y={0} width={width} height={height} color="#f4eddc" />
          )}
        </Group>
      </Canvas>
    </View>
  );
}
