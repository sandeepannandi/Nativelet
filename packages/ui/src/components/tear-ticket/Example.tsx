import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { TearTicket, type TearTicketProps } from "./TearTicket";

export default function Example({ onFeedback }: { onFeedback?: TearTicketProps["onFeedback"] }) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [tearTick, setTearTick] = useState(0);
  const [resetTick, setResetTick] = useState(0);
  const [torn, setTorn] = useState(false);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <TearTicket
        slowMotion={slow}
        reducedMotion={reduce}
        tearTick={tearTick}
        resetTick={resetTick}
        onTorn={() => setTorn(true)}
        onFeedback={onFeedback}
      />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: "#1f3a2a", fontFamily: "Geist-Regular", minHeight: 20 }}>
        {torn ? "Stub torn off. Admitted." : "Pull the stub away to tear it off"}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" onPress={() => { setTorn(false); setResetTick((v) => v + 1); }} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>New ticket</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setTearTick((v) => v + 1)} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Tear it</Text>
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
