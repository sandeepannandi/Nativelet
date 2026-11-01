import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import {
  Circle, Canvas, Fill, Group, LinearGradient, Points, RadialGradient, RoundedRect, rect, rrect, vec,
} from "@shopify/react-native-skia";
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  CYM_COUNT, CYM_DEFAULTS, CYM_H, CYM_W, PLATE_S, PLATE_X, PLATE_Y,
  createCymatics, cymHz, cymModePair, cymPointer, cymScatter, stepCymatics, type CymState,
} from "./cymaticsMath";
import {
  CYM_BACKGROUND, CYM_BG_BOTTOM, CYM_BG_TOP, CYM_BIG_SIZE, CYM_BOLT, CYM_BOLT_HI, CYM_CORES, CYM_CORE_W,
  CYM_GLOWS, CYM_GLOW_W, CYM_PLATE_BOTTOM, CYM_PLATE_RADIUS, CYM_PLATE_RIM, CYM_PLATE_TOP, CYM_SHEEN,
} from "./cymaticsDesign";

export type CymaticsProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  onFeedback?: (event: "touch" | "release" | "scatter") => void;
  onTune?: (hz: number, m: number, n: number) => void;
  label?: string;
  style?: ViewStyle;
};

type Pointer = { x: number; y: number; down: number; scatter: number };
type Sim = { value: CymState };
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

// One size class of grains, mapped from unit plate coordinates to pixels.
function grainPoints(s: CymState, big: number) {
  'worklet';
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < s.n; i++) {
    if ((s.size[i] >= CYM_BIG_SIZE ? 1 : 0) !== big) continue;
    out.push({ x: PLATE_X + s.x[i] * PLATE_S, y: PLATE_Y + s.y[i] * PLATE_S });
  }
  if (out.length === 0) return [{ x: -30, y: -30 }];
  return out;
}

type ClassProps = { sim: Sim; frame: Frame; big: number };

function GrainGlow({ sim, frame, big }: ClassProps) {
  const points = useDerivedValue(() => {
    frame.value;
    return grainPoints(sim.value, big);
  });
  return <Points points={points} mode="points" color={CYM_GLOWS[big]} style="stroke" strokeWidth={CYM_GLOW_W[big]} strokeCap="round" />;
}

function GrainCore({ sim, frame, big }: ClassProps) {
  const points = useDerivedValue(() => {
    frame.value;
    return grainPoints(sim.value, big);
  });
  return <Points points={points} mode="points" color={CYM_CORES[big]} style="stroke" strokeWidth={CYM_CORE_W[big]} strokeCap="round" />;
}

