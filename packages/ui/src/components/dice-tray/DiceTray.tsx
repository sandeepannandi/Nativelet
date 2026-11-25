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
import {
  allSettled,
  createWorld,
  diceValues,
  grabDice,
  moveHeld,
  releaseDice,
  stepDice,
  throwDice,
  type DiceWorld,
} from "./diceMath";
import { TRAY_H, TRAY_W, buildFrame, staticScene, unproject, type Item } from "./diceDesign";

export type DiceTrayProps = {
  /** How many dice, 1 to 3. */
  count?: 1 | 2 | 3;
  /** Width in layout points; the tray keeps its 340 x 460 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Increment to throw the dice for the user. */
  rollTick?: number;
  /** Called once every die has come to rest, with the face values. */
  onSettled?: (values: number[]) => void;
  /** Hook haptics here: 'pickup', 'throw', 'impact' (felt or rail hit, strength 0 to 1) and 'settle'. */
  onFeedback?: (event: "pickup" | "throw" | "impact" | "settle", strength?: number) => void;
  label?: string;
  style?: ViewStyle;
};

const TRAY_HALF_X = 3.4;
const TRAY_HALF_Z = 4.4;

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
  const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, TRAY_W, TRAY_H));
  paintItems(canvas, items);
  return rec.finishRecordingAsPicture();
}

export function DiceTray({
  count = 2,
  width = TRAY_W,
  slowMotion = false,
  reducedMotion,
  rollTick = 0,
  onSettled,
  onFeedback,
  label = "A felt dice tray. Drag to pick up the dice, flick to throw them. They tumble, bounce off the rails and settle on a face",
  style,
}: DiceTrayProps) {
  const scale = width / TRAY_W;
  const height = TRAY_H * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const worldRef = useRef<DiceWorld | null>(null);
  if (!worldRef.current) worldRef.current = createWorld(count, TRAY_HALF_X, TRAY_HALF_Z, 11);
  const latest = useRef({ slowMotion, reduce, onSettled, onFeedback });
  latest.current = { slowMotion, reduce, onSettled, onFeedback };
  const statics = useMemo(() => staticScene(TRAY_HALF_X, TRAY_HALF_Z), []);
  const [still, setStill] = useState<{ back: SkPicture; front: SkPicture } | null>(null);
  const [frame, setFrame] = useState<SkPicture | null>(null);
  const hand = useRef({ active: false, x: 0, y: 0, moved: 0, startX: 0, startY: 0 });
  const rollSeen = useRef(rollTick);
  const wasSettled = useRef(true);
  const pending = useRef<"roll" | null>(null);
  const seq = useRef(1);

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

  // The felt and rails never change: record them once.
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

  // A new count rebuilds the dice, flat on the felt.
  useEffect(() => {
    worldRef.current = createWorld(count, TRAY_HALF_X, TRAY_HALF_Z, 11);
    wasSettled.current = true;
  }, [count]);

  useEffect(() => {
    if (rollTick !== rollSeen.current) {
      rollSeen.current = rollTick;
      pending.current = "roll";
    }
  }, [rollTick]);

  // JS-thread frame loop: step the rigid bodies, then record one picture of shadows and dice.
  useEffect(() => {
    let alive = true;
    let last = 0;
    let prev: SkPicture | null = null;
    const retired: unknown[] = [];
    const startRoll = (w: DiceWorld) => {
      seq.current += 1;
      throwDice(w, [(Math.sin(seq.current * 1.7)) * 1.2, 2.4, TRAY_HALF_Z * 0.78], [Math.sin(seq.current * 2.9) * 3.2, 4, -(13 + (seq.current % 4) * 1.6)], 1, seq.current * 7919);
      wasSettled.current = false;
      latest.current.onFeedback?.("throw", 0.8);
    };
    const loop = (now: number) => {
      if (!alive) return;
      const w = worldRef.current!;
      const dt = last ? Math.min(0.5, (now - last) / 1000) : 1 / 60;
      last = now;
      if (pending.current === "roll") {
        pending.current = null;
        startRoll(w);
        if (latest.current.reduce) {
          // Reduce Motion: no tumbling to watch, show the settled throw.
          let t = 0;
          while (t < 12 && !allSettled(w)) {
            stepDice(w, 1 / 60);
            t += 1 / 60;
          }
        }
      }
      const anyHeld = w.dice.some((d) => d.held);
      if (anyHeld) {
        const h = hand.current;
        const target = unproject(h.x, h.y, 2.3);
        moveHeld(w, target, Math.min(dt, 0.05));
      }
      if (!latest.current.reduce) {
        stepDice(w, Math.min(dt, 0.1) * (latest.current.slowMotion ? 0.25 : 1));
      }
      if (w.impact > 2.5) latest.current.onFeedback?.("impact", Math.min(1, w.impact / 14));
      w.impact = 0;
      if (!wasSettled.current && !anyHeld && allSettled(w)) {
        wasSettled.current = true;
        latest.current.onFeedback?.("settle", 0.5);
        latest.current.onSettled?.(diceValues(w));
      }
      const f = buildFrame(w);
      const pic = record([...f.shadows, ...f.dice]);
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
          const x = evt.nativeEvent.locationX / scale, y = evt.nativeEvent.locationY / scale;
          hand.current = { active: true, x, y, moved: 0, startX: x, startY: y };
          const w = worldRef.current!;
          seq.current += 1;
          grabDice(w, seq.current * 31);
          wasSettled.current = false;
          latest.current.onFeedback?.("pickup", 0.4);
        },
        onPanResponderMove: (evt) => {
          const h = hand.current;
          h.x = evt.nativeEvent.locationX / scale;
          h.y = evt.nativeEvent.locationY / scale;
          h.moved = Math.max(h.moved, Math.hypot(h.x - h.startX, h.y - h.startY));
        },
        onPanResponderRelease: () => {
          const w = worldRef.current!;
          const h = hand.current;
          h.active = false;
          const speed = releaseDice(w, seq.current * 17);
          // A plain tap drops the dice where they are; a flick throws them.
          latest.current.onFeedback?.("throw", Math.min(1, speed / 30));
        },
        onPanResponderTerminate: () => {
          const w = worldRef.current!;
          hand.current.active = false;
          releaseDice(w, seq.current * 17);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [scale],
  );

  return (
    <View
      style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#1a120d" }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      <Canvas pointerEvents="none" style={{ width, height }}>
        <Group transform={[{ scale }]}>
          {still ? <Picture picture={still.back} /> : null}
          {frame ? <Picture picture={frame} /> : null}
          {still ? <Picture picture={still.front} /> : null}
        </Group>
      </Canvas>
    </View>
  );
}
