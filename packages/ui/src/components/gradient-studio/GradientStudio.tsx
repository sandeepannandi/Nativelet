// Nativelet Gradient Studio. MIT: retain the accompanying LICENSE.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, Pressable, Text, View, type ViewStyle } from "react-native";
import { Blur, Canvas, Circle, Group, LinearGradient, RoundedRect, Skia, SweepGradient, vec } from "@shopify/react-native-skia";
import {
  GS_H, GS_W, HANDLE_R, LOUPE_R, LOUPE_ZOOM, PIN_R, PREVIEW, PRESETS, RING_IN, RING_MID, RING_OUT,
  SQ, TRACK_H, TRACK_X0, TRACK_X1, TRACK_Y, WHEEL_CX, WHEEL_CY,
  addAtWidestGap, clamp01, createStudio, gradientRamp, gradientToCss, hsvToRgb, isAnimating, moveSelected, overlayFor,
  pointerDown, pointerMove, pointerUp, posToX, removeSelected, rgbToHex, selectNeighbour, selectedStop, sortedStops,
  startPreset, stepStudio, stopHex, svPoint, ringPoint, type Overlay, type Preset, type Studio,
} from "./gradientMath";
import { GS_BG, GS_BORDER, GS_HAIR, GS_INK, GS_REMOVE, GS_TEXT, HUE_COLORS } from "./gradientDesign";

export type GradientStop = { position: number; color: string };

export type GradientStudioProps = {
  /** Called whenever a stop moves, is recoloured, added or removed. Stops are sorted by position. */
  onChange?: (stops: GradientStop[], css: string) => void;
  onFeedback?: (event: "touch" | "select" | "add" | "remove" | "preset") => void;
  reducedMotion?: boolean;
  style?: ViewStyle;
};

function Wheel({ hue }: { hue: number }) {
  const pure = rgbToHex(hsvToRgb(hue, 1, 1));
  return (
    <Group>
      <Circle cx={WHEEL_CX} cy={WHEEL_CY} r={RING_MID} style="stroke" strokeWidth={RING_OUT - RING_IN}>
        <SweepGradient c={vec(WHEEL_CX, WHEEL_CY)} colors={HUE_COLORS} />
      </Circle>
      <RoundedRect x={WHEEL_CX - SQ} y={WHEEL_CY - SQ} width={SQ * 2} height={SQ * 2} r={10}>
        <LinearGradient start={vec(WHEEL_CX - SQ, 0)} end={vec(WHEEL_CX + SQ, 0)} colors={["#FFFFFF", pure]} />
      </RoundedRect>
      <RoundedRect x={WHEEL_CX - SQ} y={WHEEL_CY - SQ} width={SQ * 2} height={SQ * 2} r={10}>
        <LinearGradient start={vec(0, WHEEL_CY - SQ)} end={vec(0, WHEEL_CY + SQ)} colors={["rgba(0,0,0,0)", "#000000"]} />
      </RoundedRect>
    </Group>
  );
}

function Loupe({ o, hue, clip }: { o: Extract<Overlay, { kind: "loupe" }>; hue: number; clip: ReturnType<typeof Skia.Path.Make> }) {
  const a = clamp01(o.amount);
  return (
    <Group
      opacity={clamp01(a * 1.3)}
      transform={[{ translateX: o.lx }, { translateY: o.ly + (1 - a) * 18 }, { scale: 0.55 + 0.45 * a }]}
    >
      <Circle cx={0} cy={5} r={LOUPE_R + 3} color="rgba(13,31,22,0.22)">
        <Blur blur={7} />
      </Circle>
      <Circle cx={0} cy={0} r={LOUPE_R + 3} color="#FFFFFF" />
      <Group clip={clip}>
        <Circle cx={0} cy={0} r={LOUPE_R} color="#FFFFFF" />
        <Group transform={[{ scale: LOUPE_ZOOM }, { translateX: -o.tx }, { translateY: -o.ty }]}>
          <Wheel hue={hue} />
        </Group>
      </Group>
      <Circle cx={0} cy={0} r={LOUPE_R + 1.5} style="stroke" strokeWidth={3} color="#FFFFFF" />
      <Circle cx={0} cy={0} r={LOUPE_R + 3.2} style="stroke" strokeWidth={1} color={GS_HAIR} />
      <Circle cx={0} cy={0} r={9} style="stroke" strokeWidth={3.5} color="#FFFFFF" />
      <Circle cx={0} cy={0} r={10.6} style="stroke" strokeWidth={1} color="rgba(13,31,22,0.35)" />
      <Circle cx={0} cy={0} r={7.4} color={o.hex} />
    </Group>
  );
}

