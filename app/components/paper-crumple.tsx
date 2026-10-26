"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  CR_H, CR_LEVELS, CR_W, buildCrumple, crumpleDown, crumpleMove, crumplePinch, crumpleSmooth,
  crumpleUp, createCrumple, stepCrumple, triVerts, type CrumpleState,
} from "../../packages/ui/src/components/paper-crumple/crumpleMath";
import { CRUMPLE_BG_BOTTOM, CRUMPLE_BG_TOP, CRUMPLE_COLORS } from "../../packages/ui/src/components/paper-crumple/crumpleDesign";
import styles from "./paper-crumple.module.css";

export function PaperCrumplePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<CrumpleState | null>(null);
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
    canvas.width = CR_W * dpr;
    canvas.height = CR_H * dpr;
    const sim: CrumpleState = createCrumple();
    simRef.current = sim;
    const tri = [0, 0, 0];

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, CR_W * 0.4, CR_H);
      bg.addColorStop(0, CRUMPLE_BG_TOP);
      bg.addColorStop(1, CRUMPLE_BG_BOTTOM);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CR_W, CR_H);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let v = 0; v < sim.sx.length; v++) {
        if (sim.sx[v] < x0) x0 = sim.sx[v];
        if (sim.sx[v] > x1) x1 = sim.sx[v];
        if (sim.sy[v] < y0) y0 = sim.sy[v];
        if (sim.sy[v] > y1) y1 = sim.sy[v];
      }
      const w = x1 - x0;
      const h = y1 - y0;
      ctx.save();
      ctx.filter = `blur(${5 + Math.min(10, w * 0.04)}px)`;
      ctx.fillStyle = "rgba(40,34,24,0.34)";
      ctx.beginPath();
      ctx.ellipse(x0 + w * 0.08 + 6 + (w * 0.86) / 2, y0 + h * 0.78 + 4 + Math.max(10, h * 0.28) / 2, (w * 0.86) / 2, Math.max(10, h * 0.28) / 2, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
      for (let b = 0; b < sim.bstart.length - 1; b++) {
        if (sim.bstart[b] === sim.bstart[b + 1]) continue;
        const color = CRUMPLE_COLORS[Math.floor((b % (2 * CR_LEVELS)) / CR_LEVELS)][b % CR_LEVELS];
        ctx.beginPath();
        for (let k = sim.bstart[b]; k < sim.bstart[b + 1]; k++) {
          triVerts(sim.order[k], tri);
          ctx.moveTo(sim.sx[tri[0]], sim.sy[tri[0]]);
          ctx.lineTo(sim.sx[tri[1]], sim.sy[tri[1]]);
          ctx.lineTo(sim.sx[tri[2]], sim.sy[tri[2]]);
          ctx.closePath();
        }
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.9;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    };

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        sim.c = sim.target;
        if (sim.c > sim.mem) sim.mem = sim.c;
        sim.vx = 0;
        sim.vy = 0;
      } else {
        stepCrumple(sim, dt * (latest.current.slow ? 0.22 : 1));
      }
      buildCrumple(sim);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Pointer handling: one pointer crumples or carries, two pointers pinch.
    const pointers = new Map<number, { x: number; y: number }>();
    let startDist = 1;
    let pinching = false;
    let locked = false;
    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * CR_W, y: ((ev.clientY - rect.top) / rect.height) * CR_H };
    };
    const pinchDist = () => {
      const [a, b] = Array.from(pointers.values());
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    };
    const down = (ev: PointerEvent) => {
      const p = local(ev);
      pointers.set(ev.pointerId, p);
      canvas.setPointerCapture(ev.pointerId);
      if (pointers.size === 1) {
        locked = false;
        pinching = false;
        crumpleDown(sim, p.x, p.y, ev.timeStamp);
      } else if (pointers.size === 2 && !pinching) {
        pinching = true;
        startDist = pinchDist();
      }
    };
    const move = (ev: PointerEvent) => {
      if (!pointers.has(ev.pointerId)) return;
      const p = local(ev);
      pointers.set(ev.pointerId, p);
      if (pointers.size >= 2) {
        if (!pinching) {
          pinching = true;
          startDist = pinchDist();
        }
        crumplePinch(sim, pinchDist() / startDist, true);
      } else if (!locked && !pinching) {
        crumpleMove(sim, p.x, p.y, ev.timeStamp);
      }
    };
    const up = (ev: PointerEvent) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.delete(ev.pointerId);
      if (pinching) {
        crumplePinch(sim, 1, false);
        pinching = false;
        locked = true;
      } else if (!locked) {
        crumpleUp(sim, ev.timeStamp);
      }
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
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: CR_W, height: CR_H }} role="img" aria-label="Paper crumple web preview: drag a corner toward the middle to crumple a sheet into a ball, flick the ball to toss it, double click it to smooth it out" />
      <div className={styles.row}>
        <button type="button" className={styles.chip} onClick={() => { if (simRef.current) crumpleSmooth(simRef.current); }}>Smooth out</button>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Drag a corner toward the middle to crumple. Flick the ball to toss it. Double click it, or press Smooth out, to open it.</p>
    </div>
  );
}
