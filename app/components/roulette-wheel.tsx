"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  DEFAULT_SPEED, MAX_SPEED, MIN_SPEED, advance, colorOf, createWorld, launch, simulateToRest, type RouletteWorld,
} from '../../packages/ui/src/components/roulette-wheel/rouletteMath';
import { WHEEL_H, WHEEL_W, buildFrame, staticScene, type Item } from '../../packages/ui/src/components/roulette-wheel/rouletteDesign';
import styles from './roulette-wheel.module.css';

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

export function RouletteWheelPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced, spin: 0 as number });
  latest.current.slow = slow; latest.current.reduced = reduced;
  const startRef = useRef<(speed: number) => void>(() => {});

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = WHEEL_W * dpr; el.height = WHEEL_H * dpr;
    const w: RouletteWorld = createWorld(11);
    (el as unknown as { __world: RouletteWorld }).__world = w;
    const st = staticScene();
    const mk = (items: Item[]) => {
      const c = document.createElement('canvas');
      c.width = WHEEL_W * dpr; c.height = WHEEL_H * dpr;
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(x, items, dpr);
      return c;
    };
    const back = mk(st.back), front = mk(st.front);
    let power = 0, charging = false, sx = 0, sy = 0, seq = 1;
    let raf = 0, last = 0, done = true;
    const begin = (speed: number) => {
      if (!done) return;
      seq += 1;
      launch(w, speed, seq * 7919);
      done = false;
      setResult(null); setRunning(true);
      if (latest.current.reduced) {
        simulateToRest(w);
      }
    };
    startRef.current = begin;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      if (!latest.current.reduced) advance(w, dt * (latest.current.slow ? 0.25 : 1));
      if (!done && w.ball.locked) {
        done = true; setRunning(false); setResult(w.result);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = buildFrame(w, { power, charging });
      paintItems(ctx, f.dyn, dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(front, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(ctx, f.overlay, dpr);
    };
    raf = requestAnimationFrame(tick);
    const pos = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * WHEEL_W, ((e.clientY - r.top) / r.height) * WHEEL_H];
    };
    const down = (e: PointerEvent) => {
      if (!done) return;
      [sx, sy] = pos(e);
      charging = true; power = 0;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!charging) return;
      const [x, y] = pos(e);
      const d = Math.hypot(x - sx, y - sy);
      power = d < 10 ? 0 : Math.min(1, (d - 10) / 110);
    };
    const up = () => {
      if (!charging) return;
      charging = false;
      const speed = power > 0 ? MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power : DEFAULT_SPEED;
      power = 0;
      begin(speed);
    };
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

  const label = result === null ? null : `${result} ${colorOf(result)}`;
  return (
    <div className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A roulette wheel. Tap to spin it and send the ball round the track, or press and drag away from where you touched to set how hard the ball is launched. The ball drops through the deflectors, bounces between the pockets and settles." />
      <div className={styles.readout} aria-live="polite">{running ? 'Ball in play' : label ?? 'Tap to spin · drag to set the launch speed'}</div>
      <div className={styles.controls}>
        <button type="button" disabled={running} onClick={() => startRef.current(DEFAULT_SPEED)}>Spin</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
