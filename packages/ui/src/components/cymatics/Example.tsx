import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Cymatics } from "./Cymatics";

export default function Example({ onFeedback }: { onFeedback?: (event: "touch" | "release" | "scatter") => void }) {
  const [slow, setSlow] = useState(false);
  const [tune, setTune] = useState({ hz: 256, m: 2, n: 3 });
  const onTune = useCallback((hz: number, m: number, n: number) => setTune({ hz, m, n }), []);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#b98a3e" : "#181207", borderColor: on ? "#b98a3e" : "#3a2c14",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <View style={{ width: 340, height: 380 }}>
        <Cymatics slowMotion={slow} onFeedback={onFeedback} onTune={onTune} />
        <Text style={{ position: "absolute", top: 24, left: 26, fontSize: 11, color: "rgba(240,216,166,0.55)", fontFamily: "Geist-Regular", letterSpacing: 1.2 }}>
          PLATE {tune.m},{tune.n}
        </Text>
        <Text style={{ position: "absolute", top: 24, right: 26, fontSize: 11, color: "rgba(240,216,166,0.55)", fontFamily: "Geist-Regular", letterSpacing: 1.2 }}>
          {tune.hz} HZ
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#c9a96f", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#7a6a4d", fontFamily: "Geist-Regular", textAlign: "center", paddingHorizontal: 18 }}>
        Drag sideways to retune, up or down to blend the mode. Tap to scatter the sand.
      </Text>
    </View>
  );
}
