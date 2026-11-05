"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GALTON_DEFAULTS, createGalton, dropOne, resetGalton, setPouring, setTiltTarget, stepGalton,
} from "../../packages/ui/src/components/galton-board/galtonMath";
import {
  BALL_BASE, BALL_HI, BALL_R, BALL_RIM, BIN_TOP, BOARD_BACKGROUND, BOARD_SCALE, CENTER_X, CENTER_Y,
  CURVE_INK, DIVIDER, DIVIDER_DARK, FLOOR_Y, FRAME_EDGE, FRAME_OUTER, FUNNEL, FUNNEL_DARK,
  GALTON_H, GALTON_W, PANEL, PANEL_SHADOW, PEG_BASE, PEG_HI, PEG_R, PEG_RIM, PEG_Y0, ROWS,
  WALL_L, WALL_R, binCenter, dividerX, pegX, pegY,
} from "../../packages/ui/src/components/galton-board/galtonDesign";
import styles from "./galton-board.module.css";

const PEGS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (let row = 1; row <= ROWS; row++) for (let j = 0; j < row; j++) out.push({ x: pegX(row, j), y: pegY(row) });
  return out;
})();
const DIVIDERS = Array.from({ length: ROWS }, (_, k) => dividerX(k));
const PASCAL = [1, 10, 45, 120, 210, 252, 210, 120, 45, 10, 1];
const CURVE_MIN_SETTLED = 40;

