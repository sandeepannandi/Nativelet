package com.anonymous.nativeletshowcase;

import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

/**
 * Firebase Test Lab physical-device harness for the Gyroscope route.
 *
 * Opens nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0:
 *  - telemetry=1 installs the gyro test hook, which streams sim snapshots and
 *    gesture boundary events to logcat as '[gyro-test]' JSON;
 *  - reducedMotion=0 is the showcase route's TEST-ONLY override that pins
 *    motion on for device-farm images whose system reduced-motion setting is
 *    enabled. The production default (no params -> system setting) is
 *    untouched.
 *
 * Then injects real horizontal touch flicks (instrumentation sendPointerSync
 * -> genuine MotionEvents through the normal input pipeline). Spin velocity
 * is measured from pageX samples, so flicks must be horizontal to register.
 *
 * ASSERTIONS (honest, telemetry-backed): after the run window the harness
 * reads logcat back through the shell identity and requires the gyro test
 * hook's events: telemetry bridge installed, >=3 grabs (responder accepted
 * the flicks), >=3 spin impulses with nonzero velocity of both signs, sim
 * snapshots streaming with reduce=false, sim time and frame counter
 * advancing, and the sim having consumed the impulses. No telemetry, no pass.
 */
@RunWith(AndroidJUnit4.class)
public class FtlGyroFlickTest {
    private static final String TAG = "FtlGyroFlick";

    @Test
    public void gyroFlicks() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String pkg = inst.getTargetContext().getPackageName();
        // Method-order independence: assertions below only count this test's
        // own events (wallT >= t0), so a sibling test's grabs/spins/snaps can
        // never satisfy them.
        long t0 = System.currentTimeMillis() - 2000;

        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0"));
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        inst.startActivitySync(i);
        Log.i(TAG, "gyroscope route launched on " + pkg + " ?telemetry=1&reducedMotion=0");

        // Wait for RN bundle load + gyroscope screen to settle and render.
        SystemClock.sleep(12000);

        android.util.DisplayMetrics dm = inst.getTargetContext().getResources().getDisplayMetrics();
        float cx = dm.widthPixels / 2f;
        float cy = dm.heightPixels / 2f;
        float span = Math.min(dm.widthPixels, dm.heightPixels) * 0.28f;
        Log.i(TAG, "screen " + dm.widthPixels + "x" + dm.heightPixels + " span=" + span);

        // Three horizontal flicks with human-like spacing: right, right, left.
        // Horizontal because spin velocity is tracked from pageX samples.
        flick(inst, cx - span, cy, cx + span, cy, 220);
        SystemClock.sleep(2500);
        flick(inst, cx - span, cy, cx + span, cy, 200);
        SystemClock.sleep(2500);
        flick(inst, cx + span, cy, cx - span, cy, 240);

        // Let the resulting spin / precession / wobble render for the capture.
        SystemClock.sleep(6000);
        Log.i(TAG, "harness window complete");

