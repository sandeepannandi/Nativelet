"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createPot, potCenters, potMove, potRelease, potScene, potTouch, stepPot, POT_BASE, POT_CX, POT_H, POT_W } from '../../packages/ui/src/components/pottery-wheel/potteryMath';
import styles from './pottery-wheel.module.css';

export function PotteryWheelPreview() {
  const canvas = useRef<HTMLCanvasElement>(null), sim = useRef(createPot());
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced }); latest.current = { slow, reduced };
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) { setUnavailable(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = POT_W * dpr; el.height = POT_H * dpr;
    let raf = 0, last = 0, lastMove = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      stepPot(sim.current, dt * (latest.current.slow ? 0.22 : 1), latest.current.reduced);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, POT_W, POT_H);
      for (const m of potScene(sim.current)) {
        const p = new Path2D(m.path);
        ctx.globalAlpha = m.alpha ?? 1;
        if (m.grad) {
          const g = ctx.createLinearGradient(m.grad.x0, 0, m.grad.x1, 0);
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
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * POT_W / r.width, y: (e.clientY - r.top) * POT_H / r.height }; };
    const down = (e: PointerEvent) => { if (pointer !== -1) return; const p = local(e); if (!potTouch(sim.current, p.x, p.y)) return; pointer = e.pointerId; lastMove = performance.now(); el.setPointerCapture(pointer); };
    const move = (e: PointerEvent) => { if (e.pointerId !== pointer) return; const p = local(e); const n = performance.now(); potMove(sim.current, p.x, p.y, Math.min(0.05, (n - lastMove) / 1000) || 1 / 60); lastMove = n; };
    const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = -1; potRelease(sim.current); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  const nudge = (direction: 'in' | 'out') => {
    const s = sim.current, { centers } = potCenters(s.r), i = Math.floor(centers.length / 2), y = POT_BASE - centers[i];
    potTouch(s, POT_CX + s.r[i], y);
    for (let k = 0; k < 45; k++) { potMove(s, POT_CX + (direction === 'in' ? s.r[i] - 30 : s.r[i] + 30), y, 1 / 60); stepPot(s, 1 / 60, latest.current.reduced); }
    potRelease(s);
  };
  if (unavailable) return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
  return <div className={styles.stage}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Spinning clay on a pottery wheel. Drag across its side to shape it. Arrow keys press or pull the waist." tabIndex={0}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge('in'); } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge('out'); } }} />
    <div className={styles.controls}>
      <button onClick={() => { sim.current = createPot(); }}>New clay</button>
      <button aria-pressed={slow} onClick={() => setSlow(v => !v)}>{slow ? 'Slow motion on' : 'Slow motion'}</button>
    </div>
  </div>;
}
