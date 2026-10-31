"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GRAB, PILL_CX, PILL_CY, PILL_H, PILL_W, SENSE, VENOM_H, VENOM_W,
  GOO_ROOT, clampFinger, createVenom, drainEvents, edgeDist, isAnimating, pillFrame, pointerDown, pointerMove, pointerUp,
  spikeCircles, stepVenom, strandCircles, strandRibbon, type Venom, type VenomEvent,
} from "../../packages/ui/src/components/venom-button/venomMath";
import { VENOM_GLOSS, VENOM_INK, VENOM_RIM, VENOM_TEXT } from "../../packages/ui/src/components/venom-button/venomDesign";
import styles from "./venom-button.module.css";

const SCALE = 2;

function roundPill(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  const r = Math.min(ry, rx);
  ctx.moveTo(cx - rx + r, cy - ry);
  ctx.arcTo(cx + rx, cy - ry, cx + rx, cy + ry, r);
  ctx.arcTo(cx + rx, cy + ry, cx - rx, cy + ry, r);
  ctx.arcTo(cx - rx, cy + ry, cx - rx, cy - ry, r);
  ctx.arcTo(cx - rx, cy - ry, cx + rx, cy - ry, r);
  ctx.closePath();
}

export function VenomButtonPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ setReduced: (v: boolean) => void; setSlow: (v: boolean) => void } | null>(null);
  const systemReduce = useReducedMotion();
  const [forcedReduce, setForcedReduce] = useState(false);
  const reduce = !!systemReduce || forcedReduce;
  const [slow, setSlow] = useState(false);
  const [last, setLast] = useState("Nothing yet");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const off = document.createElement("canvas");
    off.width = VENOM_W * SCALE;
    off.height = VENOM_H * SCALE;
    const goo = off.getContext("2d")!;
    let s: Venom = createVenom(reduce);
    let slowMo = slow;
    api.current = { setReduced: (v) => { s.reduced = v; }, setSlow: (v) => { slowMo = v; } };
    let raf = 0;
    let lastT = performance.now();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      goo.clearRect(0, 0, off.width, off.height);
      goo.save();
      goo.scale(SCALE, SCALE);
      goo.fillStyle = VENOM_INK;
      const pill = pillFrame(s);
      roundPill(goo, pill.cx, pill.cy, pill.rx, pill.ry);
      goo.fill();
      // Only the thick root circles join the goo merge; thin tails would not
      // survive the alpha threshold and are drawn crisp below instead.
      const all = [] as { x: number; y: number; r: number }[];
      for (let i = 0; i < s.strands.length; i++) all.push(...strandCircles(s, i).slice(0, GOO_ROOT));
      all.push(...spikeCircles(s));
      for (const c of all) {
        goo.beginPath();
        goo.arc(c.x, c.y, Math.max(0.01, c.r), 0, Math.PI * 2);
        goo.fill();
      }
      goo.restore();
      // Goo pass: blur then an alpha-gain colour matrix merges overlapping
      // blobs into one crisp surface (same recipe as the native Skia filter;
      // CSS contrast() would only clip RGB and leave the alpha soft).
      ctx.save();
      ctx.filter = "url(#venom-goo)";
      ctx.drawImage(off, 0, 0);
      ctx.restore();
      // Crisp tapered ribbons: full-length filaments over the goo bridge.
      ctx.save();
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = VENOM_INK;
      for (let i = 0; i < s.strands.length; i++) {
        const pts = strandRibbon(s, i);
        if (pts.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Crisp gloss, rim and label above the goo.
      ctx.save();
      ctx.translate(pill.cx * SCALE, pill.cy * SCALE);
      ctx.scale(s.squash, 1 / s.squash);
      const gloss = ctx.createLinearGradient(0, (-PILL_H / 2) * SCALE, 0, (PILL_H / 2) * SCALE);
      gloss.addColorStop(0, VENOM_GLOSS);
      gloss.addColorStop(0.45, "rgba(255,255,255,0.02)");
      gloss.addColorStop(1, VENOM_RIM);
      roundPill(ctx, 0, 0, (PILL_W / 2) * SCALE, (PILL_H / 2) * SCALE);
      ctx.fillStyle = gloss;
      ctx.fill();
      const spec = ctx.createRadialGradient((-PILL_W / 2 + 30) * SCALE, (-PILL_H / 2 + 13) * SCALE, 0, (-PILL_W / 2 + 30) * SCALE, (-PILL_H / 2 + 13) * SCALE, 12 * SCALE);
      spec.addColorStop(0, "rgba(255,255,255,0.55)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fillRect(-PILL_W * SCALE, -PILL_H * SCALE, PILL_W * 2 * SCALE, PILL_H * 2 * SCALE);
      ctx.fillStyle = VENOM_TEXT;
      ctx.font = `600 ${17 * SCALE}px Geist, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Hold me", 0, 1 * SCALE);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      stepVenom(s, slowMo && !s.reduced ? dt / 4 : dt);
      for (const event of drainEvents(s)) setLast(event);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const local = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return clampFinger(((ev.clientX - r.left) * VENOM_W) / r.width, ((ev.clientY - r.top) * VENOM_H) / r.height);
    };
    const down = (ev: PointerEvent) => {
      const p = local(ev);
      pointerDown(s, p.x, p.y);
      canvas.setPointerCapture(ev.pointerId);
      canvas.focus({ preventScroll: true });
    };
    const move = (ev: PointerEvent) => {
      if (!s.down) return;
      const p = local(ev);
      pointerMove(s, p.x, p.y);
    };
    const up = () => { if (s.down) pointerUp(s); };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      pointerDown(s, PILL_CX, PILL_CY);
      pointerUp(s);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.setReduced(reduce); }, [reduce]);
  useEffect(() => { api.current?.setSlow(slow); }, [slow]);

  return (
    <div className={styles.stage}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="venom-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" />
          </filter>
        </defs>
      </svg>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={VENOM_W * SCALE}
        height={VENOM_H * SCALE}
        style={{ width: VENOM_W, height: VENOM_H }}
        tabIndex={0}
        role="application"
        aria-label="Venom Button web preview. Touch or click near the pill: tendrils reach out and grab the pointer, then snap back when you let go. Enter or Space presses the button."
      />
      <p className={styles.readout} aria-live="polite">Last action: {last}</p>
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} aria-pressed={slow} onClick={() => setSlow(!slow)}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduce ? styles.chipPrimary : styles.chip} aria-pressed={reduce} onClick={() => setForcedReduce(!reduce)}>Motion: {reduce ? "reduced" : "system"}</button>
      </div>
      <p className={styles.hint}>Press near the pill: tendrils reach for your finger, grab it up close, then stretch and snap back when you let go. A quick tap on the pill presses it.</p>
    </div>
  );
}
// End of Venom Button web preview.