        assertTelemetry(inst, t0);
    }

    private static void assertTelemetry(Instrumentation inst, long t0) throws Exception {
        ParcelFileDescriptor pfd =
                inst.getUiAutomation().executeShellCommand("logcat -d");
        BufferedReader r = new BufferedReader(
                new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(pfd)));

        boolean bridge = false;
        int grabs = 0, spins = 0, snaps = 0, snapsReduceFalse = 0;
        double maxPosJ = 0, maxNegJ = 0;
        double firstSimT = Double.NaN, lastSimT = Double.NaN;
        long firstFrame = -1, lastFrame = -1, lastSeenImpulse = -1;

        String line;
        while ((line = r.readLine()) != null) {
            int m = line.indexOf("[gyro-test]");
            if (m < 0) continue;
            int s = line.indexOf('{', m);
            int e = line.lastIndexOf('}');
            if (s < 0 || e <= s) continue;
            try {
                JSONObject o = new JSONObject(line.substring(s, e + 1));
                String kind = o.optString("kind");
                if (kind.equals("bridge")) {
                    bridge = true; // process-global: proves the hook is installed
                } else if (o.optLong("wallT", 0) < t0) {
                    // before this method's window: belongs to another test
                } else if (kind.equals("grab")) {
                    grabs++;
                } else if (kind.equals("spin")) {
                    spins++;
                    double j = o.optDouble("j", 0);
                    if (j > maxPosJ) maxPosJ = j;
                    if (j < maxNegJ) maxNegJ = j;
                } else if (kind.equals("snap")) {
                    snaps++;
                    if (!o.optBoolean("reduce", true)) snapsReduceFalse++;
                    double simT = o.optDouble("simT", Double.NaN);
                    long fr = o.optLong("frame", -1);
                    long seen = o.optLong("seenImpulse", -1);
                    if (!Double.isNaN(simT)) {
                        if (Double.isNaN(firstSimT)) firstSimT = simT;
                        lastSimT = simT;
                    }
                    if (fr >= 0) {
                        if (firstFrame < 0) firstFrame = fr;
                        lastFrame = fr;
                    }
                    if (seen >= 0) lastSeenImpulse = seen;
                }
            } catch (Exception parse) {
                Log.w(TAG, "unparsed telemetry line: " + line);
            }
        }
        r.close();

        String summary = "telemetry bridge=" + bridge
                + " grabs=" + grabs + " spins=" + spins
                + " maxPosJ=" + maxPosJ + " maxNegJ=" + maxNegJ
                + " snaps=" + snaps + " snapsReduceFalse=" + snapsReduceFalse
                + " simT=" + firstSimT + "->" + lastSimT
                + " frame=" + firstFrame + "->" + lastFrame
                + " lastSeenImpulse=" + lastSeenImpulse;
        Log.i(TAG, summary);

        StringBuilder failures = new StringBuilder();
        if (!bridge) failures.append("no bridge event (?telemetry=1 not applied); ");
        if (grabs < 3) failures.append("grabs=").append(grabs)
                .append(" <3 (flicks rejected by the pan responder); ");
        if (spins < 3) failures.append("spins=").append(spins)
                .append(" <3 (no release impulses recorded); ");
        if (maxPosJ <= 0.0005) failures.append("no positive flick impulse (maxPosJ=")
                .append(maxPosJ).append("); ");
        if (maxNegJ >= -0.0005) failures.append("no negative flick impulse (maxNegJ=")
                .append(maxNegJ).append("); ");
        if (snaps < 3) failures.append("snaps=").append(snaps)
                .append(" <3 (sim telemetry not streaming); ");
        if (snapsReduceFalse < snaps)
            failures.append("reduce=true in ").append(snaps - snapsReduceFalse)
                    .append("/").append(snaps).append(" snaps (override failed); ");
        if (!(lastSimT - firstSimT > 5.0))
            failures.append("sim time advanced only ")
                    .append(lastSimT - firstSimT).append("s; ");
        if (!(lastFrame - firstFrame > 60))
            failures.append("frame counter advanced only ")
                    .append(lastFrame - firstFrame).append("; ");
        if (lastSeenImpulse < 3)
            failures.append("sim consumed only ").append(lastSeenImpulse)
                    .append(" impulses; ");

        if (failures.length() > 0) {
            throw new AssertionError("gyro physical telemetry FAILED: "
                    + failures + "| " + summary);
        }
        Log.i(TAG, "ASSERTIONS PASSED: " + summary);
    }

    private static void flick(Instrumentation inst, float x0, float y0, float x1, float y1, long durMs) {
        final int steps = 24;
        long t0 = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(t0, t0, MotionEvent.ACTION_DOWN, x0, y0, 0);
        inst.sendPointerSync(down);
        down.recycle();
        for (int s = 1; s <= steps; s++) {
            long t = t0 + (durMs * s / steps);
            float f = (float) s / steps;
            // Constant-velocity swipe so the release-time velocity is
            // representative of the whole flick (an ease-out tail would decay
            // the tracked velocity toward zero before release).
            MotionEvent mv = MotionEvent.obtain(t0, t, MotionEvent.ACTION_MOVE,
                    x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0);
            inst.sendPointerSync(mv);
            mv.recycle();
            SystemClock.sleep(Math.max(1, durMs / steps - 2));
        }
        MotionEvent up = MotionEvent.obtain(t0, t0 + durMs + 8, MotionEvent.ACTION_UP, x1, y1, 0);
        inst.sendPointerSync(up);
        up.recycle();
        Log.i(TAG, "flick injected durMs=" + durMs + " dx=" + (x1 - x0));
    }
    // ---------------- v3: controls / drag / slow / reset / physics ----------
    // Covers the remaining physical interaction gates: Slow motion (sim-rate
    // ratio + label), Drag frame (spring-target tracking), Reset (sim restart,
    // slow preserved - actual component semantics verified in source), and a
    // free-evolution invariant window (energy dissipation, spin-momentum decay,
    // steady precession; expectations derived from gyroMath, not from emitted
    // verdicts). gfxinfo framestats + meminfo are collected as MEASUREMENT ONLY
    // (frame evidence, never a render-smoothness/GPU-time clearance).

    @Test
    public void gyroControls() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String pkg = inst.getTargetContext().getPackageName();
        long t0 = System.currentTimeMillis() - 2000;

        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0"));
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        inst.startActivitySync(i);
        Log.i(TAG, "controls: route launched ?telemetry=1&reducedMotion=0");
        SystemClock.sleep(12000);

        android.util.DisplayMetrics dm = inst.getTargetContext().getResources().getDisplayMetrics();
        int w = dm.widthPixels, h = dm.heightPixels;
        float cx = w / 2f, cy = h / 2f;
        float span = Math.min(w, h) * 0.28f;

        exec(inst, "dumpsys gfxinfo " + pkg + " reset");

        Rect rFlick = findText(inst, "Flick rotor", 3000);
        Rect rDrag = findText(inst, "Drag frame", 1500);
        Rect rSlow = findText(inst, "Slow motion", 1500);
        Rect rReset = findText(inst, "Reset", 1500);
        // v3.2: absent/ambiguous targeting fails closed - no silent fallback to
        // likely coordinates (v3.1's canvas-center miss came from substring
        // matching; a fixed-fraction tap would be the same class of guess).
        String loc = "hierarchy";
        if (rDrag == null) throw new AssertionError("Drag frame control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rSlow == null) throw new AssertionError("Slow motion control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rReset == null) throw new AssertionError("Reset control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rFlick == null) throw new AssertionError("Flick rotor control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        Log.i(TAG, "controls: locSource=" + loc);

        tap(inst, rSlow);
        long slowOn = System.currentTimeMillis();
        SystemClock.sleep(6000);
        long slowOff = System.currentTimeMillis();
        tap(inst, rSlow);
        SystemClock.sleep(800);

        tap(inst, rDrag);
        SystemClock.sleep(400);
        long dragStart = System.currentTimeMillis();
        drag(inst, cx - span * 0.45f, cy - span * 0.3f, cx + span * 0.45f, cy + span * 0.3f, 2400);
        long dragEnd = System.currentTimeMillis();
        SystemClock.sleep(1200);

        // v3.3: return to spin mode before the post-controls flick; frame-mode
        // gestures grab but cannot spin, so the impulse gate needs Flick rotor.
        tap(inst, rFlick);
        SystemClock.sleep(400);
        flick(inst, cx - span, cy, cx + span, cy, 220);
        SystemClock.sleep(2500);

        tap(inst, rSlow);
        SystemClock.sleep(500);
        tap(inst, rReset);
        long resetAt = System.currentTimeMillis();
        SystemClock.sleep(2500);
        tap(inst, rSlow); // off again for a full-rate invariant window
        SystemClock.sleep(800);

        long invStart = System.currentTimeMillis();
        SystemClock.sleep(7000);
        long invEnd = System.currentTimeMillis();

        String gfx = exec(inst, "dumpsys gfxinfo " + pkg);
        String mem = exec(inst, "dumpsys meminfo " + pkg);
        assertControls(inst, t0, slowOn, slowOff, dragStart, dragEnd, resetAt,
                invStart, invEnd, loc, gfx, mem);
    }

    private static class Ev { String kind; JSONObject o; long wallT; }

    private static void assertControls(Instrumentation inst, long t0, long slowOn, long slowOff,
            long dragStart, long dragEnd, long resetAt, long invStart, long invEnd,
            String loc, String gfx, String mem) throws Exception {
        ParcelFileDescriptor pfd = inst.getUiAutomation().executeShellCommand("logcat -d");
        BufferedReader r = new BufferedReader(
                new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(pfd)));
        boolean bridge = false;
        List<Ev> snaps = new ArrayList<>(), grabs = new ArrayList<>(),
                spins = new ArrayList<>(), resets = new ArrayList<>();
        String line;
        while ((line = r.readLine()) != null) {
            int m = line.indexOf("[gyro-test]");
            if (m < 0) continue;
            int s = line.indexOf('{', m), e = line.lastIndexOf('}');
            if (s < 0 || e <= s) continue;
            try {
                JSONObject o = new JSONObject(line.substring(s, e + 1));
                String kind = o.optString("kind");
                if (kind.equals("bridge")) { bridge = true; continue; }
                Ev ev = new Ev(); ev.kind = kind; ev.o = o; ev.wallT = o.optLong("wallT", 0);
                if (ev.wallT < t0) continue;
                if (kind.equals("snap")) snaps.add(ev);
                else if (kind.equals("grab")) grabs.add(ev);
                else if (kind.equals("spin")) spins.add(ev);
                else if (kind.equals("reset")) resets.add(ev);
            } catch (Exception ignore) { }
        }
        r.close();

        StringBuilder f = new StringBuilder();
        if (!bridge) f.append("no bridge event; ");

        // SLOW: direct simulation-time scaling, simT advance per wall second in
        // the slow window vs the baseline window of the SAME sim session. v3.1
        // scoped the baseline from t0, which straddled the previous activity's
        // snap tail (simT restart made rBase negative). Windows now start after
        // the last simT restart before slowOn. The [0.08,0.55] band proves a
        // broad slowdown only; it is not quarter-speed accuracy.
        int baseStart = 0;
        for (int i = 1; i < snaps.size(); i++) {
            double prev = snaps.get(i - 1).o.optDouble("simT"), cur = snaps.get(i).o.optDouble("simT");
            if (cur < prev - 0.5 && snaps.get(i).wallT < slowOn) baseStart = i;
        }
        List<Ev> base = new ArrayList<>();
        for (int i = baseStart; i < snaps.size(); i++) {
            Ev s = snaps.get(i);
            if (s.wallT <= slowOn - 300) base.add(s); else break;
        }
        List<Ev> slow = between(snaps, slowOn + 300, slowOff - 300);
        double rBase = rate(base), rSlow = rate(slow);
        long slowFlagged = countSlow(slow);
        if (base.size() < 3) f.append("baseline snaps=").append(base.size()).append(" <3 (window not comparable); ");
        if (slow.size() < 3) f.append("slow snaps=").append(slow.size()).append(" <3 (window not comparable); ");
        if (hasRestart(base)) f.append("sim restart inside baseline window; ");
        if (hasRestart(slow)) f.append("sim restart inside slow window; ");
        if (slowFlagged < 3) f.append("slow=true snaps=").append(slowFlagged).append(" <3 (toggle missed); ");
        if (!(rBase > 0.2)) f.append("baseline sim-rate not positive/healthy: ").append(rBase).append("; ");
        if (!(rSlow > 0.08 * rBase && rSlow < 0.55 * rBase))
            f.append("slow sim-time factor ").append(rSlow).append("/").append(rBase)
                    .append(" outside [0.08,0.55]; ");

        // DRAG FRAME: frame-mode grab, active snaps, target moved, convergence.
        Ev frameGrab = null;
        for (Ev g : grabs) if ("frame".equals(g.o.optString("mode")) && g.wallT >= dragStart - 1500) frameGrab = g;
        if (frameGrab == null) f.append("no frame-mode grab (Drag frame tap or drag missed); ");
        List<Ev> active = new ArrayList<>();
        for (Ev s : snaps) if (s.wallT >= dragStart - 300 && s.wallT <= dragEnd + 800
                && s.o.optJSONObject("input") != null && s.o.optJSONObject("input").optBoolean("active")) active.add(s);
        if (active.size() < 2) f.append("active drag snaps=").append(active.size()).append(" <2; ");
        double targetMove = 0, d0 = -1, d1 = -1;
        if (!active.isEmpty()) {
            double a0 = frameGrab != null ? frameGrab.o.optDouble("a") : Double.NaN;
            double b0 = frameGrab != null ? frameGrab.o.optDouble("b") : Double.NaN;
            for (Ev s : active) {
                JSONObject in = s.o.optJSONObject("input");
                targetMove = Math.max(targetMove, Math.abs(in.optDouble("targetYaw") - a0)
                        + Math.abs(in.optDouble("targetTilt") - b0));
            }
            JSONObject first = active.get(0).o, last = active.get(active.size() - 1).o;
            d0 = dist(first) ; d1 = dist(last);
        }
        if (!(targetMove > 0.05)) f.append("drag targets moved only ").append(targetMove).append("; ");
        if (d0 >= 0 && !(d1 < d0 || d1 < 0.12))
            f.append("pose did not converge toward drag targets ").append(d0).append("->").append(d1).append("; ");

        // FLICK regression inside the controls flow.
        boolean flickOk = false;
        for (Ev s : spins) if (s.wallT >= dragEnd && Math.abs(s.o.optDouble("j")) > 0.0005) flickOk = true;
        if (!flickOk) f.append("no post-controls flick impulse; ");

        // RESET: event, sim restart (simT back near 0), slow preserved.
        Ev reset = resets.isEmpty() ? null : resets.get(resets.size() - 1);
        if (reset == null) f.append("no reset event (Reset tap missed); ");
        boolean restarted = false, slowKept = false;
        for (Ev s : snaps) {
            if (s.wallT > resetAt - 100 && s.wallT < resetAt + 3000
                    && s.o.optDouble("simT", 99) < 1.5 && s.o.optLong("seenReset", 0) >= 1) {
                restarted = true;
                if (s.o.optBoolean("slow")) slowKept = true;
                break;
            }
        }
        if (!restarted) f.append("sim did not restart after reset; ");
        if (restarted && !slowKept) f.append("reset cleared slow mode (semantics changed); ");

        // INVARIANTS (free evolution, no input): energy strictly dissipates,
        // spin momentum decays, precession steady. Constants from gyroMath.
        List<Ev> inv = between(snaps, invStart - 300, invEnd + 300);
        if (inv.size() < 4) f.append("invariant snaps=").append(inv.size()).append(" <4; ");
        int eDown = 0, pDown = 0, dirPos = 0, dirNeg = 0;
        double yawNet = 0;
        for (int k = 1; k < inv.size(); k++) {
            double[] p = vec(inv.get(k - 1).o), q = vec(inv.get(k).o);
            if (energy(q) <= energy(p) * 1.001) eDown++;
            if (q[5] <= p[5] * 1.001) pDown++;
            double dy = q[0] - p[0];
            if (dy > 0) dirPos++; else if (dy < 0) dirNeg++;
            yawNet += dy;
        }
        int n = Math.max(1, inv.size() - 1);
        if (eDown < n) f.append("energy rose in ").append(n - eDown).append("/").append(n).append(" intervals; ");
        if (pDown < n) f.append("spin momentum rose in ").append(n - pDown).append("/").append(n).append(" intervals; ");
        if (Math.abs(yawNet) < 0.12 || Math.max(dirPos, dirNeg) * 5 < n * 4)
            f.append("precession not steady: yawNet=").append(yawNet)
                    .append(" dir+/dir-=").append(dirPos).append("/").append(dirNeg).append("; ");

        // Perf/memory: measurement only, reported, never gated.
        String janky = grep(gfx, "Janky frames:");
        String pss = grep(mem, "TOTAL PSS:");
        if (pss.isEmpty()) pss = grep(mem, "TOTAL:");

        String summary = "controls loc=" + loc
                + " snaps=" + snaps.size() + " grabs=" + grabs.size() + " spins=" + spins.size()
                + " resets=" + resets.size()
                + " slowRate=" + rSlow + " baseRate=" + rBase
                + " dragTargetMove=" + targetMove + " dragDist=" + d0 + "->" + d1
                + " invSnaps=" + inv.size() + " eDown=" + eDown + "/" + n
                + " pDown=" + pDown + "/" + n + " yawNet=" + yawNet
                + " | " + janky + " | " + pss;
        Log.i(TAG, summary);
        if (f.length() > 0)
            throw new AssertionError("gyro controls telemetry FAILED: " + f + "| " + summary
                    + " | nodes: " + dumpNodes(inst));
        Log.i(TAG, "ASSERTIONS PASSED (controls): " + summary);
    }

    private static List<Ev> between(List<Ev> snaps, long a, long b) {
        List<Ev> out = new ArrayList<>();
        for (Ev s : snaps) if (s.wallT >= a && (b <= 0 || s.wallT <= b)) out.add(s);
        return out;
    }

    private static double rate(List<Ev> snaps) {
        if (snaps.size() < 2) return Double.NaN;
        Ev f = snaps.get(0), l = snaps.get(snaps.size() - 1);
        double dt = (l.wallT - f.wallT) / 1000.0;
        return dt > 0.5 ? (l.o.optDouble("simT") - f.o.optDouble("simT")) / dt : Double.NaN;
    }

    private static boolean hasRestart(List<Ev> snaps) {
        for (int i = 1; i < snaps.size(); i++)
            if (snaps.get(i).o.optDouble("simT") < snaps.get(i - 1).o.optDouble("simT") - 0.5) return true;
        return false;
    }

    private static long countSlow(List<Ev> snaps) {
        long c = 0;
        for (Ev s : snaps) if (s.o.optBoolean("slow")) c++;
        return c;
    }

    private static double dist(JSONObject snap) {
        JSONObject in = snap.optJSONObject("input");
        if (in == null) return -1;
        org.json.JSONArray v = snap.optJSONArray("v");
        return Math.abs(v.optDouble(0) - in.optDouble("targetYaw"))
                + Math.abs(v.optDouble(1) - in.optDouble("targetTilt"));
    }

    private static double[] vec(JSONObject snap) {
        org.json.JSONArray v = snap.optJSONArray("v");
        double[] out = new double[6];
        for (int k = 0; k < 6; k++) out[k] = v.optDouble(k);
        return out;
    }

    // Total mechanical energy; constants copied from gyroMath.ts GYRO_DEFAULTS.
    private static double energy(double[] v) {
        double mass = .15, rr = .045, hh = .008;
        double rtJ = mass * (rr * rr / 4 + hh * hh / 12 + .0015 * .0015);
        double raJ = mass * rr * rr / 2;
        double B = 1.8e-5 + rtJ, G = mass * 9.81 * .0015;
        double c = Math.cos(v[1]), s = Math.sin(v[1]);
        double D = 3.2e-5 + B * s * s + 3.6e-5 * c * c;
        return .5 * Math.pow(v[3] - c * v[5], 2) / D + .5 * v[4] * v[4] / B
                + .5 * v[5] * v[5] / raJ + G * c;
    }

    private static Rect frac(int w, int h, double fx, double fy) {
        int x = (int) (w * fx), y = (int) (h * fy);
        return new Rect(x - 30, y - 30, x + 30, y + 30);
    }

    // v3.2: exact-text match + clickable ancestor. findAccessibilityNodeInfosByText
    // matches substrings in text AND content-description, so "Drag frame" also
    // matched the canvas label "...choose flick rotor or drag frame below." and
    // nodes.get(0) returned the canvas bounds - the v3.1 tap landed on the canvas.
    // Fail closed when several distinct clickable targets match.
    private static Rect findText(Instrumentation inst, String text, long timeoutMs) {
        long end = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < end) {
            try {
                AccessibilityNodeInfo root = inst.getUiAutomation().getRootInActiveWindow();
                if (root != null) {
                    List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
                    List<Rect> exact = new ArrayList<>();
                    if (nodes != null) for (AccessibilityNodeInfo n : nodes) {
                        CharSequence t = n.getText();
                        if (t != null && t.toString().equals(text)) {
                            AccessibilityNodeInfo c = n;
                            while (c != null && !c.isClickable()) c = c.getParent();
                            if (c != null) { Rect r = new Rect(); c.getBoundsInScreen(r); exact.add(r); }
                        }
                    }
                    if (exact.size() == 1) return exact.get(0);
                    if (exact.size() > 1) {
                        boolean same = true;
                        for (int i = 1; i < exact.size(); i++) if (!exact.get(i).equals(exact.get(0))) same = false;
                        if (same) return exact.get(0);
                        throw new AssertionError("ambiguous control '" + text + "': "
                                + exact.size() + " distinct clickable targets");
                    }
                }
            } catch (AssertionError ae) { throw ae; }
              catch (Exception ignore) { }
            SystemClock.sleep(300);
        }
        return null;
    }

    private static String dumpNodes(Instrumentation inst) {
        StringBuilder sb = new StringBuilder();
        try {
            AccessibilityNodeInfo root = inst.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                for (String q : new String[]{"Flick", "frame", "speed", "Slow", "Reset", "Gyroscope"}) {
                    List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(q);
                    if (nodes == null) continue;
                    for (AccessibilityNodeInfo n : nodes) {
                        Rect b = new Rect(); n.getBoundsInScreen(b);
                        sb.append('[').append(n.getText()).append('|').append(n.getContentDescription())
                          .append('|').append(b.toShortString()).append(']');
                        if (sb.length() > 700) return sb.substring(0, 700);
                    }
                }
            }
        } catch (Exception e) { sb.append("dump-err"); }
        return sb.toString();
    }


