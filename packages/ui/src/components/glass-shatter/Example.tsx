import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Skia, TileMode, vec } from "@shopify/react-native-skia";
import { GlassShatter } from "./GlassShatter";
import { PANE_H, PANE_W, SHATTER_BACKDROP, glassSceneDesign } from "./shatterDesign";

const SCALE = 2;

// The picture behind the glass: drawn once with Skia at 2x.
function drawScene() {
  const surface = Skia.Surface.MakeOffscreen(PANE_W * SCALE, PANE_H * SCALE);
  if (!surface) throw new Error("Unable to prepare the scene texture");
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.clear(Skia.Color(SHATTER_BACKDROP));
  for (const it of glassSceneDesign()) {
    if (it.k === "vgrad") {
      const colors = it.mid ? [Skia.Color(it.from), Skia.Color(it.mid), Skia.Color(it.to)] : [Skia.Color(it.from), Skia.Color(it.to)];
      paint.setShader(
        Skia.Shader.MakeLinearGradient(vec(it.x * SCALE, it.y * SCALE), vec(it.x * SCALE, (it.y + it.h) * SCALE), colors, null, TileMode.Clamp),
      );
      canvas.drawRect(Skia.XYWHRect(it.x * SCALE, it.y * SCALE, it.w * SCALE, it.h * SCALE), paint);
      paint.setShader(null);
    } else if (it.k === "rect") {
      paint.setColor(Skia.Color(it.color));
      canvas.drawRect(Skia.XYWHRect(it.x * SCALE, it.y * SCALE, it.w * SCALE, it.h * SCALE), paint);
    } else if (it.k === "circle") {
      paint.setColor(Skia.Color(it.color));
      canvas.drawCircle(it.x * SCALE, it.y * SCALE, it.r * SCALE, paint);
    } else {
      paint.setColor(Skia.Color(it.color));
      const path = Skia.Path.Make();
      path.moveTo(it.points[0] * SCALE, it.points[1] * SCALE);
      for (let i = 2; i < it.points.length; i += 2) path.lineTo(it.points[i] * SCALE, it.points[i + 1] * SCALE);
      path.close();
      canvas.drawPath(path, paint);
    }
  }
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const copy = snapshot.makeNonTextureImage();
  snapshot.dispose();
  surface.dispose();
  paint.dispose();
  if (!copy) throw new Error("Unable to copy the scene texture");
  return copy;
}

export default function Example({ onFeedback, diagnostics = false }: { diagnostics?: boolean; onFeedback?: (event: "hit") => void }) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [token, setToken] = useState(0);
  const scene = useMemo(() => drawScene(), []);
  React.useEffect(() => () => scene.dispose(), [scene]);
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#1f3a5f" : "#e9edf3", borderColor: on ? "#1f3a5f" : "#c3cbd8",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <GlassShatter diagnostics={diagnostics} image={scene} imageScale={SCALE} width={PANE_W} height={PANE_H} slowMotion={slow} reducedMotion={reduce} resetToken={token} onFeedback={onFeedback} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setToken((t) => t + 1)} style={chip(true)}>
          <Text style={{ fontSize: 12, color: "#fff", fontFamily: "Geist-Regular" }}>Reset glass</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#1f3a5f", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: reduce }} onPress={() => setReduce((v) => !v)} style={chip(reduce)}>
          <Text style={{ fontSize: 12, color: reduce ? "#fff" : "#1f3a5f", fontFamily: "Geist-Regular" }}>Reduce motion: {reduce ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#5d6b82", fontFamily: "Geist-Regular" }}>A pane over a harbor at sunrise. Tap it to break it.</Text>
    </View>
  );
}
