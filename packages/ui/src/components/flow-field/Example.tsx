import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FlowField } from "./FlowField";

export default function Example({ onFeedback }: { onFeedback?: (event: "touch" | "release") => void }) {
  const [slow, setSlow] = useState(false);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#3f74e0" : "#101a30", borderColor: on ? "#3f74e0" : "#26324f",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <FlowField slowMotion={slow} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#9db1e8", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#5d6f9e", fontFamily: "Geist-Regular" }}>Drag through the current to stir it. Let go and watch it heal.</Text>
    </View>
  );
}
