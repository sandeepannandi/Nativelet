"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FoldController } from '../../packages/ui/src/components/origami-fold/foldController';
import { FOLD_H, FOLD_W, staticScene, type Item } from '../../packages/ui/src/components/origami-fold/foldDesign';
import styles from './origami-fold.module.css';


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
  const [folds, setFolds] = useState(0);
  const reduced = !!useReducedMotion();
  const ctl = useRef<FoldController | null>(null);
  if (!ctl.current) ctl.current = new FoldController();
  const c = ctl.current;
  c.slowMotion = slow;
  c.reduced = reduced;
  c.onChange = setFolds;

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
    let raf = 0, last = 0, first = true;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      if (!c.update(dt) && !first) return;
      first = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(ctx, c.frame(), dpr);
    };
    raf = requestAnimationFrame(tick);
    const pos = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * FOLD_W, ((e.clientY - r.top) / r.height) * FOLD_H];
    };
    const down = (e: PointerEvent) => {
      const [x, y] = pos(e);
      if (!c.down(x, y)) return;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => { const [x, y] = pos(e); c.move(x, y); };
    const up = () => { c.up(); el.style.cursor = 'grab'; };
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
  }, [c]);

  return (
    <div className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A sheet of origami paper on a desk. Press anywhere on the paper and drag in any direction to fold it." />
      <div className={styles.readout} aria-live="polite">{folds === 0 ? 'Press the paper and drag any way to fold it' : `${folds} fold${folds === 1 ? '' : 's'}`}</div>
      <div className={styles.controls}>
        <button type="button" disabled={folds === 0} onClick={() => c.undo()}>Undo</button>
        <button type="button" disabled={folds === 0} onClick={() => c.reset()}>Reset</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
