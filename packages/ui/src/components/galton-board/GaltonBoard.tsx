import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, View, useWindowDimensions, type ViewStyle } from "react-native";
import {
  Canvas, Circle, DashPathEffect, Group, Path, Points, RoundedRect, Skia, vec,
} from "@shopify/react-native-skia";
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  GALTON_DEFAULTS, createGalton, dropOne, resetGalton, setPouring, setTiltTarget, stepGalton,
  type GaltonState,
} from "./galtonMath";
import {
  BALL_BASE, BALL_HI, BALL_R, BALL_RIM, BIN_TOP, BOARD_BACKGROUND, BOARD_SCALE, CENTER_X, CENTER_Y,
  CURVE_INK, DIVIDER, DIVIDER_DARK, FLOOR_Y, FRAME_EDGE, FRAME_OUTER, FUNNEL, FUNNEL_DARK,
  GALTON_H, GALTON_W, PANEL, PANEL_SHADOW, PEG_BASE, PEG_HI, PEG_R, PEG_RIM, PEG_Y0, ROWS,
  WALL_L, WALL_R, binCenter, dividerX, pegX, pegY,
} from "./galtonDesign";

export type GaltonBoardProps = {
  slowMotion?: boolean;
  reducedMotion?: boolean;
  onFeedback?: (event: "drop" | "pour" | "clear" | "impact") => void;
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

const PEGS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (let row = 1; row <= ROWS; row++) for (let j = 0; j < row; j++) out.push({ x: pegX(row, j), y: pegY(row) });
  return out;
})();
const PEG_POINTS = PEGS.map((p) => vec(p.x, p.y));
const PEG_HI_POINTS = PEGS.map((p) => vec(p.x - PEG_R * 0.32, p.y - PEG_R * 0.36));
const DIVIDERS = Array.from({ length: ROWS }, (_, k) => dividerX(k));

const FUNNEL_PATH = (() => {
  const p = Skia.Path.Make();
  p.moveTo(CENTER_X - 44, 40);
  p.lineTo(CENTER_X + 44, 40);
  p.lineTo(CENTER_X + 10, 96);
  p.lineTo(CENTER_X + 10, 112);
  p.lineTo(CENTER_X - 10, 112);
  p.lineTo(CENTER_X - 10, 96);
  p.close();
  return p;
})();
const FUNNEL_LIP = (() => {
  const p = Skia.Path.Make();
  p.moveTo(CENTER_X - 44, 40);
  p.lineTo(CENTER_X - 10, 96);
  p.moveTo(CENTER_X + 44, 40);
  p.lineTo(CENTER_X + 10, 96);
  return p;
})();

/* Binomial reference curve for 10 rows: Pascal weights / 2^10, drawn dashed
   over the bins once enough beads have settled. The curve is the theory the
   falling beads are measuring - the histogram itself is pure physics. */
const PASCAL = [1, 10, 45, 120, 210, 252, 210, 120, 45, 10, 1];
const CURVE_MIN_SETTLED = 40;

