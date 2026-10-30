"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GS_H, GS_W, HANDLE_R, LOUPE_R, LOUPE_ZOOM, MAX_STOPS, MIN_STOPS, PIN_R, PREVIEW, PRESETS, RING_IN, RING_MID, RING_OUT, SQ,
  TRACK_H, TRACK_X0, TRACK_X1, TRACK_Y, WHEEL_CX, WHEEL_CY,
  addAtWidestGap, clamp01, createStudio, gradientRamp, gradientToCss, hsvToRgb, isAnimating, moveSelected, nudgeHue, overlayFor,
  pointerDown, pointerMove, pointerUp, posToX, removeSelected, rgbToHex, ringPoint, selectNeighbour, selectedStop, sortedStops,
  startPreset, stepStudio, stopHex, svPoint, type Overlay, type Preset, type Studio,
} from "../../packages/ui/src/components/gradient-studio/gradientMath";
import { GS_BG, GS_BORDER, GS_HAIR, GS_INK, GS_REMOVE, HUE_COLORS } from "../../packages/ui/src/components/gradient-studio/gradientDesign";
import styles from "./gradient-studio.module.css";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rampGradient(ctx: CanvasRenderingContext2D, x0: number, x1: number, s: Studio) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const ramp = gradientRamp(s.stops);
  ramp.colors.forEach((c, i) => g.addColorStop(ramp.positions[i], c));
  return g;
}

function drawWheel(ctx: CanvasRenderingContext2D, hue: number) {
  const pure = rgbToHex(hsvToRgb(hue, 1, 1));
  const conic = ctx.createConicGradient(0, WHEEL_CX, WHEEL_CY);
  HUE_COLORS.forEach((c, i) => conic.addColorStop(i / (HUE_COLORS.length - 1), c));
  ctx.beginPath();
  ctx.arc(WHEEL_CX, WHEEL_CY, RING_MID, 0, Math.PI * 2);
  ctx.lineWidth = RING_OUT - RING_IN;
  ctx.strokeStyle = conic;
  ctx.stroke();
  roundRect(ctx, WHEEL_CX - SQ, WHEEL_CY - SQ, SQ * 2, SQ * 2, 10);
  const h = ctx.createLinearGradient(WHEEL_CX - SQ, 0, WHEEL_CX + SQ, 0);
  h.addColorStop(0, "#FFFFFF");
  h.addColorStop(1, pure);
  ctx.fillStyle = h;
  ctx.fill();
  const v = ctx.createLinearGradient(0, WHEEL_CY - SQ, 0, WHEEL_CY + SQ);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "#000000");
  ctx.fillStyle = v;
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function softShadowDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, blur: number, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = 3;
  disc(ctx, x, y, r, "#FFFFFF");
  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, s: Studio, id: number) {
  const stop = s.stops.find((t) => t.id === id);
  if (!stop) return;
  const selected = s.selected === id;
  const dragging = !!s.drag && s.drag.kind === "stop" && s.drag.id === id;
  const removing = dragging && s.drag!.kind === "stop" && (s.drag as { remove: boolean }).remove;
  const lifted = dragging ? 1 + 0.14 * clamp01(s.pin) : 1;
  const scale = (selected ? s.pop : 1) * lifted * (removing ? 0.8 : 1);
  ctx.save();
  ctx.globalAlpha = removing ? 0.45 : 1;
  ctx.translate(posToX(stop.pos), TRACK_Y);
  ctx.scale(scale, scale);
  softShadowDisc(ctx, 0, 0, HANDLE_R, 6, "rgba(13,31,22,0.25)");
  disc(ctx, 0, 0, HANDLE_R - 4, stopHex(stop));
  ring(ctx, 0, 0, HANDLE_R, 1, GS_HAIR);
  if (selected) ring(ctx, 0, 0, HANDLE_R + 3.5, 2.5, GS_INK);
  ctx.restore();
}

