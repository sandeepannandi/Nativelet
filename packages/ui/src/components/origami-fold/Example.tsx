import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { OrigamiFold } from "./OrigamiFold";
import { STEP_COUNT } from "./foldMath";

const NAMES = ["Flat sheet", "Corner to corner", "Tip tucked down", "Left half over", "Base folded up"];

export default function Example({
  onFeedback,
}: {
  onFeedback?: (event: "grab" | "crease" | "release", strength?: number) => void;
}) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [target, setTarget] = useState(0);
  const [at, setAt] = useState(0);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <OrigamiFold step={target} slowMotion={slow} reducedMotion={reduce} onStepChange={setAt} onFeedback={onFeedback} />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: "#1f3a2a", fontFamily: "Geist-Regular", minHeight: 20 }}>
        Step {at} of {STEP_COUNT}: {NAMES[at]}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: target <= 0 }} onPress={() => setTarget((t) => Math.max(0, t - 1))} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Unfold</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: target >= STEP_COUNT }} onPress={() => setTarget((t) => Math.min(STEP_COUNT, t + 1))} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Fold</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: reduce }} onPress={() => setReduce((v) => !v)} style={chip(reduce)}>
          <Text style={{ fontSize: 12, color: reduce ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Reduce motion: {reduce ? "on" : "off"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
