"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { createWorld, mulberry32, shardGlint, shardRefraction, stepWorld, type Body, type World } from "../../packages/ui/src/components/glass-shatter/shatterMath";
import { PANE_H, PANE_W, SHATTER_BACKDROP, glassSceneDesign } from "../../packages/ui/src/components/glass-shatter/shatterDesign";
import styles from "./glass-shatter.module.css";

// Fixed light from the upper left, the same light shardGlint uses. Direction
// points from the pane toward the light.
const LIGHT_X = -0.42;
const LIGHT_Y = -0.91;

type Dust = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number };

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

function shardPath(ctx: CanvasRenderingContext2D, b: Body, c: number, s: number) {
  ctx.beginPath();
  for (let k = 0; k < b.local.length; k++) {
    const p = b.local[k];
    const x = b.x + p.x * c - p.y * s;
    const y = b.y + p.x * s + p.y * c;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Glass edges are not uniformly white: the side facing the light flares, the
// side away from it reads as a dark refracted seam. Bright edges are batched
// into a few alpha buckets so the frame stays cheap.
const BUCKETS = 4;
function drawShardEdges(ctx: CanvasRenderingContext2D, b: Body, c: number, s: number, held: boolean) {
  const n = b.local.length;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = b.local[k];
    xs.push(b.x + p.x * c - p.y * s);
    ys.push(b.y + p.x * s + p.y * c);
  }
  // Dark refracted seam under every edge, stronger once the shard is falling.
  ctx.strokeStyle = held ? "rgba(9,16,30,0.10)" : "rgba(9,16,30,0.32)";
  ctx.lineWidth = held ? 0.6 : 1.1;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    ctx.moveTo(xs[k], ys[k]);
    ctx.lineTo(xs[j], ys[j]);
  }
  ctx.stroke();
  // Bright flare only on light-facing edges, grouped into alpha buckets.
  const paths: Path2D[] = [];
  for (let q = 0; q < BUCKETS; q++) paths.push(new Path2D());
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const ex = xs[j] - xs[k];
    const ey = ys[j] - ys[k];
    const len = Math.hypot(ex, ey) || 1;
    // Outward normal of this CCW edge.
    const nx = ey / len;
    const ny = -ex / len;
    const facing = nx * LIGHT_X + ny * LIGHT_Y;
    if (facing <= 0.18) continue;
    const q = Math.min(BUCKETS - 1, Math.floor(((facing - 0.18) / 0.82) * BUCKETS));
    paths[q].moveTo(xs[k], ys[k]);
    paths[q].lineTo(xs[j], ys[j]);
  }
  ctx.lineWidth = held ? 0.6 : 0.9;
  for (let q = 0; q < BUCKETS; q++) {
    const alpha = (held ? 0.10 : 0.22) + ((q + 0.5) / BUCKETS) * (held ? 0.22 : 0.55);
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.stroke(paths[q]);
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
    let dust: Dust[] = [];
    let struckAt = -1;
    let hitX = 0;
    let hitY = 0;
    let craterSeed = 1;

    const draw = (now: number) => {
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
      // Cracked but still in the frame: the picture stays continuous and only
      // faint crack lines show, brightest near the impact like a real pane.
      for (const b of w.bodies) {
        if (b.gone || !b.held) continue;
        const c = Math.cos(b.a);
        const s = Math.sin(b.a);
        shardPath(ctx, b, c, s);
        const d = Math.hypot(b.homeX - hitX, b.homeY - hitY);
        const crack = 0.06 + 0.34 * Math.exp(-d / 150);
        ctx.fillStyle = `rgba(255,255,255,${(crack * 0.55).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${crack.toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      for (const b of w.bodies) {
        if (b.gone || b.held) continue;
        const c = Math.cos(b.a);
        const s = Math.sin(b.a);
        shardRefraction(b, off);
        ctx.save();
        shardPath(ctx, b, c, s);
        ctx.clip();
        // The glass is clear: the shard shows the picture behind where it is now, bent by its tilt.
        ctx.drawImage(scene, off[0], off[1]);
        ctx.fillStyle = `rgba(255,255,255,${(0.05 + shardGlint(b) * 0.22).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
        drawShardEdges(ctx, b, c, s, false);
      }
      // Impact point: crushed glass glows white for a moment, then fades.
      if (struckAt >= 0) {
        const t = (now - struckAt) / 1000;
        if (t < 0.55) {
          const flash = 0.5 * Math.exp(-t * 6);
          const radius = 22 + 58 * (1 - Math.exp(-t * 7));
          const g = ctx.createRadialGradient(hitX, hitY, 0, hitX, hitY, radius);
          g.addColorStop(0, `rgba(255,255,255,${flash.toFixed(3)})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hitX, hitY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (t < 2.4) {
          const rnd = mulberry32(craterSeed);
          const alpha = 0.6 * Math.exp(-t * 1.6);
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          for (let k = 0; k < 16; k++) {
            const ang = rnd() * Math.PI * 2;
            const rr = 2 + rnd() * 11;
            ctx.fillRect(hitX + Math.cos(ang) * rr, hitY + Math.sin(ang) * rr, 1.1, 1.1);
          }
        }
      }
      if (dust.length) {
        for (const p of dust) {
          const a = Math.max(0, 1 - p.age / p.life) * 0.85;
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    const loop = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      const w = worldRef.current;
      const scale = latest.current.slow ? 0.25 : 1;
      if (w && !latest.current.reduced) stepWorld(w, dt * scale);
      if (dust.length) {
        const dd = latest.current.reduced ? 0 : dt * scale;
        for (const p of dust) {
          p.age += dt;
          p.vy += 1050 * dd;
          p.x += p.vx * dd;
          p.y += p.vy * dd;
        }
        dust = dust.filter((p) => p.age < p.life && p.y < PANE_H + 10);
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const strike = (x: number, y: number) => {
      if (worldRef.current) return;
      hits++;
      hitX = Math.max(2, Math.min(PANE_W - 2, x));
      hitY = Math.max(2, Math.min(PANE_H - 2, y));
      worldRef.current = createWorld({ width: PANE_W, height: PANE_H, hitX, hitY, seed: (hits * 7919) % 100000, target: 360 });
      struckAt = performance.now();
      craterSeed = hits * 104729 + 7;
      if (!latest.current.reduced) {
        const rnd = mulberry32(craterSeed + 13);
        dust = [];
        for (let k = 0; k < 55; k++) {
          const ang = rnd() * Math.PI * 2;
          const sp = 60 + rnd() * 380;
          dust.push({
            x: hitX + (rnd() - 0.5) * 6,
            y: hitY + (rnd() - 0.5) * 6,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 70,
            age: 0,
            life: 0.5 + rnd() * 0.9,
            r: 0.5 + rnd() * 1.2,
          });
        }
      }
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
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: PANE_W, height: PANE_H }} role="button" tabIndex={0} aria-label="Glass shatter web preview: tap the pane to break it; cracks spread from the hit, then about 360 shards fall away, colliding as they go" />
      <div className={styles.row}>
        <button type="button" className={styles.chipPrimary} onClick={() => { worldRef.current = null; }}>Reset glass</button>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>A pane over a harbor at sunrise. Tap anywhere to break it. Reset puts a whole pane back.</p>
    </div>
  );
}
