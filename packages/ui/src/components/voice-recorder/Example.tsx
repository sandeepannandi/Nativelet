import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { VoiceRecorder, type VoiceMessage } from "./VoiceRecorder";
import { formatClock } from "./recorderMath";
import { REC_GREEN, REC_GREEN_SOFT, REC_TEXT, REC_WAVE } from "./recorderDesign";

type Sent = VoiceMessage & { id: number };

// A sent voice message: play sweeps a playhead across the recorded samples.
// Playback is simulated on a timer; this demo never touches the microphone.
function VoicePill({ msg }: { msg: Sent }) {
  const [played, setPlayed] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPlayed((p) => {
        if (p + 0.1 >= msg.seconds) {
          setPlaying(false);
          return 0;
        }
        return p + 0.1;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, msg.seconds]);
  const bars = msg.samples.filter((_, i) => i % 2 === 0).slice(-24);
  const progress = msg.seconds > 0 ? played / msg.seconds : 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-end", backgroundColor: REC_GREEN_SOFT, borderRadius: 22, borderWidth: 1, borderColor: "rgba(25,63,48,0.14)", paddingVertical: 10, paddingHorizontal: 14, maxWidth: 280 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause voice message" : "Play voice message"} onPress={() => setPlaying((v) => !v)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: REC_GREEN, alignItems: "center", justifyContent: "center" }}>
        {playing ? (
          <View style={{ flexDirection: "row", gap: 3 }}>
            <View style={{ width: 3, height: 10, backgroundColor: "#fff", borderRadius: 1.5 }} />
            <View style={{ width: 3, height: 10, backgroundColor: "#fff", borderRadius: 1.5 }} />
          </View>
        ) : (
          <View style={{ width: 0, height: 0, marginLeft: 2, borderLeftWidth: 9, borderLeftColor: "#fff", borderTopWidth: 6, borderTopColor: "transparent", borderBottomWidth: 6, borderBottomColor: "transparent" }} />
        )}
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 26 }}>
        {bars.map((level, i) => (
          <View key={i} style={{ width: 2.6, borderRadius: 1.3, height: 3 + level * 20, backgroundColor: i / bars.length <= progress ? REC_GREEN : REC_WAVE, opacity: i / bars.length <= progress ? 1 : 0.55 }} />
        ))}
      </View>
      <Text style={{ color: REC_TEXT, fontSize: 12, fontVariant: ["tabular-nums"] }}>{formatClock(played > 0 ? played : msg.seconds)}</Text>
    </View>
  );
}

export default function Example({ onFeedback }: { onFeedback?: (event: string) => void }) {
  const [messages, setMessages] = useState<Sent[]>([]);
  const [slow, setSlow] = useState(false);
  const idRef = useRef(0);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? REC_GREEN : "#ffffff", borderColor: on ? REC_GREEN : "#d5e1d2",
  });
  const chipText = (on: boolean) => ({ color: on ? "#ffffff" : REC_TEXT, fontSize: 12, fontWeight: "600" as const });
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 14 }}>
      <View style={{ width: 360, minHeight: 190, justifyContent: "flex-end", gap: 8, paddingHorizontal: 8 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#d5e1d2", paddingVertical: 9, paddingHorizontal: 13 }}>
          <Text style={{ color: "#1d2b23", fontSize: 14 }}>send the voice note when it works</Text>
        </View>
        {messages.map((m) => <VoicePill key={m.id} msg={m} />)}
      </View>
      <VoiceRecorder
        slowMotion={slow}
        onSend={(msg) => setMessages((list) => [...list.slice(-3), { ...msg, id: ++idRef.current }])}
        onFeedback={(event) => onFeedback?.(event)}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={chipText(slow)}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setMessages([])} style={chip(false)}>
          <Text style={chipText(false)}>Reset</Text>
        </Pressable>
      </View>
      <Text style={{ color: REC_TEXT, fontSize: 12, textAlign: "center", maxWidth: 320 }}>
        Hold the mic to record. Slide left to cancel, drag up to lock. Tap the mic to record hands free. Audio levels are simulated.
      </Text>
    </View>
  );
}
