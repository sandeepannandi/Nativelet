"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { STEP_COUNT } from '../../packages/ui/src/components/origami-fold/foldMath';
import { FOLD_H, FOLD_W, buildFrame, staticScene, type Item } from '../../packages/ui/src/components/origami-fold/foldDesign';
import styles from './origami-fold.module.css';

const NAMES = ['Flat sheet', 'Corner to corner', 'Tip tucked down', 'Left half over', 'Base folded up'];
const PX_PER_STEP = 150;

/* Paint a draw list with Canvas2D. Blur uses the shadow trick so it works in every browser. */
function paintItems(ctx: CanvasRenderingContext2D, items: Item[], dpr: number) {
  for (const it of items) {
    if (it.k === 'poly') {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < it.pts.length; i += 2) {
        if (i) ctx.lineTo(it.pts[i], it.pts[i + 1]); else ctx.moveTo(it.pts[i], it.pts[i + 1]);
      }
      ctx.closePath();
      ctx.globalAlpha = it.alpha ?? 1;
      if (it.blur) {
        const OFF = 6000;
        ctx.shadowColor = it.color;
        ctx.shadowBlur = it.blur * dpr;
        ctx.shadowOffsetX = OFF * dpr;
        ctx.translate(-OFF, 0);
        ctx.fillStyle = it.color;
        ctx.fill();
      } else {
        if (it.grad) {
          const g = ctx.createLinearGradient(it.grad.x0, it.grad.y0, it.grad.x1, it.grad.y1);
          g.addColorStop(0, it.grad.c0);
          g.addColorStop(1, it.grad.c1);
          ctx.fillStyle = g;
        } else ctx.fillStyle = it.color;
        ctx.fill();
      }
      ctx.restore();
    } else if (it.k === 'dots') {
      ctx.fillStyle = it.color;
      ctx.globalAlpha = it.alpha;
      for (let i = 0; i < it.pts.length; i += 2) ctx.fillRect(it.pts[i], it.pts[i + 1], it.size, it.size);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = it.width;
      ctx.globalAlpha = it.alpha ?? 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(it.pts[0], it.pts[1]);
      ctx.lineTo(it.pts[2], it.pts[3]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

export function OrigamiFoldPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const [at, setAt] = useState(0);
  const [targetUi, setTargetUi] = useState(0);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced, targetUi });
  latest.current = { slow, reduced, targetUi };
  const sim = useRef({ u: 0, v: 0, target: 0, held: false, lastStep: 0 });

  useEffect(() => {
    const s = sim.current;
    if (!s.held) s.target = targetUi;
  }, [targetUi]);

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = FOLD_W * dpr; el.height = FOLD_H * dpr;
    const bg = document.createElement('canvas');
    bg.width = FOLD_W * dpr; bg.height = FOLD_H * dpr;
    const bx = bg.getContext('2d')!;
    bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintItems(bx, staticScene().back, dpr);
    let raf = 0, last = 0, lastU = -1;
    const s = sim.current;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      if (!s.held) {
        if (latest.current.reduced) { s.u = s.target; s.v = 0; }
        else {
          const k = 70, c = 2 * Math.sqrt(k) * 0.8, h = dt * (latest.current.slow ? 0.25 : 1);
          const n = Math.max(1, Math.ceil(h / 0.004));
          for (let i = 0; i < n; i++) { s.v += ((k * (s.target - s.u) - c * s.v) * h) / n; s.u += (s.v * h) / n; }
          s.u = Math.max(0, Math.min(STEP_COUNT, s.u));
          if (Math.abs(s.target - s.u) < 0.0008 && Math.abs(s.v) < 0.01) { s.u = s.target; s.v = 0; }
        }
        const nearest = Math.round(s.u);
        if (Math.abs(s.u - nearest) < 0.0001 && nearest !== s.lastStep) { s.lastStep = nearest; setAt(nearest); setTargetUi(nearest); }
      }
      if (Math.abs(s.u - lastU) < 1e-5) return;
      lastU = s.u;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(ctx, buildFrame(s.u), dpr);
    };
    raf = requestAnimationFrame(tick);

    let px = 0, pt = 0, pv = 0;
    const down = (e: PointerEvent) => {
      if (latest.current.reduced) return;
      el.setPointerCapture(e.pointerId);
      s.held = true; s.v = 0; px = e.clientX; pt = performance.now(); pv = 0;
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!s.held) return;
      const r = el.getBoundingClientRect();
      const scale = r.width / FOLD_W;
      const du = ((e.clientX - px) / scale) / PX_PER_STEP;
      const now = performance.now();
      s.u = Math.max(0, Math.min(STEP_COUNT, s.u + du));
      pv = pv * 0.6 + (du / Math.max(0.001, (now - pt) / 1000)) * 0.4;
      px = e.clientX; pt = now;
    };
    const up = () => {
      if (!s.held) return;
      s.held = false;
      s.target = Math.max(0, Math.min(STEP_COUNT, Math.round(s.u + Math.max(-1, Math.min(1, pv * 0.22)))));
      s.v = Math.max(-6, Math.min(6, pv));
      el.style.cursor = 'grab';
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

  return (
    <div className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A sheet of origami paper on a desk. Drag sideways to fold it step by step, drag back to unfold." />
      <div className={styles.readout} aria-live="polite">Step {at} of {STEP_COUNT}: {NAMES[at]}</div>
      <div className={styles.controls}>
        <button type="button" disabled={targetUi <= 0} onClick={() => setTargetUi((t) => Math.max(0, t - 1))}>Unfold</button>
        <button type="button" disabled={targetUi >= STEP_COUNT} onClick={() => setTargetUi((t) => Math.min(STEP_COUNT, t + 1))}>Fold</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
