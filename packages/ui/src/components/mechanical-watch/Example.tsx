import React from "react";
import { Text, View } from "react-native";
import { MechanicalWatch } from "./MechanicalWatch";

export default function Example({ onBeat }: { onBeat?: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <MechanicalWatch onBeat={onBeat} />
      <Text style={{ fontSize: 12, color: "#63705f", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 16 }}>
        A Swiss-lever escapement with contact-based locking, draw and impulse; the contact geometry is still being validated against the real mechanism. Drag to orbit the movement. Drag the crown at 3 o'clock up or down to wind the mainspring. Tap to toggle slow motion. Left alone, it idles on a slow turntable.
      </Text>
    </View>
  );
}
