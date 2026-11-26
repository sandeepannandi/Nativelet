import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
import { FOLD_H, FOLD_W, staticScene, type Item } from "./foldDesign";
import { FoldController, type FoldEvent } from "./foldController";

export type OrigamiFoldHandle = {
  /** Play the last fold backwards. */
  undo: () => void;
  /** Unfold everything, one fold after another. */
  reset: () => void;
};

export type OrigamiFoldProps = {
  /** Width in layout points; the sheet keeps its 340 x 420 proportions. */
  width?: number;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Called when a fold lands or is undone, with the number of folds now on the paper. */
  onFoldsChange?: (folds: number) => void;
  /** Hook haptics here: 'grab', 'crease' (a fold lands, strength 0 to 1), 'release' and 'undo'. */
  onFeedback?: (event: FoldEvent, strength?: number) => void;
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

export const OrigamiFold = forwardRef<OrigamiFoldHandle, OrigamiFoldProps>(function OrigamiFold(
  {
    width = FOLD_W,
    slowMotion = false,
    reducedMotion,
    onFoldsChange,
    onFeedback,
    label = "A sheet of origami paper on a desk. Press anywhere on the paper and drag in any direction to fold it",
    style,
  },
  ref,
) {
  const scale = width / FOLD_W;
  const height = FOLD_H * scale;
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const ctl = useRef<FoldController | null>(null);
  if (!ctl.current) ctl.current = new FoldController();
  const c = ctl.current;
  c.slowMotion = slowMotion;
  c.reduced = reduce;
  c.onChange = onFoldsChange;
  c.onFeedback = onFeedback;
  const [back, setBack] = useState<SkPicture | null>(null);
  const [frame, setFrame] = useState<SkPicture | null>(null);

  useImperativeHandle(ref, () => ({ undo: () => c.undo(), reset: () => c.reset() }), [c]);

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

  useEffect(() => {
    let alive = true;
    let last = 0;
    let prev: SkPicture | null = null;
    const retired: unknown[] = [];
    const loop = (now: number) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (c.update(dt) || !prev) {
        const pic = record(c.frame());
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
  }, [c]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // only a press that lands on the paper starts a fold
        onStartShouldSetPanResponder: (evt) => c.down(evt.nativeEvent.locationX / scale, evt.nativeEvent.locationY / scale),
        onPanResponderMove: (evt) => c.move(evt.nativeEvent.locationX / scale, evt.nativeEvent.locationY / scale),
        onPanResponderRelease: () => c.up(),
        onPanResponderTerminate: () => c.up(),
        onPanResponderTerminationRequest: () => false,
      }),
    [scale, c],
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
});
