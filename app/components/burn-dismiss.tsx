"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  ASH_STRIDE, BURN_DEFAULTS, EMBER_STRIDE, burnPointerDown, burnPointerUp,
  createBurn, fbm2, packBurn, startRestore, stepBurn, burnAt,
} from '../../packages/ui/src/components/burn-dismiss/burnMath';
import { CARD_H, CARD_W, cardScene, type SceneItem } from '../../packages/ui/src/components/burn-dismiss/burnDesign';
import styles from './burn-dismiss.module.css';

const COLS = 96, ROWS = 128;
const CFG = { cols: COLS, rows: ROWS, width: CARD_W, height: CARD_H };

function paintScene(ctx: CanvasRenderingContext2D) {
  for (const it of cardScene() as SceneItem[]) {
    if (it.k === 'vgrad') {
      const g = ctx.createLinearGradient(it.x, it.y, it.x, it.y + it.h);
      g.addColorStop(0, it.from); g.addColorStop(1, it.to);
      ctx.fillStyle = g; ctx.fillRect(it.x, it.y, it.w, it.h);
    } else if (it.k === 'rect') {
      ctx.fillStyle = it.color;
      if (!it.r) ctx.fillRect(it.x, it.y, it.w, it.h);
      else { ctx.beginPath(); ctx.roundRect(it.x, it.y, it.w, it.h, it.r); ctx.fill(); }
    } else if (it.k === 'circle') {
      ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, 6.2832); ctx.fill();
    } else if (it.k === 'poly') {
      ctx.fillStyle = it.color; ctx.beginPath();
      ctx.moveTo(it.points[0], it.points[1]);
      for (let i = 2; i < it.points.length; i += 2) ctx.lineTo(it.points[i], it.points[i + 1]);
      ctx.closePath(); ctx.fill();
    } else if (it.k === 'line') {
      ctx.strokeStyle = it.color; ctx.lineWidth = it.width; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(it.points[0], it.points[1]);
      for (let i = 2; i < it.points.length; i += 2) ctx.lineTo(it.points[i], it.points[i + 1]);
      ctx.stroke();
    } else {
      ctx.fillStyle = it.color;
      ctx.font = `${it.bold ? '700' : '400'} ${it.size}px "Geist", sans-serif`;
      ctx.textAlign = it.align ?? 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.text, it.x, it.y);
    }
  }
}

