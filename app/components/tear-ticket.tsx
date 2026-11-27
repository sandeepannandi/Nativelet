"use client";
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  TH, TW, advance, createWorld, drag, grab, isTorn, release, reset, settleNow, startAuto, type TearWorld,
} from '../../packages/ui/src/components/tear-ticket/tearMath';
import { buildFrame, mainKey, mainLayer, staticScene, type Item } from '../../packages/ui/src/components/tear-ticket/tearDesign';
import styles from './tear-ticket.module.css';

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
      const subs = it.extra ? [it.pts, ...it.extra] : [it.pts];
      for (const pts of subs) {
        for (let i = 0; i < pts.length; i += 2) {
          if (i) ctx.lineTo(pts[i], pts[i + 1]); else ctx.moveTo(pts[i], pts[i + 1]);
        }
        if (it.stroke === undefined || it.closed !== false) ctx.closePath();
      }
    }
    if (it.k === 'poly' && it.stroke !== undefined) {
      ctx.strokeStyle = fill;
      ctx.lineWidth = it.stroke;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill('nonzero');
    }
    ctx.restore();
  }
}

export function TearTicketPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const [torn, setTorn] = useState(false);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced });
  latest.current.slow = slow; latest.current.reduced = reduced;
  const actions = useRef<{ tear: () => void; fresh: () => void }>({ tear: () => {}, fresh: () => {} });

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = TW * dpr; el.height = TH * dpr;
    let w: TearWorld = createWorld(3);
    (el as unknown as { __world: () => TearWorld }).__world = () => w;
    const table = document.createElement('canvas');
    table.width = TW * dpr; table.height = TH * dpr;
    const tx = table.getContext('2d')!;
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintItems(tx, staticScene(), dpr);
    let mainPic: HTMLCanvasElement | null = null;
    let mainSig = -1;
    const paintMain = () => {
      const c = document.createElement('canvas');
      c.width = TW * dpr; c.height = TH * dpr;
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintItems(x, mainLayer(w), dpr);
      mainPic = c;
    };
    let raf = 0, last = 0, tornSent = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      w.slowRate = latest.current.slow ? 0.25 : 1;
      advance(w, dt * w.slowRate);
      if (latest.current.reduced && isTorn(w) && !w.rest) settleNow(w);
      w.events.length = 0;
      if (isTorn(w) && !tornSent) { tornSent = true; setTorn(true); }
      const sig = mainKey(w);
      if (sig !== mainSig || !mainPic) { paintMain(); mainSig = sig; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(table, 0, 0);
      ctx.drawImage(mainPic!, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = buildFrame(w);
      paintItems(ctx, f.stubShadow, dpr);
      paintItems(ctx, f.stub, dpr);
      paintItems(ctx, f.overlay, dpr);
    };
    raf = requestAnimationFrame(tick);
    actions.current = {
      tear: () => {
        if (startAuto(w) && latest.current.reduced) {
          let g = 0;
          while ((w.auto || (w.mode === 'free' && !w.rest)) && g++ < 20000) advance(w, 1 / 60);
        }
      },
      fresh: () => { w = reset(w); tornSent = false; setTorn(false); (el as unknown as { __world: () => TearWorld }).__world = () => w; },
    };
    const pos = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * TW, ((e.clientY - r.top) / r.height) * TH];
    };
    const down = (e: PointerEvent) => {
      const [x, y] = pos(e);
      if (grab(w, x, y)) el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => { const [x, y] = pos(e); drag(w, x, y); };
    const up = () => release(w);
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
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label="A perforated event ticket with a stub. Press the stub and pull it away to tear it off along the perforation, or use the Tear it button. A short pull tears part of the way and the stub stays bent; a long pull takes it off, and it falls like paper." />
      <div className={styles.readout} aria-live="polite">{torn ? 'Stub torn off. Admitted.' : 'Pull the stub away to tear it off'}</div>
      <div className={styles.controls}>
        <button type="button" onClick={() => actions.current.fresh()}>New ticket</button>
        <button type="button" onClick={() => actions.current.tear()}>Tear it</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>Slow motion: {slow ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