import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

/**
 * Firebase Test Lab physical-device harness for the Gyroscope route.
 *
 * Opens nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0:
 *  - telemetry=1 installs the gyro test hook, which streams sim snapshots and
 *    gesture boundary events to logcat as '[gyro-test]' JSON;
 *  - reducedMotion=0 is the showcase route's TEST-ONLY override that pins
 *    motion on for device-farm images whose system reduced-motion setting is
 *    enabled. The production default (no params -> system setting) is
 *    untouched.
 *
 * Then injects real horizontal touch flicks (instrumentation sendPointerSync
 * -> genuine MotionEvents through the normal input pipeline). Spin velocity
 * is measured from pageX samples, so flicks must be horizontal to register.
 *
 * ASSERTIONS (honest, telemetry-backed): after the run window the harness
 * reads logcat back through the shell identity and requires the gyro test
 * hook's events: telemetry bridge installed, >=3 grabs (responder accepted
 * the flicks), >=3 spin impulses with nonzero velocity of both signs, sim
 * snapshots streaming with reduce=false, sim time and frame counter
 * advancing, and the sim having consumed the impulses. No telemetry, no pass.
 */
@RunWith(AndroidJUnit4.class)
public class FtlGyroFlickTest {
    private static final String TAG = "FtlGyroFlick";

