import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, type ViewStyle } from "react-native";
import {
  Canvas, Circle, Fill, Group, LinearGradient, Points, RadialGradient, RoundedRect, vec,
} from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  GL_CX, GL_CY, GL_R, PG_BOLTS, PG_BR, PG_BSEG, PG_H, PG_SEG, PG_W,
  createPlasma, plasmaPointer, stepPlasma, type PlasmaState,
} from "./plasmaMath";
import {
  PG_BACKGROUND, PG_BASE_BOTTOM, PG_BASE_RIM, PG_BASE_TOP, PG_BG_BOTTOM, PG_BG_TOP, PG_CORE, PG_CORE_W,
  PG_ELECTRODE, PG_FRESNEL, PG_GLASS_CENTER, PG_GLASS_EDGE, PG_GLOW, PG_GLOW_W, PG_HAZE, PG_MID, PG_MID_W,
  PG_RIM, PG_SPECULAR, PG_TOUCH,
} from "./plasmaDesign";

export type PlasmaGlobeProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  onFeedback?: (event: "touch" | "release") => void;
  label?: string;
  style?: ViewStyle;
};

type Pointer = { x: number; y: number; down: number };
type Sim = { value: PlasmaState };
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

// Line segments (pairs of points) for one bolt class.
function segmentPoints(s: PlasmaState, kind: number) {
  'worklet';
  const src = kind === 0 ? s.main : s.branches;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < src.length; i += 4) {
    out.push({ x: src[i], y: src[i + 1] });
    out.push({ x: src[i + 2], y: src[i + 3] });
  }
  return out;
}

type PassProps = { sim: Sim; frame: Frame; kind: number };

function BoltPass({ sim, frame, kind }: PassProps) {
  const points = useDerivedValue(() => {
    frame.value;
    return segmentPoints(sim.value, kind);
  });
  return (
    <Group blendMode="plus">
      <Points points={points} mode="lines" color={PG_GLOW[kind]} style="stroke" strokeWidth={PG_GLOW_W[kind]} strokeCap="round" />
      <Points points={points} mode="lines" color={PG_MID[kind]} style="stroke" strokeWidth={PG_MID_W[kind]} strokeCap="round" />
      <Points points={points} mode="lines" color={PG_CORE[kind]} style="stroke" strokeWidth={PG_CORE_W[kind]} strokeCap="round" />
    </Group>
  );
}

function ElectrodeGlow({ sim, frame }: { sim: Sim; frame: Frame }) {
  const r1 = useDerivedValue(() => {
    frame.value;
    return 34 + 8 * sim.value.pulse;
  });
  const op = useDerivedValue(() => {
    frame.value;
    return 0.75 * sim.value.glow;
  });
  return (
    <Group opacity={op}>
      <Circle cx={GL_CX} cy={GL_CY} r={r1}>
        <RadialGradient c={vec(GL_CX, GL_CY)} r={44} colors={["rgba(210,120,255,0.55)", "rgba(120,40,255,0)"]} />
      </Circle>
    </Group>
  );
}

function Fingertip({ pointer, sim, frame }: { pointer: { value: Pointer }; sim: Sim; frame: Frame }) {
  const cx = useDerivedValue(() => {
    const p = pointer.value;
    const dx = p.x - GL_CX;
    const dy = p.y - GL_CY;
    const d = Math.hypot(dx, dy);
    const lim = GL_R * 0.965;
    return d > lim ? GL_CX + (dx / d) * lim : p.x;
  });
  const cy = useDerivedValue(() => {
    const p = pointer.value;
    const dx = p.x - GL_CX;
    const dy = p.y - GL_CY;
    const d = Math.hypot(dx, dy);
    const lim = GL_R * 0.965;
    return d > lim ? GL_CY + (dy / d) * lim : p.y;
  });
  const opacity = useDerivedValue(() => {
    frame.value;
    return Math.min(1, sim.value.attract * 1.2);
  });
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={30} color={PG_TOUCH[0]} />
      <Circle cx={cx} cy={cy} r={15} color={PG_TOUCH[1]} />
      <Circle cx={cx} cy={cy} r={6} color={PG_TOUCH[2]} />
    </Group>
  );
}

const BOLT_KINDS = [0, 1];

function Filaments({ sim, frame }: { sim: Sim; frame: Frame }) {
  const glow = useDerivedValue(() => {
    frame.value;
    return sim.value.glow > 1 ? 1 : sim.value.glow;
  });
  return (
    <Group opacity={glow}>
      {BOLT_KINDS.map((k) => <BoltPass key={`b${k}`} sim={sim} frame={frame} kind={k} />)}
    </Group>
  );
}

