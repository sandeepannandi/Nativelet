import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SnowGlobe } from "./SnowGlobe";

export default function Example({
  onFeedback,
}: {
  onFeedback?: (event: "grab" | "shake" | "settle", strength?: number) => void;
}) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 14 }}>
      <SnowGlobe slowMotion={slow} reducedMotion={reduce} shakeTick={shakeTick} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" onPress={() => setShakeTick((v) => v + 1)} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Shake</Text>
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
