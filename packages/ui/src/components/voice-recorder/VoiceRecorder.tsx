// Nativelet Voice Recorder. MIT: retain the accompanying LICENSE.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, Pressable, Text, View, type ViewStyle } from "react-native";
import { Canvas, Circle, Group, Path, Points, RoundedRect } from "@shopify/react-native-skia";
import Animated, { useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import {
  BAR_COUNT, BAR_H, BAR_W, BAR_X, BAR_Y, LOCK_CX, LOCK_CY, LOCK_H, LOCK_W, MIC_CX, MIC_CY, MIC_R,
  REC_H, REC_W, TIMER_X, WAVE_CY, DOT_X, barSegment, cancelWash, clamp01, createRecorder,
  recorderLockedCancel, recorderLockedSend, recorderPressEnd, recorderPressMove, recorderPressStart,
  stepRecorder, formatClock, type RecorderEvent, type RecorderPhase, type RecorderState,
} from "./recorderMath";
import {
  REC_BAR_BG, REC_BAR_BORDER, REC_GREEN, REC_GREEN_SOFT, REC_RED, REC_RED_SOFT, REC_TEXT_FAINT, REC_WAVE,
} from "./recorderDesign";

export type VoiceMessage = { seconds: number; samples: number[] };

export type VoiceRecorderProps = {
  onSend?: (message: VoiceMessage) => void;
  onCancel?: () => void;
  onFeedback?: (event: "touch" | "start" | "lock" | "cancel" | "send") => void;
  slowMotion?: boolean;
  reducedMotion?: boolean;
  label?: string;
  style?: ViewStyle;
};

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

function barsToPoints(s: RecorderState): { x: number; y: number }[] {
  'worklet';
  const wash = cancelWash(s);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const seg = barSegment(s, i);
    out.push({ x: seg.x + wash.dx, y: seg.y0 }, { x: seg.x + wash.dx, y: seg.y1 });
  }
  return out;
}

function Waveform({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const points = useDerivedValue(() => {
    frame.value;
    return barsToPoints(sim.value);
  });
  const opacity = useDerivedValue(() => {
    const s = sim.value;
    if (s.phase === "idle" || s.phase === "pressing") return 0;
    if (s.phase === "sending" || s.phase === "cancelling") return 1 - clamp01(s.anim);
    return 1;
  });
  return (
    <Group opacity={opacity}>
      <Points points={points} mode="lines" color={REC_WAVE} style="stroke" strokeWidth={2.6} strokeCap="round" />
    </Group>
  );
}

function RecordDot({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const opacity = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    if (s.phase === "idle" || s.phase === "pressing") return 0;
    if (s.phase === "sending" || s.phase === "cancelling") return 1 - clamp01(s.anim);
    return 0.55 + 0.45 * Math.sin(s.t * 4.2);
  });
  return <Circle cx={DOT_X} cy={MIC_CY} r={5} color={REC_RED} opacity={opacity} />;
}

function LockCapsule({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const opacity = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    if (s.phase === "pressing") return 0.4;
    if (s.phase === "recording") return 1;
    return 0;
  });
  const fill = useDerivedValue(() => {
    frame.value;
    return sim.value.lock;
  });
  const transform = useDerivedValue(() => {
    frame.value;
    return [{ translateX: LOCK_CX }, { translateY: LOCK_CY }, { scale: 1 + sim.value.lockPop * 0.35 }];
  });
  return (
    <Group opacity={opacity} transform={transform}>
      <RoundedRect x={-LOCK_W / 2} y={-LOCK_H / 2} width={LOCK_W} height={LOCK_H} r={22} color={REC_GREEN} opacity={0.12} />
      <RoundedRect x={-LOCK_W / 2 + 4} y={-LOCK_H / 2 + 4} width={LOCK_W - 8} height={LOCK_H - 8} r={18} color={REC_BAR_BG} />
      <LockFill fill={fill} />
      <Group transform={[{ translateY: -LOCK_H / 2 + 15 }]}>
        <Path path="M -5 4 L 0 -2 L 5 4" color={REC_TEXT_FAINT} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" />
      </Group>
      <Group transform={[{ translateY: LOCK_H / 2 - 21 }]}>
        <Path path="M -4.5 0 L -4.5 -3.5 A 4.5 4.5 0 0 1 4.5 -3.5 L 4.5 0" color={REC_GREEN} style="stroke" strokeWidth={1.8} strokeCap="round" />
        <RoundedRect x={-7} y={0} width={14} height={11} r={3} color={REC_GREEN} />
      </Group>
    </Group>
  );
}

function LockFill({ fill }: { fill: { value: number } }) {
  const height = useDerivedValue(() => (LOCK_H - 8) * fill.value);
  const y = useDerivedValue(() => LOCK_H / 2 - 4 - height.value);
  const r = useDerivedValue(() => Math.min(18, height.value / 2));
  return <RoundedRect x={-LOCK_W / 2 + 4} y={y} width={LOCK_W - 8} height={height} r={r} color={REC_GREEN_SOFT} />;
}

