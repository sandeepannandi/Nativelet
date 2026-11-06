"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { WATCH_DEFAULTS, createWatch, stepWatch, trainAngles } from "../../packages/ui/src/components/mechanical-watch/watchMath";
import { buildWatchScene, renderWatch, type Camera, type Tri } from "../../packages/ui/src/components/mechanical-watch/watch3d";
import styles from "./mechanical-watch.module.css";

const SIZE = 360;
const CAM0: Camera = { yaw: 0.35, pitch: 0.55, dist: 150, fov: 0.73, cx: 0, cy: 0 };

export function MechanicalWatchPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const systemReduce = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reduced = reducedOverride ?? !!systemReduce;
  const latest = useRef({ reduced });
  latest.current = { reduced };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const scene = buildWatchScene();
    const sim = createWatch(WATCH_DEFAULTS);
    const tris: Tri[] = [];
    const cam: Camera = { ...CAM0 };
    let raf = 0;
    let last = 0;
    let dragging = false;
    let grab: { yaw: number; pitch: number } | null = null;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#09090e";
      ctx.fillRect(0, 0, SIZE, SIZE);
      tris.length = 0;
      const a = trainAngles(sim.e);
      renderWatch(scene, {
        barrel: a.barrel, center: a.center, third: a.third, fourth: a.fourth, escape: a.escape,
        fork: sim.p, balance: sim.b, hour: -a.hour, minute: -a.minute, second: -a.second,
      }, cam, SIZE, tris);
      // Same 12-bit color-bucket batching as the native renderer: flush the
      // path run when the quantized fill changes.
      let cr = -1, cg = -1, cb = -1;
      ctx.beginPath();
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        const qr = (t.r * 15) | 0, qg = (t.g * 15) | 0, qb = (t.b * 15) | 0;
        if (qr !== cr || qg !== cg || qb !== cb) {
          if (cr >= 0) {
            ctx.fillStyle = `rgb(${Math.round(((cr + 0.5) / 15) * 255)},${Math.round(((cg + 0.5) / 15) * 255)},${Math.round(((cb + 0.5) / 15) * 255)})`;
            ctx.fill();
          }
          ctx.beginPath();
          cr = qr; cg = qg; cb = qb;
        }
        ctx.moveTo(t.x0, t.y0);
        ctx.lineTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.closePath();
      }
      if (cr >= 0) {
        ctx.fillStyle = `rgb(${Math.round(((cr + 0.5) / 15) * 255)},${Math.round(((cg + 0.5) / 15) * 255)},${Math.round(((cb + 0.5) / 15) * 255)})`;
        ctx.fill();
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(48, last ? t - last : 16.7) / 1000;
      last = t;
      if (!latest.current.reduced) {
        stepWatch(sim, WATCH_DEFAULTS, dt);
        if (!dragging) cam.yaw += dt * 0.12;   // idle turntable
      }
      draw();
    };
    raf = requestAnimationFrame(tick);

    // Track drag with explicit start coords (movementX is unreliable on some browsers).
    let startX = 0, startY = 0;
    const down2 = (e: PointerEvent) => {
      startX = e.clientX; startY = e.clientY;
      dragging = true;
      grab = { yaw: cam.yaw, pitch: cam.pitch };
      canvas.setPointerCapture(e.pointerId);
    };
    const move2 = (e: PointerEvent) => {
      if (!dragging || !grab) return;
      cam.yaw = grab.yaw + (e.clientX - startX) / 140;
      cam.pitch = Math.max(-1.1, Math.min(1.3, grab.pitch + (e.clientY - startY) / 180));
    };
    const up = () => { dragging = false; grab = null; };
    canvas.addEventListener("pointerdown", down2);
    canvas.addEventListener("pointermove", move2);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down2);
      canvas.removeEventListener("pointermove", move2);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className={styles.frame}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ aspectRatio: "1 / 1" }}
        role="img"
        aria-label="Mechanical watch: a 3D Swiss-lever escapement movement"
        onDoubleClick={() => setReducedOverride((v) => !(v ?? !!systemReduce))}
      />
    </div>
  );
}

export default MechanicalWatchPreview;
