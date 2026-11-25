import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import {
  BlurStyle,
  Canvas,
  Group,
  Picture,
  PointMode,
  Skia,
  StrokeCap,
  TileMode,
  vec,
  type SkCanvas,
  type SkPicture,
} from "@shopify/react-native-skia";
import { STEP_COUNT } from "./foldMath";
import { FOLD_H, FOLD_W, buildFrame, staticScene, type Item } from "./foldDesign";

export type OrigamiFoldProps = {
  /** Fold step to rest at, 0 (flat sheet) to 4 (finished). Change it to fold or unfold with an animation. */
  step?: number;
  /** Width in layout points; the sheet keeps its 340 x 420 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Called when the paper comes to rest on a fold step. */
  onStepChange?: (step: number) => void;
  /** Hook haptics here: 'grab', 'crease' (a fold lands, strength 0 to 1) and 'release'. */
  onFeedback?: (event: "grab" | "crease" | "release", strength?: number) => void;
  label?: string;
  style?: ViewStyle;
};

function safeDispose(o: unknown): void {
  const d = (o as { dispose?: () => void } | null | undefined)?.dispose;
  if (typeof d === "function") {
    try {
      d.call(o);
    } catch {
      /* some hosts free these on their own */
    }
  }
}

/** Paint a draw list with Skia. */
function paintItems(canvas: SkCanvas, items: Item[]) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const blurs = new Map<number, ReturnType<typeof Skia.MaskFilter.MakeBlur>>();
  for (const it of items) {
    if (it.k === "poly") {
      const path = Skia.Path.Make();
      path.moveTo(it.pts[0], it.pts[1]);
      for (let i = 2; i < it.pts.length; i += 2) path.lineTo(it.pts[i], it.pts[i + 1]);
      path.close();
      paint.setShader(null);
      paint.setMaskFilter(null);
      paint.setColor(Skia.Color(it.color));
      let shader: ReturnType<typeof Skia.Shader.MakeLinearGradient> | null = null;
      if (it.grad) {
        shader = Skia.Shader.MakeLinearGradient(
          vec(it.grad.x0, it.grad.y0),
          vec(it.grad.x1, it.grad.y1),
          [Skia.Color(it.grad.c0), Skia.Color(it.grad.c1)],
          null,
          TileMode.Clamp,
        );
        paint.setShader(shader);
      }
      if (it.blur) {
        const key = Math.round(it.blur * 10);
        let f = blurs.get(key);
        if (!f) {
          f = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, it.blur / 2, true);
          blurs.set(key, f);
        }
        paint.setMaskFilter(f);
      }
      paint.setAlphaf(it.alpha ?? 1);
      canvas.drawPath(path, paint);
      path.dispose?.();
      paint.setShader(null);
      safeDispose(shader);
    } else if (it.k === "dots") {
      paint.setShader(null);
      paint.setMaskFilter(null);
      paint.setColor(Skia.Color(it.color));
      paint.setAlphaf(it.alpha);
      paint.setStrokeWidth(it.size);
      paint.setStrokeCap(StrokeCap.Square);
      const pts = [];
      for (let i = 0; i < it.pts.length; i += 2) pts.push(vec(it.pts[i], it.pts[i + 1]));
      canvas.drawPoints(PointMode.Points, pts, paint);
    } else {
      paint.setShader(null);
      paint.setMaskFilter(null);
      paint.setColor(Skia.Color(it.color));
      paint.setAlphaf(it.alpha ?? 1);
      paint.setStrokeWidth(it.width);
      paint.setStrokeCap(StrokeCap.Round);
      canvas.drawLine(it.pts[0], it.pts[1], it.pts[2], it.pts[3], paint);
    }
  }
  blurs.forEach((f) => safeDispose(f));
  safeDispose(paint);
}


function record(items: Item[]): SkPicture {
  const rec = Skia.PictureRecorder();
  const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, FOLD_W, FOLD_H));
  paintItems(canvas, items);
  return rec.finishRecordingAsPicture();
}

/** Pixels of finger travel for one full fold. */
const PX_PER_STEP = 150;

