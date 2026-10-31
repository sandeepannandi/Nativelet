// Nativelet Venom Button. MIT: retain the accompanying LICENSE.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Blur, Circle, ColorMatrix, Group, Paint, Path, RoundedRect, LinearGradient, vec, Canvas } from "@shopify/react-native-skia";
import { Skia } from "@shopify/react-native-skia";
import {
  PILL_CX, PILL_CY, PILL_H, PILL_W, VENOM_H, VENOM_W,
  GOO_ROOT, clampFinger, createVenom, drainEvents, gooMatrix, isAnimating, pillFrame, pointerDown, pointerMove, pointerUp,
  spikeCircles, stepVenom, strandCircles, strandRibbon, type Venom, type VenomEvent,
} from "./venomMath";
import { VENOM_BG, VENOM_GLOSS, VENOM_INK, VENOM_RIM, VENOM_TEXT } from "./venomDesign";

export type VenomButtonProps = {
  /** Text on the pill. */
  label?: string;
  /** Fired on a quick tap of the pill (grab-and-release drags do not press). */
  onPress?: () => void;
  /** Gesture feedback for haptics: sense | grab | release | press. */
  onFeedback?: (event: VenomEvent) => void;
  reducedMotion?: boolean;
  /** Plays the reach, grab and snap about four times slower so you can watch the goo. Ignored while Reduce Motion is on. */
  slowMotion?: boolean;
  style?: ViewStyle;
};

export function VenomButton({ label = "Hold me", onPress, onFeedback, reducedMotion, slowMotion = false, style }: VenomButtonProps) {
  const [sysReduce, setSysReduce] = useState(false);
  const reduced = reducedMotion ?? sysReduce;
  const [view, setView] = useState<Venom>(() => createVenom(reduced));
  const ref = useRef(view);
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);
  const latest = useRef({ onPress, onFeedback });
  latest.current = { onPress, onFeedback };

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSysReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSysReduce);
    return () => sub.remove();
  }, []);

  const commit = useCallback((next: Venom) => {
    ref.current = next;
    setView({ ...next });
    for (const event of drainEvents(next)) {
      latest.current.onFeedback?.(event);
      if (event === "press") {
        latest.current.onPress?.();
        AccessibilityInfo.announceForAccessibility?.("Pressed");
      }
    }
  }, []);

  const loop = useCallback(() => {
    const now = Date.now();
    const dt = Math.min(0.05, (now - lastT.current) / 1000);
    lastT.current = now;
    const next = stepVenom(ref.current, slowMotion && !ref.current.reduced ? dt / 4 : dt);
    commit(next);
    raf.current = isAnimating(next) || next.down ? requestAnimationFrame(loop) : null;
  }, [commit, slowMotion]);

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
    ref.current.reduced = reduced;
    commit(ref.current);
    kick();
  }, [reduced, commit, kick]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => { const p = clampFinger(evt.nativeEvent.locationX, evt.nativeEvent.locationY); commit(pointerDown(ref.current, p.x, p.y)); kick(); },
      onPanResponderMove: (evt) => { const p = clampFinger(evt.nativeEvent.locationX, evt.nativeEvent.locationY); commit(pointerMove(ref.current, p.x, p.y)); kick(); },
      onPanResponderRelease: () => { commit(pointerUp(ref.current)); kick(); },
      onPanResponderTerminate: () => { commit(pointerUp(ref.current)); kick(); },
    }),
  ).current;

  const pill = pillFrame(view);
  const matrix = gooMatrix();
  // Goo merges the pill with the thick strand roots; thin tails draw crisp.
  const circles: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < view.strands.length; i++) circles.push(...strandCircles(view, i).slice(0, GOO_ROOT));
  circles.push(...spikeCircles(view));
  const ribbons = [];
  for (let i = 0; i < view.strands.length; i++) {
    const pts = strandRibbon(view, i);
    if (pts.length < 3) continue;
    const path = Skia.Path.Make();
    path.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) path.lineTo(pts[k].x, pts[k].y);
    path.close();
    ribbons.push(path);
  }

  return (
    <View
      style={[styles.stage, { width: VENOM_W, height: VENOM_H, backgroundColor: VENOM_BG }, style]}
      {...pan.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Touch and hold nearby: tendrils reach out and grab your finger. Tap to press."
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate") {
          commit(pointerDown(ref.current, PILL_CX, PILL_CY));
          commit(pointerUp(ref.current));
          kick();
        }
      }}
    >
      <Canvas pointerEvents="none" style={{ width: VENOM_W, height: VENOM_H }}>
        <Group layer={<Paint><Blur blur={3.5} /><ColorMatrix matrix={matrix} /></Paint>} color={VENOM_INK}>
          <RoundedRect x={pill.cx - pill.rx} y={pill.cy - pill.ry} width={pill.rx * 2} height={pill.ry * 2} r={Math.min(PILL_H / 2, pill.ry)} />
          {circles.map((c, i) => <Circle key={i} cx={c.x} cy={c.y} r={Math.max(0.01, c.r)} />)}
        </Group>
        {/* Crisp tapered filaments over the goo bridge. */}
        <Group color={VENOM_INK}>
          {ribbons.map((path, i) => <Path key={i} path={path} />)}
        </Group>
        {/* Gloss and rim stay crisp above the goo. */}
        <Group transform={[{ translateX: pill.cx }, { translateY: pill.cy }, { scaleX: view.squash }, { scaleY: 1 / view.squash }]}>
          <RoundedRect x={-PILL_W / 2} y={-PILL_H / 2} width={PILL_W} height={PILL_H} r={PILL_H / 2}>
            <LinearGradient start={vec(0, -PILL_H / 2)} end={vec(0, PILL_H / 2)} colors={[VENOM_GLOSS, "rgba(255,255,255,0.02)", VENOM_RIM]} positions={[0, 0.45, 1]} />
          </RoundedRect>
          <Circle cx={-PILL_W / 2 + 30} cy={-PILL_H / 2 + 14} r={9} color="rgba(255,255,255,0.5)">
            <Blur blur={6} />
          </Circle>
          <Circle cx={-PILL_W / 2 + 52} cy={-PILL_H / 2 + 10} r={4} color="rgba(255,255,255,0.65)">
            <Blur blur={3.5} />
          </Circle>
        </Group>
      </Canvas>
      <View pointerEvents="none" style={[styles.labelWrap, { transform: [{ translateX: pill.cx - PILL_CX }, { translateY: pill.cy - PILL_CY }, { scaleX: view.squash }, { scaleY: 1 / view.squash }] }]}>
        <Text style={[styles.label, { color: VENOM_TEXT }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: "center", borderRadius: 16, overflow: "hidden" },
  labelWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 17, fontWeight: "600", letterSpacing: 0.4 },
});