function drawLoupe(ctx: CanvasRenderingContext2D, o: Extract<Overlay, { kind: "loupe" }>, hue: number) {
  const a = clamp01(o.amount);
  ctx.save();
  ctx.globalAlpha = clamp01(a * 1.3);
  ctx.translate(o.lx, o.ly + (1 - a) * 18);
  const sc = 0.55 + 0.45 * a;
  ctx.scale(sc, sc);
  softShadowDisc(ctx, 0, 0, LOUPE_R + 3, 14, "rgba(13,31,22,0.3)");
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, LOUPE_R, 0, Math.PI * 2);
  ctx.clip();
  disc(ctx, 0, 0, LOUPE_R, "#FFFFFF");
  ctx.scale(LOUPE_ZOOM, LOUPE_ZOOM);
  ctx.translate(-o.tx, -o.ty);
  drawWheel(ctx, hue);
  ctx.restore();
  ring(ctx, 0, 0, LOUPE_R + 1.5, 3, "#FFFFFF");
  ring(ctx, 0, 0, LOUPE_R + 3.2, 1, GS_HAIR);
  ring(ctx, 0, 0, 9, 3.5, "#FFFFFF");
  ring(ctx, 0, 0, 10.6, 1, "rgba(13,31,22,0.35)");
  disc(ctx, 0, 0, 7.4, o.hex);
  ctx.restore();
}

function drawPin(ctx: CanvasRenderingContext2D, o: Extract<Overlay, { kind: "pin" }>) {
  const a = clamp01(o.amount);
  ctx.save();
  ctx.globalAlpha = clamp01(a * 1.3) * (o.remove ? 0.55 : 1);
  ctx.translate(o.x, o.y + (1 - a) * 14);
  const sc = 0.5 + 0.5 * a;
  ctx.scale(sc, sc);
  softShadowDisc(ctx, 0, 0, PIN_R + 3, 10, "rgba(13,31,22,0.28)");
  disc(ctx, 0, 0, PIN_R, o.hex);
  if (o.remove) ring(ctx, 0, 0, PIN_R + 3, 2.5, GS_REMOVE);
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: Studio) {
  ctx.clearRect(0, 0, GS_W, GS_H);
  roundRect(ctx, 0.5, 0.5, GS_W - 1, GS_H - 1, 28);
  ctx.fillStyle = GS_BG;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = GS_BORDER;
  ctx.stroke();
  roundRect(ctx, PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h, PREVIEW.r);
  ctx.fillStyle = rampGradient(ctx, PREVIEW.x, PREVIEW.x + PREVIEW.w, s);
  ctx.fill();
  ctx.strokeStyle = "rgba(13,31,22,0.08)";
  ctx.stroke();
  roundRect(ctx, TRACK_X0, TRACK_Y - TRACK_H / 2, TRACK_X1 - TRACK_X0, TRACK_H, TRACK_H / 2);
  ctx.fillStyle = rampGradient(ctx, TRACK_X0, TRACK_X1, s);
  ctx.fill();
  ctx.strokeStyle = GS_HAIR;
  ctx.stroke();
  const order = sortedStops(s.stops);
  [...order.filter((t) => t.id !== s.selected), ...order.filter((t) => t.id === s.selected)].forEach((t) => drawHandle(ctx, s, t.id));
  const sel = selectedStop(s);
  drawWheel(ctx, sel.h);
  const hp = ringPoint(sel.h);
  disc(ctx, hp.x, hp.y, 12, "#FFFFFF");
  ring(ctx, hp.x, hp.y, 12, 1, "rgba(13,31,22,0.3)");
  disc(ctx, hp.x, hp.y, 8.5, rgbToHex(hsvToRgb(sel.h, 1, 1)));
  const sp = svPoint(sel.s, sel.v);
  disc(ctx, sp.x, sp.y, 11, stopHex(sel));
  ring(ctx, sp.x, sp.y, 11, 3, "#FFFFFF");
  ring(ctx, sp.x, sp.y, 12.6, 1, "rgba(13,31,22,0.35)");
  const o = overlayFor(s);
  if (o && o.kind === "pin") drawPin(ctx, o);
  if (o && o.kind === "loupe") drawLoupe(ctx, o, sel.h);
}

type Api = {
  preset: (p: Preset) => void;
  add: () => void;
  remove: () => void;
  setReduced: (v: boolean) => void;
};

