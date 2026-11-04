import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { NewtonsCradle } from "./NewtonsCradle";

export default function Example({ onFeedback }: { onFeedback?: (event: "grab" | "release" | "collision") => void }) {
  const [slow, setSlow] = useState(false),
    [reduce, setReduce] = useState(false);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <NewtonsCradle slowMotion={slow} reducedMotion={reduce} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: reduce }} onPress={() => setReduce((v) => !v)} style={chip(reduce)}>
          <Text style={{ fontSize: 12, color: reduce ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Reduce motion: {reduce ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#63705f", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 16 }}>
        Pull a ball back and let go. Grab the second ball from an end to lift two.
      </Text>
    </View>
  );
}
