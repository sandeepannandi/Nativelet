import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { PaperCrumple } from "./PaperCrumple";

export default function Example({ onFeedback }: { onFeedback?: (event: "touch" | "release") => void }) {
  const [slow, setSlow] = useState(false);
  const [smooth, setSmooth] = useState(0);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#2f6b4f" : "#f4f1ea", borderColor: on ? "#2f6b4f" : "#d9d4c8",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <PaperCrumple slowMotion={slow} smoothToken={smooth} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setSmooth((v) => v + 1)} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#4a463c", fontFamily: "Geist-Regular" }}>Smooth out</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#4a463c", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#8a8374", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 24 }}>
        Drag a corner toward the middle or pinch to crumple. Flick the ball to toss it. Double tap or pinch out to open it.
      </Text>
    </View>
  );
}
