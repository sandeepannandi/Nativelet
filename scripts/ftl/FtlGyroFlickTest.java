package com.anonymous.nativeletshowcase;

import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.MotionEvent;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Firebase Test Lab physical-device harness for the Gyroscope route.
 * Opens nativelet-showcase:///gyroscope and injects real touch flicks
 * (instrumentation sendPointerSync -> genuine MotionEvents through the
 * normal input pipeline), then lets the spin render for the video and
 * FPS/CPU/memory capture. No assertions: the captured evidence is the
 * deliverable, evaluated outside the device.
 */
@RunWith(AndroidJUnit4.class)
public class FtlGyroFlickTest {
    private static final String TAG = "FtlGyroFlick";

    @Test
    public void gyroFlicks() throws Exception {
        Instrumentation inst = InstrumentationRegistry.getInstrumentation();
        String pkg = inst.getTargetContext().getPackageName();

        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("nativelet-showcase:///gyroscope"));
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        inst.startActivitySync(i);
        Log.i(TAG, "gyroscope route launched on " + pkg);

        // Wait for RN bundle load + gyroscope screen to settle and render.
        SystemClock.sleep(12000);

        DisplayMetrics dm = inst.getTargetContext().getResources().getDisplayMetrics();
        float cx = dm.widthPixels / 2f;
        float cy = dm.heightPixels / 2f;
        float span = Math.min(dm.widthPixels, dm.heightPixels) * 0.28f;
        Log.i(TAG, "screen " + dm.widthPixels + "x" + dm.heightPixels + " span=" + span);

        // Three flicks with human-like spacing: up, up, down.
        flick(inst, cx, cy + span, cx, cy - span, 220);
        SystemClock.sleep(2500);
        flick(inst, cx, cy + span, cx, cy - span, 200);
        SystemClock.sleep(2500);
        flick(inst, cx, cy - span, cx, cy + span, 240);

        // Let the resulting spin / precession / wobble render for the capture.
        SystemClock.sleep(6000);
        Log.i(TAG, "harness complete");
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
            // ease-out profile so the tail moves fastest, like a real flick
            float e = 1f - (1f - f) * (1f - f);
            MotionEvent mv = MotionEvent.obtain(t0, t, MotionEvent.ACTION_MOVE,
                    x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, 0);
            inst.sendPointerSync(mv);
            mv.recycle();
            SystemClock.sleep(Math.max(1, durMs / steps - 2));
        }
        MotionEvent up = MotionEvent.obtain(t0, t0 + durMs + 8, MotionEvent.ACTION_UP, x1, y1, 0);
        inst.sendPointerSync(up);
        up.recycle();
        Log.i(TAG, "flick injected durMs=" + durMs);
    }
}
