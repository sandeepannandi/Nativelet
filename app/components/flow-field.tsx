"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  FLOW_COUNT, FLOW_DEFAULTS, FLOW_H, FLOW_W, createFlow, flowPointer, stepFlowFrame, type FlowState,
} from "../../packages/ui/src/components/flow-field/flowMath";
import {
  FLOW_BIG_SIZE, FLOW_CORES, FLOW_GLOWS, FLOW_GLOW_STROKES, FLOW_SPEED_LIMITS, FLOW_STROKES,
  FLOW_TRAIL_MAX, FLOW_TRAIL_MIN, FLOW_TRAIL_SECONDS, FLOW_VEILS,
} from "../../packages/ui/src/components/flow-field/flowDesign";
import styles from "./flow-field.module.css";

export function FlowFieldPreview() {
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
    canvas.width = FLOW_W * dpr;
    canvas.height = FLOW_H * dpr;
    let sim: FlowState = createFlow();
    const pointer = { x: 0, y: 0, down: false };
    let wasReduced = false;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createLinearGradient(0, 0, FLOW_W * 0.4, FLOW_H);
      bg.addColorStop(0, "#0a1124");
      bg.addColorStop(1, "#04060d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, FLOW_W, FLOW_H);
      for (const v of FLOW_VEILS) {
        const g = ctx.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, v.r);
        g.addColorStop(0, v.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(v.cx - v.r, v.cy - v.r, v.r * 2, v.r * 2);
      }
      // Additive light: overlapping streaks brighten like a long exposure.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        for (let bucket = 0; bucket < 4; bucket++) {
          for (let big = 0; big <= 1; big++) {
            ctx.strokeStyle = pass === 0 ? FLOW_GLOWS[bucket] : FLOW_CORES[bucket];
            ctx.lineWidth = pass === 0 ? FLOW_GLOW_STROKES[big] : FLOW_STROKES[big];
            ctx.beginPath();
            for (let i = 0; i < sim.n; i++) {
              const sp = Math.sqrt(sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i]);
              let b = 0;
              while (b < FLOW_SPEED_LIMITS.length && sp >= FLOW_SPEED_LIMITS[b]) b++;
              if (b !== bucket) continue;
              if ((sim.size[i] >= FLOW_BIG_SIZE ? 1 : 0) !== big) continue;
              const x = sim.x[i];
              const y = sim.y[i];
              let tx: number;
              let ty: number;
              if (sp < 2) {
                tx = x - 0.7;
                ty = y;
              } else {
                const len = Math.min(FLOW_TRAIL_MAX, Math.max(FLOW_TRAIL_MIN, sp * FLOW_TRAIL_SECONDS));
                tx = x - (sim.vx[i] / sp) * len;
                ty = y - (sim.vy[i] / sp) * len;
              }
              ctx.moveTo(tx, ty);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
      }
      if (pointer.down) {
        ctx.fillStyle = "rgba(180, 210, 255, 0.05)";
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 30, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = "rgba(180, 210, 255, 0.09)";
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 13, 0, 6.2832);
        ctx.fill();
      }
    };

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        if (!wasReduced) {
          pointer.down = false;
          flowPointer(sim, 0, 0, false);
          sim = createFlow(FLOW_DEFAULTS, FLOW_COUNT, 20261025, true);
          wasReduced = true;
        }
      } else {
        if (wasReduced) {
          sim = createFlow();
          wasReduced = false;
        }
        flowPointer(sim, pointer.x, pointer.y, pointer.down);
        stepFlowFrame(sim, dt * (latest.current.slow ? 0.22 : 1));
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * FLOW_W, y: ((ev.clientY - rect.top) / rect.height) * FLOW_H };
    };
    const down = (ev: PointerEvent) => {
      if (latest.current.reduced) return;
      const p = local(ev);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.down = true;
      canvas.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (!pointer.down) return;
      const p = local(ev);
      pointer.x = p.x;
      pointer.y = p.y;
    };
    const up = () => {
      pointer.down = false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: FLOW_W, height: FLOW_H }} role="img" aria-label="Flow field web preview: glowing particles ride a fluid current, drag to stir swirls and comets" />
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Drag through the current to stir it. Let go and watch it heal.</p>
    </div>
  );
}