function MicGlyph({ sending }: { sending: { value: number } }) {
  // Mic: capsule + cradle arc + stem. Fades into a check while sending.
  const micOpacity = useDerivedValue(() => 1 - sending.value);
  const checkOpacity = useDerivedValue(() => sending.value);
  return (
    <Group>
      <Group opacity={micOpacity}>
        <RoundedRect x={-5} y={-10} width={10} height={15} r={5} color="#ffffff" />
        <Path path="M -8.5 -2 A 8.5 8.5 0 0 0 8.5 -2" color="#ffffff" style="stroke" strokeWidth={1.9} strokeCap="round" />
        <Path path="M 0 6.5 L 0 10 M -4.5 10 L 4.5 10" color="#ffffff" style="stroke" strokeWidth={1.9} strokeCap="round" />
      </Group>
      <Group opacity={checkOpacity}>
        <Path path="M -7 0.5 L -2.5 5 L 7 -4.5" color="#ffffff" style="stroke" strokeWidth={2.6} strokeCap="round" strokeJoin="round" />
      </Group>
    </Group>
  );
}

function TrashGlyph() {
  return (
    <Group>
      <RoundedRect x={-4.5} y={-3} width={9} height={9} r={1.6} color="transparent" style="stroke" strokeWidth={1.6} />
      <Path path="M -6 -5 L 6 -5 M -2.2 -5 L -2.2 -7 L 2.2 -7 L 2.2 -5 M -1.6 -0.5 L -1.6 3.5 M 1.6 -0.5 L 1.6 3.5" color={REC_RED} style="stroke" strokeWidth={1.6} strokeCap="round" />
    </Group>
  );
}

function MicButton({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const transform = useDerivedValue(() => {
    frame.value;
    return [{ translateX: MIC_CX }, { translateY: MIC_CY }, { scale: sim.value.micScale }];
  });
  const sending = useDerivedValue(() => {
    frame.value;
    return sim.value.phase === "sending" ? clamp01(sim.value.anim * 1.6) : 0;
  });
  const redOpacity = useDerivedValue(() => {
    frame.value;
    return sim.value.phase === "cancelling" ? 1 : 0;
  });
  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={MIC_R} color={REC_GREEN} />
      <Circle cx={0} cy={0} r={MIC_R} color={REC_RED} opacity={redOpacity} />
      <MicGlyph sending={sending} />
    </Group>
  );
}

