import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import {
  BlurStyle,
  Canvas,
  Group,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
  type SkCanvas,
  type SkPicture,
} from "@shopify/react-native-skia";
import {
  DEFAULT_SPEED,
  MAX_SPEED,
  MIN_SPEED,
  advance,
  colorOf,
  createWorld,
  launch,
  simulateToRest,
  type PocketColor,
  type RouletteWorld,
} from "./rouletteMath";
import { WHEEL_H, WHEEL_W, buildFrame, staticScene, type Item } from "./rouletteDesign";

export type RouletteEvent = "launch" | "drop" | "deflector" | "fret" | "settle";

export type RouletteWheelProps = {
  /** Width in layout points; the wheel keeps its 340 x 336 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Increment to spin the wheel and launch the ball for the user. */
  spinTick?: number;
  /** Called once the ball has settled in a pocket. */
  onSettled?: (result: { number: number; color: PocketColor }) => void;
  /** Called as soon as a ball is launched. */
  onLaunch?: () => void;
  /** Hook haptics here: 'launch', 'drop' (ball leaves the track), 'deflector' and 'fret' hits (strength 0 to 1) and 'settle'. */
  onFeedback?: (event: RouletteEvent, strength?: number) => void;
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
  const canvas = rec.beginRecording(Skia.XYWHRect(-WHEEL_W, -WHEEL_H, WHEEL_W * 3, WHEEL_H * 3));
  paintItems(canvas, items);
  return rec.finishRecordingAsPicture();
}

export function RouletteWheel({
  width = WHEEL_W,
  slowMotion = false,
  reducedMotion,
  spinTick = 0,
  onSettled,
  onLaunch,
  onFeedback,
  label = "A roulette wheel. Tap to spin it and launch the ball, or press and drag to set how hard the ball is launched. The ball circles the track, drops through the deflectors, bounces between the pockets and settles in one",
  style,
}: RouletteWheelProps) {
  const scale = width / WHEEL_W;
  const height = WHEEL_H * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const worldRef = useRef<RouletteWorld | null>(null);
  if (!worldRef.current) worldRef.current = createWorld(11);
  const latest = useRef({ slowMotion, reduce, onSettled, onLaunch, onFeedback });
  latest.current = { slowMotion, reduce, onSettled, onLaunch, onFeedback };
  const statics = useMemo(() => staticScene(), []);
  const [still, setStill] = useState<{ back: SkPicture; front: SkPicture } | null>(null);
  const [frame, setFrame] = useState<{ dyn: SkPicture; overlay: SkPicture } | null>(null);
  const hand = useRef({ charging: false, power: 0 });
  const seq = useRef(1);
  const playing = useRef(false);
  const spinSeen = useRef(spinTick);
  const pendingLaunch = useRef<number | null>(null);

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

  // The bowl, track and rim never change: record them once.
  useEffect(() => {
    const back = record(statics.back);
    const front = record(statics.front);
    setStill({ back, front });
    return () => {
      setTimeout(() => {
        safeDispose(back);
        safeDispose(front);
      }, 1500);
    };
  }, [statics]);

  useEffect(() => {
    if (spinTick !== spinSeen.current) {
      spinSeen.current = spinTick;
      if (!playing.current) pendingLaunch.current = DEFAULT_SPEED;
    }
  }, [spinTick]);

  // JS-thread frame loop: step the physics, then record the turning wheel and the ball as one picture.
  useEffect(() => {
    let alive = true;
    let last = 0;
    let prev: { dyn: SkPicture; overlay: SkPicture } | null = null;
    const retired: unknown[] = [];
    const loop = (now: number) => {
      if (!alive) return;
      const w = worldRef.current!;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      if (pendingLaunch.current !== null) {
        const speed = pendingLaunch.current;
        pendingLaunch.current = null;
        seq.current += 1;
        launch(w, speed, seq.current * 7919);
        playing.current = true;
        latest.current.onLaunch?.();
        if (latest.current.reduce) simulateToRest(w);
      }
      if (!latest.current.reduce) advance(w, dt * (latest.current.slowMotion ? 0.25 : 1));
      if (w.events.length) {
        const strength = Math.max(0.2, w.impact);
        for (const e of w.events) latest.current.onFeedback?.(e, e === "deflector" || e === "fret" ? strength : 0.6);
        w.events.length = 0;
        w.impact = 0;
      }
      if (playing.current && w.ball.locked && w.result !== null) {
        playing.current = false;
        latest.current.onSettled?.({ number: w.result, color: colorOf(w.result) });
      }
      const f = buildFrame(w, { power: hand.current.power, charging: hand.current.charging });
      const pic = { dyn: record(f.dyn), overlay: record(f.overlay) };
      setFrame(pic);
      if (prev) retired.push(prev.dyn, prev.overlay);
      while (retired.length > 8) safeDispose(retired.shift());
      prev = pic;
      requestAnimationFrame(loop);
    };
    const raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      const rest = [...retired, prev?.dyn, prev?.overlay];
      setTimeout(() => rest.forEach(safeDispose), 1500);
    };
  }, []);

  // Press and drag away from where you touched to set the launch power; a plain tap launches at a middling speed.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin(() => {
          if (playing.current || pendingLaunch.current !== null) return;
          hand.current = { charging: true, power: 0 };
        })
        .onUpdate((e) => {
          if (!hand.current.charging) return;
          const d = Math.hypot(e.translationX, e.translationY) / scale;
          hand.current.power = d < 10 ? 0 : Math.min(1, (d - 10) / 110);
        })
        .onFinalize(() => {
          const h = hand.current;
          if (!h.charging) return;
          h.charging = false;
          const p = h.power;
          h.power = 0;
          pendingLaunch.current = p > 0 ? MIN_SPEED + (MAX_SPEED - MIN_SPEED) * p : DEFAULT_SPEED;
        }),
    [scale],
  );

  return (
    <GestureHandlerRootView style={{ width, height }}>
      <GestureDetector gesture={pan}>
        <View
          style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#17110d" }, style]}
          accessibilityLabel={label}
          accessibilityRole="image"
          accessibilityActions={[{ name: "activate", label: "Spin the wheel" }]}
          onAccessibilityAction={() => {
            if (!playing.current && pendingLaunch.current === null) pendingLaunch.current = DEFAULT_SPEED;
          }}
          accessible
        >
          <Canvas pointerEvents="none" style={{ width, height }}>
            <Group transform={[{ scale }]}>
              {still ? <Picture picture={still.back} /> : null}
              {frame ? <Picture picture={frame.dyn} /> : null}
              {still ? <Picture picture={still.front} /> : null}
              {frame ? <Picture picture={frame.overlay} /> : null}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
