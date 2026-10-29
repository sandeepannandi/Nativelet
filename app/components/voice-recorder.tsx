"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  BAR_COUNT, BAR_H, BAR_W, BAR_X, BAR_Y, DOT_X, LOCK_CX, LOCK_CY, LOCK_H, LOCK_W, MIC_CX, MIC_CY, MIC_R,
  REC_H, REC_W, TIMER_X, WAVE_CY, barSegment, cancelWash, clamp01, createRecorder, formatClock,
  recorderLockedCancel, recorderLockedSend, recorderPressEnd, recorderPressMove, recorderPressStart,
  stepRecorder, type RecorderState,
} from "../../packages/ui/src/components/voice-recorder/recorderMath";
import styles from "./voice-recorder.module.css";

// Thread region above the bar; the bar scene keeps the math's coordinates
// by translating the context down by THREAD_H.
const THREAD_H = 190;
const WEB_W = REC_W;
const WEB_H = REC_H + THREAD_H;

const GREEN = "#193f30";
const GREEN_SOFT = "#e6edde";
const WAVE = "#31533e";
const RED = "#e5484d";
const RED_SOFT = "#fbe9e7";
const FAINT = "#8aa092";
const TEXT = "#4b6053";

type Pill = { id: number; seconds: number; samples: number[]; played: number; playing: boolean };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pillRect(index: number, pill: Pill) {
  const w = 210;
  const h = 44;
  const x = WEB_W - 8 - w;
  const y = THREAD_H - 14 - (index + 1) * (h + 8);
  return { x, y, w, h };
}