function Pin({ o }: { o: Extract<Overlay, { kind: "pin" }> }) {
  const a = clamp01(o.amount);
  return (
    <Group
      opacity={clamp01(a * 1.3) * (o.remove ? 0.55 : 1)}
      transform={[{ translateX: o.x }, { translateY: o.y + (1 - a) * 14 }, { scale: 0.5 + 0.5 * a }]}
    >
      <Circle cx={0} cy={4} r={PIN_R + 3} color="rgba(13,31,22,0.2)">
        <Blur blur={5} />
      </Circle>
      <Circle cx={0} cy={0} r={PIN_R + 3} color="#FFFFFF" />
      <Circle cx={0} cy={0} r={PIN_R} color={o.hex} />
      {o.remove ? <Circle cx={0} cy={0} r={PIN_R + 3} style="stroke" strokeWidth={2.5} color={GS_REMOVE} /> : null}
    </Group>
  );
}

function Handle({ view, id }: { view: Studio; id: number }) {
  const stop = view.stops.find((t) => t.id === id);
  if (!stop) return null;
  const selected = view.selected === id;
  const dragging = !!view.drag && view.drag.kind === "stop" && view.drag.id === id;
  const removing = dragging && view.drag && view.drag.kind === "stop" && view.drag.remove;
  const lifted = dragging ? 1 + 0.14 * clamp01(view.pin) : 1;
  const scale = (selected ? view.pop : 1) * lifted * (removing ? 0.8 : 1);
  return (
    <Group
      opacity={removing ? 0.45 : 1}
      transform={[{ translateX: posToX(stop.pos) }, { translateY: TRACK_Y }, { scale }]}
    >
      <Circle cx={0} cy={2} r={HANDLE_R + 1.5} color="rgba(13,31,22,0.14)">
        <Blur blur={3} />
      </Circle>
      <Circle cx={0} cy={0} r={HANDLE_R} color="#FFFFFF" />
      <Circle cx={0} cy={0} r={HANDLE_R - 4} color={stopHex(stop)} />
      <Circle cx={0} cy={0} r={HANDLE_R} style="stroke" strokeWidth={1} color={GS_HAIR} />
      {selected ? <Circle cx={0} cy={0} r={HANDLE_R + 3.5} style="stroke" strokeWidth={2.5} color={GS_INK} /> : null}
    </Group>
  );
}

function MiniRamp({ preset }: { preset: Preset }) {
  return (
    <Canvas style={{ width: 76, height: 30 }}>
      <RoundedRect x={0} y={0} width={76} height={30} r={9}>
        <LinearGradient start={vec(0, 0)} end={vec(76, 0)} colors={preset.colors} positions={preset.positions} />
      </RoundedRect>
    </Canvas>
  );
}

