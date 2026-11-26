import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RouletteWheel, type RouletteEvent } from "./RouletteWheel";

const TONE = { red: "#a8161c", black: "#1d1d20", green: "#12753a" } as const;

export default function Example({ onFeedback }: { onFeedback?: (event: RouletteEvent, strength?: number) => void }) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [spinTick, setSpinTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<{ number: number; color: "red" | "black" | "green" } | null>(null);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <RouletteWheel
        slowMotion={slow}
        reducedMotion={reduce}
        spinTick={spinTick}
        onLaunch={() => { setPlaying(true); setResult(null); }}
        onSettled={(r) => { setPlaying(false); setResult(r); }}
        onFeedback={onFeedback}
      />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: result ? TONE[result.color] : "#1f3a2a", fontFamily: "Geist-Regular", minHeight: 20 }}>
        {playing ? "Ball in play" : result ? `${result.number} ${result.color}` : "Tap to spin · drag to set the launch speed"}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: playing }} disabled={playing} onPress={() => setSpinTick((v) => v + 1)} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Spin</Text>
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
