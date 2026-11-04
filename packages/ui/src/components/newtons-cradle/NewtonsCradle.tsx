import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, useWindowDimensions, type ViewStyle } from "react-native";
import { Canvas, Circle, Group, Line, Oval, Points, RadialGradient, RoundedRect, vec } from "@shopify/react-native-skia";
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  CRADLE_DEFAULTS,
  createCradle,
  pickBall,
  stepCradleFixed,
  type CradleConfig,
  type CradlePointer,
  type CradleState,
} from "./cradleMath";
import {
  BALL_BASE, BALL_R, BALL_RIM, BASE_SIDE, BASE_TOP, CHROME_STOPS, CRADLE_BACKGROUND, CRADLE_H, CRADLE_W,
  FRAME_BAR, FRAME_EDGE, FRAME_POST, PIVOT_DX, PIVOT_Y, REST_BALL_Y, SHADOW_Y, SPECULAR, STRING_COLOR,
  STRING_LEN, pivotX,
} from "./cradleDesign";

export type NewtonsCradleProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  onFeedback?: (event: "grab" | "release" | "collision") => void;
  label?: string;
  style?: ViewStyle;
};

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

const INDICES = [0, 1, 2, 3, 4];

function Ball({ sim, frame, i }: { sim: ReturnType<typeof useSharedValue<CradleState>>; frame: ReturnType<typeof useSharedValue<number>>; i: number }) {
  const cx = useDerivedValue(() => {
    frame.value;
    return pivotX(i) + STRING_LEN * Math.sin(sim.value.th[i]);
  });
  const cy = useDerivedValue(() => {
    frame.value;
    return PIVOT_Y + STRING_LEN * Math.cos(sim.value.th[i]);
  });
  const gradientCenter = useDerivedValue(() => ({ x: cx.value - BALL_R * 0.35, y: cy.value - BALL_R * 0.42 }));
  const shadowX = useDerivedValue(() => cx.value - BALL_R * 0.9);
  const shadowOpacity = useDerivedValue(() => Math.max(0.05, 0.2 - ((cy.value - REST_BALL_Y) / 150) * 0.15));
  return (
    <>
      <Oval x={shadowX} y={SHADOW_Y} width={BALL_R * 1.8} height={7} color="#3a2f22" opacity={shadowOpacity} />
      <Circle cx={cx} cy={cy} r={BALL_R} color={BALL_BASE}>
        <RadialGradient c={gradientCenter} r={BALL_R * 1.25} colors={[...CHROME_STOPS]} />
      </Circle>
      <Circle cx={cx} cy={cy} r={BALL_R} color={BALL_RIM} style="stroke" strokeWidth={1} opacity={0.65} />
      <Circle cx={cx} cy={cy} r={BALL_R * 0.17} color={SPECULAR} />
    </>
  );
}