export function GradientStudioPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<Api | null>(null);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const latest = useRef(reduced);
  latest.current = reduced;
  const [info, setInfo] = useState({ hex: "", index: 1, count: 3, pct: 50, css: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.current?.setReduced(reduced);
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(GS_W * dpr);
    canvas.height = Math.round(GS_H * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    let s = createStudio(PRESETS[0], latest.current);
    let raf = 0;
    let last = performance.now();
    let lastInfo = "";
    const publish = () => {
      const sel = selectedStop(s);
      const order = sortedStops(s.stops);
      const next = { hex: stopHex(sel), index: order.findIndex((t) => t.id === sel.id) + 1, count: s.stops.length, pct: Math.round(sel.pos * 100), css: gradientToCss(s.stops) };
      const key = JSON.stringify(next);
      if (key !== lastInfo) {
        lastInfo = key;
        setInfo(next);
      }
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (isAnimating(s)) s = stepStudio(s, dt);
      draw(ctx, s);
      publish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const local = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) * GS_W) / r.width, y: ((ev.clientY - r.top) * GS_H) / r.height };
    };
    const down = (ev: PointerEvent) => {
      const p = local(ev);
      s = pointerDown(s, p.x, p.y);
      canvas.setPointerCapture(ev.pointerId);
      canvas.focus({ preventScroll: true });
    };
    const move = (ev: PointerEvent) => {
      if (!s.down) return;
      const p = local(ev);
      s = pointerMove(s, p.x, p.y);
    };
    const up = () => {
      if (!s.down) return;
      s = pointerUp(s);
    };
    const key = (ev: KeyboardEvent) => {
      const step = ev.shiftKey ? 0.1 : 0.02;
      if (ev.altKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        s = nudgeHue(s, ev.key === "ArrowLeft" ? -10 : 10);
      } else if (ev.key === "ArrowLeft") s = moveSelected(s, -step);
      else if (ev.key === "ArrowRight") s = moveSelected(s, step);
      else if (ev.key === ",") s = selectNeighbour(s, -1);
      else if (ev.key === ".") s = selectNeighbour(s, 1);
      else if (ev.key === "Enter") s = addAtWidestGap(s);
      else if (ev.key === "Delete" || ev.key === "Backspace") s = removeSelected(s);
      else return;
      ev.preventDefault();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", key);
    api.current = {
      preset: (p) => { s = startPreset(s, p); },
      add: () => { s = addAtWidestGap(s); },
      remove: () => { s = removeSelected(s); },
      setReduced: (v) => { s = { ...s, reduced: v }; },
    };
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
      api.current = null;
    };
  }, []);

  return (
    <div className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: GS_W, height: GS_H }}
        tabIndex={0}
        role="application"
        aria-label="Gradient Studio web preview. Drag a stop along the bar, tap the bar to add one, pull a stop away to remove it. Drag the hue ring or the square to recolor the selected stop. Keyboard: left and right arrows move the selected stop, comma and period select another stop, Enter adds a stop, Delete removes it, Alt plus arrows turns the hue."
      />
      <p className={styles.readout} aria-live="polite">{info.hex}  ·  stop {info.index} of {info.count}  ·  {info.pct}%</p>
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className={styles.preset} onClick={() => api.current?.preset(p)} aria-label={`${p.name} gradient`}>
            <span className={styles.swatch} style={{ background: `linear-gradient(90deg, ${p.colors.map((c, i) => `${c} ${Math.round(p.positions[i] * 100)}%`).join(", ")})` }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.chip} disabled={info.count >= MAX_STOPS} onClick={() => api.current?.add()}>Add stop</button>
        <button type="button" className={styles.chip} disabled={info.count <= MIN_STOPS} onClick={() => api.current?.remove()}>Remove stop</button>
        <button
          type="button"
          className={styles.chip}
          onClick={() => {
            void navigator.clipboard?.writeText(info.css).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }).catch(() => {});
          }}
        >
          {copied ? "Copied" : "Copy CSS"}
        </button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.css}>{info.css}</p>
      <p className={styles.hint}>Drag a stop, tap the bar to add one, pull a stop away to remove it. Drag the wheel or square to recolor; a loupe follows your finger.</p>
    </div>
  );
}