    @Test
    public void gyroFlicks() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String pkg = inst.getTargetContext().getPackageName();
        // Method-order independence: assertions below only count this test's
        // own events (wallT >= t0), so a sibling test's grabs/spins/snaps can
        // never satisfy them.
        long t0 = System.currentTimeMillis() - 2000;

        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0"));
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        inst.startActivitySync(i);
        Log.i(TAG, "gyroscope route launched on " + pkg + " ?telemetry=1&reducedMotion=0");

        // Wait for RN bundle load + gyroscope screen to settle and render.
        SystemClock.sleep(12000);

        android.util.DisplayMetrics dm = inst.getTargetContext().getResources().getDisplayMetrics();
        float cx = dm.widthPixels / 2f;
        float cy = dm.heightPixels / 2f;
        float span = Math.min(dm.widthPixels, dm.heightPixels) * 0.28f;
        Log.i(TAG, "screen " + dm.widthPixels + "x" + dm.heightPixels + " span=" + span);

        // Three horizontal flicks with human-like spacing: right, right, left.
        // Horizontal because spin velocity is tracked from pageX samples.
        flick(inst, cx - span, cy, cx + span, cy, 220);
        SystemClock.sleep(2500);
        flick(inst, cx - span, cy, cx + span, cy, 200);
        SystemClock.sleep(2500);
        flick(inst, cx + span, cy, cx - span, cy, 240);

