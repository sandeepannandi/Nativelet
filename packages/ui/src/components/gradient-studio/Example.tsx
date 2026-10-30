import React, { useState } from "react";
import { Text, View } from "react-native";
import { GradientStudio } from "./GradientStudio";
import { GS_TEXT } from "./gradientDesign";

const START_CSS = "linear-gradient(in oklab 90deg, #FF9966 0%, #C2509C 50%, #3A3D9E 100%)";

export default function Example({ onFeedback }: { onFeedback?: (event: string) => void }) {
  const [css, setCss] = useState(START_CSS);
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 14 }}>
      <GradientStudio onChange={(_stops, value) => setCss(value)} onFeedback={(event) => onFeedback?.(event)} />
      <Text selectable style={{ color: GS_TEXT, fontSize: 11, textAlign: "center", maxWidth: 330, fontVariant: ["tabular-nums"] }}>
        {css}
      </Text>
    </View>
  );
}
