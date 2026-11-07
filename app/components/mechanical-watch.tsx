"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { WATCH_DEFAULTS, createWatch, stepWatch, trainAngles, windCrown } from "../../packages/ui/src/components/mechanical-watch/watchMath";
import { buildWatchScene, renderWatch, rasterizeZB, type Camera, type Tri } from "../../packages/ui/src/components/mechanical-watch/watch3d";
import styles from "./mechanical-watch.module.css";

const SIZE = 360;
const CAM0: Camera = { yaw: 0.35, pitch: 0.55, dist: 150, fov: 0.73, cx: 0, cy: 0 };
const BG: [number, number, number] = [9, 9, 14];

/* Adaptive software-render resolution: walk down when the rolling render time
   exceeds a frame budget, back up with headroom; the bitmap is upscaled with
   smoothing, so a lower tier costs sharpness, not correctness. */
const TIERS = [512, 448, 384, 320];

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
    let timeScale = 1;            // tap toggles slow motion (1 -> 0.12)
    const crownScreen = { x: -1e9, y: -1e9 };   // updated per frame from the camera
    const tris: Tri[] = [];
    const cam: Camera = { ...CAM0 };
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    let raf = 0;
    let last = 0;
    let dragging = false;
    let grab: { yaw: number; pitch: number } | null = null;
    let tier = 1;
    let ema = 20;
    let img: ImageData | null = null;
    let px = 0;
    // test instrumentation: compiled out of production builds entirely
    // (NODE_ENV is inlined at build time; development/test builds only).
    let simClock = 0, wallClock = 0;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __watch: unknown }).__watch = {
        sim, cam, crownScreen,
        crownCss: () => {
          const rect = canvas.getBoundingClientRect();
          return {
            x: rect.left + (crownScreen.x * rect.width) / canvas.width,
            y: rect.top + (crownScreen.y * rect.height) / canvas.height,
          };
        },
        getTimeScale: () => timeScale,
        getClocks: () => ({ simClock, wallClock }),
      };
    }

    const draw = () => {
      const t0 = performance.now();
      if (px !== TIERS[tier]) {
        px = TIERS[tier];
        off.width = px;
        off.height = px;
        img = offCtx.createImageData(px, px);
      }
      const a = trainAngles(sim.e);
      tris.length = 0;
      // sort=false: depth is resolved per-pixel by the z-buffer rasterizer.
      renderWatch(scene, {
        barrel: a.barrel, center: a.center, third: a.third, fourth: a.fourth, escape: a.escape,
        fork: sim.p, balance: sim.b, hour: -a.hour, minute: -a.minute, second: -a.second, crown: sim.crown,
      }, cam, px, tris, false);
      // project the crown head to canvas coords for the wind hit zone
      {
        const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
        const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        const f = px / (2 * Math.tan(cam.fov / 2));
        const x2 = 53.5 * cyw, yw = 53.5 * syw, zc = yw * sp - 4 * cp + cam.dist;
        const ys = yw * cp + 4 * sp;
        const scl = canvas.width / px;
        crownScreen.x = (px / 2 + (x2 * f) / zc) * scl;
        crownScreen.y = (px / 2 - (ys * f) / zc) * scl;
      }
      if (!img) return;
      rasterizeZB(tris, px, 1, BG, img.data);
      offCtx.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      const ms = performance.now() - t0;
      ema = ema * 0.85 + ms * 0.15;
      if (ema > 26 && tier < TIERS.length - 1) { tier++; ema = 20; }
      else if (ema < 12 && tier > 0) { tier--; ema = 20; }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(48, last ? t - last : 16.7) / 1000;
      last = t;
      if (!latest.current.reduced) {
        stepWatch(sim, WATCH_DEFAULTS, dt * timeScale);
        simClock += dt * timeScale;
        wallClock += dt;
        if (!dragging) cam.yaw += dt * 0.12;   // idle turntable
      }
      draw();
    };
    raf = requestAnimationFrame(tick);

    // Track drag with explicit start coords (movementX is unreliable on some browsers).
    let startX = 0, startY = 0;
    let mode: "orbit" | "wind" = "orbit";
    let downAt = 0, lastWindY = 0, moved = 0;
    const down2 = (e: PointerEvent) => {
      startX = e.clientX; startY = e.clientY;
      downAt = performance.now(); moved = 0; lastWindY = e.clientY;
      const rect = canvas.getBoundingClientRect();
      const dprX = canvas.width / rect.width, dprY = canvas.height / rect.height;
      const px2 = (e.clientX - rect.left) * dprX, py2 = (e.clientY - rect.top) * dprY;
      mode = Math.hypot(px2 - crownScreen.x, py2 - crownScreen.y) < 42 * dprX ? "wind" : "orbit";
      dragging = true;
      grab = { yaw: cam.yaw, pitch: cam.pitch };
      canvas.setPointerCapture(e.pointerId);
    };
    const move2 = (e: PointerEvent) => {
      if (!dragging || !grab) return;
      moved += Math.abs(e.movementX ?? 0) + Math.abs(e.movementY ?? 0);
      if (mode === "wind") {
        // vertical drag on the crown winds: 46px per turn; ratchet - only positive adds power
        windCrown(sim, WATCH_DEFAULTS, (e.clientY - lastWindY) / 46);
        lastWindY = e.clientY;
        return;
      }
      cam.yaw = grab.yaw + (e.clientX - startX) / 140;
      cam.pitch = Math.max(-1.1, Math.min(1.3, grab.pitch + (e.clientY - startY) / 180));
    };
    const up = () => {
      // quick tap (not on the crown) toggles slow motion
      if (mode === "orbit" && moved < 6 && performance.now() - downAt < 300) timeScale = timeScale === 1 ? 0.12 : 1;
      dragging = false; grab = null;
    };
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
