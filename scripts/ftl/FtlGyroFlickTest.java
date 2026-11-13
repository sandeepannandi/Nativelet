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

        assertTelemetry(inst);
    }

    private static void assertTelemetry(Instrumentation inst) throws Exception {
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
                    bridge = true;
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
}