function CancelChevrons({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const opacity = useDerivedValue(() => {
    frame.value;
    const s = sim.value;
    if (s.phase !== "recording" && s.phase !== "pressing") return 0;
    return clamp01(1 - s.cancel * 1.6) * 0.9;
  });
  return (
    <Group opacity={opacity} transform={[{ translateX: TIMER_X + 52 }, { translateY: MIC_CY }]}>
      <Path path="M 3 -5 L -3 0 L 3 5" color={REC_TEXT_FAINT} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" />
      <Path path="M 3 -5 L -3 0 L 3 5" color={REC_TEXT_FAINT} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" opacity={0.5} transform={[{ translateX: 9 }]} />
    </Group>
  );
}

function RedWash({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const opacity = useDerivedValue(() => {
    frame.value;
    return cancelWash(sim.value).alpha;
  });
  return <RoundedRect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} r={30} color={REC_RED} opacity={opacity} />;
}

function LockedGlyphs({ sim, frame }: { sim: { value: RecorderState }; frame: { value: number } }) {
  const opacity = useDerivedValue(() => {
    frame.value;
    return sim.value.phase === "locked" ? 1 : 0;
  });
  return (
    <Group opacity={opacity}>
      <Group transform={[{ translateX: BAR_X + 34 }, { translateY: MIC_CY }]}>
        <Circle cx={0} cy={0} r={20} color={REC_RED_SOFT} />
        <TrashGlyph />
      </Group>
    </Group>
  );
}

function CancelHint({ sim }: { sim: { value: RecorderState } }) {
  const style = useAnimatedStyle(() => ({
    opacity: clamp01(1 - sim.value.cancel * 1.6),
    transform: [{ translateX: -sim.value.cancel * 28 }],
  }));
  return (
    <Animated.Text pointerEvents="none" style={[{ position: "absolute", left: TIMER_X + 66, top: MIC_CY - 8, color: REC_TEXT_FAINT, fontSize: 12 }, style]}>
      slide to cancel
    </Animated.Text>
  );
}

export function VoiceRecorder({
  onSend,
  onCancel,
  onFeedback,
  slowMotion = false,
  reducedMotion,
  label,
  style,
}: VoiceRecorderProps) {
  const [systemReduce, setSystemReduce] = useState(false);
  const reduce = reducedMotion ?? systemReduce;
  const sim = useSharedValue<RecorderState>(createRecorder());
  const frame = useSharedValue(0);
  const slowM = useSharedValue(false);
  const [ui, setUi] = useState<{ phase: RecorderPhase; seconds: number }>({ phase: "idle", seconds: 0 });
  const latest = useRef({ reduce, onSend, onCancel, onFeedback });
  latest.current.reduce = reduce;
  latest.current.onSend = onSend;
  latest.current.onCancel = onCancel;
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
    sim.value.reduced = reduce;
  }, [reduce, sim]);

  // Mirror coarse UI (phase + whole seconds) and drain sim events into the
  // callbacks. Polling on a light interval keeps the worklet loop free of
  // runOnJS chatter; the frame clock above drives the fine animation.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sim.value;
      if (s.events.length) {
        const events = s.events.splice(0, s.events.length) as RecorderEvent[];
        for (const ev of events) {
          if (ev.type === "start") latest.current.onFeedback?.("start");
          else if (ev.type === "lock") latest.current.onFeedback?.("lock");
          else if (ev.type === "cancel") {
            latest.current.onCancel?.();
            latest.current.onFeedback?.("cancel");
          } else {
            latest.current.onSend?.({ seconds: ev.seconds, samples: ev.samples });
            latest.current.onFeedback?.("send");
          }
        }
      }
      setUi((prev) => {
        const seconds = Math.floor(s.seconds);
        return prev.phase === s.phase && prev.seconds === seconds ? prev : { phase: s.phase, seconds };
      });
    }, 80);
    return () => clearInterval(id);
  }, [sim]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (sim.value.phase !== "idle") return false;
          return evt.nativeEvent.locationX > MIC_CX - MIC_R - 14;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          recorderPressStart(sim.value);
          latest.current.onFeedback?.("touch");
        },
        onPanResponderMove: (evt, gesture) => {
          recorderPressMove(sim.value, gesture.dx, gesture.dy);
        },
        onPanResponderRelease: () => {
          recorderPressEnd(sim.value);
        },
        onPanResponderTerminate: () => {
          recorderPressEnd(sim.value);
        },
      }),
    [sim],
  );

  useFrameCallback((info) => {
    const s = sim.value;
    const dt = Math.min(48, info.timeSincePreviousFrame ?? 16.7) / 1000;
    stepRecorder(s, dt * (slowM.value ? 0.25 : 1));
    frame.value = frame.value + 1;
  });

  const recording = ui.phase === "recording" || ui.phase === "locked" || ui.phase === "cancelling" || ui.phase === "sending";
  const defaultLabel = recording
    ? `Recording voice message, ${formatClock(ui.seconds)}. Slide left to cancel or drag up to lock.`
    : "Voice message button. Press and hold to record, slide left to cancel, drag up to lock. Tap to record hands free.";

  return (
    <View style={[{ width: REC_W, height: REC_H }, style]} accessibilityRole="button" accessibilityLabel={label ?? defaultLabel} {...pan.panHandlers}>
      <CanvasKeepAlive />
      <Canvas pointerEvents="none" style={{ width: REC_W, height: REC_H }}>
        <RoundedRect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} r={30} color={REC_BAR_BG} />
        <RoundedRect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} r={30} color={REC_BAR_BORDER} style="stroke" strokeWidth={1} />
        <RedWash sim={sim} frame={frame} />
        <RecordDot sim={sim} frame={frame} />
        <Waveform sim={sim} frame={frame} />
        <CancelChevrons sim={sim} frame={frame} />
        <LockedGlyphs sim={sim} frame={frame} />
        <MicButton sim={sim} frame={frame} />
        <LockCapsule sim={sim} frame={frame} />
      </Canvas>
      {ui.phase === "idle" || ui.phase === "pressing" ? (
        <Text pointerEvents="none" style={{ position: "absolute", left: BAR_X + 22, top: MIC_CY - 9, color: REC_TEXT_FAINT, fontSize: 15 }}>
          Message
        </Text>
      ) : null}
      {recording && ui.phase !== "sending" && ui.phase !== "cancelling" ? (
        <Text pointerEvents="none" style={{ position: "absolute", left: TIMER_X, top: MIC_CY - 8, color: "#1d2b23", fontSize: 13, fontVariant: ["tabular-nums"] }}>
          {formatClock(ui.seconds)}
        </Text>
      ) : null}
      {ui.phase === "recording" ? <CancelHint sim={sim} /> : null}
      {ui.phase === "locked" ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard recording"
            onPress={() => recorderLockedCancel(sim.value)}
            style={{ position: "absolute", left: BAR_X + 34 - 24, top: MIC_CY - 24, width: 48, height: 48 }}
            hitSlop={6}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send voice message"
            onPress={() => recorderLockedSend(sim.value)}
            style={{ position: "absolute", left: MIC_CX - 26, top: MIC_CY - 26, width: 52, height: 52 }}
            hitSlop={6}
          />
        </>
      ) : null}
    </View>
  );
}

export default VoiceRecorder;
