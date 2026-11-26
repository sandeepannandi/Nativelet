/* Free-form folding controller. Pure TypeScript: press anywhere on the paper
   and drag in any direction. The crease sits halfway between where you grabbed
   and where your finger is, so it follows the finger. The grabbed part lifts
   and swings over; let go past the halfway mark and it lands, otherwise it
   springs back. Both the Skia component and the web preview drive this class. */
import {
  applyCut, cutSheet, flatSheet, poseCuts, poseFlat, pointInFacet,
  type Crease, type CutFacet, type P2, type Sheet,
} from "./foldMath";
import { buildFrame, flatView, screenToSheet, viewFor, type Item, type View } from "./foldDesign";

/** How far from the grab point the crease stays while the flap is still lifting (sheet units). */
const LIFT_REACH = 0.34;
/** Finger travel before a fold starts (sheet units). */
const DEAD = 0.035;
const PI = Math.PI;

type Active = {
  cuts: CutFacet[];
  crease: Crease;
  phi: number;
  target: number;
  v: number;
  held: boolean;
  /** An undo plays the committed fold backwards. */
  undo: boolean;
};

export type FoldEvent = "grab" | "crease" | "release" | "undo";

export class FoldController {
  sheet: Sheet = flatSheet();
  history: { sheet: Sheet; crease: Crease }[] = [];
  view: View = flatView();
  slowMotion = false;
  reduced = false;
  onChange?: (folds: number) => void;
  onFeedback?: (e: FoldEvent, strength?: number) => void;
  private act: Active | null = null;
  private grab: { p: P2; vx: number; vt: number; speed: number } | null = null;
  private lastSent = 0;
  private pendingUndo = 0;
  private dirty = true;

  get folds() { return this.history.length; }
  get busy() { return !!this.act; }

  /** Screen point (in the 340 x 420 frame) to sheet coordinates. */
  private toSheet(x: number, y: number): P2 { return screenToSheet(x, y, this.view); }

  down(x: number, y: number): boolean {
    if (this.act || this.reduced) return false;
    const p = this.toSheet(x, y);
    if (!this.sheet.some((f) => pointInFacet(p, f.pts))) return false;
    this.grab = { p, vx: 0, vt: performance.now(), speed: 0 };
    this.onFeedback?.("grab", 0.3);
    return true;
  }

  move(x: number, y: number) {
    const g = this.grab;
    if (!g) return;
    const f = this.toSheet(x, y);
    const dx = f[0] - g.p[0];
    const dy = f[1] - g.p[1];
    const dist = Math.hypot(dx, dy);
    if (dist < DEAD) { if (this.act?.held) { this.act.phi = 0; this.dirty = true; } return; }
    const nx = dx / dist;
    const ny = dy / dist;
    const a = Math.max(dist / 2, LIFT_REACH);
    const crease: Crease = { nx, ny, d: nx * g.p[0] + ny * g.p[1] + a };
    const phi = dist >= 2 * LIFT_REACH ? PI : Math.acos(Math.max(-1, 1 - dist / LIFT_REACH));
    const now = performance.now();
    const rate = (phi - (this.act?.phi ?? 0)) / Math.max(0.001, (now - g.vt) / 1000);
    g.speed = g.speed * 0.6 + rate * 0.4;
    g.vt = now;
    const cuts = cutSheet(this.sheet, crease);
    if (!cuts) { this.act = null; this.dirty = true; return; }
    this.act = { cuts, crease, phi, target: PI, v: 0, held: true, undo: false };
    // a soft tick when the flap passes upright
    if ((phi > PI / 2) !== (this.lastSent > PI / 2)) this.onFeedback?.("crease", 0.25);
    this.lastSent = phi;
    this.dirty = true;
  }

  up() {
    const g = this.grab;
    this.grab = null;
    const a = this.act;
    if (!a || !a.held) return;
    a.held = false;
    const flick = g ? g.speed : 0;
    a.target = a.phi > 0.62 * PI || (flick > 5 && a.phi > 0.4 * PI) ? PI : 0;
    a.v = Math.max(-8, Math.min(8, (g?.speed ?? 0) * 0.5));
    this.onFeedback?.("release", Math.min(1, Math.abs(a.v) / 6));
  }

