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
import { TH, TW, advance, createWorld, drag, grab, isTorn, release, reset, settleNow, startAuto, type TearEvent, type TearWorld } from "./tearMath";
import { buildFrame, mainKey, mainLayer, staticScene, type Item } from "./tearDesign";

export type TearTicketProps = {
  /** Width in layout points; the ticket keeps its 340 x 392 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Increment to tear the stub off for the user (for a Tear button). */
  tearTick?: number;
  /** Increment to bring a fresh ticket. */
  resetTick?: number;
  /** Called once the stub is off. */
  onTorn?: () => void;
  /** Called when the stub has landed and stopped. */
  onSettled?: () => void;
  /** Hook haptics here: 'grab', 'tick' (a perforation tie goes, strength 0 to 1), 'detach', 'land', 'settle'. */
  onFeedback?: (event: TearEvent, strength?: number) => void;
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
      shader = Skia.Shader.MakeRadialGradient(it.rgrad && vec(it.rgrad.cx, it.rgrad.cy), it.rgrad.r, [Skia.Color(it.rgrad.c0), Skia.Color(it.rgrad.c1)], null, TileMode.Clamp);
      paint.setShader(shader);
    } else if (it.k === "poly" && it.grad) {
      shader = Skia.Shader.MakeLinearGradient(vec(it.grad.x0, it.grad.y0), vec(it.grad.x1, it.grad.y1), [Skia.Color(it.grad.c0), Skia.Color(it.grad.c1)], null, TileMode.Clamp);
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
      const subs = it.extra ? [it.pts, ...it.extra] : [it.pts];
      for (const pts of subs) {
        path.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
        if (it.stroke === undefined || it.closed !== false) path.close();
      }
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
  const canvas = rec.beginRecording(Skia.XYWHRect(-TW, -TH, TW * 3, TH * 3));
  paintItems(canvas, items);
  return rec.finishRecordingAsPicture();
}

export function TearTicket({
  width = TW,
  slowMotion = false,
  reducedMotion,
  tearTick = 0,
  resetTick = 0,
  onTorn,
  onSettled,
  onFeedback,
  label = "A perforated event ticket with a stub. Press the stub and pull it away to tear it off along the perforation, or use the tear action",
  style,
}: TearTicketProps) {
  const scale = width / TW;
  const height = TH * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const worldRef = useRef<TearWorld | null>(null);
  if (!worldRef.current) worldRef.current = createWorld(3);
  const latest = useRef({ slowMotion, reduce, onTorn, onSettled, onFeedback });
  latest.current = { slowMotion, reduce, onTorn, onSettled, onFeedback };
  const [still, setStill] = useState<SkPicture | null>(null);
  const [frame, setFrame] = useState<{ main: SkPicture; stub: SkPicture } | null>(null);
  const tearSeen = useRef(tearTick);
  const resetSeen = useRef(resetTick);
  const tornSent = useRef(false);
  const lastTick = useRef(0);

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

  // The table never changes: record it once.
  useEffect(() => {
    const pic = record(staticScene());
    setStill(pic);
    return () => {
      setTimeout(() => safeDispose(pic), 1500);
    };
  }, []);

  // JS-thread frame loop: step the paper, then record the body (only when a tie breaks) and the moving stub.
  useEffect(() => {
    let alive = true;
    let last = 0;
    let mainPic: SkPicture | null = null;
    let mainSig = -1;
    let prevStub: SkPicture | null = null;
    const retired: unknown[] = [];
    const loop = (now: number) => {
      if (!alive) return;
      let w = worldRef.current!;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (resetTick !== resetSeen.current) {
        resetSeen.current = resetTick;
        w = reset(w);
        worldRef.current = w;
        tornSent.current = false;
      }
      if (tearTick !== tearSeen.current) {
        tearSeen.current = tearTick;
        if (startAuto(w) && latest.current.reduce) {
          let guard = 0;
          while ((w.auto || (w.mode === "free" && !w.rest)) && guard++ < 20000) advance(w, 1 / 60);
        }
      }
      w.slowRate = latest.current.slowMotion ? 0.25 : 1;
      w.reduced = latest.current.reduce;
      advance(w, dt * w.slowRate);
      if (latest.current.reduce && isTorn(w) && !w.rest) settleNow(w);
      if (w.events.length) {
        for (const e of w.events) {
          if (e === "tick") {
            if (now - lastTick.current < 28) continue;
            lastTick.current = now;
            latest.current.onFeedback?.(e, w.tickStrength);
          } else {
            latest.current.onFeedback?.(e, 0.7);
          }
          if (e === "detach" && !tornSent.current) {
            tornSent.current = true;
            latest.current.onTorn?.();
          }
          if (e === "settle") latest.current.onSettled?.();
        }
        w.events.length = 0;
      }
      const sig = mainKey(w);
      let nextMain = mainPic;
      if (sig !== mainSig || !mainPic) {
        nextMain = record(mainLayer(w));
        if (mainPic) retired.push(mainPic);
        mainPic = nextMain;
        mainSig = sig;
      }
      const f = buildFrame(w);
      const stub = record([...f.stubShadow, ...f.stub, ...f.overlay]);
      setFrame({ main: nextMain!, stub });
      if (prevStub) retired.push(prevStub);
      while (retired.length > 8) safeDispose(retired.shift());
      prevStub = stub;
      requestAnimationFrame(loop);
    };
    const raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      const rest = [...retired, mainPic, prevStub];
      setTimeout(() => rest.forEach(safeDispose), 1500);
    };
    // tearTick and resetTick are read through the closure each frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tearTick, resetTick]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => {
          grab(worldRef.current!, e.x / scale, e.y / scale);
        })
        .onUpdate((e) => {
          drag(worldRef.current!, e.x / scale, e.y / scale);
        })
        .onFinalize(() => {
          release(worldRef.current!);
        }),
    [scale],
  );

  return (
    <GestureHandlerRootView style={{ width, height }}>
      <GestureDetector gesture={pan}>
        <View
          style={[{ width, height, borderRadius: 18, overflow: "hidden", backgroundColor: "#141915" }, style]}
          accessibilityLabel={label}
          accessibilityRole="image"
          accessibilityActions={[{ name: "activate", label: "Tear off the stub" }]}
          onAccessibilityAction={() => {
            startAuto(worldRef.current!);
          }}
          accessible
        >
          <Canvas pointerEvents="none" style={{ width, height }}>
            <Group transform={[{ scale }]}>
              {still ? <Picture picture={still} /> : null}
              {frame ? <Picture picture={frame.main} /> : null}
              {frame ? <Picture picture={frame.stub} /> : null}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
