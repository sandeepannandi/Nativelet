import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import {
  BlurStyle,
  Canvas,
  Group,
  Picture,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
  type SkCanvas,
  type SkPicture,
} from "@shopify/react-native-skia";
import {
  allSettled,
  createWorld,
  holdGlobe,
  moveGlobe,
  releaseGlobe,
  startShake,
  stepSnow,
  type SnowWorld,
} from "./snowMath";
import { GLOBE_H, GLOBE_W, RP, buildFrame, staticScene, type Item } from "./snowDesign";

export type SnowGlobeProps = {
  /** Number of flakes. 480 is the default; fewer is lighter on slow phones. */
  flakes?: number;
  /** Width in layout points; the scene keeps its 340 x 460 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Increment to shake the globe for the user. */
  shakeTick?: number;
  /** Called once the water is calm and every flake lies on the ground. */
  onSettled?: () => void;
  /** Hook haptics here: 'grab', 'shake' and 'settle'. */
  onFeedback?: (event: "grab" | "shake" | "settle", strength?: number) => void;
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
    paint.setShader(null);
    paint.setMaskFilter(null);
    paint.setStyle(PaintStyle.Fill);
    paint.setColor(Skia.Color(it.color));
    let shader: ReturnType<typeof Skia.Shader.MakeLinearGradient> | null = null;
    if (it.rgrad) {
      shader = Skia.Shader.MakeRadialGradient(
        vec(it.rgrad.cx, it.rgrad.cy),
        it.rgrad.r,
        [Skia.Color(it.rgrad.c0), Skia.Color(it.rgrad.c1)],
        null,
        TileMode.Clamp,
      );
      paint.setShader(shader);
    } else if (it.k === "poly" && it.grad) {
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
    if (it.k === "circ") {
      canvas.drawCircle(it.x, it.y, it.r, paint);
    } else {
      const path = Skia.Path.Make();
      path.moveTo(it.pts[0], it.pts[1]);
      for (let i = 2; i < it.pts.length; i += 2) path.lineTo(it.pts[i], it.pts[i + 1]);
      if (it.stroke === undefined || it.closed !== false) path.close();
      if (it.stroke !== undefined) {
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(it.stroke);
        paint.setStrokeCap(StrokeCap.Round);
        paint.setStrokeJoin(StrokeJoin.Round);
      }
      canvas.drawPath(path, paint);
      path.dispose?.();
    }
    paint.setShader(null);
    safeDispose(shader);
  }
  blurs.forEach((f) => safeDispose(f));
  safeDispose(paint);
}

function record(items: Item[]): SkPicture {
  const rec = Skia.PictureRecorder();
  const canvas = rec.beginRecording(Skia.XYWHRect(-GLOBE_W, -GLOBE_H, GLOBE_W * 3, GLOBE_H * 3));
  paintItems(canvas, items);
  return rec.finishRecordingAsPicture();
}

type Still = { shadow: SkPicture; s0: SkPicture; s1: SkPicture; s2: SkPicture; s3: SkPicture };