export function NewtonsCradle({
  slowMotion = false,
  reducedMotion,
  onFeedback,
  label = "Newton's cradle",
  style,
}: NewtonsCradleProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const cfg: CradleConfig = useMemo(
    () => ({
      pivotX: new Float32Array(INDICES.map(pivotX)),
      pivotY: PIVOT_Y,
      lengthPx: STRING_LEN,
      ballRadiusPx: BALL_R,
      pixelsPerMeter: STRING_LEN / CRADLE_DEFAULTS.lengthM,
    }),
    [],
  );
  const opts = useMemo(() => CRADLE_DEFAULTS, []);
  /* The design space is 576x380 so the full swing fits; scale it down to the
     host width. Pointer coordinates map back into design space by / scale. */
  const { width: winW } = useWindowDimensions();
  const scale = Math.min(1, (winW - 48) / CRADLE_W);
  const dispW = CRADLE_W * scale;
  const dispH = CRADLE_H * scale;
  const sim = useSharedValue<CradleState>(createCradle(opts));
  const frame = useSharedValue(0);
  const pointer = useSharedValue<CradlePointer>({ id: 0, x: 0, y: 0, ball: -1 });
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const lastClick = useSharedValue(-10);
  const latest = useRef({ reduce, onFeedback });
  latest.current = { reduce, onFeedback };

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
    sim.value = createCradle(opts);
    frame.value = frame.value + 1;
  }, [reduce, reduceM, sim, frame, opts]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.reduce,
        onPanResponderGrant: (evt) => {
          const s = sim.value;
          const x = evt.nativeEvent.locationX / scale;
          const y = evt.nativeEvent.locationY / scale;
          const ball = pickBall(s, cfg, x, y, BALL_R * 2.4);
          pointer.value = { id: 1, x, y, ball };
          if (ball >= 0) latest.current.onFeedback?.("grab");
        },
        onPanResponderMove: (evt) => {
          const p = pointer.value;
          if (p.ball >= 0) pointer.value = { ...p, x: evt.nativeEvent.locationX / scale, y: evt.nativeEvent.locationY / scale };
        },
        onPanResponderRelease: () => {
          if (pointer.value.ball >= 0) latest.current.onFeedback?.("release");
          pointer.value = { id: 1, x: 0, y: 0, ball: -1 };
        },
        onPanResponderTerminate: () => {
          pointer.value = { id: 1, x: 0, y: 0, ball: -1 };
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [pointer, sim, cfg],
  );

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    const ptrs = pointer.value.ball >= 0 ? [pointer.value] : [];
    stepCradleFixed(s, cfg, dt * (slowM.value ? 0.25 : 1), ptrs, opts);
    if (s.lastCollisionAt > lastClick.value + 0.08) {
      lastClick.value = s.lastCollisionAt;
      const cb = latest.current.onFeedback;
      if (cb) runOnJS(cb)("collision");
    }
    frame.value = frame.value + 1;
  });

  const strings = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < s.th.length; i++) {
      const cx = cfg.pivotX[i] + STRING_LEN * Math.sin(s.th[i]);
      const cy = PIVOT_Y + STRING_LEN * Math.cos(s.th[i]);
      for (const side of [-1, 1]) {
        const ax = cfg.pivotX[i] + side * PIVOT_DX;
        const dx = cx - ax;
        const dy = cy - PIVOT_Y;
        const d = Math.hypot(dx, dy) || 1;
        out.push({ x: ax, y: PIVOT_Y });
        out.push({ x: ax + (dx / d) * (d - BALL_R * 0.55), y: PIVOT_Y + (dy / d) * (d - BALL_R * 0.55) });
      }
    }
    return out;
  });

  return (
    <View
      style={[{ width: dispW, height: dispH }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width: dispW, height: dispH }}>
        <Group transform={[{ scale }]}>
        <RoundedRect x={0} y={0} width={CRADLE_W} height={CRADLE_H} r={18} color={CRADLE_BACKGROUND} />
        <RoundedRect x={188} y={338} width={200} height={18} r={4} color={BASE_SIDE} />
        <RoundedRect x={188} y={336} width={200} height={9} r={3} color={BASE_TOP} />
        <Line p1={vec(208, 340)} p2={vec(218, 46)} color={FRAME_POST} style="stroke" strokeWidth={7} strokeCap="round" />
        <Line p1={vec(368, 340)} p2={vec(358, 46)} color={FRAME_POST} style="stroke" strokeWidth={7} strokeCap="round" />
        <RoundedRect x={202} y={36} width={172} height={11} r={4} color={FRAME_BAR} />
        <RoundedRect x={202} y={44} width={172} height={4} r={2} color={FRAME_EDGE} opacity={0.55} />
        <Points points={strings} mode="lines" color={STRING_COLOR} style="stroke" strokeWidth={1.4} strokeCap="round" />
        {INDICES.map((i) => (
          <Ball key={i} sim={sim} frame={frame} i={i} />
        ))}
        </Group>
      </Canvas>
    </View>
  );
}