        // Let the resulting spin / precession / wobble render for the capture.
        SystemClock.sleep(6000);
        Log.i(TAG, "harness window complete");

        assertTelemetry(inst, t0);
    }

    private static void assertTelemetry(Instrumentation inst, long t0) throws Exception {
        ParcelFileDescriptor pfd =
                inst.getUiAutomation().executeShellCommand("logcat -d");
        BufferedReader r = new BufferedReader(
                new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(pfd)));

        boolean bridge = false;
        int grabs = 0, spins = 0, snaps = 0, snapsReduceFalse = 0;
        double maxPosJ = 0, maxNegJ = 0;
        double firstSimT = Double.NaN, lastSimT = Double.NaN;
        long firstFrame = -1, lastFrame = -1, lastSeenImpulse = -1;

        String line;
        while ((line = r.readLine()) != null) {
            int m = line.indexOf("[gyro-test]");
            if (m < 0) continue;
            int s = line.indexOf('{', m);
            int e = line.lastIndexOf('}');
            if (s < 0 || e <= s) continue;
            try {
                JSONObject o = new JSONObject(line.substring(s, e + 1));
                String kind = o.optString("kind");
                if (kind.equals("bridge")) {
                    bridge = true; // process-global: proves the hook is installed
                } else if (o.optLong("wallT", 0) < t0) {
                    // before this method's window: belongs to another test
                } else if (kind.equals("grab")) {
                    grabs++;
                } else if (kind.equals("spin")) {
                    spins++;
                    double j = o.optDouble("j", 0);
                    if (j > maxPosJ) maxPosJ = j;
                    if (j < maxNegJ) maxNegJ = j;
                } else if (kind.equals("snap")) {
                    snaps++;
                    if (!o.optBoolean("reduce", true)) snapsReduceFalse++;
                    double simT = o.optDouble("simT", Double.NaN);
                    long fr = o.optLong("frame", -1);
                    long seen = o.optLong("seenImpulse", -1);
                    if (!Double.isNaN(simT)) {
                        if (Double.isNaN(firstSimT)) firstSimT = simT;
                        lastSimT = simT;
                    }
                    if (fr >= 0) {
                        if (firstFrame < 0) firstFrame = fr;
                        lastFrame = fr;
                    }
                    if (seen >= 0) lastSeenImpulse = seen;
                }
            } catch (Exception parse) {
                Log.w(TAG, "unparsed telemetry line: " + line);
            }
        }
        r.close();

        String summary = "telemetry bridge=" + bridge
                + " grabs=" + grabs + " spins=" + spins
                + " maxPosJ=" + maxPosJ + " maxNegJ=" + maxNegJ
                + " snaps=" + snaps + " snapsReduceFalse=" + snapsReduceFalse
                + " simT=" + firstSimT + "->" + lastSimT
                + " frame=" + firstFrame + "->" + lastFrame
                + " lastSeenImpulse=" + lastSeenImpulse;
        Log.i(TAG, summary);

        StringBuilder failures = new StringBuilder();
        if (!bridge) failures.append("no bridge event (?telemetry=1 not applied); ");
        if (grabs < 3) failures.append("grabs=").append(grabs)
                .append(" <3 (flicks rejected by the pan responder); ");
        if (spins < 3) failures.append("spins=").append(spins)
                .append(" <3 (no release impulses recorded); ");
        if (maxPosJ <= 0.0005) failures.append("no positive flick impulse (maxPosJ=")
                .append(maxPosJ).append("); ");
        if (maxNegJ >= -0.0005) failures.append("no negative flick impulse (maxNegJ=")
                .append(maxNegJ).append("); ");
        if (snaps < 3) failures.append("snaps=").append(snaps)
                .append(" <3 (sim telemetry not streaming); ");
        if (snapsReduceFalse < snaps)
            failures.append("reduce=true in ").append(snaps - snapsReduceFalse)
                    .append("/").append(snaps).append(" snaps (override failed); ");
        if (!(lastSimT - firstSimT > 5.0))
            failures.append("sim time advanced only ")
                    .append(lastSimT - firstSimT).append("s; ");
        if (!(lastFrame - firstFrame > 60))
            failures.append("frame counter advanced only ")
                    .append(lastFrame - firstFrame).append("; ");
        if (lastSeenImpulse < 3)
            failures.append("sim consumed only ").append(lastSeenImpulse)
                    .append(" impulses; ");

        if (failures.length() > 0) {
            throw new AssertionError("gyro physical telemetry FAILED: "
                    + failures + "| " + summary);
        }
        Log.i(TAG, "ASSERTIONS PASSED: " + summary);
    }

    private static void flick(Instrumentation inst, float x0, float y0, float x1, float y1, long durMs) {
        final int steps = 24;
        long t0 = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(t0, t0, MotionEvent.ACTION_DOWN, x0, y0, 0);
        inst.sendPointerSync(down);
        down.recycle();
        for (int s = 1; s <= steps; s++) {
            long t = t0 + (durMs * s / steps);
            float f = (float) s / steps;
            // Constant-velocity swipe so the release-time velocity is
            // representative of the whole flick (an ease-out tail would decay
            // the tracked velocity toward zero before release).
            MotionEvent mv = MotionEvent.obtain(t0, t, MotionEvent.ACTION_MOVE,
                    x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0);
            inst.sendPointerSync(mv);
            mv.recycle();
            SystemClock.sleep(Math.max(1, durMs / steps - 2));
        }
        MotionEvent up = MotionEvent.obtain(t0, t0 + durMs + 8, MotionEvent.ACTION_UP, x1, y1, 0);
        inst.sendPointerSync(up);
        up.recycle();
        Log.i(TAG, "flick injected durMs=" + durMs + " dx=" + (x1 - x0));
    }
    // ---------------- v3: controls / drag / slow / reset / physics ----------
    // Covers the remaining physical interaction gates: Slow motion (sim-rate
    // ratio + label), Drag frame (spring-target tracking), Reset (sim restart,
    // slow preserved - actual component semantics verified in source), and a
    // free-evolution invariant window (energy dissipation, spin-momentum decay,
    // steady precession; expectations derived from gyroMath, not from emitted
    // verdicts). gfxinfo framestats + meminfo are collected as MEASUREMENT ONLY
    // (frame evidence, never a render-smoothness/GPU-time clearance).

    @Test
    public void gyroControls() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String pkg = inst.getTargetContext().getPackageName();
        long t0 = System.currentTimeMillis() - 2000;

        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("nativelet-showcase:///gyroscope?telemetry=1&reducedMotion=0"));
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        inst.startActivitySync(i);
        Log.i(TAG, "controls: route launched ?telemetry=1&reducedMotion=0");
        SystemClock.sleep(12000);

        android.util.DisplayMetrics dm = inst.getTargetContext().getResources().getDisplayMetrics();
        int w = dm.widthPixels, h = dm.heightPixels;
        float cx = w / 2f, cy = h / 2f;
        float span = Math.min(w, h) * 0.28f;

        exec(inst, "dumpsys gfxinfo " + pkg + " reset");

        Rect rFlick = findText(inst, "Flick rotor", 3000);
        Rect rDrag = findText(inst, "Drag frame", 1500);
        Rect rSlow = findText(inst, "Slow motion", 1500);
        Rect rReset = findText(inst, "Reset", 1500);
        // v3.2: absent/ambiguous targeting fails closed - no silent fallback to
        // likely coordinates (v3.1's canvas-center miss came from substring
        // matching; a fixed-fraction tap would be the same class of guess).
        String loc = "hierarchy";
        if (rDrag == null) throw new AssertionError("Drag frame control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rSlow == null) throw new AssertionError("Slow motion control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rReset == null) throw new AssertionError("Reset control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        if (rFlick == null) throw new AssertionError("Flick rotor control not located exactly; refusing geometry guess. nodes: " + dumpNodes(inst));
        Log.i(TAG, "controls: locSource=" + loc);

        tap(inst, rSlow);
        long slowOn = System.currentTimeMillis();
        SystemClock.sleep(6000);
        long slowOff = System.currentTimeMillis();
        tap(inst, rSlow);
        SystemClock.sleep(800);

        tap(inst, rDrag);
        SystemClock.sleep(400);
        long dragStart = System.currentTimeMillis();
        drag(inst, cx - span * 0.45f, cy - span * 0.3f, cx + span * 0.45f, cy + span * 0.3f, 2400);
        long dragEnd = System.currentTimeMillis();
        SystemClock.sleep(1200);

        // v3.3: return to spin mode before the post-controls flick; frame-mode
        // gestures grab but cannot spin, so the impulse gate needs Flick rotor.
        tap(inst, rFlick);
        SystemClock.sleep(400);
        flick(inst, cx - span, cy, cx + span, cy, 220);
        SystemClock.sleep(2500);

        tap(inst, rSlow);
        SystemClock.sleep(500);
        tap(inst, rReset);
        long resetAt = System.currentTimeMillis();
        SystemClock.sleep(2500);
        tap(inst, rSlow); // off again for a full-rate invariant window
        SystemClock.sleep(800);

        long invStart = System.currentTimeMillis();
        SystemClock.sleep(7000);
        long invEnd = System.currentTimeMillis();

        String gfx = exec(inst, "dumpsys gfxinfo " + pkg);
        String mem = exec(inst, "dumpsys meminfo " + pkg);
        assertControls(inst, t0, slowOn, slowOff, dragStart, dragEnd, resetAt,
                invStart, invEnd, loc, gfx, mem);
    }

    private static class Ev { String kind; JSONObject o; long wallT; }

    private static void assertControls(Instrumentation inst, long t0, long slowOn, long slowOff,
            long dragStart, long dragEnd, long resetAt, long invStart, long invEnd,
            String loc, String gfx, String mem) throws Exception {
        ParcelFileDescriptor pfd = inst.getUiAutomation().executeShellCommand("logcat -d");
        BufferedReader r = new BufferedReader(
                new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(pfd)));
        boolean bridge = false;
        List<Ev> snaps = new ArrayList<>(), grabs = new ArrayList<>(),
                spins = new ArrayList<>(), resets = new ArrayList<>();
        String line;
        while ((line = r.readLine()) != null) {
            int m = line.indexOf("[gyro-test]");
            if (m < 0) continue;
            int s = line.indexOf('{', m), e = line.lastIndexOf('}');
            if (s < 0 || e <= s) continue;
            try {
                JSONObject o = new JSONObject(line.substring(s, e + 1));
                String kind = o.optString("kind");
                if (kind.equals("bridge")) { bridge = true; continue; }
                Ev ev = new Ev(); ev.kind = kind; ev.o = o; ev.wallT = o.optLong("wallT", 0);
                if (ev.wallT < t0) continue;
                if (kind.equals("snap")) snaps.add(ev);
                else if (kind.equals("grab")) grabs.add(ev);
                else if (kind.equals("spin")) spins.add(ev);
                else if (kind.equals("reset")) resets.add(ev);
            } catch (Exception ignore) { }
        }
        r.close();

        StringBuilder f = new StringBuilder();
        if (!bridge) f.append("no bridge event; ");

        // SLOW: direct simulation-time scaling, simT advance per wall second in
        // the slow window vs the baseline window of the SAME sim session. v3.1
        // scoped the baseline from t0, which straddled the previous activity's
        // snap tail (simT restart made rBase negative). Windows now start after
        // the last simT restart before slowOn. The [0.08,0.55] band proves a
        // broad slowdown only; it is not quarter-speed accuracy.
        int baseStart = 0;
        for (int i = 1; i < snaps.size(); i++) {
            double prev = snaps.get(i - 1).o.optDouble("simT"), cur = snaps.get(i).o.optDouble("simT");
            if (cur < prev - 0.5 && snaps.get(i).wallT < slowOn) baseStart = i;
        }
        List<Ev> base = new ArrayList<>();
        for (int i = baseStart; i < snaps.size(); i++) {
            Ev s = snaps.get(i);
            if (s.wallT <= slowOn - 300) base.add(s); else break;
        }
        List<Ev> slow = between(snaps, slowOn + 300, slowOff - 300);
        double rBase = rate(base), rSlow = rate(slow);
        long slowFlagged = countSlow(slow);
        if (base.size() < 3) f.append("baseline snaps=").append(base.size()).append(" <3 (window not comparable); ");
        if (slow.size() < 3) f.append("slow snaps=").append(slow.size()).append(" <3 (window not comparable); ");
        if (hasRestart(base)) f.append("sim restart inside baseline window; ");
        if (hasRestart(slow)) f.append("sim restart inside slow window; ");
        if (slowFlagged < 3) f.append("slow=true snaps=").append(slowFlagged).append(" <3 (toggle missed); ");
        if (!(rBase > 0.2)) f.append("baseline sim-rate not positive/healthy: ").append(rBase).append("; ");
        if (!(rSlow > 0.08 * rBase && rSlow < 0.55 * rBase))
            f.append("slow sim-time factor ").append(rSlow).append("/").append(rBase)
                    .append(" outside [0.08,0.55]; ");

        // DRAG FRAME: frame-mode grab, active snaps, target moved, convergence.
        Ev frameGrab = null;
        for (Ev g : grabs) if ("frame".equals(g.o.optString("mode")) && g.wallT >= dragStart - 1500) frameGrab = g;
        if (frameGrab == null) f.append("no frame-mode grab (Drag frame tap or drag missed); ");
        List<Ev> active = new ArrayList<>();
        for (Ev s : snaps) if (s.wallT >= dragStart - 300 && s.wallT <= dragEnd + 800
                && s.o.optJSONObject("input") != null && s.o.optJSONObject("input").optBoolean("active")) active.add(s);
        if (active.size() < 2) f.append("active drag snaps=").append(active.size()).append(" <2; ");
        double targetMove = 0, d0 = -1, d1 = -1;
        if (!active.isEmpty()) {
            double a0 = frameGrab != null ? frameGrab.o.optDouble("a") : Double.NaN;
            double b0 = frameGrab != null ? frameGrab.o.optDouble("b") : Double.NaN;
            for (Ev s : active) {
                JSONObject in = s.o.optJSONObject("input");
                targetMove = Math.max(targetMove, Math.abs(in.optDouble("targetYaw") - a0)
                        + Math.abs(in.optDouble("targetTilt") - b0));
            }
            JSONObject first = active.get(0).o, last = active.get(active.size() - 1).o;
            d0 = dist(first) ; d1 = dist(last);
        }
        if (!(targetMove > 0.05)) f.append("drag targets moved only ").append(targetMove).append("; ");
        if (d0 >= 0 && !(d1 < d0 || d1 < 0.12))
            f.append("pose did not converge toward drag targets ").append(d0).append("->").append(d1).append("; ");

        // FLICK regression inside the controls flow.
        boolean flickOk = false;
        for (Ev s : spins) if (s.wallT >= dragEnd && Math.abs(s.o.optDouble("j")) > 0.0005) flickOk = true;
        if (!flickOk) f.append("no post-controls flick impulse; ");

        // RESET: event, sim restart (simT back near 0), slow preserved.
        Ev reset = resets.isEmpty() ? null : resets.get(resets.size() - 1);
        if (reset == null) f.append("no reset event (Reset tap missed); ");
        boolean restarted = false, slowKept = false;
        for (Ev s : snaps) {
            if (s.wallT > resetAt - 100 && s.wallT < resetAt + 3000
                    && s.o.optDouble("simT", 99) < 1.5 && s.o.optLong("seenReset", 0) >= 1) {
                restarted = true;
                if (s.o.optBoolean("slow")) slowKept = true;
                break;
            }
        }
        if (!restarted) f.append("sim did not restart after reset; ");
        if (restarted && !slowKept) f.append("reset cleared slow mode (semantics changed); ");

        // INVARIANTS (free evolution, no input): energy strictly dissipates,
        // spin momentum decays, precession steady. Constants from gyroMath.
        List<Ev> inv = between(snaps, invStart - 300, invEnd + 300);
        if (inv.size() < 4) f.append("invariant snaps=").append(inv.size()).append(" <4; ");
        int eDown = 0, pDown = 0, dirPos = 0, dirNeg = 0;
        double yawNet = 0;
        for (int k = 1; k < inv.size(); k++) {
            double[] p = vec(inv.get(k - 1).o), q = vec(inv.get(k).o);
            if (energy(q) <= energy(p) * 1.001) eDown++;
            if (q[5] <= p[5] * 1.001) pDown++;
            double dy = q[0] - p[0];
            if (dy > 0) dirPos++; else if (dy < 0) dirNeg++;
            yawNet += dy;
        }
        int n = Math.max(1, inv.size() - 1);
        if (eDown < n) f.append("energy rose in ").append(n - eDown).append("/").append(n).append(" intervals; ");
        if (pDown < n) f.append("spin momentum rose in ").append(n - pDown).append("/").append(n).append(" intervals; ");
        if (Math.abs(yawNet) < 0.12 || Math.max(dirPos, dirNeg) * 5 < n * 4)
            f.append("precession not steady: yawNet=").append(yawNet)
                    .append(" dir+/dir-=").append(dirPos).append("/").append(dirNeg).append("; ");

        // Perf/memory: measurement only, reported, never gated.
        String janky = grep(gfx, "Janky frames:");
        String pss = grep(mem, "TOTAL PSS:");
        if (pss.isEmpty()) pss = grep(mem, "TOTAL:");

        String summary = "controls loc=" + loc
                + " snaps=" + snaps.size() + " grabs=" + grabs.size() + " spins=" + spins.size()
                + " resets=" + resets.size()
                + " slowRate=" + rSlow + " baseRate=" + rBase
                + " dragTargetMove=" + targetMove + " dragDist=" + d0 + "->" + d1
                + " invSnaps=" + inv.size() + " eDown=" + eDown + "/" + n
                + " pDown=" + pDown + "/" + n + " yawNet=" + yawNet
                + " | " + janky + " | " + pss;
        Log.i(TAG, summary);
        if (f.length() > 0)
            throw new AssertionError("gyro controls telemetry FAILED: " + f + "| " + summary
                    + " | nodes: " + dumpNodes(inst));
        Log.i(TAG, "ASSERTIONS PASSED (controls): " + summary);
    }

    private static List<Ev> between(List<Ev> snaps, long a, long b) {
        List<Ev> out = new ArrayList<>();
        for (Ev s : snaps) if (s.wallT >= a && (b <= 0 || s.wallT <= b)) out.add(s);
        return out;
    }

    private static double rate(List<Ev> snaps) {
        if (snaps.size() < 2) return Double.NaN;
        Ev f = snaps.get(0), l = snaps.get(snaps.size() - 1);
        double dt = (l.wallT - f.wallT) / 1000.0;
        return dt > 0.5 ? (l.o.optDouble("simT") - f.o.optDouble("simT")) / dt : Double.NaN;
    }

    private static boolean hasRestart(List<Ev> snaps) {
        for (int i = 1; i < snaps.size(); i++)
            if (snaps.get(i).o.optDouble("simT") < snaps.get(i - 1).o.optDouble("simT") - 0.5) return true;
        return false;
    }

    private static long countSlow(List<Ev> snaps) {
        long c = 0;
        for (Ev s : snaps) if (s.o.optBoolean("slow")) c++;
        return c;
    }

    private static double dist(JSONObject snap) {
        JSONObject in = snap.optJSONObject("input");
        if (in == null) return -1;
        org.json.JSONArray v = snap.optJSONArray("v");
        return Math.abs(v.optDouble(0) - in.optDouble("targetYaw"))
                + Math.abs(v.optDouble(1) - in.optDouble("targetTilt"));
    }

    private static double[] vec(JSONObject snap) {
        org.json.JSONArray v = snap.optJSONArray("v");
        double[] out = new double[6];
        for (int k = 0; k < 6; k++) out[k] = v.optDouble(k);
        return out;
    }

    // Total mechanical energy; constants copied from gyroMath.ts GYRO_DEFAULTS.
    private static double energy(double[] v) {
        double mass = .15, rr = .045, hh = .008;
        double rtJ = mass * (rr * rr / 4 + hh * hh / 12 + .0015 * .0015);
        double raJ = mass * rr * rr / 2;
        double B = 1.8e-5 + rtJ, G = mass * 9.81 * .0015;
        double c = Math.cos(v[1]), s = Math.sin(v[1]);
        double D = 3.2e-5 + B * s * s + 3.6e-5 * c * c;
        return .5 * Math.pow(v[3] - c * v[5], 2) / D + .5 * v[4] * v[4] / B
                + .5 * v[5] * v[5] / raJ + G * c;
    }

    private static Rect frac(int w, int h, double fx, double fy) {
        int x = (int) (w * fx), y = (int) (h * fy);
        return new Rect(x - 30, y - 30, x + 30, y + 30);
    }

    // v3.2: exact-text match + clickable ancestor. findAccessibilityNodeInfosByText
    // matches substrings in text AND content-description, so "Drag frame" also
    // matched the canvas label "...choose flick rotor or drag frame below." and
    // nodes.get(0) returned the canvas bounds - the v3.1 tap landed on the canvas.
    // Fail closed when several distinct clickable targets match.
    private static Rect findText(Instrumentation inst, String text, long timeoutMs) {
        long end = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < end) {
            try {
                AccessibilityNodeInfo root = inst.getUiAutomation().getRootInActiveWindow();
                if (root != null) {
                    List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
                    List<Rect> exact = new ArrayList<>();
                    if (nodes != null) for (AccessibilityNodeInfo n : nodes) {
                        CharSequence t = n.getText();
                        if (t != null && t.toString().equals(text)) {
                            AccessibilityNodeInfo c = n;
                            while (c != null && !c.isClickable()) c = c.getParent();
                            if (c != null) { Rect r = new Rect(); c.getBoundsInScreen(r); exact.add(r); }
                        }
                    }
                    if (exact.size() == 1) return exact.get(0);
                    if (exact.size() > 1) {
                        boolean same = true;
                        for (int i = 1; i < exact.size(); i++) if (!exact.get(i).equals(exact.get(0))) same = false;
                        if (same) return exact.get(0);
                        throw new AssertionError("ambiguous control '" + text + "': "
                                + exact.size() + " distinct clickable targets");
                    }
                }
            } catch (AssertionError ae) { throw ae; }
              catch (Exception ignore) { }
            SystemClock.sleep(300);
        }
        return null;
    }

    private static String dumpNodes(Instrumentation inst) {
        StringBuilder sb = new StringBuilder();
        try {
            AccessibilityNodeInfo root = inst.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                for (String q : new String[]{"Flick", "frame", "speed", "Slow", "Reset", "Gyroscope"}) {
                    List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(q);
                    if (nodes == null) continue;
                    for (AccessibilityNodeInfo n : nodes) {
                        Rect b = new Rect(); n.getBoundsInScreen(b);
                        sb.append('[').append(n.getText()).append('|').append(n.getContentDescription())
                          .append('|').append(b.toShortString()).append(']');
                        if (sb.length() > 700) return sb.substring(0, 700);
                    }
                }
            }
        } catch (Exception e) { sb.append("dump-err"); }
        return sb.toString();
    }

    private static void tap(Instrumentation inst, Rect r) {
        long t0 = SystemClock.uptimeMillis();
        float x = r.centerX(), y = r.centerY();
        MotionEvent d = MotionEvent.obtain(t0, t0, MotionEvent.ACTION_DOWN, x, y, 0);
        inst.sendPointerSync(d); d.recycle();
        MotionEvent u = MotionEvent.obtain(t0, t0 + 60, MotionEvent.ACTION_UP, x, y, 0);
        inst.sendPointerSync(u); u.recycle();
        Log.i(TAG, "tap " + x + "," + y);
        SystemClock.sleep(150);
    }

    private static void drag(Instrumentation inst, float x0, float y0, float x1, float y1, long durMs) {
        final int steps = 48;
        long t0 = SystemClock.uptimeMillis();
        MotionEvent d = MotionEvent.obtain(t0, t0, MotionEvent.ACTION_DOWN, x0, y0, 0);
        inst.sendPointerSync(d); d.recycle();
        for (int s = 1; s <= steps; s++) {
            long t = t0 + (durMs * s / steps);
            float f = (float) s / steps;
            MotionEvent mv = MotionEvent.obtain(t0, t, MotionEvent.ACTION_MOVE,
                    x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0);
            inst.sendPointerSync(mv); mv.recycle();
            SystemClock.sleep(Math.max(1, durMs / steps - 2));
        }
        MotionEvent u = MotionEvent.obtain(t0, t0 + durMs + 8, MotionEvent.ACTION_UP, x1, y1, 0);
        inst.sendPointerSync(u); u.recycle();
        Log.i(TAG, "drag injected durMs=" + durMs);
    }

    private static String exec(Instrumentation inst, String cmd) {
        try {
            ParcelFileDescriptor pfd = inst.getUiAutomation().executeShellCommand(cmd);
            BufferedReader r = new BufferedReader(
                    new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(pfd)));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
            r.close();
            return sb.toString();
        } catch (Exception e) {
            return "exec failed: " + e;
        }
    }

    private static String grep(String text, String prefix) {
        for (String line : text.split("\n"))
            if (line.trim().startsWith(prefix)) return line.trim();
        return "(no '" + prefix.trim() + "' line)";
    }

            }