function drawBarScene(ctx: CanvasRenderingContext2D, s: RecorderState) {
  // Bar
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d5e1d2";
  ctx.lineWidth = 1;
  ctx.stroke();

  const wash = cancelWash(s);
  if (wash.alpha > 0) {
    ctx.save();
    roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 30);
    ctx.clip();
    ctx.fillStyle = `rgba(229,72,77,${wash.alpha})`;
    ctx.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
    ctx.restore();
  }

  const recording = s.phase === "recording" || s.phase === "locked" || s.phase === "cancelling" || s.phase === "sending";
  const fading = s.phase === "cancelling" || s.phase === "sending";
  const contentAlpha = fading ? 1 - clamp01(s.anim) : 1;

  if (recording) {
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    // Pulsing record dot (hidden in locked mode: the discard circle sits there)
    if (s.phase !== "locked") {
      const pulse = fading ? 1 : 0.75 + 0.25 * Math.sin(s.t * 4.2);
      ctx.fillStyle = RED;
      ctx.globalAlpha = contentAlpha * pulse;
      ctx.beginPath();
      ctx.arc(DOT_X, MIC_CY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = contentAlpha;
    }
    // Timer
    ctx.fillStyle = "#1d2b23";
    ctx.font = "13px Geist, ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(formatClock(s.seconds), s.phase === "locked" ? BAR_X + 68 : TIMER_X, WAVE_CY + 1);
    // Waveform
    ctx.strokeStyle = WAVE;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < BAR_COUNT; i++) {
      const seg = barSegment(s, i);
      ctx.moveTo(seg.x + wash.dx, seg.y0);
      ctx.lineTo(seg.x + wash.dx, seg.y1);
    }
    ctx.stroke();
    // Slide-to-cancel hint with chevrons
    if (s.phase === "recording") {
      const a = clamp01(1 - s.cancel * 1.6);
      ctx.globalAlpha = contentAlpha * a * 0.9;
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 2;
      const cx = TIMER_X + 48 - s.cancel * 28;
      for (const off of [0, 9]) {
        ctx.beginPath();
        ctx.moveTo(cx + off + 3, MIC_CY - 5);
        ctx.lineTo(cx + off - 3, MIC_CY);
        ctx.lineTo(cx + off + 3, MIC_CY + 5);
        ctx.stroke();
      }
      ctx.font = "12px Geist, ui-sans-serif, system-ui, sans-serif";
      const tx = cx + 22 - s.cancel * 28;
      const tw = ctx.measureText("slide to cancel").width;
      // Opaque chip: the label floats over the waveform instead of
      // colliding with the bars.
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, tx - 7, MIC_CY - 11, tw + 14, 20, 10);
      ctx.fill();
      ctx.fillStyle = FAINT;
      ctx.fillText("slide to cancel", tx, WAVE_CY + 1);
    }
    ctx.restore();
  }

  // Mic / send button
  const scale = s.micScale;
  ctx.save();
  ctx.translate(MIC_CX, MIC_CY);
  ctx.scale(scale, scale);
  ctx.fillStyle = s.phase === "cancelling" ? RED : GREEN;
  ctx.beginPath();
  ctx.arc(0, 0, MIC_R, 0, Math.PI * 2);
  ctx.fill();
  const sendFade = s.phase === "sending" ? clamp01(s.anim * 1.6) : 0;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (sendFade < 1) {
    ctx.globalAlpha = 1 - sendFade;
    roundRect(ctx, -5, -10, 10, 15, 5);
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(0, -2, 8.5, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 6.5);
    ctx.lineTo(0, 10);
    ctx.moveTo(-4.5, 10);
    ctx.lineTo(4.5, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (sendFade > 0) {
    ctx.globalAlpha = sendFade;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7, 0.5);
    ctx.lineTo(-2.5, 5);
    ctx.lineTo(7, -4.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Locked-mode discard button
  if (s.phase === "locked") {
    ctx.save();
    ctx.translate(BAR_X + 34, MIC_CY);
    ctx.fillStyle = RED_SOFT;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.6;
    roundRect(ctx, -4.5, -3, 9, 9, 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(6, -5);
    ctx.moveTo(-2.2, -5);
    ctx.lineTo(-2.2, -7);
    ctx.lineTo(2.2, -7);
    ctx.lineTo(2.2, -5);
    ctx.moveTo(-1.6, -0.5);
    ctx.lineTo(-1.6, 3.5);
    ctx.moveTo(1.6, -0.5);
    ctx.lineTo(1.6, 3.5);
    ctx.stroke();
    ctx.restore();
  }

  // Lock capsule above the mic
  if (s.phase === "pressing" || s.phase === "recording") {
    ctx.save();
    ctx.translate(LOCK_CX, LOCK_CY);
    const pop = 1 + s.lockPop * 0.35;
    ctx.scale(pop, pop);
    ctx.globalAlpha = s.phase === "pressing" ? 0.4 : 1;
    roundRect(ctx, -LOCK_W / 2, -LOCK_H / 2, LOCK_W, LOCK_H, 22);
    ctx.fillStyle = "rgba(25,63,48,0.12)";
    ctx.fill();
    roundRect(ctx, -LOCK_W / 2 + 4, -LOCK_H / 2 + 4, LOCK_W - 8, LOCK_H - 8, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (s.lock > 0) {
      const h = (LOCK_H - 8) * s.lock;
      roundRect(ctx, -LOCK_W / 2 + 4, LOCK_H / 2 - 4 - h, LOCK_W - 8, h, Math.min(18, h / 2));
      ctx.fillStyle = GREEN_SOFT;
      ctx.fill();
    }
    // Chevron up
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -LOCK_H / 2 + 19);
    ctx.lineTo(0, -LOCK_H / 2 + 13);
    ctx.lineTo(5, -LOCK_H / 2 + 19);
    ctx.stroke();
    // Lock glyph
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4.5, LOCK_H / 2 - 21);
    ctx.lineTo(-4.5, LOCK_H / 2 - 24.5);
    ctx.arc(0, LOCK_H / 2 - 24.5, 4.5, Math.PI, 0);
    ctx.lineTo(4.5, LOCK_H / 2 - 21);
    ctx.stroke();
    roundRect(ctx, -7, LOCK_H / 2 - 21, 14, 11, 3);
    ctx.fillStyle = GREEN;
    ctx.fill();
    ctx.restore();
  }
}

function drawThread(ctx: CanvasRenderingContext2D, pills: Pill[]) {
  // One fixed incoming bubble, then the sent pills newest at the bottom.
  ctx.font = "14px Geist, ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  roundRect(ctx, 8, 8, 218, 38, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d5e1d2";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#1d2b23";
  ctx.fillText("send the voice note when it works", 22, 28);
  pills.slice(-3).forEach((pill, i) => {
    const { x, y, w, h } = pillRect(i, pill);
    roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = GREEN_SOFT;
    ctx.fill();
    // Play / pause
    const pcx = x + 24;
    const pcy = y + h / 2;
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    if (pill.playing) {
      ctx.fillRect(pcx - 4.5, pcy - 5, 3, 10);
      ctx.fillRect(pcx + 1.5, pcy - 5, 3, 10);
    } else {
      ctx.beginPath();
      ctx.moveTo(pcx - 3, pcy - 6);
      ctx.lineTo(pcx + 6, pcy);
      ctx.lineTo(pcx - 3, pcy + 6);
      ctx.closePath();
      ctx.fill();
    }
    // Mini waveform with playhead
    const bars = pill.samples.filter((_, k) => k % 2 === 0).slice(-24);
    const progress = pill.seconds > 0 ? pill.played / pill.seconds : 0;
    bars.forEach((level, k) => {
      const bx = x + 50 + k * 4.6;
      const bh = 3 + level * 20;
      ctx.fillStyle = k / bars.length <= progress ? GREEN : WAVE;
      ctx.globalAlpha = k / bars.length <= progress ? 1 : 0.55;
      roundRect(ctx, bx, pcy - bh / 2, 2.6, bh, 1.3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = TEXT;
    ctx.font = "12px Geist, ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(formatClock(pill.played > 0 ? pill.played : pill.seconds), x + w - 36, pcy + 1);
    ctx.font = "14px Geist, ui-sans-serif, system-ui, sans-serif";
  });
}

export function VoiceRecorderPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const latest = useRef({ slow, reduced });
  latest.current = { slow, reduced };
  const [, bump] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WEB_W * dpr;
    canvas.height = WEB_H * dpr;
    const sim = createRecorder();
    const pills: Pill[] = [];
    let pillId = 0;
    const pointer = { down: false, sx: 0, sy: 0 };
    let clock = 0;

    const drain = () => {
      for (const ev of sim.events.splice(0, sim.events.length)) {
        if (ev.type === "send") pills.push({ id: ++pillId, seconds: ev.seconds, samples: ev.samples, played: 0, playing: false });
        bump((n) => n + 1);
      }
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f6f8f4";
      ctx.fillRect(0, 0, WEB_W, WEB_H);
      drawThread(ctx, pills);
      ctx.save();
      ctx.translate(0, THREAD_H);
      drawBarScene(ctx, sim);
      ctx.restore();
      // Placeholder in idle
      if (sim.phase === "idle" || sim.phase === "pressing") {
        ctx.fillStyle = FAINT;
        ctx.font = "15px Geist, ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText("Message", BAR_X + 22, THREAD_H + MIC_CY + 1);
      }
    };

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(48, now - last) / 1000 : 1 / 60;
      last = now;
      const scale = latest.current.slow ? 0.25 : 1;
      sim.reduced = latest.current.reduced;
      stepRecorder(sim, dt * scale);
      clock += dt * scale;
      for (const pill of pills) {
        if (pill.playing) {
          pill.played += dt;
          if (pill.played >= pill.seconds) {
            pill.playing = false;
            pill.played = 0;
          }
        }
      }
      drain();
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const local = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * WEB_W, y: ((ev.clientY - rect.top) / rect.height) * WEB_H };
    };
    const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    const down = (ev: PointerEvent) => {
      const p = local(ev);
      // Pills: toggle playback.
      if (p.y < THREAD_H) {
        pills.slice(-3).forEach((pill, i) => {
          const r = pillRect(i, pill);
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
            pill.playing = !pill.playing;
            if (pill.playing && pill.played >= pill.seconds) pill.played = 0;
          }
        });
        return;
      }
      const by = p.y - THREAD_H;
      // Locked mode: the two bar buttons.
      if (sim.phase === "locked") {
        if (inCircle(p.x, by, BAR_X + 34, MIC_CY, 26)) {
          recorderLockedCancel(sim);
          return;
        }
        if (inCircle(p.x, by, MIC_CX, MIC_CY, 30)) {
          recorderLockedSend(sim);
          return;
        }
        return;
      }
      if (sim.phase !== "idle") return;
      if (!inCircle(p.x, by, MIC_CX, MIC_CY, MIC_R + 14)) return;
      pointer.down = true;
      pointer.sx = p.x;
      pointer.sy = by;
      recorderPressStart(sim);
      canvas.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (!pointer.down) return;
      const p = local(ev);
      recorderPressMove(sim, p.x - pointer.sx, p.y - THREAD_H - pointer.sy);
    };
    const up = () => {
      if (!pointer.down) return;
      pointer.down = false;
      recorderPressEnd(sim);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (sim.phase === "idle") {
          recorderPressStart(sim);
          recorderPressEnd(sim); // tap: locked recording
        } else if (sim.phase === "locked") {
          recorderLockedSend(sim);
        }
      } else if (ev.key === "Escape" && sim.phase === "locked") {
        recorderLockedCancel(sim);
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: WEB_W, height: WEB_H }}
        tabIndex={0}
        role="application"
        aria-label="Voice recorder web preview: hold the mic to record, slide left to cancel, drag up to lock. Keyboard: Enter starts a hands-free recording, Enter again sends, Escape cancels. Audio levels are simulated."
      />
      <div className={styles.row}>
        <button type="button" className={slow ? styles.chipPrimary : styles.chip} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>Slow motion: {slow ? "on" : "off"}</button>
        <button type="button" className={reduced ? styles.chipPrimary : styles.chip} onClick={() => setReducedOverride(!reduced)} aria-pressed={reduced}>Reduce motion: {reduced ? "on" : "off"}</button>
      </div>
      <p className={styles.hint}>Hold the mic. Slide left to cancel, drag up to lock, release to send. Tap for hands free. Levels are simulated - no microphone is used.</p>
    </div>
  );
}
