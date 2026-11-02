"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GL_CX, GL_CY, GL_R, PG_H, PG_W,
  createPlasma, plasmaPointer, stepPlasma, type PlasmaState,
} from "../../packages/ui/src/components/plasma-globe/plasmaMath";
import {
  PG_BASE_BOTTOM, PG_BASE_RIM, PG_BASE_TOP, PG_BG_BOTTOM, PG_BG_TOP, PG_CORE, PG_CORE_W, PG_ELECTRODE,
  PG_GLASS_CENTER, PG_GLASS_EDGE, PG_GLOW, PG_GLOW_W, PG_HAZE, PG_MID, PG_MID_W, PG_RIM, PG_SPECULAR, PG_TOUCH,
} from "../../packages/ui/src/components/plasma-globe/plasmaDesign";
import styles from "./plasma-globe.module.css";

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][], x1 = x, y1 = y) {
  const g = ctx.createRadialGradient(x1, y1, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function PlasmaGlobePreview() {
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
    canvas.width = PG_W * dpr;
    canvas.height = PG_H * dpr;
    let sim: PlasmaState = createPlasma();
    const pointer = { x: GL_CX, y: GL_CY, down: false };
    let wasReduced = false;

    const strokeKind = (kind: number) => {
      const src = kind === 0 ? sim.main : sim.branches;
      const passes: [string, number][] = [
        [PG_GLOW[kind], PG_GLOW_W[kind]], [PG_MID[kind], PG_MID_W[kind]], [PG_CORE[kind], PG_CORE_W[kind]],
      ];
      for (const [color, w] of passes) {
        ctx.beginPath();
        for (let i = 0; i < src.length; i += 4) {
          ctx.moveTo(src[i], src[i + 1]);
          ctx.lineTo(src[i + 2], src[i + 3]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.stroke();
      }
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const bg = ctx.createLinearGradient(0, 0, PG_W * 0.4, PG_H);
      bg.addColorStop(0, PG_BG_TOP);
      bg.addColorStop(1, PG_BG_BOTTOM);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, PG_W, PG_H);
      // Stand.
      const stand = (x: number, y: number, w: number, h: number, r: number, rim: boolean) => {
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, PG_BASE_TOP);
        g.addColorStop(1, PG_BASE_BOTTOM);
        roundedRectPath(ctx, x, y, w, h, r);
        ctx.fillStyle = g;
        ctx.fill();
        if (rim) {
          roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
          ctx.strokeStyle = PG_BASE_RIM;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      };
      stand(GL_CX - 50, GL_CY + GL_R - 14, 100, 36, 10, false);
      stand(GL_CX - 78, GL_CY + GL_R + 12, 156, 34, 12, true);
      // Glass.
      ctx.beginPath();
      ctx.arc(GL_CX, GL_CY, GL_R, 0, 6.2832);
      ctx.fillStyle = radial(ctx, GL_CX, GL_CY, GL_R, [[0, PG_GLASS_CENTER], [1, PG_GLASS_EDGE]]);
      ctx.fill();
      ctx.fillStyle = radial(ctx, GL_CX, GL_CY, GL_R * 0.62, [[0, PG_HAZE], [1, "rgba(100,40,200,0)"]]);
      ctx.fill();
      // Electrode halo.
      ctx.save();
      ctx.globalAlpha = 0.75 * Math.min(1, sim.glow);
      ctx.beginPath();
      ctx.arc(GL_CX, GL_CY, 34 + 8 * sim.pulse, 0, 6.2832);
      ctx.fillStyle = radial(ctx, GL_CX, GL_CY, 44, [[0, "rgba(210,120,255,0.55)"], [1, "rgba(120,40,255,0)"]]);
      ctx.fill();
      ctx.restore();
      // Filaments, additive.
      ctx.save();
      ctx.globalAlpha = Math.min(1, sim.glow);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokeKind(0);
      strokeKind(1);
      ctx.restore();
      // Fingertip.
      if (sim.attract > 0.01) {
        let fx = pointer.x;
        let fy = pointer.y;
        const d = Math.hypot(fx - GL_CX, fy - GL_CY);
        if (d > GL_R * 0.965) {
          fx = GL_CX + ((fx - GL_CX) / d) * GL_R * 0.965;
          fy = GL_CY + ((fy - GL_CY) / d) * GL_R * 0.965;
        }
        ctx.save();
        ctx.globalAlpha = Math.min(1, sim.attract * 1.2);
        [[30, PG_TOUCH[0]], [15, PG_TOUCH[1]], [6, PG_TOUCH[2]]].forEach(([r, c]) => {
          ctx.beginPath();
          ctx.arc(fx, fy, r as number, 0, 6.2832);
          ctx.fillStyle = c as string;
          ctx.fill();
        });
        ctx.restore();
      }
      // Electrode.
      ctx.beginPath();
      ctx.arc(GL_CX, GL_CY, 9, 0, 6.2832);
      ctx.fillStyle = radial(ctx, GL_CX, GL_CY, 11, [[0, PG_ELECTRODE[0]], [0.5, PG_ELECTRODE[1]], [1, PG_ELECTRODE[2]]], GL_CX - 2, GL_CY - 2);
      ctx.fill();
      // Fresnel edge, rim, highlights.
      ctx.beginPath();
      ctx.arc(GL_CX, GL_CY, GL_R, 0, 6.2832);
      ctx.fillStyle = radial(ctx, GL_CX, GL_CY, GL_R, [[0, "rgba(150,110,255,0)"], [0.82, "rgba(150,110,255,0)"], [1, "rgba(150,110,255,0.22)"]]);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(GL_CX, GL_CY, GL_R - 0.5, 0, 6.2832);
      ctx.strokeStyle = PG_RIM;
      ctx.lineWidth = 1;
      ctx.stroke();
      const spec = ctx.createLinearGradient(0, GL_CY - 112, 0, GL_CY - 60);
      spec.addColorStop(0, PG_SPECULAR);
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.ellipse(GL_CX - 37, GL_CY - 86, 55, 26, 0, 0, 6.2832);
      ctx.fillStyle = spec;
      ctx.fill();
      const low = ctx.createLinearGradient(0, GL_CY + 74, 0, GL_CY + 96);
      low.addColorStop(0, "rgba(255,255,255,0)");
      low.addColorStop(1, "rgba(255,255,255,0.07)");
      ctx.beginPath();
      ctx.ellipse(GL_CX + 81, GL_CY + 85, 23, 11, 0, 0, 6.2832);
      ctx.fillStyle = low;
      ctx.fill();
    };

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        if (!wasReduced) {
          pointer.down = false;
          sim = createPlasma(20261102, true);
          wasReduced = true;
        }
      } else {
        if (wasReduced) {
          sim = createPlasma();
          wasReduced = false;
        }
        plasmaPointer(sim, pointer.x, pointer.y, pointer.down);
        stepPlasma(sim, dt * (latest.current.slow ? 0.22 : 1), 1);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - rect.left) / rect.width) * PG_W,
        y: ((ev.clientY - rect.top) / rect.height) * PG_H,
      };
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
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: PG_W, height: PG_H }} role="img" aria-label="Plasma Globe web preview: branching electric filaments run from a glowing electrode to the glass. Touch or drag and they gather at your finger, release and they scatter." />
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Touch the glass and the filaments gather at your finger. Drag to lead them. Release to let them scatter.</p>
    </div>
  );
}
