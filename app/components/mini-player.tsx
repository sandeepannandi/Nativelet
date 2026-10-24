"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  backdropOpacity, clamp01, collapseFade, contentScale, dragProgress, expandFade,
  formatClock, hashSeed, lerp, resolveTarget, waveformBars, artSize,
} from "@/packages/ui/src/components/mini-player/playerMath";
import styles from "./mini-player.module.css";

const BAR_HEIGHT = 64;
const BAR_MARGIN = 12;
const BAR_RADIUS = 18;
const SHEET_RADIUS = 30;
const ART_MINI = 40;
const ART_TOP = 76;
const SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;

type Track = { id: string; title: string; artist: string; duration: number; colors: [string, string] };

// Same playlist as the native Example.
const TRACKS: Track[] = [
  { id: "monsoon", title: "Monsoon Drift", artist: "Paper Lanterns", duration: 214, colors: ["#2f6b4f", "#8fd0a8"] },
  { id: "terra", title: "Terra Cotta", artist: "Vega Bloom", duration: 186, colors: ["#b0552f", "#f2b279"] },
  { id: "nightbus", title: "Night Bus", artist: "Low Orbit", duration: 243, colors: ["#2c3550", "#7f96d1"] },
  { id: "saffron", title: "Saffron Line", artist: "Mina Rao", duration: 171, colors: ["#c98a1f", "#f4d35e"] },
  { id: "tide", title: "Glass Tide", artist: "Harborline", duration: 228, colors: ["#1f6f7a", "#9adcd3"] },
];

function PlayGlyph({ playing, color, size }: { playing: boolean; color: string; size: number }) {
  if (playing) {
    const bar = size * 0.22;
    return (
      <span style={{ width: size, height: size, display: "flex", justifyContent: "space-between", padding: `0 ${size * 0.17}px`, boxSizing: "border-box" }}>
        <span style={{ width: bar, height: size, borderRadius: 2, background: color }} />
        <span style={{ width: bar, height: size, borderRadius: 2, background: color }} />
      </span>
    );
  }
  return (
    <span style={{
      width: 0, height: 0, marginLeft: size * 0.12,
      borderTop: `${size * 0.5}px solid transparent`, borderBottom: `${size * 0.5}px solid transparent`,
      borderLeft: `${size * 0.82}px solid ${color}`,
    }} />
  );
}

function SkipGlyph({ direction, color, size }: { direction: -1 | 1; color: string; size: number }) {
  const tri = (
    <span style={{
      width: 0, height: 0,
      borderTop: `${size * 0.34}px solid transparent`, borderBottom: `${size * 0.34}px solid transparent`,
      ...(direction === 1 ? { borderLeft: `${size * 0.44}px solid ${color}` } : { borderRight: `${size * 0.44}px solid ${color}` }),
    }} />
  );
  const bar = <span style={{ width: 2.5, height: size * 0.68, borderRadius: 2, background: color }} />;
  return (
    <span style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {direction === -1 ? <>{bar}{tri}{tri}</> : <>{tri}{tri}{bar}</>}
    </span>
  );
}