function FingerPad({ pointer }: { pointer: { value: Pointer } }) {
  const down = useDerivedValue(() => pointer.value.down);
  const cx = useDerivedValue(() => PLATE_X + pointer.value.x * PLATE_S);
  const cy = useDerivedValue(() => PLATE_Y + pointer.value.y * PLATE_S);
  const opacity = useDerivedValue(() => (down.value ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={26} color="rgba(240, 216, 166, 0.06)" />
      <Circle cx={cx} cy={cy} r={11} color="rgba(240, 216, 166, 0.10)" />
    </Group>
  );
}

const BOLTS = [
  { cx: PLATE_X + 11, cy: PLATE_Y + 11 },
  { cx: PLATE_X + PLATE_S - 11, cy: PLATE_Y + 11 },
  { cx: PLATE_X + 11, cy: PLATE_Y + PLATE_S - 11 },
  { cx: PLATE_X + PLATE_S - 11, cy: PLATE_Y + PLATE_S - 11 },
];
const SIZES = [0, 1];

export function Cymatics({
  slowMotion = false,
  reducedMotion,
  onFeedback,
  onTune,
  label = "Sand scattered on a square steel plate vibrating at a pure frequency. The grains dance and settle into the resonance figure of the plate. Drag sideways to retune the frequency and watch the figure break and reform, drag up or down to blend the mode, tap to scatter the sand",
  style,
}: CymaticsProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue<CymState>(createCymatics());
  const frame = useSharedValue(0);
  const pointer = useSharedValue<Pointer>({ x: 0.5, y: 0.5, down: 0, scatter: 0 });
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const latest = useRef({ reduce, onFeedback });
  latest.current.reduce = reduce;
  latest.current.onFeedback = onFeedback;
  const tune = useRef({ hz: -1, m: -1, n: -1, onTune });
  tune.current.onTune = onTune;

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
      // Still picture: the figure is pre-run so the sand sits on the
      // nodal lines.
      sim.value = createCymatics(CYM_DEFAULTS, CYM_COUNT, 20261101, true);
      frame.value = frame.value + 1;
    } else if (sim.value.settled) {
      sim.value = createCymatics();
    }
  }, [reduce, reduceM, sim, frame]);

  const pan = useMemo(() => {
    const toPlate = (lx: number, ly: number) => {
      let x = (lx - PLATE_X) / PLATE_S;
      let y = (ly - PLATE_Y) / PLATE_S;
      if (x < 0) x = 0; else if (x > 1) x = 1;
      if (y < 0) y = 0; else if (y > 1) y = 1;
      return { x, y };
    };
    const send = (x: number, y: number, down: number, scatter: number) => {
      pointer.value = { x, y, down, scatter };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.reduce,
      onPanResponderGrant: (evt) => {
        const p = toPlate(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        send(p.x, p.y, 1, 0);
        latest.current.onFeedback?.("touch");
      },
      onPanResponderMove: (evt) => {
        const p = toPlate(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        send(p.x, p.y, 1, 0);
      },
      onPanResponderRelease: () => {
        // A touch that barely moved is a tap: kick the sand off the lines.
        const tap = sim.value.moved < 0.02;
        send(pointer.value.x, pointer.value.y, 0, tap ? 1 : 0);
        latest.current.onFeedback?.(tap ? "scatter" : "release");
      },
      onPanResponderTerminate: () => {
        send(pointer.value.x, pointer.value.y, 0, 0);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [pointer, sim]);

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    const p = pointer.value;
    cymPointer(s, p.x, p.y, p.down === 1);
    if (p.scatter) {
      cymScatter(s, CYM_DEFAULTS);
      pointer.value = { x: p.x, y: p.y, down: p.down, scatter: 0 };
    }
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepCymatics(s, dt * (slowM.value ? 0.22 : 1), CYM_DEFAULTS);
    frame.value = frame.value + 1;
    const cb = tune.current.onTune;
    if (cb && (frame.value & 7) === 0) {
      const hz = cymHz(s);
      const [m, n] = cymModePair(s);
      if (hz !== tune.current.hz || m !== tune.current.m || n !== tune.current.n) {
        tune.current.hz = hz;
        tune.current.m = m;
        tune.current.n = n;
        runOnJS(cb)(hz, m, n);
      }
    }
  });

  return (
    <View
      style={[{ width: CYM_W, height: CYM_H, borderRadius: 18, overflow: "hidden", backgroundColor: CYM_BACKGROUND }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width: CYM_W, height: CYM_H }}>
        <Fill color={CYM_BACKGROUND} />
        <RoundedRect x={0} y={0} width={CYM_W} height={CYM_H} r={0}>
          <LinearGradient start={vec(0, 0)} end={vec(CYM_W * 0.4, CYM_H)} colors={[CYM_BG_TOP, CYM_BG_BOTTOM]} />
        </RoundedRect>
        <RoundedRect x={PLATE_X} y={PLATE_Y} width={PLATE_S} height={PLATE_S} r={CYM_PLATE_RADIUS}>
          <LinearGradient start={vec(PLATE_X, PLATE_Y)} end={vec(PLATE_X, PLATE_Y + PLATE_S)} colors={[CYM_PLATE_TOP, CYM_PLATE_BOTTOM]} />
        </RoundedRect>
        <Circle cx={PLATE_X + 66} cy={PLATE_Y + 52} r={190} color={CYM_SHEEN}>
          <RadialGradient start={vec(0, 0)} end={vec(0, 190)} colors={[CYM_SHEEN, "rgba(255,255,255,0)"]} />
        </Circle>
        <Group clip={rrect(rect(PLATE_X, PLATE_Y, PLATE_S, PLATE_S), CYM_PLATE_RADIUS, CYM_PLATE_RADIUS)}>
          {SIZES.map((g) => <GrainGlow key={`g${g}`} sim={sim} frame={frame} big={g} />)}
          {SIZES.map((g) => <GrainCore key={`c${g}`} sim={sim} frame={frame} big={g} />)}
        </Group>
        <RoundedRect
          x={PLATE_X + 0.5} y={PLATE_Y + 0.5} width={PLATE_S - 1} height={PLATE_S - 1} r={CYM_PLATE_RADIUS}
          color={CYM_PLATE_RIM} style="stroke" strokeWidth={1}
        />
        {BOLTS.map((b, i) => (
          <Group key={i}>
            <Circle cx={b.cx} cy={b.cy} r={2.6} color={CYM_BOLT} />
            <Circle cx={b.cx - 0.7} cy={b.cy - 0.7} r={0.9} color={CYM_BOLT_HI} />
          </Group>
        ))}
        <FingerPad pointer={pointer} />
      </Canvas>
    </View>
  );
}
