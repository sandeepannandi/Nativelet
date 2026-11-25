"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  createWorld, holdGlobe, moveGlobe, releaseGlobe, startShake, stepSnow, type SnowWorld,
} from '../../packages/ui/src/components/snow-globe/snowMath';
import { GLOBE_H, GLOBE_W, RP, buildFrame, staticScene, type Item } from '../../packages/ui/src/components/snow-globe/snowDesign';
import styles from './snow-globe.module.css';

/* Paint a draw list with Canvas2D. Blur uses the shadow trick so it works in every browser. */
export function paintItems(ctx: CanvasRenderingContext2D, items: Item[], dpr: number) {
  for (const it of items) {
    ctx.save();
    ctx.globalAlpha = it.alpha ?? 1;
    let fill: string | CanvasGradient = it.color;
    if (it.rgrad) {
      const g = ctx.createRadialGradient(it.rgrad.cx, it.rgrad.cy, 0, it.rgrad.cx, it.rgrad.cy, it.rgrad.r);
      g.addColorStop(0, it.rgrad.c0); g.addColorStop(1, it.rgrad.c1);
      fill = g;
    } else if (it.k === 'poly' && it.grad) {
      const g = ctx.createLinearGradient(it.grad.x0, it.grad.y0, it.grad.x1, it.grad.y1);
      g.addColorStop(0, it.grad.c0); g.addColorStop(1, it.grad.c1);
      fill = g;
    }
    const OFF = 6000;
    if (it.blur) {
      ctx.shadowColor = it.color;
      ctx.shadowBlur = it.blur * dpr;
      ctx.shadowOffsetX = OFF * dpr;
      ctx.translate(-OFF, 0);
    }
    ctx.beginPath();
    if (it.k === 'circ') {
      ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
    } else {
      for (let i = 0; i < it.pts.length; i += 2) {
        if (i) ctx.lineTo(it.pts[i], it.pts[i + 1]); else ctx.moveTo(it.pts[i], it.pts[i + 1]);
      }
      if (it.stroke === undefined || it.closed !== false) ctx.closePath();
    }
    if (it.k === 'poly' && it.stroke !== undefined) {
      ctx.strokeStyle = fill;
      ctx.lineWidth = it.stroke;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.restore();
  }
}

export function SnowGlobePreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced, shakeTick });
  latest.current = { slow, reduced, shakeTick };

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = GLOBE_W * dpr; el.height = GLOBE_H * dpr;
    const w: SnowWorld = createWorld(720, 7);
    (el as unknown as { __world: SnowWorld }).__world = w;
    const st = staticScene();
    const mk = (items: Item[]) => {
      const c = document.createElement('canvas');
      c.width = GLOBE_W * dpr; c.height = GLOBE_H * dpr;
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(x, items, dpr);
      return c;
    };
    const layers = st.layers.map((l) => mk(l.items));
    const glass = mk(st.glass);
    const shadowC = mk(st.shadow);
    let shakeSeen = latest.current.shakeTick;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      if (latest.current.shakeTick !== shakeSeen) {
        shakeSeen = latest.current.shakeTick;
        if (!latest.current.reduced) startShake(w, 1);
      }
      if (!latest.current.reduced) stepSnow(w, dt * (latest.current.slow ? 0.25 : 1));
      const f = buildFrame(w, st.layers);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(shadowC, 0, 0);
      const ox = f.dx * dpr, oy = f.dy * dpr;
      for (let i = 0; i < layers.length; i++) {
        ctx.drawImage(layers[i], ox, oy);
        if (f.slots[i].length) {
          ctx.save(); ctx.translate(ox, oy); ctx.scale(dpr, dpr);
          paintItems(ctx, f.slots[i], dpr);
          ctx.restore();
        }
      }
      ctx.drawImage(glass, ox, oy);
    };
    raf = requestAnimationFrame(tick);

    let grab: { x: number; y: number } | null = null;
    const pos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * GLOBE_W, y: ((e.clientY - r.top) / r.height) * GLOBE_H };
    };
    const down = (e: PointerEvent) => {
      if (latest.current.reduced) return;
      el.setPointerCapture(e.pointerId);
      grab = pos(e);
      holdGlobe(w, 0, 0);
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!grab) return;
      const p = pos(e);
      moveGlobe(w, (p.x - grab.x) / RP, -(p.y - grab.y) / RP);
    };
    const up = () => { if (grab) { grab = null; releaseGlobe(w); } el.style.cursor = 'grab'; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A snow globe with a small cottage and pines. Drag the globe or shake it and the snow swirls, then slowly settles." />
      <div className={styles.controls}>
        <button type="button" onClick={() => setShakeTick((v) => v + 1)}>Shake</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
