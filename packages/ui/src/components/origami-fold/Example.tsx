import React, { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { OrigamiFold, type OrigamiFoldHandle } from "./OrigamiFold";
import type { FoldEvent } from "./foldController";

export default function Example({ onFeedback }: { onFeedback?: (event: FoldEvent, strength?: number) => void }) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [folds, setFolds] = useState(0);
  const paper = useRef<OrigamiFoldHandle>(null);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <OrigamiFold ref={paper} slowMotion={slow} reducedMotion={reduce} onFoldsChange={setFolds} onFeedback={onFeedback} />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: "#1f3a2a", fontFamily: "Geist-Regular", minHeight: 20 }}>
        {folds === 0 ? "Press the paper and drag any way to fold it" : `${folds} fold${folds === 1 ? "" : "s"}`}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: folds === 0 }} onPress={() => paper.current?.undo()} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Undo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: folds === 0 }} onPress={() => paper.current?.reset()} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Reset</Text>
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
