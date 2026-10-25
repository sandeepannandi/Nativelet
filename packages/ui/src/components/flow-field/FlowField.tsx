import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import { Circle, Canvas, Fill, Group, LinearGradient, Points, RoundedRect, vec } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  FLOW_COUNT, FLOW_DEFAULTS, FLOW_H, FLOW_W, createFlow, flowPointer, stepFlowFrame, type FlowState,
} from "./flowMath";
import {
  FLOW_BACKGROUND, FLOW_BG_BOTTOM, FLOW_BG_TOP, FLOW_BIG_SIZE, FLOW_CORES, FLOW_GLOWS,
  FLOW_GLOW_STROKES, FLOW_SPEED_LIMITS, FLOW_STROKES, FLOW_TRAIL_MAX, FLOW_TRAIL_MIN, FLOW_TRAIL_SECONDS,
  FLOW_VEILS,
} from "./flowDesign";

export type FlowFieldProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  onFeedback?: (event: "touch" | "release") => void;
  label?: string;
  style?: ViewStyle;
};

type Pointer = { x: number; y: number; down: number };
type Sim = { value: FlowState };
type Frame = { value: number };

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

// One speed/size bucket of streaks. A particle's tail is its displacement
// over a short window, so the line length encodes speed even inside one
// color bucket; zero-length segments are nudged so they draw as dots.
function bucketPoints(s: FlowState, bucket: number, big: number) {
  'worklet';
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < s.n; i++) {
    const sp = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
    let b = 0;
    while (b < FLOW_SPEED_LIMITS.length && sp >= FLOW_SPEED_LIMITS[b]) b++;
    if (b !== bucket) continue;
    if ((s.size[i] >= FLOW_BIG_SIZE ? 1 : 0) !== big) continue;
    const x = s.x[i];
    const y = s.y[i];
    let tx: number;
    let ty: number;
    if (sp < 2) {
      tx = x - 0.7;
      ty = y;
    } else {
      const len = Math.min(FLOW_TRAIL_MAX, Math.max(FLOW_TRAIL_MIN, sp * FLOW_TRAIL_SECONDS));
      tx = x - (s.vx[i] / sp) * len;
      ty = y - (s.vy[i] / sp) * len;
    }
    out.push({ x: tx, y: ty }, { x, y });
  }
  if (out.length === 0) return [{ x: -30, y: -30 }, { x: -29, y: -30 }];
  return out;
}

type BucketProps = { sim: Sim; frame: Frame; bucket: number; big: number };

function TrailGlow({ sim, frame, bucket, big }: BucketProps) {
  const points = useDerivedValue(() => {
    frame.value;
    return bucketPoints(sim.value, bucket, big);
  });
  return (
    <Points
      points={points}
      mode="lines"
      color={FLOW_GLOWS[bucket]}
      style="stroke"
      strokeWidth={FLOW_GLOW_STROKES[big]}
      strokeCap="round"
    />
  );
}

function TrailCore({ sim, frame, bucket, big }: BucketProps) {
  const points = useDerivedValue(() => {
    frame.value;
    return bucketPoints(sim.value, bucket, big);
  });
  return (
    <Points
      points={points}
      mode="lines"
      color={FLOW_CORES[bucket]}
      style="stroke"
      strokeWidth={FLOW_STROKES[big]}
      strokeCap="round"
    />
  );
}

function FingerPad({ pointer }: { pointer: { value: Pointer } }) {
  const down = useDerivedValue(() => pointer.value.down);
  const cx = useDerivedValue(() => pointer.value.x);
  const cy = useDerivedValue(() => pointer.value.y);
  const opacity = useDerivedValue(() => (down.value ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={30} color="rgba(180, 210, 255, 0.05)" />
      <Circle cx={cx} cy={cy} r={13} color="rgba(180, 210, 255, 0.09)" />
    </Group>
  );
}

const BUCKETS = [0, 1, 2, 3];
const SIZES = [0, 1];

export function FlowField({
  slowMotion = false,
  reducedMotion,
  onFeedback,
  label = "A dark current of glowing particles flowing like a slow river of light. Drag through it to stir swirls and comets; let go and the current heals back",
  style,
}: FlowFieldProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue<FlowState>(createFlow());
  const frame = useSharedValue(0);
  const pointer = useSharedValue<Pointer>({ x: 0, y: 0, down: 0 });
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const latest = useRef({ reduce, onFeedback });
  latest.current.reduce = reduce;
  latest.current.onFeedback = onFeedback;

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
    if (reduce) {
      // Still picture: the current is pre-run so streaks read in place.
      sim.value = createFlow(FLOW_DEFAULTS, FLOW_COUNT, 20261025, true);
      frame.value = frame.value + 1;
    } else if (sim.value.settled) {
      sim.value = createFlow();
    }
  }, [reduce, reduceM, sim, frame]);

  const pan = useMemo(() => {
    const send = (x: number, y: number, down: number) => {
      pointer.value = { x, y, down };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.reduce,
      onPanResponderGrant: (evt) => {
        send(evt.nativeEvent.locationX, evt.nativeEvent.locationY, 1);
        latest.current.onFeedback?.("touch");
      },
      onPanResponderMove: (evt) => {
        send(evt.nativeEvent.locationX, evt.nativeEvent.locationY, 1);
      },
      onPanResponderRelease: () => {
        send(pointer.value.x, pointer.value.y, 0);
        latest.current.onFeedback?.("release");
      },
      onPanResponderTerminate: () => {
        send(pointer.value.x, pointer.value.y, 0);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [pointer]);

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    const p = pointer.value;
    flowPointer(s, p.x, p.y, p.down === 1);
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepFlowFrame(s, dt * (slowM.value ? 0.22 : 1), FLOW_DEFAULTS);
    frame.value = frame.value + 1;
  });

  return (
    <View
      style={[{ width: FLOW_W, height: FLOW_H, borderRadius: 18, overflow: "hidden", backgroundColor: FLOW_BACKGROUND }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width: FLOW_W, height: FLOW_H }}>
        <Fill color={FLOW_BACKGROUND} />
        <RoundedRect x={0} y={0} width={FLOW_W} height={FLOW_H} r={0}>
          <LinearGradient start={vec(0, 0)} end={vec(FLOW_W * 0.4, FLOW_H)} colors={[FLOW_BG_TOP, FLOW_BG_BOTTOM]} />
        </RoundedRect>
        {FLOW_VEILS.map((v, i) => (
          <Circle key={i} cx={v.cx} cy={v.cy} r={v.r} color={v.color} />
        ))}
        <Group blendMode="plus">
          {BUCKETS.map((b) =>
            SIZES.map((g) => <TrailGlow key={`g${b}-${g}`} sim={sim} frame={frame} bucket={b} big={g} />),
          )}
          {BUCKETS.map((b) =>
            SIZES.map((g) => <TrailCore key={`c${b}-${g}`} sim={sim} frame={frame} bucket={b} big={g} />),
          )}
        </Group>
        <FingerPad pointer={pointer} />
      </Canvas>
    </View>
  );
}
