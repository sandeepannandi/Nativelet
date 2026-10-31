import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { VenomButton, type VenomEvent } from "./VenomButton";
import { VENOM_FAINT } from "./venomDesign";

export default function Example({ onFeedback }: { onFeedback?: (event: string) => void }) {
  const [slow, setSlow] = useState(false);
  const [last, setLast] = useState("nothing yet");
  const feedback = (event: VenomEvent) => { setLast(event); onFeedback?.(event); };
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 14 }}>
      <VenomButton onFeedback={feedback} slowMotion={slow} />
      <Pressable accessibilityRole="button" onPress={() => setSlow(!slow)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: slow ? "#193f30" : "#ffffff", borderWidth: 1, borderColor: "#d5e1d2" }}>
        <Text style={{ color: slow ? "#ffffff" : "#31533e", fontSize: 13 }}>Slow motion: {slow ? "on" : "off"}</Text>
      </Pressable>
      <Text style={{ color: VENOM_FAINT, fontSize: 11 }}>Last action: {last}</Text>
    </View>
  );
}