export function PlasmaGlobe({
  slowMotion = false,
  reducedMotion,
  onFeedback,
  label = "A glass plasma globe. Purple and pink electric filaments branch from a glowing centre electrode to the glass. Touch the globe and the filaments gather at your fingertip and follow your drag. Release and they scatter back into wandering arcs",
  style,
}: PlasmaGlobeProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue<PlasmaState>(createPlasma());
  const frame = useSharedValue(0);
  const pointer = useSharedValue<Pointer>({ x: GL_CX, y: GL_CY, down: 0 });
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
      // Still picture: a fixed set of filaments, no motion.
      sim.value = createPlasma(20261102, true);
      pointer.value = { x: GL_CX, y: GL_CY, down: 0 };
      frame.value = frame.value + 1;
    }
  }, [reduce, reduceM, sim, frame, pointer]);

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
    plasmaPointer(s, p.x, p.y, p.down === 1);
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepPlasma(s, dt * (slowM.value ? 0.22 : 1), 1);
    frame.value = frame.value + 1;
  });

  return (
    <View
      style={[{ width: PG_W, height: PG_H, borderRadius: 18, overflow: "hidden", backgroundColor: PG_BACKGROUND }, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      {...pan.panHandlers}
    >
      {!reduce ? <CanvasKeepAlive /> : null}
      <Canvas pointerEvents="none" style={{ width: PG_W, height: PG_H }}>
        <Fill color={PG_BACKGROUND} />
        <RoundedRect x={0} y={0} width={PG_W} height={PG_H} r={0}>
          <LinearGradient start={vec(0, 0)} end={vec(PG_W * 0.4, PG_H)} colors={[PG_BG_TOP, PG_BG_BOTTOM]} />
        </RoundedRect>
        {/* Stand */}
        <RoundedRect x={GL_CX - 50} y={GL_CY + GL_R - 14} width={100} height={36} r={10}>
          <LinearGradient start={vec(0, GL_CY + GL_R - 14)} end={vec(0, GL_CY + GL_R + 22)} colors={[PG_BASE_TOP, PG_BASE_BOTTOM]} />
        </RoundedRect>
        <RoundedRect x={GL_CX - 78} y={GL_CY + GL_R + 12} width={156} height={34} r={12}>
          <LinearGradient start={vec(0, GL_CY + GL_R + 12)} end={vec(0, GL_CY + GL_R + 46)} colors={[PG_BASE_TOP, PG_BASE_BOTTOM]} />
        </RoundedRect>
        <RoundedRect x={GL_CX - 77.5} y={GL_CY + GL_R + 12.5} width={155} height={33} r={12} color={PG_BASE_RIM} style="stroke" strokeWidth={1} />
        {/* Glass */}
        <Circle cx={GL_CX} cy={GL_CY} r={GL_R}>
          <RadialGradient c={vec(GL_CX, GL_CY)} r={GL_R} colors={[PG_GLASS_CENTER, PG_GLASS_EDGE]} />
        </Circle>
        <Circle cx={GL_CX} cy={GL_CY} r={GL_R}>
          <RadialGradient c={vec(GL_CX, GL_CY)} r={GL_R * 0.62} colors={[PG_HAZE, "rgba(100,40,200,0)"]} />
        </Circle>
        <ElectrodeGlow sim={sim} frame={frame} />
        <Filaments sim={sim} frame={frame} />
        <Fingertip pointer={pointer} sim={sim} frame={frame} />
        {/* Electrode */}
        <Circle cx={GL_CX} cy={GL_CY} r={9}>
          <RadialGradient c={vec(GL_CX - 2, GL_CY - 2)} r={11} colors={[PG_ELECTRODE[0], PG_ELECTRODE[1], PG_ELECTRODE[2]]} />
        </Circle>
        {/* Glass rim, fresnel edge, highlights */}
        <Circle cx={GL_CX} cy={GL_CY} r={GL_R}>
          <RadialGradient c={vec(GL_CX, GL_CY)} r={GL_R} colors={["rgba(150,110,255,0)", "rgba(150,110,255,0)", PG_FRESNEL]} positions={[0, 0.82, 1]} />
        </Circle>
        <Circle cx={GL_CX} cy={GL_CY} r={GL_R - 0.5} color={PG_RIM} style="stroke" strokeWidth={1} />
        <RoundedRect x={GL_CX - 92} y={GL_CY - 112} width={110} height={52} r={26}>
          <LinearGradient start={vec(0, GL_CY - 112)} end={vec(0, GL_CY - 60)} colors={[PG_SPECULAR, "rgba(255,255,255,0)"]} />
        </RoundedRect>
        <RoundedRect x={GL_CX + 58} y={GL_CY + 74} width={46} height={22} r={11}>
          <LinearGradient start={vec(0, GL_CY + 74)} end={vec(0, GL_CY + 96)} colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.07)"]} />
        </RoundedRect>
      </Canvas>
    </View>
  );
}

export const PLASMA_COUNTS = { bolts: PG_BOLTS, branchesPerBolt: PG_BR, segments: PG_SEG, branchSegments: PG_BSEG };