/** Web preview of the React Native Mini Player. It shares playerMath.ts with the native source. */
export function MiniPlayerPreview() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"collapsed" | "expanded">("collapsed");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const track = TRACKS[index];
  const expanded = state === "expanded";

  const stage = useRef<HTMLDivElement>(null);
  const t = useMotionValue(0);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef({ active: false, start: 0 });
  const blockClickUntil = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p + 0.25 / Math.max(1, track.duration);
        if (next >= 1) {
          setIndex((i) => (i + 1) % TRACKS.length);
          return 0;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [playing, track.duration]);

  function settle(target: number, velocity = 0) {
    controls.current?.stop();
    controls.current = reduce
      ? animate(t, target, { duration: 0 })
      : animate(t, target, { ...SPRING, velocity: velocity * 1000 });
  }
  useEffect(() => {
    if (!drag.current.active) settle(expanded ? 1 : 0);
  });
  useEffect(() => () => controls.current?.stop(), []);

  function toggle() {
    setState(stateRef.current === "expanded" ? "collapsed" : "expanded");
  }

  const dragRange = () => Math.max(220, (stage.current?.clientHeight ?? 600) * 0.55);

  function onPanStart() {
    controls.current?.stop();
    drag.current = { active: true, start: t.get() };
  }
  function onPan(_: unknown, info: { offset: { y: number } }) {
    if (!drag.current.active) return;
    t.set(dragProgress(drag.current.start, -info.offset.y, dragRange()));
  }
  function onPanEnd(_: unknown, info: { velocity: { y: number } }) {
    if (!drag.current.active) return;
    drag.current.active = false;
    blockClickUntil.current = Date.now() + 250;
    const v = -info.velocity.y / 1000 / dragRange();
    const target = resolveTarget(t.get(), v);
    const next = target === 1 ? "expanded" : "collapsed";
    if (next !== stateRef.current) setState(next);
    else settle(target, v);
  }

  // Layout interpolations, all pure functions of t.
  const margin = useTransform(t, (v) => lerp(BAR_MARGIN, 0, v));
  const height = useTransform(t, (v) => lerp(BAR_HEIGHT, stage.current?.clientHeight ?? 600, v));
  const top = useTransform(t, (v) => (stage.current?.clientHeight ?? 600) - lerp(BAR_MARGIN, 0, v) - lerp(BAR_HEIGHT, stage.current?.clientHeight ?? 600, v));
  const radius = useTransform(t, (v) => lerp(BAR_RADIUS, SHEET_RADIUS, v));
  const dim = useTransform(t, backdropOpacity);
  const pageScale = useTransform(t, contentScale);
  const artSizeMv = useTransform(t, (v) => lerp(ART_MINI, artSize(stage.current?.clientWidth ?? 380, stage.current?.clientHeight ?? 600), v));
  const artLeft = useTransform(t, (v) => lerp(12, ((stage.current?.clientWidth ?? 380) - artSize(stage.current?.clientWidth ?? 380, stage.current?.clientHeight ?? 600)) / 2, v));
  const artTop = useTransform(t, (v) => lerp((BAR_HEIGHT - ART_MINI) / 2, ART_TOP, v));
  const artRadius = useTransform(t, (v) => lerp(10, 24, v));
  const artScale = useTransform(t, (v) => lerp(ART_MINI, artSize(stage.current?.clientWidth ?? 380, stage.current?.clientHeight ?? 600), v) / artSize(stage.current?.clientWidth ?? 380, stage.current?.clientHeight ?? 600));
  const barFade = useTransform(t, collapseFade);
  const fullFade = useTransform(t, expandFade);
  const fullRise = useTransform(t, (v) => lerp(24, 0, expandFade(v)));

  const seed = hashSeed(track.id);
  const artBig = artSize(stage.current?.clientWidth ?? 380, stage.current?.clientHeight ?? 600);
  const bars = waveformBars(track.id + track.title, 56);

  function scrub(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1 && event.type !== "pointerdown") return;
    const box = event.currentTarget.getBoundingClientRect();
    setProgress(clamp01((event.clientX - box.left) / box.width));
  }

  return (
    <div className={styles.stage}>
      <div className={styles.phone} ref={stage}>
        <motion.div className={styles.content} style={{ scale: pageScale }} aria-hidden={expanded}>
          <p className={styles.eyebrow}>EVENING MIX</p>
          <h4 className={styles.heading}>Made for the demo</h4>
          {TRACKS.map((item, i) => (
            <button key={item.id} className={`${styles.track} ${i === index ? styles.trackActive : ""}`} onClick={() => { setIndex(i); setProgress(0); setPlaying(true); }} tabIndex={expanded ? -1 : 0}>
              <span className={styles.thumb} style={{ background: `linear-gradient(135deg, ${item.colors[0]}, ${item.colors[1]})` }} />
              <span>
                <p className={styles.trackName}>{item.title}</p>
                <p className={styles.trackArtist}>{item.artist}</p>
              </span>
              <span className={styles.trackTime}>{formatClock(item.duration)}</span>
            </button>
          ))}
          <p className={styles.note}>Playback is simulated on a timer: no audio is decoded or played. Drag the bar up to open the player, down to close it.</p>
        </motion.div>
        <motion.div className={styles.backdrop} style={{ opacity: dim }} />
        <motion.div
          className={styles.surface}
          role="button"
          aria-expanded={expanded}
          aria-label={`${track.title} by ${track.artist}. Mini player`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && !expanded) { event.preventDefault(); toggle(); }
            if (event.key === "ArrowDown" && expanded) { event.preventDefault(); toggle(); }
          }}
          onPanStart={onPanStart}
          onPan={onPan}
          onPanEnd={onPanEnd}
          style={{ left: margin, right: margin, top, height, borderRadius: radius }}
        >
          <button className={styles.tapzone} aria-label={expanded ? "Collapse player" : "Expand player"} onClick={() => { if (!drag.current.active && Date.now() > blockClickUntil.current) toggle(); }} />
          <motion.div className={styles.art} style={{ width: artSizeMv, height: artSizeMv, left: artLeft, top: artTop, borderRadius: artRadius }}>
            <motion.div className={styles.artInner} style={{ width: artBig, height: artBig, scale: artScale }}>
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${track.colors[0]}, ${track.colors[1]})` }} />
              <span className={styles.artBlob} style={{ left: artBig * (0.25 + (seed % 50) / 100), top: artBig * (0.2 + ((seed >> 8) % 40) / 100), width: artBig * 0.68, height: artBig * 0.68, marginLeft: -artBig * 0.34, marginTop: -artBig * 0.34, background: "rgba(255,255,255,0.22)" }} />
              <span className={styles.artBlob} style={{ left: artBig * (0.55 + ((seed >> 16) % 30) / 100), top: artBig * (0.6 + ((seed >> 24) % 30) / 100), width: artBig * 0.44, height: artBig * 0.44, marginLeft: -artBig * 0.22, marginTop: -artBig * 0.22, background: "rgba(0,0,0,0.16)" }} />
            </motion.div>
          </motion.div>
          <motion.div className={styles.barRow} style={{ opacity: barFade, pointerEvents: expanded ? "none" : "none" }}>
            <div className={styles.hairline} style={{ width: `${clamp01(progress) * 100}%` }} />
            <div className={styles.barInner}>
              <div className={styles.barText}>
                <p className={styles.barTitle}>{track.title}</p>
                <p className={styles.barArtist}>{track.artist}</p>
              </div>
              <button className={styles.iconBtn} aria-label={playing ? "Pause" : "Play"} onClick={(event) => { event.stopPropagation(); setPlaying(!playing); }} style={{ pointerEvents: expanded ? "none" : "auto" }}>
                <PlayGlyph playing={playing} color="#193f30" size={18} />
              </button>
            </div>
          </motion.div>
          <motion.div className={styles.full} style={{ opacity: fullFade, y: fullRise, pointerEvents: expanded ? "auto" : "none" }}>
            <div className={styles.fullInner} style={{ top: ART_TOP + artBig + 26 }}>
              <p className={styles.fullTitle}>{track.title}</p>
              <p className={styles.fullArtist}>{track.artist}</p>
              <div
                className={styles.wave}
                role="slider"
                aria-label={`Seek. ${formatClock(progress * track.duration)} of ${formatClock(track.duration)}`}
                aria-valuemin={0}
                aria-valuemax={track.duration}
                aria-valuenow={Math.round(progress * track.duration)}
                tabIndex={expanded ? 0 : -1}
                onKeyDown={(event) => {
                  const step = 10 / Math.max(1, track.duration);
                  if (event.key === "ArrowRight") { event.preventDefault(); setProgress(clamp01(progress + step)); }
                  if (event.key === "ArrowLeft") { event.preventDefault(); setProgress(clamp01(progress - step)); }
                }}
                onPointerDown={scrub}
                onPointerMove={scrub}
              >
                {bars.map((amp, i) => (
                  <span
                    key={i}
                    className={styles.waveBar}
                    style={{
                      height: `${Math.max(6, amp * 88)}%`,
                      background: (i + 0.5) / bars.length <= clamp01(progress) ? "#193f30" : "rgba(25,63,48,0.28)",
                    }}
                  />
                ))}
              </div>
              <div className={styles.times}>
                <span>{formatClock(progress * track.duration)}</span>
                <span>{formatClock(track.duration)}</span>
              </div>
              <div className={styles.controls}>
                <button className={styles.skip} aria-label="Previous track" onClick={() => { setIndex((index - 1 + TRACKS.length) % TRACKS.length); setProgress(0); }} tabIndex={expanded ? 0 : -1}>
                  <SkipGlyph direction={-1} color="#193f30" size={24} />
                </button>
                <button className={styles.playBig} aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} tabIndex={expanded ? 0 : -1}>
                  <PlayGlyph playing={playing} color="#f6f8f4" size={24} />
                </button>
                <button className={styles.skip} aria-label="Next track" onClick={() => { setIndex((index + 1) % TRACKS.length); setProgress(0); }} tabIndex={expanded ? 0 : -1}>
                  <SkipGlyph direction={1} color="#193f30" size={24} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
      <p className={styles.hint}>Tap a track. Drag the bar up or down - release velocity decides. Scrub the waveform.</p>
      <p className={styles.hint}>Web adapter of the RN source. Try the Expo screen for React Native Web rendering.</p>
    </div>
  );
}