function makeSprite(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export function BurnDismissPreview() {
  const initial = useMemo(() => createBurn(CFG, BURN_DEFAULTS), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef(initial);
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  const reduced = !!useReducedMotion();
  const latest = useRef({ slow, reduced, restoreTick });
  latest.current = { slow, reduced, restoreTick };

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) { setUnavailable(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = CARD_W * dpr; el.height = CARD_H * dpr;

    // Scene painted once at card size, then read back at grid resolution.
    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = CARD_W; sceneCanvas.height = CARD_H;
    const sctx = sceneCanvas.getContext('2d')!;
    paintScene(sctx);
    const lowCanvas = document.createElement('canvas');
    lowCanvas.width = COLS; lowCanvas.height = ROWS;
    const lctx = lowCanvas.getContext('2d')!;
    lctx.drawImage(sceneCanvas, 0, 0, COLS, ROWS);
    const sceneLow = lctx.getImageData(0, 0, COLS, ROWS).data;

    const body = document.createElement('canvas');
    body.width = COLS; body.height = ROWS;
    const bctx = body.getContext('2d')!;
    const frame = bctx.createImageData(COLS, ROWS);
    const mask = document.createElement('canvas');
    mask.width = COLS; mask.height = ROWS;
    const mctx = mask.getContext('2d')!;
    const maskImg = mctx.createImageData(COLS, ROWS);
    const stage = document.createElement('canvas');
    stage.width = CARD_W; stage.height = CARD_H;
    const stx = stage.getContext('2d')!;
    const burnBytes = new Uint8Array(COLS * ROWS * 4);

    const spriteHot = makeSprite('rgba(255,246,214,1)', 'rgba(255,150,40,0.55)');
    const spriteRed = makeSprite('rgba(255,120,50,1)', 'rgba(200,40,5,0.5)');

    const cw = CARD_W / COLS, ch = CARD_H / ROWS;
    let restoreSeen = latest.current.restoreTick;
    let raf = 0, last = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      const s = sim.current;
      if (latest.current.restoreTick !== restoreSeen) {
        restoreSeen = latest.current.restoreTick;
        if (s.mode === 1) startRestore(s);
      }
      if (!latest.current.reduced) stepBurn(s, CFG, dt * (latest.current.slow ? 0.22 : 1), BURN_DEFAULTS);
      packBurn(s, CFG, burnBytes);
      const time = s.clock;
      const d = frame.data;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          const o = i * 4;
          const burn = burnBytes[o] / 255;
          const gflick = burnBytes[o + 1] / 255;
          const crack = burnBytes[o + 2] / 255;
          const u = (c + 0.5) / COLS, v = (r + 0.5) / ROWS;
          const sr = sceneLow[o], sg = sceneLow[o + 1], sb = sceneLow[o + 2];
          if (burn <= 0) {
            // Untouched: the crisp full-res scene shows through.
            d[o + 3] = 0;
            maskImg.data[o + 3] = 0;
            continue;
          }
          const warp = fbm2(u * 7, v * 9 + time * 0.05, 41);
          const warpAmp = 0.22 * smooth(-0.06, 0.3, burn) * (1 - smooth(0.7, 0.92, burn));
          const bw = burn + (warp - 0.5) * warpAmp;
          let col = [sr, sg, sb];
          const fibre = fbm2(u * 46, v * 7, 42);
          col = mix3(col, [col[0] * (0.965 + 0.07 * fibre), col[1] * (0.965 + 0.07 * fibre), col[2] * (0.965 + 0.07 * fibre)], 1);
          if (bw > 0.001) {
            const scorch = smooth(0.001, 0.10, bw) * (1 - smooth(0.10, 0.30, bw));
            col = mix3(col, [115, 71, 31], scorch * 0.55);
            const gb = smooth(0.02, 0.06, bw) * (1 - smooth(0.16, 0.34, bw));
            let glowCol = [255, 247, 220];
            glowCol = mix3(glowCol, [255, 209, 61], smooth(0.02, 0.10, bw));
            glowCol = mix3(glowCol, [255, 115, 26], smooth(0.10, 0.20, bw));
            glowCol = mix3(glowCol, [199, 31, 5], smooth(0.20, 0.34, bw));
            const glow = Math.min(1, gb * (0.35 + 0.65 * gflick) * 1.25);
            col = mix3(col, [glowCol[0] * 1.35, glowCol[1] * 1.35, glowCol[2] * 1.35], glow);
            const chm = smooth(0.30, 0.48, bw);
            const streak = fbm2(u * 60, v * 9, 43);
            let charCol = mix3([41, 26, 15], [13, 8, 5], smooth(0.48, 0.9, bw));
            charCol = charCol.map((x) => x * (0.85 + 0.3 * streak));
            charCol = [charCol[0] + 230 * crack * 0.8, charCol[1] + 64 * crack * 0.8, charCol[2] + 13 * crack * 0.8];
            col = mix3(col, charCol, chm);
            const bx = burnAt(s, i + 1 < COLS * ROWS && c < COLS - 1 ? i + 1 : i) - burnAt(s, c > 0 ? i - 1 : i);
            const by = burnAt(s, r < ROWS - 1 ? i + COLS : i) - burnAt(s, r > 0 ? i - COLS : i);
            const crest = smooth(0.80, 0.90, bw) * (1 - smooth(0.90, 0.965, bw));
            const lit = Math.max(-1, Math.min(1, (bx * -0.55 + by * -0.83) * 6));
            col = [col[0] + 128 * crest * Math.max(lit, 0), col[1] + 87 * crest * Math.max(lit, 0), col[2] + 46 * crest * Math.max(lit, 0)];
            col = col.map((x) => x * (1 - 0.55 * crest * Math.max(-lit, 0)));
            const rim = smooth(0.92, 0.97, bw);
            col = mix3(col, [82, 77, 71], rim * 0.45 * (1 - smooth(0.97, 0.99, bw)));
          }
          const alpha = 1 - smooth(0.965, 0.995, bw);
          d[o] = Math.min(255, Math.round(col[0]));
          d[o + 1] = Math.min(255, Math.round(col[1]));
          d[o + 2] = Math.min(255, Math.round(col[2]));
          d[o + 3] = Math.round(alpha * 255);
          maskImg.data[o] = 255; maskImg.data[o + 1] = 255; maskImg.data[o + 2] = 255;
          maskImg.data[o + 3] = Math.round((1 - alpha) * 255);
        }
      }
      bctx.putImageData(frame, 0, 0);
      mctx.putImageData(maskImg, 0, 0);

      // Compose at full resolution: crisp card, hole punched, burn on top.
      stx.globalCompositeOperation = 'source-over';
      stx.clearRect(0, 0, CARD_W, CARD_H);
      stx.drawImage(sceneCanvas, 0, 0);
      stx.globalCompositeOperation = 'destination-out';
      stx.drawImage(mask, 0, 0, CARD_W, CARD_H);
      stx.globalCompositeOperation = 'source-over';
      stx.drawImage(body, 0, 0, CARD_W, CARD_H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CARD_W, CARD_H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stage, 0, 0);
      // Embers, additive.
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < s.emberCount; k++) {
        const q = k * EMBER_STRIDE;
        const t = s.embers[q + 4] / s.embers[q + 5];
        const flick = 0.72 + 0.28 * Math.sin(time * 21 + s.embers[q + 7]);
        const fade = t > 0.8 ? (1 - t) / 0.2 : 1;
        const rad = s.embers[q + 6] * (1 - t * 0.55);
        ctx.globalAlpha = Math.min(1, 0.85 * flick * fade);
        const sprite = t < 0.5 ? spriteHot : spriteRed;
        ctx.drawImage(sprite, s.embers[q] - rad * 3.1, s.embers[q + 1] - rad * 3.1, rad * 6.2, rad * 6.2);
      }
      ctx.globalCompositeOperation = 'source-over';
      // Ash.
      for (let k = 0; k < s.ashCount; k++) {
        const q = k * ASH_STRIDE;
        const t = s.ash[q + 4] / s.ash[q + 5];
        const fade = t > 0.72 ? (1 - t) / 0.28 : 1;
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#4a3c2e';
        ctx.save();
        ctx.translate(s.ash[q], s.ash[q + 1]);
        ctx.rotate(s.ash[q + 7]);
        const w = s.ash[q + 6];
        ctx.fillRect(-w, -w * 0.6, w * 2, w * 1.2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);

    let pointer = -1;
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * CARD_W / r.width, y: (e.clientY - r.top) * CARD_H / r.height }; };
    const down = (e: PointerEvent) => { if (pointer !== -1 || latest.current.reduced) return; const p = local(e); pointer = e.pointerId; el.setPointerCapture(pointer); burnPointerDown(sim.current, CFG, p.x, p.y, BURN_DEFAULTS); };
    const move = (e: PointerEvent) => { if (e.pointerId !== pointer) return; const p = local(e); burnPointerDown(sim.current, CFG, p.x, p.y, BURN_DEFAULTS); };
    const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = -1; burnPointerUp(sim.current); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); };
  }, []);

  if (unavailable) return <p role="status">Canvas preview is unavailable in this browser. The native source is in the Code tab.</p>;
  return <div className={styles.stage}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Burn Dismiss. Touch the postcard to ignite it, hold to feed the fire, drag to spread it. Press Enter to ignite, R to restore." tabIndex={0}
      onKeyDown={e => {
        if (latest.current.reduced) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); burnPointerDown(sim.current, CFG, CARD_W * 0.6, CARD_H * 0.45, BURN_DEFAULTS); burnPointerUp(sim.current); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setRestoreTick(v => v + 1); }
      }} />
    <div className={styles.controls}>
      <button onClick={() => setRestoreTick(v => v + 1)}>Restore</button>
      <button onClick={() => { sim.current = createBurn(CFG, BURN_DEFAULTS); }}>New card</button>
      <button aria-pressed={slow} onClick={() => setSlow(v => !v)}>{slow ? 'Slow motion on' : 'Slow motion'}</button>
    </div>
  </div>;
}