export function GaltonBoardPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const latest = useRef({ slow, reduced });
  latest.current = { slow, reduced };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GALTON_W * dpr;
    canvas.height = GALTON_H * dpr;
    const sim = createGalton(GALTON_DEFAULTS);
    const pointer = { down: false, moved: false, holding: false, startX: 0, startT: 0, timer: 0 };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BOARD_BACKGROUND;
      ctx.beginPath();
      ctx.roundRect(0, 0, GALTON_W, GALTON_H, 18);
      ctx.fill();
      ctx.save();
      ctx.translate(CENTER_X, CENTER_Y);
      ctx.rotate(sim.tilt);
      ctx.scale(BOARD_SCALE, BOARD_SCALE);
      ctx.translate(-CENTER_X, -CENTER_Y);

      ctx.fillStyle = FRAME_EDGE;
      ctx.beginPath();
      ctx.roundRect(10, 6, GALTON_W - 20, GALTON_H - 12, 14);
      ctx.fill();
      ctx.fillStyle = FRAME_OUTER;
      ctx.beginPath();
      ctx.roundRect(14, 10, GALTON_W - 28, GALTON_H - 20, 12);
      ctx.fill();
      ctx.fillStyle = PANEL_SHADOW;
      ctx.beginPath();
      ctx.roundRect(WALL_L, 26, WALL_R - WALL_L, FLOOR_Y - 26 + 6, 4);
      ctx.fill();
      ctx.fillStyle = PANEL;
      ctx.beginPath();
      ctx.roundRect(WALL_L + 3, 26, WALL_R - WALL_L - 6, FLOOR_Y - 26, 4);
      ctx.fill();

      ctx.fillStyle = FUNNEL;
      ctx.beginPath();
      ctx.moveTo(CENTER_X - 44, 40);
      ctx.lineTo(CENTER_X + 44, 40);
      ctx.lineTo(CENTER_X + 10, 96);
      ctx.lineTo(CENTER_X + 10, 112);
      ctx.lineTo(CENTER_X - 10, 112);
      ctx.lineTo(CENTER_X - 10, 96);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = FUNNEL_DARK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(CENTER_X - 44, 40);
      ctx.lineTo(CENTER_X - 10, 96);
      ctx.moveTo(CENTER_X + 44, 40);
      ctx.lineTo(CENTER_X + 10, 96);
      ctx.stroke();

      for (const x of DIVIDERS) {
        ctx.fillStyle = DIVIDER;
        ctx.beginPath();
        ctx.roundRect(x - 2.5, BIN_TOP, 5, FLOOR_Y - BIN_TOP, 2);
        ctx.fill();
        ctx.fillStyle = DIVIDER_DARK;
        ctx.beginPath();
        ctx.arc(x, BIN_TOP, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of PEGS) {
        ctx.fillStyle = PEG_RIM;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PEG_BASE;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R - 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PEG_HI;
        ctx.beginPath();
        ctx.arc(p.x - PEG_R * 0.32, p.y - PEG_R * 0.36, PEG_R * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#3a2f22";
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < sim.n; i++) {
        if (sim.sleep[i]) continue;
        if (sim.y[i] >= BIN_TOP) continue;
        const sx = Math.min(WALL_R - 6, Math.max(WALL_L + 6, sim.x[i]));
        const depth = Math.min(1, Math.max(0, (FLOOR_Y - sim.y[i]) / (FLOOR_Y - PEG_Y0)));
        ctx.beginPath();
        ctx.arc(sx, sim.y[i] + 10 + depth * 6, BALL_R * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < sim.n; i++) {
        const x = sim.x[i], y = sim.y[i];
        ctx.fillStyle = BALL_RIM;
        ctx.beginPath();
        ctx.arc(x, y, BALL_R + 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = BALL_BASE;
        ctx.beginPath();
        ctx.arc(x, y, BALL_R - 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = BALL_HI;
        ctx.beginPath();
        ctx.arc(x - BALL_R * 0.3, y - BALL_R * 0.34, BALL_R * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sim.settled >= CURVE_MIN_SETTLED) {
        const maxH = (FLOOR_Y - BIN_TOP) * 0.82;
        ctx.strokeStyle = CURVE_INK;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        for (let k = 0; k <= ROWS; k++) {
          const expected = (sim.n * PASCAL[k]) / 1024;
          const h = Math.min(maxH, expected * (maxH / ((sim.n * 252) / 1024)));
          const x = binCenter(k);
          const y = FLOOR_Y - h;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const preRun = () => {
      setPouring(sim, true);
      for (let f = 0; f < 14 * 60; f++) stepGalton(sim, 1 / 60, GALTON_DEFAULTS);
      setPouring(sim, false);
      for (let f = 0; f < 26 * 60; f++) stepGalton(sim, 1 / 60, GALTON_DEFAULTS);
    };

    let raf = 0;
    let last = 0;
    let wasReduced = false;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      if (latest.current.reduced) {
        if (!wasReduced) {
          resetGalton(sim);
          preRun();
          wasReduced = true;
        }
        draw();
      } else {
        if (wasReduced) {
          resetGalton(sim);
          wasReduced = false;
        }
        stepGalton(sim, dt * (latest.current.slow ? 0.25 : 1), GALTON_DEFAULTS);
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * GALTON_W, y: ((ev.clientY - rect.top) / rect.height) * GALTON_H };
    };
    const down = (ev: PointerEvent) => {
      if (latest.current.reduced) return;
      const p = local(ev);
      pointer.down = true;
      pointer.moved = false;
      pointer.holding = false;
      pointer.startX = p.x;
      pointer.startT = performance.now();
      canvas.setPointerCapture(ev.pointerId);
      pointer.timer = window.setTimeout(() => {
        pointer.holding = true;
        setPouring(sim, true);
      }, 230);
    };
    const move = (ev: PointerEvent) => {
      if (!pointer.down) return;
      const p = local(ev);
      const dx = p.x - pointer.startX;
      if (!pointer.moved && Math.abs(dx) > 10) {
        pointer.moved = true;
        if (pointer.holding) {
          pointer.holding = false;
          setPouring(sim, false);
        } else {
          window.clearTimeout(pointer.timer);
        }
      }
      if (pointer.moved) setTiltTarget(sim, GALTON_DEFAULTS, dx / 420);
    };
    const up = (ev: PointerEvent) => {
      if (!pointer.down) return;
      pointer.down = false;
      window.clearTimeout(pointer.timer);
      const p = local(ev);
      const dx = p.x - pointer.startX;
      const dt = performance.now() - pointer.startT;
      if (pointer.holding) {
        pointer.holding = false;
        setPouring(sim, false);
      } else if (Math.abs(dx) > 70 || (Math.abs(dx) > 24 && dt < 220)) {
        resetGalton(sim);
      } else if (!pointer.moved) {
        dropOne(sim, GALTON_DEFAULTS);
      }
      setTiltTarget(sim, GALTON_DEFAULTS, 0);
    };
    const cancel = () => {
      pointer.down = false;
      window.clearTimeout(pointer.timer);
      if (pointer.holding) {
        pointer.holding = false;
        setPouring(sim, false);
      }
      setTiltTarget(sim, GALTON_DEFAULTS, 0);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(pointer.timer);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, []);

  return (
    <div className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        /* inline height must stay auto: a fixed pixel height overrides the
           stylesheet's height:auto, so max-width:100% on narrow screens
           would squeeze the width while height stayed 720 and stretch the
           board into ovals */
        style={{ width: GALTON_W, height: "auto" }}
        role="img"
        aria-label="Galton board web preview: wooden beads clatter down brass pegs and pile into a bell curve"
      />
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Tap to drop a bead, hold to pour the hopper. Drag sideways to tilt the board, swipe fast to clear the bins.</p>
    </div>
  );
}
