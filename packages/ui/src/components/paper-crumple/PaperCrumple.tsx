import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import { Canvas, Fill, Oval, BlurMask, Path, Skia } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  CR_BUCKETS, CR_H, CR_LAYERS, CR_LEVELS, CR_W, buildCrumple, crumpleBounds, crumpleDown, crumpleMove,
  crumplePinch, crumpleSmooth, crumpleUp, createCrumple, stepCrumple, triVerts, type CrumpleState,
} from "./crumpleMath";
import { CRUMPLE_BACKGROUND, CRUMPLE_COLORS, CRUMPLE_SHADOW } from "./crumpleDesign";

export type PaperCrumpleProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  /** Change this number to smooth the paper back out (same as a double tap). */
  smoothToken?: number;
  onFeedback?: (event: "touch" | "release") => void;
  label?: string;
  style?: ViewStyle;
};

type Sim = { value: CrumpleState };
type Frame = { value: number };
type Ev = { id: number; k: number; x: number; y: number; t: number; scale: number };
type View2 = { x: number; y: number; w: number; h: number };

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

// One shade bucket of facets. The sim groups triangle ids by bucket, so this
// path walks only its own triangles. A hairline stroke in the same color
// hides the anti-aliasing seams between neighbouring facets.
function Bucket({ sim, frame, bucket }: { sim: Sim; frame: Frame; bucket: number }) {
  const path = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    const tri = [0, 0, 0];
    for (let k = s.bstart[bucket]; k < s.bstart[bucket + 1]; k++) {
      triVerts(s.order[k], tri);
      p.moveTo(s.sx[tri[0]], s.sy[tri[0]]);
      p.lineTo(s.sx[tri[1]], s.sy[tri[1]]);
      p.lineTo(s.sx[tri[2]], s.sy[tri[2]]);
      p.close();
    }
    return p;
  });
  const color = CRUMPLE_COLORS[Math.floor((bucket % (2 * CR_LEVELS)) / CR_LEVELS)][bucket % CR_LEVELS];
  return (
    <>
      <Path path={path} color={color} style="fill" />
      <Path path={path} color={color} style="stroke" strokeWidth={0.9} strokeJoin="round" />
    </>
  );
}

const BUCKET_IDS = Array.from({ length: CR_BUCKETS }, (_, i) => i);

export function PaperCrumple({
  slowMotion = false,
  reducedMotion,
  smoothToken = 0,
  onFeedback,
  label = "A sheet of ruled paper. Drag a corner toward the middle or pinch to crumple it into a ball, flick the ball to toss it, double tap or pinch out to smooth it open",
  style,
}: PaperCrumpleProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue<CrumpleState>(createCrumple());
  const frame = useSharedValue(0);
  const inputs = useSharedValue<Ev[]>([]);
  const view = useSharedValue<View2>({ x: 0, y: 0, w: 0, h: 0 });
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const seen = useSharedValue(0);
  const latest = useRef({ reduce, onFeedback });
  latest.current.reduce = reduce;
  latest.current.onFeedback = onFeedback;
  const ring = useRef<Ev[]>([]);
  const counter = useRef(0);

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

  const push = (k: number, x: number, y: number, t: number, scale = 1) => {
    counter.current += 1;
    const next = ring.current.concat({ id: counter.current, k, x, y, t, scale }).slice(-24);
    ring.current = next;
    inputs.value = next;
  };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    push(5, 0, 0, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoothToken]);

  const pan = useMemo(() => {
    let pinching = false;
    let startDist = 1;
    let locked = false;
    const dist = (t: readonly { pageX: number; pageY: number }[]) =>
      Math.sqrt((t[0].pageX - t[1].pageX) ** 2 + (t[0].pageY - t[1].pageY) ** 2) || 1;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        pinching = false;
        locked = false;
        push(0, evt.nativeEvent.locationX, evt.nativeEvent.locationY, evt.nativeEvent.timestamp);
        latest.current.onFeedback?.("touch");
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        const ts = evt.nativeEvent.timestamp;
        if (touches.length >= 2) {
          if (!pinching) {
            pinching = true;
            startDist = dist(touches);
          }
          push(3, 0, 0, ts, dist(touches) / startDist);
          return;
        }
        if (pinching) {
          pinching = false;
          locked = true;
          push(4, 0, 0, ts);
        }
        if (!locked) push(1, evt.nativeEvent.locationX, evt.nativeEvent.locationY, ts);
      },
      onPanResponderRelease: (evt) => {
        if (pinching) push(4, 0, 0, evt.nativeEvent.timestamp);
        else if (!locked) push(2, 0, 0, evt.nativeEvent.timestamp);
        pinching = false;
        latest.current.onFeedback?.("release");
      },
      onPanResponderTerminate: (evt) => {
        if (pinching) push(4, 0, 0, evt.nativeEvent.timestamp);
        else if (!locked) push(2, 0, 0, evt.nativeEvent.timestamp);
        pinching = false;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrameCallback((info) => {
    const s = sim.value;
    const evs = inputs.value;
    let handled = false;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.id <= seen.value) continue;
      seen.value = e.id;
      handled = true;
      if (e.k === 0) crumpleDown(s, e.x, e.y, e.t);
      else if (e.k === 1) crumpleMove(s, e.x, e.y, e.t);
      else if (e.k === 2) crumpleUp(s, e.t);
      else if (e.k === 3) crumplePinch(s, e.scale, true);
      else if (e.k === 4) crumplePinch(s, 1, false);
      else if (e.k === 5) crumpleSmooth(s);
    }
    if (reduceM.value) {
      // Still picture: no easing, no tossing; gestures jump to the result.
      if (handled || s.c !== s.target) {
        s.c = s.target;
        if (s.c > s.mem) s.mem = s.c;
        s.vx = 0;
        s.vy = 0;
        buildCrumple(s);
        frame.value = frame.value + 1;
      }
      return;
    }
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepCrumple(s, dt * (slowM.value ? 0.22 : 1));
    buildCrumple(s);
    const b = crumpleBounds(s);
    view.value = { x: b.x0, y: b.y0, w: b.w, h: b.h };
    frame.value = frame.value + 1;
  });

  const shX = useDerivedValue(() => view.value.x + view.value.w * 0.08 + 6);
  const shY = useDerivedValue(() => view.value.y + view.value.h * 0.78 + 4);
  const shW = useDerivedValue(() => view.value.w * 0.86);
  const shH = useDerivedValue(() => Math.max(10, view.value.h * 0.28));
  const shBlur = useDerivedValue(() => 5 + Math.min(10, view.value.w * 0.04));

  return (
    <View
      style={[{ width: CR_W, height: CR_H, borderRadius: 18, overflow: "hidden", backgroundColor: CRUMPLE_BACKGROUND }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width: CR_W, height: CR_H }}>
        <Fill color={CRUMPLE_BACKGROUND} />
        <Oval x={shX} y={shY} width={shW} height={shH} color={CRUMPLE_SHADOW}>
          <BlurMask blur={shBlur} style="normal" />
        </Oval>
        {Array.from({ length: CR_LAYERS }, (_, layer) =>
          BUCKET_IDS.slice(layer * 2 * CR_LEVELS, (layer + 1) * 2 * CR_LEVELS).map((b) => (
            <Bucket key={`f${b}`} sim={sim} frame={frame} bucket={b} />
          )),
        )}
      </Canvas>
    </View>
  );
}
