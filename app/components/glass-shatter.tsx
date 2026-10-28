"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { createWorld, shardGlint, shardRefraction, stepWorld, type World } from "../../packages/ui/src/components/glass-shatter/shatterMath";
import { PANE_H, PANE_W, SHATTER_BACKDROP, glassSceneDesign } from "../../packages/ui/src/components/glass-shatter/shatterDesign";
import styles from "./glass-shatter.module.css";

function drawScene(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = SHATTER_BACKDROP;
  ctx.fillRect(0, 0, PANE_W, PANE_H);
  for (const it of glassSceneDesign()) {
    if (it.k === "vgrad") {
      const g = ctx.createLinearGradient(0, it.y, 0, it.y + it.h);
      g.addColorStop(0, it.from);
      if (it.mid) g.addColorStop(0.55, it.mid);
      g.addColorStop(1, it.to);
      ctx.fillStyle = g;
      ctx.fillRect(it.x, it.y, it.w, it.h);
    } else if (it.k === "rect") {
      ctx.fillStyle = it.color;
      ctx.fillRect(it.x, it.y, it.w, it.h);
    } else if (it.k === "circle") {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(it.points[0], it.points[1]);
      for (let i = 2; i < it.points.length; i += 2) ctx.lineTo(it.points[i], it.points[i + 1]);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function GlassShatterPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
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
    canvas.width = PANE_W * dpr;
    canvas.height = PANE_H * dpr;
    const scene = document.createElement("canvas");
    scene.width = PANE_W;
    scene.height = PANE_H;
    const sctx = scene.getContext("2d")!;
    drawScene(sctx);
    let hits = 0;
    const off = [0, 0];
    let last = 0;
    let raf = 0;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(scene, 0, 0);
      const w = worldRef.current;
      if (!w) {
        const g = ctx.createLinearGradient(0, 0, PANE_W * 0.8, PANE_H);
        g.addColorStop(0, "rgba(255,255,255,0.15)");
        g.addColorStop(0.5, "rgba(255,255,255,0.03)");
        g.addColorStop(1, "rgba(255,255,255,0.11)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, PANE_W, PANE_H);
        ctx.strokeStyle = "rgba(255,255,255,0.33)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(1, 1, PANE_W - 2, PANE_H - 2);
        return;
      }
      for (const b of w.bodies) {
        if (b.gone) continue;
        const c = Math.cos(b.a);
        const s = Math.sin(b.a);
        shardRefraction(b, off);
        ctx.save();
        ctx.beginPath();
        for (let k = 0; k < b.local.length; k++) {
          const p = b.local[k];
          const x = b.x + p.x * c - p.y * s;
          const y = b.y + p.x * s + p.y * c;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
        // The glass is clear: the shard shows the picture behind where it is now, bent by its tilt.
        ctx.drawImage(scene, off[0], off[1]);
        ctx.fillStyle = `rgba(255,255,255,${((b.held ? 0.18 : shardGlint(b)) * 0.5).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let k = 0; k < b.local.length; k++) {
          const p = b.local[k];
          const x = b.x + p.x * c - p.y * s;
          const y = b.y + p.x * s + p.y * c;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    };
    const loop = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      const w = worldRef.current;
      if (w && !latest.current.reduced) stepWorld(w, dt * (latest.current.slow ? 0.25 : 1));
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const strike = (x: number, y: number) => {
      if (worldRef.current) return;
      hits++;
      worldRef.current = createWorld({ width: PANE_W, height: PANE_H, hitX: Math.max(2, Math.min(PANE_W - 2, x)), hitY: Math.max(2, Math.min(PANE_H - 2, y)), seed: (hits * 7919) % 100000, target: 360 });
    };
    const down = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      strike(((ev.clientX - rect.left) / rect.width) * PANE_W, ((ev.clientY - rect.top) / rect.height) * PANE_H);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); strike(PANE_W / 2, PANE_H / 2); }
    };
    canvas.addEventListener("keydown", key);
    canvas.addEventListener("pointerdown", down);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: PANE_W, height: PANE_H }} role="button" tabIndex={0} aria-label="Glass shatter web preview: tap the pane to break it; about 360 shards fall away, colliding as they go" />
      <div className={styles.row}>
        <button type="button" className={styles.chipPrimary} onClick={() => { worldRef.current = null; }}>Reset glass</button>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>A pane over a harbor at sunrise. Tap anywhere to break it. Reset puts a whole pane back.</p>
    </div>
  );
}