export function SnowGlobe({
  flakes = 480,
  width = GLOBE_W,
  slowMotion = false,
  reducedMotion,
  shakeTick = 0,
  onSettled,
  onFeedback,
  label = "A snow globe with a small cottage and pine trees. Drag the globe or shake it and the snow swirls, then slowly settles",
  style,
}: SnowGlobeProps) {
  const scale = width / GLOBE_W;
  const height = GLOBE_H * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const worldRef = useRef<SnowWorld | null>(null);
  if (!worldRef.current) worldRef.current = createWorld(flakes, 7);
  const latest = useRef({ slowMotion, reduce, onSettled, onFeedback });
  latest.current = { slowMotion, reduce, onSettled, onFeedback };
  const [still, setStill] = useState<Still | null>(null);
  const [frame, setFrame] = useState<SkPicture | null>(null);
  const stillRef = useRef<Still | null>(null);
  stillRef.current = still;
  const grab = useRef<{ x: number; y: number } | null>(null);
  const shakeSeen = useRef(shakeTick);
  const pendingShake = useRef(false);
  const wasSettled = useRef(true);

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

  // The glass, base, house and trees never change: record each layer once.
  useEffect(() => {
    const st = staticScene();
    const pics: Still = {
      shadow: record(st.shadow),
      s0: record(st.s0),
      s1: record(st.s1),
      s2: record(st.s2),
      s3: record(st.s3),
    };
    setStill(pics);
    return () => {
      setTimeout(() => Object.values(pics).forEach(safeDispose), 1500);
    };
  }, []);

  // A new flake count rebuilds the snow, lying on the ground.
  const countSeen = useRef(flakes);
  useEffect(() => {
    if (countSeen.current !== flakes) {
      countSeen.current = flakes;
      worldRef.current = createWorld(flakes, 7);
      wasSettled.current = true;
    }
  }, [flakes]);

  useEffect(() => {
    if (shakeTick !== shakeSeen.current) {
      shakeSeen.current = shakeTick;
      pendingShake.current = true;
    }
  }, [shakeTick]);

  // JS-thread frame loop: step the water and flakes, then record one picture of the moving flakes.
  useEffect(() => {
    let alive = true;
    let last = 0;
    let prev: SkPicture | null = null;
    const retired: unknown[] = [];
    const loop = (now: number) => {
      if (!alive) return;
      const w = worldRef.current!;
      const dt = last ? Math.min(0.5, (now - last) / 1000) : 1 / 60;
      last = now;
      if (pendingShake.current) {
        pendingShake.current = false;
        if (!latest.current.reduce) {
          startShake(w, 1);
          wasSettled.current = false;
          latest.current.onFeedback?.("shake", 0.8);
        }
      }
      if (!latest.current.reduce) {
        stepSnow(w, Math.min(dt, 0.1) * (latest.current.slowMotion ? 0.25 : 1));
      }
      if (!wasSettled.current && allSettled(w)) {
        wasSettled.current = true;
        latest.current.onFeedback?.("settle", 0.5);
        latest.current.onSettled?.();
      }
      const f = buildFrame(w);
      const rec = Skia.PictureRecorder();
      const canvas = rec.beginRecording(Skia.XYWHRect(-GLOBE_W, -GLOBE_H, GLOBE_W * 3, GLOBE_H * 3));
      canvas.save();
      canvas.translate(f.dx, f.dy);
      const st = stillRef.current;
      if (st) {
        canvas.drawPicture(st.s0);
        paintItems(canvas, f.f1);
        canvas.drawPicture(st.s1);
        paintItems(canvas, f.f2);
        canvas.drawPicture(st.s2);
        paintItems(canvas, f.f3);
        canvas.drawPicture(st.s3);
      }
      canvas.restore();
      const pic = rec.finishRecordingAsPicture();
      setFrame(pic);
      if (prev) retired.push(prev);
      while (retired.length > 8) safeDispose(retired.shift());
      prev = pic;
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
          grab.current = { x: evt.nativeEvent.locationX / scale, y: evt.nativeEvent.locationY / scale };
          holdGlobe(worldRef.current!, 0, 0);
          wasSettled.current = false;
          latest.current.onFeedback?.("grab", 0.4);
        },
        onPanResponderMove: (evt) => {
          const g = grab.current;
          if (!g) return;
          const x = evt.nativeEvent.locationX / scale, y = evt.nativeEvent.locationY / scale;
          moveGlobe(worldRef.current!, (x - g.x) / RP, -(y - g.y) / RP);
        },
        onPanResponderRelease: () => {
          grab.current = null;
          releaseGlobe(worldRef.current!);
        },
        onPanResponderTerminate: () => {
          grab.current = null;
          releaseGlobe(worldRef.current!);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [scale],
  );

  return (
    <View
      style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#e9e6df" }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      <Canvas pointerEvents="none" style={{ width, height }}>
        <Group transform={[{ scale }]}>
          {still ? <Picture picture={still.shadow} /> : null}
          {frame ? <Picture picture={frame} /> : null}
        </Group>
      </Canvas>
    </View>
  );
}