export function GradientStudio({ onChange, onFeedback, reducedMotion, style }: GradientStudioProps) {
  const [sysReduce, setSysReduce] = useState(false);
  const reduced = reducedMotion ?? sysReduce;
  const [view, setView] = useState<Studio>(() => createStudio(PRESETS[0], reduced));
  const ref = useRef(view);
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);
  const latest = useRef({ onChange, onFeedback });
  latest.current = { onChange, onFeedback };
  const loupeClip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(0, 0, LOUPE_R);
    return p;
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSysReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSysReduce);
    return () => sub.remove();
  }, []);

  const commit = useCallback((next: Studio) => {
    const prev = ref.current;
    ref.current = next;
    setView(next);
    if (next.stops !== prev.stops && latest.current.onChange) {
      const list = sortedStops(next.stops).map((s) => ({ position: s.pos, color: stopHex(s) }));
      latest.current.onChange(list, gradientToCss(next.stops));
    }
  }, []);

  const loop = useCallback(() => {
    const now = Date.now();
    const dt = Math.min(0.05, (now - lastT.current) / 1000);
    lastT.current = now;
    const next = stepStudio(ref.current, dt);
    commit(next);
    raf.current = isAnimating(next) ? requestAnimationFrame(loop) : null;
  }, [commit]);

  const kick = useCallback(() => {
    if (raf.current !== null) return;
    lastT.current = Date.now();
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  useEffect(() => {
    if (ref.current.reduced === reduced) return;
    commit({ ...ref.current, reduced });
    kick();
  }, [reduced, commit, kick]);

  const start = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX;
          const y = evt.nativeEvent.locationY;
          start.current = { x, y };
          const before = ref.current;
          const next = pointerDown(before, x, y);
          commit(next);
          latest.current.onFeedback?.(next.selected !== before.selected ? "select" : "touch");
          kick();
        },
        onPanResponderMove: (_evt, g) => {
          commit(pointerMove(ref.current, start.current.x + g.dx, start.current.y + g.dy));
          kick();
        },
        onPanResponderRelease: () => finish(),
        onPanResponderTerminate: () => finish(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  function finish() {
    const before = ref.current;
    const next = pointerUp(before);
    commit(next);
    if (next.stops.length > before.stops.length) latest.current.onFeedback?.("add");
    else if (next.stops.length < before.stops.length) latest.current.onFeedback?.("remove");
    kick();
  }

  const act = (fn: (s: Studio) => Studio, event?: "add" | "remove" | "select") => {
    const before = ref.current;
    const next = fn(before);
    if (next === before) return;
    commit(next);
    if (event) latest.current.onFeedback?.(event);
    kick();
  };
  const choosePreset = (p: Preset) => {
    commit(startPreset(ref.current, p));
    latest.current.onFeedback?.("preset");
    kick();
  };

  const ramp = gradientRamp(view.stops);
  const sel = selectedStop(view);
  const order = sortedStops(view.stops);
  const index = order.findIndex((t) => t.id === sel.id) + 1;
  const hex = stopHex(sel);
  const overlay = overlayFor(view);
  const handleIds = [...order.filter((t) => t.id !== view.selected), ...order.filter((t) => t.id === view.selected)].map((t) => t.id);
  const hp = ringPoint(sel.h);
  const sp = svPoint(sel.s, sel.v);

  const chip = { alignItems: "center" as const, gap: 5 };

  return (
    <View style={[{ width: GS_W, alignItems: "center", gap: 12 }, style]}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Gradient with ${view.stops.length} color stops. Stop ${index} of ${view.stops.length}, ${hex}, at ${Math.round(sel.pos * 100)} percent.`}
        accessibilityHint="Swipe up or down to move the selected stop. Double tap to select the next stop."
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }, { name: "addStop", label: "Add stop" }, { name: "removeStop", label: "Remove selected stop" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") act((s) => moveSelected(s, 0.05));
          else if (e.nativeEvent.actionName === "decrement") act((s) => moveSelected(s, -0.05));
          else if (e.nativeEvent.actionName === "addStop") act(addAtWidestGap, "add");
          else if (e.nativeEvent.actionName === "removeStop") act(removeSelected, "remove");
          else act((s) => selectNeighbour(s, 1), "select");
        }}
        style={{ width: GS_W, height: GS_H }}
      >
        <View pointerEvents="none">
          <Canvas style={{ width: GS_W, height: GS_H }}>
            <RoundedRect x={0.5} y={0.5} width={GS_W - 1} height={GS_H - 1} r={28} color={GS_BG} />
            <RoundedRect x={0.5} y={0.5} width={GS_W - 1} height={GS_H - 1} r={28} style="stroke" strokeWidth={1} color={GS_BORDER} />
            <RoundedRect x={PREVIEW.x} y={PREVIEW.y} width={PREVIEW.w} height={PREVIEW.h} r={PREVIEW.r}>
              <LinearGradient start={vec(PREVIEW.x, 0)} end={vec(PREVIEW.x + PREVIEW.w, 0)} colors={ramp.colors} positions={ramp.positions} />
            </RoundedRect>
            <RoundedRect x={PREVIEW.x} y={PREVIEW.y} width={PREVIEW.w} height={PREVIEW.h} r={PREVIEW.r} style="stroke" strokeWidth={1} color="rgba(13,31,22,0.08)" />
            <RoundedRect x={TRACK_X0} y={TRACK_Y - TRACK_H / 2} width={TRACK_X1 - TRACK_X0} height={TRACK_H} r={TRACK_H / 2}>
              <LinearGradient start={vec(TRACK_X0, 0)} end={vec(TRACK_X1, 0)} colors={ramp.colors} positions={ramp.positions} />
            </RoundedRect>
            <RoundedRect x={TRACK_X0} y={TRACK_Y - TRACK_H / 2} width={TRACK_X1 - TRACK_X0} height={TRACK_H} r={TRACK_H / 2} style="stroke" strokeWidth={1} color={GS_HAIR} />
            {handleIds.map((id) => <Handle key={id} view={view} id={id} />)}
            <Wheel hue={sel.h} />
            <Circle cx={hp.x} cy={hp.y} r={12} color="#FFFFFF" />
            <Circle cx={hp.x} cy={hp.y} r={12} style="stroke" strokeWidth={1} color="rgba(13,31,22,0.3)" />
            <Circle cx={hp.x} cy={hp.y} r={8.5} color={rgbToHex(hsvToRgb(sel.h, 1, 1))} />
            <Circle cx={sp.x} cy={sp.y} r={11} color={hex} />
            <Circle cx={sp.x} cy={sp.y} r={11} style="stroke" strokeWidth={3} color="#FFFFFF" />
            <Circle cx={sp.x} cy={sp.y} r={12.6} style="stroke" strokeWidth={1} color="rgba(13,31,22,0.35)" />
            {overlay && overlay.kind === "pin" ? <Pin o={overlay} /> : null}
            {overlay && overlay.kind === "loupe" ? <Loupe o={overlay} hue={sel.h} clip={loupeClip} /> : null}
          </Canvas>
        </View>
      </View>
      <Text style={{ color: GS_INK, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
        {hex}  ·  stop {index} of {view.stops.length}  ·  {Math.round(sel.pos * 100)}%
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {PRESETS.map((p) => (
          <Pressable key={p.name} accessibilityRole="button" accessibilityLabel={`${p.name} gradient`} onPress={() => choosePreset(p)} style={chip}>
            <MiniRamp preset={p} />
            <Text style={{ color: GS_TEXT, fontSize: 11 }}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
