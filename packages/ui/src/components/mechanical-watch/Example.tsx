import React from "react";
import { Text, View } from "react-native";
import { MechanicalWatch } from "./MechanicalWatch";

export default function Example({ onBeat }: { onBeat?: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <MechanicalWatch onBeat={onBeat} />
      <Text style={{ fontSize: 12, color: "#63705f", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 16 }}>
        A Swiss-lever escapement running contact physics. Drag to orbit the movement; it idles on a slow turntable.
      </Text>
    </View>
  );
}
