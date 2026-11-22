"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createSling, slMove, slRelease, slScene, slTouch, fireDefault, reload, stepSl, SL_H, SL_W } from '../../packages/ui/src/components/slingshot/slingMath';
import styles from './slingshot.module.css';

export function SlingshotPreview() {
  const canvas = useRef<HTMLCanvasElement>(null), sim = useRef(createSling());
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced }); latest.current = { slow, reduced };
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) { setUnavailable(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = SL_W * dpr; el.height = SL_H * dpr;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      stepSl(sim.current, dt * (latest.current.slow ? 0.22 : 1) * (latest.current.reduced ? 0.55 : 1), latest.current.reduced);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, SL_W, SL_H);
      for (const m of slScene(sim.current)) {
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
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * SL_W / r.width, y: (e.clientY - r.top) * SL_H / r.height }; };
    const down = (e: PointerEvent) => { if (pointer !== -1) return; const p = local(e); if (slTouch(sim.current, p.x, p.y) === 'none') return; pointer = e.pointerId; el.setPointerCapture(pointer); };
    const move = (e: PointerEvent) => { if (e.pointerId !== pointer) return; const p = local(e); slMove(sim.current, p.x, p.y); };
    const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = -1; slRelease(sim.current); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  if (unavailable) return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
  return <div className={styles.stage}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Slingshot. Drag the pouch back to stretch the rubber band, then release to launch the ball." tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fireDefault(sim.current); } else if (e.key === 'ArrowUp') { e.preventDefault(); reload(sim.current); } }} />
    <div className={styles.controls}>
      <button onClick={() => fireDefault(sim.current)}>Fire</button>
      <button onClick={() => reload(sim.current)}>Reload</button>
      <button aria-pressed={slow} onClick={() => setSlow(v => !v)}>{slow ? 'Slow motion on' : 'Slow motion'}</button>
    </div>
  </div>;
}
