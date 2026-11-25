import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { DiceTray } from "./DiceTray";

export default function Example({
  onFeedback,
}: {
  onFeedback?: (event: "pickup" | "throw" | "impact" | "settle", strength?: number) => void;
}) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [count, setCount] = useState<1 | 2 | 3>(2);
  const [rollTick, setRollTick] = useState(0);
  const [values, setValues] = useState<number[] | null>(null);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  const total = values ? values.reduce((a, b) => a + b, 0) : 0;
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <DiceTray
        count={count}
        slowMotion={slow}
        reducedMotion={reduce}
        rollTick={rollTick}
        onSettled={setValues}
        onFeedback={(e, s) => {
          if (e === "pickup" || e === "throw") setValues(null);
          onFeedback?.(e, s);
        }}
      />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: "#1f3a2a", fontFamily: "Geist-Regular", minHeight: 20 }}>
        {values ? `${values.join(" + ")}${values.length > 1 ? ` = ${total}` : ""}` : "Drag to pick up, flick to throw"}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" onPress={() => { setValues(null); setRollTick((v) => v + 1); }} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Roll</Text>
        </Pressable>
        {([1, 2, 3] as const).map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: count === n }} onPress={() => { setCount(n); setValues(null); }} style={chip(count === n)}>
            <Text style={{ fontSize: 12, color: count === n ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>{n} {n === 1 ? "die" : "dice"}</Text>
          </Pressable>
        ))}
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
