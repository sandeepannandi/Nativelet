"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createDominoRun, domMove, domRelease, domScene, domTouch, pushFirst, standUp, stepDom, DOM_H, DOM_W } from '../../packages/ui/src/components/domino-run/dominoMath';
import styles from './domino-run.module.css';

export function DominoRunPreview() {
  const canvas = useRef<HTMLCanvasElement>(null), sim = useRef(createDominoRun());
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced }); latest.current = { slow, reduced };
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) { setUnavailable(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = DOM_W * dpr; el.height = DOM_H * dpr;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      stepDom(sim.current, dt * (latest.current.slow ? 0.22 : 1) * (latest.current.reduced ? 0.55 : 1), latest.current.reduced);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, DOM_W, DOM_H);
      for (const m of domScene(sim.current)) {
        const p = new Path2D(m.path);
        ctx.globalAlpha = m.alpha ?? 1;
        if (m.grad) {
          const g = ctx.createLinearGradient(m.grad.x0, m.grad.y0, m.grad.x1, m.grad.y1);
          for (const [t, c] of m.grad.stops) g.addColorStop(t, c);
          ctx.fillStyle = g; ctx.fill(p);
        } else if (m.stroke) {
          ctx.strokeStyle = m.color ?? '#000'; ctx.lineWidth = m.stroke; ctx.lineCap = m.cap ?? 'butt'; ctx.stroke(p);
        } else { ctx.fillStyle = m.color ?? '#000'; ctx.fill(p); }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let pointer = -1;
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * DOM_W / r.width, y: (e.clientY - r.top) * DOM_H / r.height }; };
    const down = (e: PointerEvent) => { if (pointer !== -1) return; const p = local(e); if (domTouch(sim.current, p.x, p.y) === 'none') return; pointer = e.pointerId; el.setPointerCapture(pointer); };
    const move = (e: PointerEvent) => { if (e.pointerId !== pointer) return; const p = local(e); domMove(sim.current, p.x, p.y); };
    const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = -1; domRelease(sim.current); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  if (unavailable) return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
  return <div className={styles.stage}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Domino run on a wooden table. Drag on empty table to draw a path, tap a domino to topple the chain, or drag a domino to move it." tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pushFirst(sim.current); } else if (e.key === 'ArrowUp') { e.preventDefault(); standUp(sim.current); } }} />
    <div className={styles.controls}>
      <button onClick={() => pushFirst(sim.current)}>Push the first</button>
      <button onClick={() => standUp(sim.current)}>Stand them up</button>
      <button aria-pressed={slow} onClick={() => setSlow(v => !v)}>{slow ? 'Slow motion on' : 'Slow motion'}</button>
    </div>
  </div>;
}
