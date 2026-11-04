"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  CRADLE_DEFAULTS, createCradle, pickBall, stepCradleFixed,
  type CradleConfig, type CradlePointer,
} from "../../packages/ui/src/components/newtons-cradle/cradleMath";
import {
  BALL_BASE, BALL_R, BALL_RIM, BASE_SIDE, BASE_TOP, CHROME_STOPS, CRADLE_BACKGROUND, CRADLE_H, CRADLE_W,
  FRAME_BAR, FRAME_EDGE, FRAME_POST, PIVOT_DX, PIVOT_Y, REST_BALL_Y, SHADOW_Y, STRING_COLOR, STRING_LEN, pivotX,
} from "../../packages/ui/src/components/newtons-cradle/cradleDesign";
import styles from "./newtons-cradle.module.css";

const CFG: CradleConfig = {
  pivotX: new Float32Array([0, 1, 2, 3, 4].map(pivotX)),
  pivotY: PIVOT_Y,
  lengthPx: STRING_LEN,
  ballRadiusPx: BALL_R,
  pixelsPerMeter: STRING_LEN / CRADLE_DEFAULTS.lengthM,
};

export function NewtonsCradlePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const latest = useRef({ slow, reduced });
  latest.current = { slow, reduced };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CRADLE_W * dpr;
    canvas.height = CRADLE_H * dpr;
    let sim = createCradle(CRADLE_DEFAULTS);
    const grabs = new Map<number, CradlePointer>();

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = CRADLE_BACKGROUND;
      ctx.beginPath();
      ctx.roundRect(0, 0, CRADLE_W, CRADLE_H, 18);
      ctx.fill();
      ctx.fillStyle = BASE_SIDE;
      ctx.beginPath();
      ctx.roundRect(188, 338, 200, 18, 4);
      ctx.fill();
      ctx.fillStyle = BASE_TOP;
      ctx.beginPath();
      ctx.roundRect(188, 336, 200, 9, 3);
      ctx.fill();
      ctx.strokeStyle = FRAME_POST;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(208, 340);
      ctx.lineTo(218, 46);
      ctx.moveTo(368, 340);
      ctx.lineTo(358, 46);
      ctx.stroke();
      ctx.fillStyle = FRAME_BAR;
      ctx.beginPath();
      ctx.roundRect(202, 36, 172, 11, 4);
      ctx.fill();
      ctx.fillStyle = FRAME_EDGE;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.roundRect(202, 44, 172, 4, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = STRING_COLOR;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < sim.th.length; i++) {
        const cx = CFG.pivotX[i] + STRING_LEN * Math.sin(sim.th[i]);
        const cy = PIVOT_Y + STRING_LEN * Math.cos(sim.th[i]);
        for (const side of [-1, 1]) {
          const ax = CFG.pivotX[i] + side * PIVOT_DX;
          const dx = cx - ax;
          const dy = cy - PIVOT_Y;
          const d = Math.hypot(dx, dy) || 1;
          ctx.moveTo(ax, PIVOT_Y);
          ctx.lineTo(ax + (dx / d) * (d - BALL_R * 0.55), PIVOT_Y + (dy / d) * (d - BALL_R * 0.55));
        }
      }
      ctx.stroke();
      for (let i = 0; i < sim.th.length; i++) {
        const cx = CFG.pivotX[i] + STRING_LEN * Math.sin(sim.th[i]);
        const cy = PIVOT_Y + STRING_LEN * Math.cos(sim.th[i]);
        ctx.fillStyle = "#3a2f22";
        ctx.globalAlpha = Math.max(0.05, 0.2 - ((cy - REST_BALL_Y) / 150) * 0.15);
        ctx.beginPath();
        ctx.ellipse(cx, SHADOW_Y + 3.5, BALL_R * 0.9, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        const g = ctx.createRadialGradient(cx - BALL_R * 0.35, cy - BALL_R * 0.42, BALL_R * 0.1, cx - BALL_R * 0.35, cy - BALL_R * 0.42, BALL_R * 1.25);
        g.addColorStop(0, CHROME_STOPS[0]);
        g.addColorStop(0.45, CHROME_STOPS[1]);
        g.addColorStop(1, CHROME_STOPS[2]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = BALL_RIM;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(cx - BALL_R * 0.35, cy - BALL_R * 0.42, BALL_R * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let raf = 0;
    let last = 0;
    let wasReduced = false;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        if (!wasReduced) {
          grabs.clear();
          sim = createCradle(CRADLE_DEFAULTS);
          wasReduced = true;
        }
        draw();
      } else {
        if (wasReduced) wasReduced = false;
        stepCradleFixed(sim, CFG, dt * (latest.current.slow ? 0.25 : 1), Array.from(grabs.values()), CRADLE_DEFAULTS);
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * CRADLE_W, y: ((ev.clientY - rect.top) / rect.height) * CRADLE_H };
    };
    const down = (ev: PointerEvent) => {
      if (latest.current.reduced) return;
      const p = local(ev);
      const ball = pickBall(sim, CFG, p.x, p.y, BALL_R * 2.4);
      if (ball < 0) return;
      grabs.set(ev.pointerId, { id: ev.pointerId, x: p.x, y: p.y, ball });
      canvas.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      const g = grabs.get(ev.pointerId);
      if (!g) return;
      const p = local(ev);
      g.x = p.x;
      g.y = p.y;
    };
    const up = (ev: PointerEvent) => {
      grabs.delete(ev.pointerId);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: CRADLE_W, height: CRADLE_H }}
        role="img"
        aria-label="Newton's cradle web preview: five chrome balls on strings, momentum clicks through the line"
      />
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Pull a ball back and let go. Grab the second ball from an end to lift two.</p>
    </div>
  );
}
