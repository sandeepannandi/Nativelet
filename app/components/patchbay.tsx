"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createBay, moveCable, releaseCable, bayScene, grabCable, cycleConnection, stepBay, CH, CW } from '../../packages/ui/src/components/patchbay/cableMath';
import styles from './patchbay.module.css';

export function CablePatchbayPreview() {
  const canvas = useRef<HTMLCanvasElement>(null), sim = useRef(createBay());
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced }); latest.current = { slow, reduced };
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) { setUnavailable(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = CW * dpr; el.height = CH * dpr;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      stepBay(sim.current, dt * (latest.current.slow ? 0.22 : 1));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, CW, CH);
      for (const m of bayScene(sim.current, latest.current.reduced)) {
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
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * CH / r.height }; };
    const down = (e: PointerEvent) => { if (pointer !== -1) return; const p = local(e); if (!grabCable(sim.current, p.x, p.y)) return; pointer = e.pointerId; el.setPointerCapture(pointer); };
    const move = (e: PointerEvent) => { if (e.pointerId !== pointer) return; const p = local(e); moveCable(sim.current, p.x, p.y); };
    const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = -1; releaseCable(sim.current, e.type !== 'pointerup'); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);
  if (unavailable) return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
  return <div className={styles.stage}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Cable Patchbay. Drag a plug into a free socket. Press Enter to reroute the gold cable, Arrow Up to reset." tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cycleConnection(sim.current); } else if (e.key === 'ArrowUp') { e.preventDefault(); sim.current=createBay(); } }} />
    <div className={styles.controls}>
      <button onClick={() => cycleConnection(sim.current)}>Reroute</button>
      <button onClick={() => {sim.current=createBay();}}>Reset</button>
      <button aria-pressed={slow} onClick={() => setSlow(v => !v)}>{slow ? 'Slow motion on' : 'Slow motion'}</button>
    </div>
  </div>;
}