  /** Play the last fold backwards. */
  undo(): boolean {
    if (this.act || !this.history.length) return false;
    const h = this.history.pop()!;
    this.sheet = h.sheet;
    const cuts = cutSheet(h.sheet, h.crease)!;
    this.act = { cuts, crease: h.crease, phi: PI, target: 0, v: 0, held: false, undo: true };
    this.onFeedback?.("undo", 0.3);
    this.onChange?.(this.history.length);
    this.dirty = true;
    return true;
  }

  reset() {
    if (this.act && !this.act.undo) { this.act = null; this.grab = null; }
    this.pendingUndo = this.history.length;
    if (!this.act) {
      this.undo();
      this.pendingUndo = Math.max(0, this.pendingUndo - 1);
    }
  }

  /** Jump to a given list of creases, folded fully. For tests and the cover image. */
  foldAll(creases: Crease[]) {
    for (const c of creases) {
      const cuts = cutSheet(this.sheet, c);
      if (!cuts) continue;
      this.history.push({ sheet: this.sheet, crease: c });
      this.sheet = applyCut(cuts, c);
    }
    this.dirty = true;
  }

  /** Hold a fold part way for a still frame. */
  hold(crease: Crease, phi: number) {
    const cuts = cutSheet(this.sheet, crease);
    if (cuts) this.act = { cuts, crease, phi, target: phi, v: 0, held: true, undo: false };
    this.dirty = true;
  }

  /** Advance the simulation. Returns true when the frame changed. */
  update(dt: number): boolean {
    const a = this.act;
    let changed = this.dirty;
    this.dirty = false;
    if (a && !a.held) {
      if (this.reduced) { a.phi = a.target; a.v = 0; }
      else {
        // a lightly under-damped spring: the flap settles with a small, soft overshoot
        const k = 90, c = 2 * Math.sqrt(k) * 0.78;
        const h = dt * (this.slowMotion ? 0.25 : 1);
        const n = Math.max(1, Math.ceil(h / 0.004));
        for (let i = 0; i < n; i++) {
          const acc = k * (a.target - a.phi) - c * a.v;
          a.v += (acc * h) / n;
          a.phi += (a.v * h) / n;
        }
        a.phi = Math.max(0, Math.min(PI, a.phi));
        if (a.phi >= PI && a.v > 0) a.v = 0;
        if (a.phi <= 0 && a.v < 0) a.v = 0;
      }
      changed = true;
      if (Math.abs(a.target - a.phi) < 0.004 && Math.abs(a.v) < 0.06) {
        a.phi = a.target;
        this.act = null;
        if (!a.undo && a.target === PI) {
          this.history.push({ sheet: this.sheet, crease: a.crease });
          this.sheet = applyCut(a.cuts, a.crease);
          this.onFeedback?.("crease", Math.min(1, 0.45 + Math.abs(a.v) * 0.1));
          this.onChange?.(this.history.length);
        }
        if (this.pendingUndo > 0) { this.pendingUndo--; this.undo(); }
      }
    }
    // the camera glides to frame whatever is on the table
    const tv = viewFor(this.posed());
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 7);
    const dv = Math.abs(tv.cx - this.view.cx) + Math.abs(tv.cy - this.view.cy) + Math.abs(tv.zoom - this.view.zoom);
    if (dv > 1e-4) {
      this.view = { cx: this.view.cx + (tv.cx - this.view.cx) * k, cy: this.view.cy + (tv.cy - this.view.cy) * k, zoom: this.view.zoom + (tv.zoom - this.view.zoom) * k };
      changed = true;
    }
    return changed;
  }

  private posed() {
    return this.act ? poseCuts(this.act.cuts, this.act.crease, this.act.phi) : poseFlat(this.sheet);
  }

  frame(): Item[] {
    return buildFrame(this.posed(), this.view);
  }
}