export function GaltonBoard({
  slowMotion = false,
  reducedMotion,
  onFeedback,
  label = "Galton board",
  style,
}: GaltonBoardProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const { width: winW } = useWindowDimensions();
  const scale = Math.min(1, (winW - 48) / GALTON_W);
  const dispW = GALTON_W * scale;
  const dispH = GALTON_H * scale;
  const sim = useSharedValue<GaltonState>(createGalton(GALTON_DEFAULTS));
  const frame = useSharedValue(0);
  const pouringSV = useSharedValue(false);
  /* Commands from JS-thread gesture handlers to the UI-thread sim. The sim
     object lives on the UI runtime; mutating sim.value from the JS thread is
     lost, so gestures set primitive flags that the frame callback applies. */
  const dropCmd = useSharedValue(0);
  const resetCmd = useSharedValue(0);
  const tiltSV = useSharedValue(0);
  const slowM = useSharedValue(false);
  const reduceM = useSharedValue(false);
  const lastClick = useSharedValue(-10);
  const latest = useRef({ reduce, onFeedback, scale });
  latest.current = { reduce, onFeedback, scale };

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
    sim.value = createGalton(GALTON_DEFAULTS);
    if (reduce) {
      /* Reduced motion: pre-run the whole pour off-screen and show the
         finished bell curve as a still picture. */
      const s = sim.value;
      setPouring(s, true);
      for (let f = 0; f < 14 * 60; f++) stepGalton(s, 1 / 60, GALTON_DEFAULTS);
      setPouring(s, false);
      for (let f = 0; f < 26 * 60; f++) stepGalton(s, 1 / 60, GALTON_DEFAULTS);
      /* Reassign so the pre-run state reaches the UI runtime (a JS-side
         sim.value read is a detached copy on native). */
      sim.value = s;
    }
    frame.value = frame.value + 1;
  }, [reduce, reduceM, sim, frame]);

  const gesture = useRef({ moved: false, holdTimer: 0, holding: false });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.reduce,
        onPanResponderGrant: () => {
          const g = gesture.current;
          g.moved = false;
          g.holding = false;
          g.holdTimer = window.setTimeout(() => {
            g.holding = true;
            pouringSV.value = true;
            latest.current.onFeedback?.("pour");
          }, 230);
        },
        onPanResponderMove: (_evt, gs) => {
          const g = gesture.current;
          if (!g.moved && Math.abs(gs.dx) > 10) {
            g.moved = true;
            if (!g.holding) {
              window.clearTimeout(g.holdTimer);
            } else {
              g.holding = false;
              pouringSV.value = false;
            }
          }
          if (g.moved) tiltSV.value = gs.dx / 420;
        },
        onPanResponderRelease: (_evt, gs) => {
          const g = gesture.current;
          window.clearTimeout(g.holdTimer);
          if (g.holding) {
            g.holding = false;
            pouringSV.value = false;
          } else if (Math.abs(gs.vx) > 1.1 || Math.abs(gs.dx) > 70) {
            resetCmd.value += 1;
            latest.current.onFeedback?.("clear");
          } else if (!g.moved) {
            dropCmd.value += 1;
            latest.current.onFeedback?.("drop");
          }
          tiltSV.value = 0;
        },
        onPanResponderTerminate: () => {
          const g = gesture.current;
          window.clearTimeout(g.holdTimer);
          g.holding = false;
          pouringSV.value = false;
          tiltSV.value = 0;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [sim, pouringSV],
  );

  useFrameCallback((info) => {
    if (reduceM.value) return;
    const s = sim.value;
    if (resetCmd.value > 0) {
      resetGalton(s);
      resetCmd.value = 0;
    }
    while (dropCmd.value > 0) {
      dropOne(s, GALTON_DEFAULTS);
      dropCmd.value -= 1;
    }
    setTiltTarget(s, GALTON_DEFAULTS, tiltSV.value);
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    setPouring(s, pouringSV.value);
    stepGalton(s, dt * (slowM.value ? 0.25 : 1), GALTON_DEFAULTS);
    if (s.lastImpactAt > lastClick.value + 0.1) {
      lastClick.value = s.lastImpactAt;
      const cb = latest.current.onFeedback;
      if (cb) runOnJS(cb)("impact");
    }
    frame.value = frame.value + 1;
  });

  const tilt = useDerivedValue(() => {
    frame.value;
    return sim.value.tilt;
  });
  const boardTransform = useDerivedValue(() => [
    { translateX: CENTER_X },
    { translateY: CENTER_Y },
    { rotate: tilt.value },
    { scale: BOARD_SCALE },
    { translateX: -CENTER_X },
    { translateY: -CENTER_Y },
  ]);

  /* Three batched passes: contact shadow (awake beads only), body, and a
     shared highlight that reads as one light source over all the beads. */
  const shadowPoints = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < s.n; i++) {
      if (s.sleep[i]) continue;
      const sx = Math.min(WALL_R - 6, Math.max(WALL_L + 6, s.x[i]));
      const depth = Math.min(1, Math.max(0, (FLOOR_Y - s.y[i]) / (FLOOR_Y - PEG_Y0)));
      if (s.y[i] < BIN_TOP) out.push({ x: sx, y: s.y[i] + 10 + depth * 6 });
    }
    return out;
  });
  const bodyPoints = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < s.n; i++) out.push({ x: s.x[i], y: s.y[i] });
    return out;
  });
  const hiPoints = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < s.n; i++) out.push({ x: s.x[i] - BALL_R * 0.3, y: s.y[i] - BALL_R * 0.34 });
    return out;
  });

  const curvePath = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.settled < CURVE_MIN_SETTLED) return p;
    const maxH = (FLOOR_Y - BIN_TOP) * 0.82;
    for (let k = 0; k <= ROWS; k++) {
      const expected = (s.n * PASCAL[k]) / 1024;
      const h = Math.min(maxH, expected * (maxH / ((s.n * 252) / 1024)));
      const x = binCenter(k);
      const y = FLOOR_Y - h;
      if (k === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
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
          <RoundedRect x={0} y={0} width={GALTON_W} height={GALTON_H} r={18} color={BOARD_BACKGROUND} />
          <Group transform={boardTransform}>
            <RoundedRect x={10} y={6} width={GALTON_W - 20} height={GALTON_H - 12} r={14} color={FRAME_EDGE} />
            <RoundedRect x={14} y={10} width={GALTON_W - 28} height={GALTON_H - 20} r={12} color={FRAME_OUTER} />
            <RoundedRect x={WALL_L} y={26} width={WALL_R - WALL_L} height={FLOOR_Y - 26 + 6} r={4} color={PANEL_SHADOW} />
            <RoundedRect x={WALL_L + 3} y={26} width={WALL_R - WALL_L - 6} height={FLOOR_Y - 26} r={4} color={PANEL} />
            <Path path={FUNNEL_PATH} color={FUNNEL} />
            <Path path={FUNNEL_LIP} color={FUNNEL_DARK} style="stroke" strokeWidth={2.5} />
            {DIVIDERS.map((x, k) => (
              <React.Fragment key={k}>
                <RoundedRect x={x - 2.5} y={BIN_TOP} width={5} height={FLOOR_Y - BIN_TOP} r={2} color={DIVIDER} />
                <Circle cx={x} cy={BIN_TOP} r={2.5} color={DIVIDER_DARK} />
              </React.Fragment>
            ))}
            <Points points={PEG_POINTS} mode="points" color={PEG_RIM} style="stroke" strokeWidth={PEG_R * 2 + 2} strokeCap="round" />
            <Points points={PEG_POINTS} mode="points" color={PEG_BASE} style="stroke" strokeWidth={PEG_R * 2 - 1} strokeCap="round" />
            <Points points={PEG_HI_POINTS} mode="points" color={PEG_HI} style="stroke" strokeWidth={PEG_R * 0.8} strokeCap="round" />
            <Points points={shadowPoints} mode="points" color="#3a2f22" style="stroke" strokeWidth={BALL_R * 1.7} strokeCap="round" opacity={0.16} />
            <Points points={bodyPoints} mode="points" color={BALL_RIM} style="stroke" strokeWidth={BALL_R * 2 + 1.6} strokeCap="round" />
            <Points points={bodyPoints} mode="points" color={BALL_BASE} style="stroke" strokeWidth={BALL_R * 2 - 1.2} strokeCap="round" />
            <Points points={hiPoints} mode="points" color={BALL_HI} style="stroke" strokeWidth={BALL_R * 0.85} strokeCap="round" />
            <Path path={curvePath} color={CURVE_INK} style="stroke" strokeWidth={2} opacity={0.85}>
              <DashPathEffect intervals={[7, 6]} />
            </Path>
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}