export function OrigamiFold({
  step = 0,
  width = FOLD_W,
  slowMotion = false,
  reducedMotion,
  onStepChange,
  onFeedback,
  label = "A sheet of origami paper on a desk. Drag sideways to fold it step by step, drag back to unfold",
  style,
}: OrigamiFoldProps) {
  const scale = width / FOLD_W;
  const height = FOLD_H * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const target0 = Math.max(0, Math.min(STEP_COUNT, Math.round(step)));
  const sim = useRef({ u: target0, v: 0, target: target0, held: false, lastStep: target0 });
  const latest = useRef({ slowMotion, reduce, onStepChange, onFeedback });
  latest.current = { slowMotion, reduce, onStepChange, onFeedback };
  const [back, setBack] = useState<SkPicture | null>(null);
  const [frame, setFrame] = useState<SkPicture | null>(null);
  const drag = useRef({ x: 0, t: 0, v: 0 });

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
    const pic = record(staticScene().back);
    setBack(pic);
    return () => {
      setTimeout(() => safeDispose(pic), 1500);
    };
  }, []);

  // A new step prop sends the paper there.
  useEffect(() => {
    const s = sim.current;
    if (!s.held) s.target = Math.max(0, Math.min(STEP_COUNT, Math.round(step)));
  }, [step]);

  useEffect(() => {
    let alive = true;
    let last = 0;
    let prev: SkPicture | null = null;
    let lastU = -1;
    const retired: unknown[] = [];
    const loop = (now: number) => {
      if (!alive) return;
      const s = sim.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!s.held) {
        if (latest.current.reduce) {
          s.u = s.target;
          s.v = 0;
        } else {
          // a lightly under-damped spring: the paper settles with a small, soft overshoot
          const k = 70;
          const c = 2 * Math.sqrt(k) * 0.8;
          const h = dt * (latest.current.slowMotion ? 0.25 : 1);
          const n = Math.max(1, Math.ceil(h / 0.004));
          for (let i = 0; i < n; i++) {
            const a = k * (s.target - s.u) - c * s.v;
            s.v += (a * h) / n;
            s.u += (s.v * h) / n;
          }
          s.u = Math.max(0, Math.min(STEP_COUNT, s.u));
          if (Math.abs(s.target - s.u) < 0.0008 && Math.abs(s.v) < 0.01) {
            s.u = s.target;
            s.v = 0;
          }
        }
        const nearest = Math.round(s.u);
        if (Math.abs(s.u - nearest) < 0.0001 && nearest !== s.lastStep) {
          latest.current.onFeedback?.("crease", Math.min(1, 0.4 + Math.abs(s.v) * 0.2));
          s.lastStep = nearest;
          latest.current.onStepChange?.(nearest);
        }
      }
      if (Math.abs(s.u - lastU) > 1e-5 || !prev) {
        lastU = s.u;
        const pic = record(buildFrame(s.u));
        setFrame(pic);
        if (prev) retired.push(prev);
        while (retired.length > 8) safeDispose(retired.shift());
        prev = pic;
      }
      requestAnimationFrame(loop);
    };
    const raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      const rest = [...retired, prev];
      setTimeout(() => rest.forEach(safeDispose), 1500);
    };
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.reduce,
        onPanResponderGrant: (evt) => {
          const s = sim.current;
          s.held = true;
          s.v = 0;
          drag.current = { x: evt.nativeEvent.locationX / scale, t: Date.now(), v: 0 };
          latest.current.onFeedback?.("grab", 0.3);
        },
        onPanResponderMove: (evt) => {
          const s = sim.current;
          const d = drag.current;
          const x = evt.nativeEvent.locationX / scale;
          const now = Date.now();
          const du = (x - d.x) / PX_PER_STEP;
          s.u = Math.max(0, Math.min(STEP_COUNT, s.u + du));
          const dtm = Math.max(1, now - d.t) / 1000;
          d.v = d.v * 0.6 + (du / dtm) * 0.4;
          d.x = x;
          d.t = now;
        },
        onPanResponderRelease: () => {
          const s = sim.current;
          s.held = false;
          const v = drag.current.v;
          // a flick carries on to the next step; a slow release settles on the nearest
          s.target = Math.max(0, Math.min(STEP_COUNT, Math.round(s.u + Math.max(-1, Math.min(1, v * 0.22)))));
          s.v = Math.max(-6, Math.min(6, v));
          latest.current.onFeedback?.("release", Math.min(1, Math.abs(v) / 4));
        },
        onPanResponderTerminate: () => {
          const s = sim.current;
          s.held = false;
          s.target = Math.max(0, Math.min(STEP_COUNT, Math.round(s.u)));
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [scale],
  );

  return (
    <View
      style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#1d1d21" }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      <Canvas pointerEvents="none" style={{ width, height }}>
        <Group transform={[{ scale }]}>
          {back ? <Picture picture={back} /> : null}
          {frame ? <Picture picture={frame} /> : null}
        </Group>
      </Canvas>
    </View>
  );
}
