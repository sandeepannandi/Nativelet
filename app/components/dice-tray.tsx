"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  allSettled, createWorld, diceValues, grabDice, moveHeld, releaseDice, stepDice, throwDice, type DiceWorld,
} from '../../packages/ui/src/components/dice-tray/diceMath';
import { TRAY_H, TRAY_W, buildFrame, staticScene, unproject, type Item } from '../../packages/ui/src/components/dice-tray/diceDesign';
import styles from './dice-tray.module.css';

const HALF_X = 3.4, HALF_Z = 4.4;

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

export function DiceTrayPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState<1 | 2 | 3>(2);
  const [slow, setSlow] = useState(false);
  const [values, setValues] = useState<number[] | null>(null);
  const [rollTick, setRollTick] = useState(0);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced, rollTick });
  latest.current = { slow, reduced, rollTick };
  const world = useRef<DiceWorld | null>(null);
  const seq = useRef(1);
  const settled = useRef(true);
  const hand = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = TRAY_W * dpr; el.height = TRAY_H * dpr;
    const w = createWorld(count, HALF_X, HALF_Z, 11);
    world.current = w;
    settled.current = true;
    const st = staticScene(HALF_X, HALF_Z);
    const mk = (items: Item[]) => {
      const c = document.createElement('canvas');
      c.width = TRAY_W * dpr; c.height = TRAY_H * dpr;
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(x, items, dpr);
      return c;
    };
    const back = mk(st.back), front = mk(st.front);
    let rollSeen = latest.current.rollTick;
    let raf = 0, last = 0;
    const startRoll = () => {
      seq.current += 1;
      throwDice(w, [Math.sin(seq.current * 1.7) * 1.2, 2.4, HALF_Z * 0.78], [Math.sin(seq.current * 2.9) * 3.2, 4, -(13 + (seq.current % 4) * 1.6)], 1, seq.current * 7919);
      settled.current = false;
      setValues(null);
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      if (latest.current.rollTick !== rollSeen) {
        rollSeen = latest.current.rollTick;
        startRoll();
        if (latest.current.reduced) {
          let t = 0;
          while (t < 12 && !allSettled(w)) { stepDice(w, 1 / 60); t += 1 / 60; }
        }
      }
      const held = w.dice.some((d) => d.held);
      if (held) moveHeld(w, unproject(hand.current.x, hand.current.y, 2.3), Math.min(dt, 0.05));
      if (!latest.current.reduced) stepDice(w, dt * (latest.current.slow ? 0.25 : 1));
      w.impact = 0;
      if (!settled.current && !held && allSettled(w)) {
        settled.current = true;
        setValues(diceValues(w));
      }
      const f = buildFrame(w);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(ctx, f.shadows, dpr);
      paintItems(ctx, f.dice, dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(front, 0, 0);
    };
    raf = requestAnimationFrame(tick);

    const pos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      hand.current = { x: ((e.clientX - r.left) / r.width) * TRAY_W, y: ((e.clientY - r.top) / r.height) * TRAY_H };
    };
    const down = (e: PointerEvent) => {
      if (latest.current.reduced) return;
      el.setPointerCapture(e.pointerId);
      pos(e);
      seq.current += 1;
      grabDice(w, seq.current * 31);
      settled.current = false;
      setValues(null);
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => { if (w.dice.some((d) => d.held)) pos(e); };
    const up = () => {
      if (w.dice.some((d) => d.held)) releaseDice(w, seq.current * 17);
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
  }, [count]);

  const total = values ? values.reduce((a, b) => a + b, 0) : 0;
  return (
    <div className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A felt dice tray. Drag to pick up the dice, flick to throw them." />
      <div className={styles.readout} aria-live="polite">
        {values ? `${values.join(' + ')}${values.length > 1 ? ` = ${total}` : ''}` : 'Drag to pick up, flick to throw'}
      </div>
      <div className={styles.controls}>
        <button type="button" onClick={() => { setValues(null); setRollTick((v) => v + 1); }}>Roll</button>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" aria-pressed={count === n} onClick={() => { setCount(n); setValues(null); }}>{n} {n === 1 ? 'die' : 'dice'}</button>
        ))}
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
