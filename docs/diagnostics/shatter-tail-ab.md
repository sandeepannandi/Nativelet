# Terminal quiescence diagnostic plan

Local implementation only. Bounded A/B behavior+marker smoke approved after actual-diff review. No merge or performance study authorized.

A: default/unset EXPO_PUBLIC_SHATTER_TAIL; diagnostics=true.
B: EXPO_PUBLIC_SHATTER_TAIL=physics-mesh; diagnostics=true.
Diagnostics=false never activates this branch. Hermes sampler setting remains identical in A/B; do not enable competing samplers. CanvasKeepAlive is unchanged in both. A future keepalive-only variant needs separate review, not combined treatment.

B consumes all queued hit/reset input before the terminal guard. A hit and Reset each clear terminal. Every existing physics step runs unchanged until all bodies are explicitly gone. Sleeping is not terminal. The count90 timing report is not terminal. The all-gone step still invalidates the mesh once to park the last vertices and clear edge paths. Later callbacks remain subscribed for Reset/new hit but skip physics/frame invalidation. World remains non-null, preserving cleared-pane sheen state. Shards/geometry/contacts/solver/time-step, Canvas JSX and final textures are untouched.

Local tests are not native UI proof. Actual Reanimated scheduling/derived mesh ordering, Skia presentation and Reset pixels remain unverified. Tests run the transpiled actual callback under mocked hooks/native objects, plus real numerical trajectories/mesh comparison. Do not infer native race freedom from the mock.

Before any native experiment:
- Review this exact diff and all tests. The historical five unwind failures remain unresolved. Zero-error is mandatory for accepted performance attribution, NOT a prerequisite for independent behavior/marker smoke.
- Add native BOOTTIME-aligned trace slices on actual UI thread for createWorld,stepWorld,fillMesh,path/copies,all-gone,final-mesh-parked,reset. Use Android tracing clock conversion; JS performance.now/log receipt is not a BOOTTIME marker. This patch deliberately does not invent a native tracing bridge.
- Use matched seed/input/shards/device/build configuration and matched post-final-mesh windows (e.g. first5seconds after final-mesh-parked), while keeping same capture duration. Baseline also needs marker observation without quiescing.
- Validate first fracture, terminal cleared pane, Reset restored rim and second fracture in both variants. A cannot use90-frame report or old28-frame report as terminal boundary.
- Compare main/RenderThread schedulerRunning/runnable durations separately from inclusive sampled stacks, errors and unknown mappings. Report missing trailing coverage. No hardware GPU causality from qemu_pipe_read or absent vendor events.
- Evaluate active-phase equality and tail-only savings separately. A tail result cannot establish smoother active fracture. Require zero reported unwind errors before accepting any whole-stack ranking.

Only the specifically approved finite A/B behavior+marker smoke may run; no automatic reruns. Existing trace remains failed-quality evidence, unchanged.

## Existing bridge patch and bounded smoke proposal (not executed)

EXPO_PUBLIC_SHATTER_TRACE=1 plus diagnostics=true enables existing Worklets
_beginSection/_endSection host functions in both A/B. Disabled calls run bodies
without requiring globals. Missing globals throw SHATTER_TRACE_UNAVAILABLE only
in explicit diagnostic mode. Synchronous try/finally pairs never span frames.

Sections: SHATTER/createWorld,stepWorld,fillMesh,path,copies,allGone,
finalMeshParked,reset. Terminal sections emit once per hit/reset generation;
allGone detection also runs in baseline tracing mode without quiescing it.
finalMeshParked marks CPU preparation only, not GPU completion/presentation.
Current implementation uses fixed section names; recover generations by ordered
createWorld/reset intervals on the actual UI-thread track, not by log count.

Proposed bounded build/behavior+marker smoke, subject to separate approval:
1. Review diff/tests, then produce diagnostic release artifacts A/B with identical
   settings except tail mode. No dependency updates or CanvasKeepAlive variant.
2. One behavior sequence per artifact: intact pane -> tap -> wait for explicit
   allGone/finalMeshParked -> cleared screenshot -> Reset -> intact rim screenshot
   -> second tap -> both terminal markers and cleared screenshot. Keep a finite
   timeout (e.g.15s per fracture), fail rather than retry silently.
3. Capture system atrace/ftrace (target atrace_apps) for marker smoke. Query parsed
   slices joined through thread_track/thread/process: correct package/PID/main
   UI tid, finite durations, paired synchronous sections, each createWorld cycle
   has allGone before finalMeshParked and reset lies between generations. All
   expected names must exist; absent markers fail marker smoke even if globals
   were callable. Missing markers must not be treated as zero duration/work.
4. Screenshot/pixel checks determine behavior independently of marker/performance
   quality. Do not pass native behavior from host mocks. Return separate statuses
   for build, first/Reset/second-fracture behavior, marker presence/order and any
   native trace quality. Keep capture existing unwind failures visible and the
   strict zero-error performance-attribution gate unchanged. No automatic rerun.
5. A/B performance measurement is NOT this smoke. Matching after-finalMeshParked
   windows need a later reviewed design once marker capture/behavior are verified.
   Neither this patch nor marker smoke resolves active-fracture smoothness or the
   separate Prism native/full-suite crash gate.
