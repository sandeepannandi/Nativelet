"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  CYM_COUNT, CYM_DEFAULTS, CYM_H, CYM_W, PLATE_S, PLATE_X, PLATE_Y,
  createCymatics, cymHz, cymModePair, cymPointer, cymScatter, stepCymatics, type CymState,
} from "../../packages/ui/src/components/cymatics/cymaticsMath";
import {
  CYM_BIG_SIZE, CYM_BOLT, CYM_BOLT_HI, CYM_CORES, CYM_CORE_W, CYM_GLOWS, CYM_GLOW_W,
  CYM_PLATE_BOTTOM, CYM_PLATE_RADIUS, CYM_PLATE_RIM, CYM_PLATE_TOP,
} from "../../packages/ui/src/components/cymatics/cymaticsDesign";
import styles from "./cymatics.module.css";

const BOLTS = [
  { cx: PLATE_X + 11, cy: PLATE_Y + 11 },
  { cx: PLATE_X + PLATE_S - 11, cy: PLATE_Y + 11 },
  { cx: PLATE_X + 11, cy: PLATE_Y + PLATE_S - 11 },
  { cx: PLATE_X + PLATE_S - 11, cy: PLATE_Y + PLATE_S - 11 },
];

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function CymaticsPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const [tune, setTune] = useState({ hz: 256, m: 2, n: 3 });
  const latest = useRef({ slow, reduced });
  latest.current = { slow, reduced };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CYM_W * dpr;
    canvas.height = CYM_H * dpr;
    let sim: CymState = createCymatics();
    const pointer = { x: 0.5, y: 0.5, down: false };
    let wasReduced = false;
    let lastHz = -1;
    let lastM = -1;
    let lastN = -1;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createLinearGradient(0, 0, CYM_W * 0.4, CYM_H);
      bg.addColorStop(0, "#0a0e16");
      bg.addColorStop(1, "#04060a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CYM_W, CYM_H);
      // Steel plate.
      const plate = ctx.createLinearGradient(PLATE_X, PLATE_Y, PLATE_X, PLATE_Y + PLATE_S);
      plate.addColorStop(0, CYM_PLATE_TOP);
      plate.addColorStop(1, CYM_PLATE_BOTTOM);
      roundedRectPath(ctx, PLATE_X, PLATE_Y, PLATE_S, PLATE_S, CYM_PLATE_RADIUS);
      ctx.fillStyle = plate;
      ctx.fill();
      const sheen = ctx.createRadialGradient(PLATE_X + 66, PLATE_Y + 52, 0, PLATE_X + 66, PLATE_Y + 52, 190);
      sheen.addColorStop(0, "rgba(255,255,255,0.05)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      roundedRectPath(ctx, PLATE_X, PLATE_Y, PLATE_S, PLATE_S, CYM_PLATE_RADIUS);
      ctx.clip();
      ctx.fillStyle = sheen;
      ctx.fillRect(PLATE_X, PLATE_Y, PLATE_S, PLATE_S);
      // Sand: one glow pass, one core pass, batched per size class.
      for (const big of [0, 1]) {
        ctx.beginPath();
        for (let i = 0; i < sim.n; i++) {
          if ((sim.size[i] >= CYM_BIG_SIZE ? 1 : 0) !== big) continue;
          const cx = PLATE_X + sim.x[i] * PLATE_S;
          const cy = PLATE_Y + sim.y[i] * PLATE_S;
          ctx.moveTo(cx + CYM_GLOW_W[big] / 2, cy);
          ctx.arc(cx, cy, CYM_GLOW_W[big] / 2, 0, 6.2832);
        }
        ctx.fillStyle = CYM_GLOWS[big];
        ctx.fill();
      }
      for (const big of [0, 1]) {
        ctx.beginPath();
        for (let i = 0; i < sim.n; i++) {
          if ((sim.size[i] >= CYM_BIG_SIZE ? 1 : 0) !== big) continue;
          const cx = PLATE_X + sim.x[i] * PLATE_S;
          const cy = PLATE_Y + sim.y[i] * PLATE_S;
          ctx.moveTo(cx + CYM_CORE_W[big] / 2, cy);
          ctx.arc(cx, cy, CYM_CORE_W[big] / 2, 0, 6.2832);
        }
        ctx.fillStyle = CYM_CORES[big];
        ctx.fill();
      }
      ctx.restore();
      // Rim and bolts.
      roundedRectPath(ctx, PLATE_X + 0.5, PLATE_Y + 0.5, PLATE_S - 1, PLATE_S - 1, CYM_PLATE_RADIUS);
      ctx.strokeStyle = CYM_PLATE_RIM;
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const b of BOLTS) {
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, 2.6, 0, 6.2832);
        ctx.fillStyle = CYM_BOLT;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.cx - 0.7, b.cy - 0.7, 0.9, 0, 6.2832);
        ctx.fillStyle = CYM_BOLT_HI;
        ctx.fill();
      }
      if (pointer.down) {
        const fx = PLATE_X + pointer.x * PLATE_S;
        const fy = PLATE_Y + pointer.y * PLATE_S;
        ctx.fillStyle = "rgba(240, 216, 166, 0.06)";
        ctx.beginPath();
        ctx.arc(fx, fy, 26, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = "rgba(240, 216, 166, 0.10)";
        ctx.beginPath();
        ctx.arc(fx, fy, 11, 0, 6.2832);
        ctx.fill();
      }
    };

    let raf = 0;
    let last = 0;
    let frames = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        if (!wasReduced) {
          pointer.down = false;
          cymPointer(sim, 0.5, 0.5, false);
          sim = createCymatics(CYM_DEFAULTS, CYM_COUNT, 20261101, true);
          wasReduced = true;
        }
      } else {
        if (wasReduced) {
          sim = createCymatics();
          wasReduced = false;
        }
        cymPointer(sim, pointer.x, pointer.y, pointer.down);
        stepCymatics(sim, dt * (latest.current.slow ? 0.22 : 1));
      }
      frames++;
      if ((frames & 7) === 0) {
        const hz = cymHz(sim);
        const [m, n] = cymModePair(sim);
        if (hz !== lastHz || m !== lastM || n !== lastN) {
          lastHz = hz;
          lastM = m;
          lastN = n;
          setTune({ hz, m, n });
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * CYM_W;
      const py = ((ev.clientY - rect.top) / rect.height) * CYM_H;
      let x = (px - PLATE_X) / PLATE_S;
      let y = (py - PLATE_Y) / PLATE_S;
      if (x < 0) x = 0; else if (x > 1) x = 1;
      if (y < 0) y = 0; else if (y > 1) y = 1;
      return { x, y };
    };
    const down = (ev: PointerEvent) => {
      if (latest.current.reduced) return;
      const p = local(ev);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.down = true;
      canvas.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (!pointer.down) return;
      const p = local(ev);
      pointer.x = p.x;
      pointer.y = p.y;
    };
    const up = () => {
      // A touch that barely moved is a tap: kick the sand off the lines.
      if (pointer.down && sim.moved < 0.02) cymScatter(sim);
      pointer.down = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.stage}>
      <div className={styles.plateWrap} style={{ width: CYM_W, height: CYM_H }}>
        <canvas ref={canvasRef} className={styles.canvas} style={{ width: CYM_W, height: CYM_H }} role="img" aria-label="Cymatics web preview: sand on a vibrating steel plate settles into Chladni resonance figures, drag to retune the frequency, tap to scatter" />
        <span className={styles.modeTag}>PLATE {tune.m},{tune.n}</span>
        <span className={styles.hzTag}>{tune.hz} HZ</span>
      </div>
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Drag sideways to retune, up or down to blend the mode. Tap to scatter the sand.</p>
    </div>
  );
}
