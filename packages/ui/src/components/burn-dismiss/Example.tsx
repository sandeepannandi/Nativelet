import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Skia, TileMode, useTypeface, vec, type SkTypeface } from "@shopify/react-native-skia";
import { BurnDismiss } from "./BurnDismiss";
import { CARD_H, CARD_W, cardScene, type SceneItem } from "./burnDesign";

const GEIST = require("../text-morph/fonts/Geist-Regular.ttf");
const SCALE = 2;

// The card to burn: one texture drawn once with Skia at 2x.
function drawScene(typeface: SkTypeface) {
  const surface = Skia.Surface.MakeOffscreen(CARD_W * SCALE, CARD_H * SCALE);
  if (!surface) throw new Error("Unable to prepare the card texture");
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.clear(Skia.Color("#f4eddc"));
  for (const it of cardScene() as SceneItem[]) {
    if (it.k === "vgrad") {
      paint.setShader(
        Skia.Shader.MakeLinearGradient(
          vec(it.x * SCALE, it.y * SCALE),
          vec(it.x * SCALE, (it.y + it.h) * SCALE),
          [Skia.Color(it.from), Skia.Color(it.to)],
          null,
          TileMode.Clamp,
        ),
      );
      canvas.drawRect(Skia.XYWHRect(it.x * SCALE, it.y * SCALE, it.w * SCALE, it.h * SCALE), paint);
      paint.setShader(null);
    } else if (it.k === "rect") {
      paint.setColor(Skia.Color(it.color));
      if (!it.r) canvas.drawRect(Skia.XYWHRect(it.x * SCALE, it.y * SCALE, it.w * SCALE, it.h * SCALE), paint);
      else canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(it.x * SCALE, it.y * SCALE, it.w * SCALE, it.h * SCALE), it.r * SCALE, it.r * SCALE), paint);
    } else if (it.k === "circle") {
      paint.setColor(Skia.Color(it.color));
      canvas.drawCircle(it.x * SCALE, it.y * SCALE, it.r * SCALE, paint);
    } else if (it.k === "poly") {
      paint.setColor(Skia.Color(it.color));
      const path = Skia.Path.Make();
      path.moveTo(it.points[0] * SCALE, it.points[1] * SCALE);
      for (let i = 2; i < it.points.length; i += 2) path.lineTo(it.points[i] * SCALE, it.points[i + 1] * SCALE);
      path.close();
      canvas.drawPath(path, paint);
    } else if (it.k === "line") {
      paint.setColor(Skia.Color(it.color));
      paint.setStrokeWidth(it.width * SCALE);
      paint.setStyle(1);
      const path = Skia.Path.Make();
      path.moveTo(it.points[0] * SCALE, it.points[1] * SCALE);
      for (let i = 2; i < it.points.length; i += 2) path.lineTo(it.points[i] * SCALE, it.points[i + 1] * SCALE);
      canvas.drawPath(path, paint);
      paint.setStyle(0);
    } else {
      paint.setColor(Skia.Color(it.color));
      const font = Skia.Font(typeface, it.size * SCALE);
      const w = it.align === "left" || !it.align ? 0 : font.getTextWidth(it.text);
      const x = it.x * SCALE - (it.align === "center" ? w / 2 : it.align === "right" ? w : 0);
      canvas.drawText(it.text, x, it.y * SCALE, paint, font);
    }
  }
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const copy = snapshot.makeNonTextureImage();
  snapshot.dispose();
  surface.dispose();
  paint.dispose();
  if (!copy) throw new Error("Unable to copy the card texture");
  return copy;
}

export default function Example({ onFeedback }: { onFeedback?: (event: "ignite" | "release" | "restore") => void }) {
  const [slow, setSlow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  const [gone, setGone] = useState(false);
  const typeface = useTypeface(GEIST);
  const scene = useMemo(() => (typeface ? drawScene(typeface) : null), [typeface]);
  React.useEffect(() => () => scene?.dispose(), [scene]);
  if (!scene) return null;
  const chip = (on: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1,
    backgroundColor: on ? "#315843" : "#eeeade", borderColor: on ? "#315843" : "#c7caba",
  });
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
      <View style={{ borderRadius: 18, backgroundColor: "#241d16" }}>
        <BurnDismiss
          image={scene}
          slowMotion={slow}
          reducedMotion={reduce}
          restoreTick={restoreTick}
          onDismissed={() => setGone(true)}
          onFeedback={(e) => { if (e === "ignite") setGone(false); onFeedback?.(e); }}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" onPress={() => setRestoreTick((v) => v + 1)} style={chip(false)}>
          <Text style={{ fontSize: 12, color: "#315843", fontFamily: "Geist-Regular" }}>Restore</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: slow }} onPress={() => setSlow((v) => !v)} style={chip(slow)}>
          <Text style={{ fontSize: 12, color: slow ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Slow motion: {slow ? "on" : "off"}</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: reduce }} onPress={() => setReduce((v) => !v)} style={chip(reduce)}>
          <Text style={{ fontSize: 12, color: reduce ? "#fff" : "#315843", fontFamily: "Geist-Regular" }}>Reduce motion: {reduce ? "on" : "off"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: "#63705f", fontFamily: "Geist-Regular" }}>
        {gone ? "Burned away. Restore to bring the card back." : "Touch to ignite. Hold to feed the fire, drag to spread it."}
      </Text>
    </View>
  );
}
