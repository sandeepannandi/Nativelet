import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { PlasmaGlobe } from "./PlasmaGlobe";

export default function Example({ onFeedback }: { onFeedback?: (event: "touch" | "release") => void }) {
  const [slow, setSlow] = useState(false);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#8b3fe0" : "#140a22", borderColor: on ? "#8b3fe0" : "#34204f",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <PlasmaGlobe slowMotion={slow} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#c7a6f2", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#7d6a9c", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 18 }}>
        Touch the glass and the filaments gather at your finger. Drag to lead them. Release to let them scatter.
      </Text>
    </View>
  );
}
