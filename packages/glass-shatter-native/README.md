# Nativelet Glass Shatter native companion

Unpublished integration candidate. Reusable native companion, not showcase-only code. The shared UI source imports only installed React Native/Worklets APIs and locates NativeletShatter through TurboModuleRegistry.

## Consumer installation

Use the repository package locally, or a packed archive from `npm pack ./packages/glass-shatter-native`. Add that archive as a dependency in the consumer app. This package is private/unpublished for review, do not assume an npm registry release exists.

Requires React Native0.86.x, react-native-worklets0.10.x (>=0.10.1), the UI component's Reanimated/Skia peers, and New Architecture. Android/iOS auto-register via react-native.config.js and Codegen; no showcase file paths. Expo users add `@nativelet/glass-shatter-native` to plugins, then `npx expo prebuild --clean` and make a custom development/native build. Plugin is deliberately no-op: installed pure-C++ dependency autolinking handles registration. Bare RN users run native autolinking/Codegen, install iOS pods and rebuild their app. ExpoGo cannot load this native module. Web retains original TS physics. No app release/publication is authorized by these instructions.

Android custom CMake target exports NativeletShatter header, links installed RN/Worklets. Codegen header is included verbatim under cpp/generated and checked against newly generated schema. iOS root podspec sources cpp files, depends on RNWorklets/ReactCodegen; Codegen maps NativeletShatterProvider. No app-specific Gradle/OnLoad patch required. Actual platform compile/link remains unverified.

Handle identity is epoch*2^26+counter, both strictly below2^26, total strictly below2^52. Native import has separate number bounds1e9; handle parser does not use that bound. Process-wide atomic epochs survive UI runtime/store reload. A destroyed process cannot carry its JS numeric handles into the next process. Never reuse store epoch. Counter/epoch exhaustion fail before creation. Store tests verify old handle rejection in new store and parser limits above1e9 and2^52boundary.

Render holds a store busy guard across every JavaScript property read/write, uses a C++ scalar snapshot, rejects create/dispose/advance during the call and permanently poisons world on failure. Swallowing a reentry exception still poisons outer render. This is not transactional publication to malicious setter receivers: earlier receiver properties may have changed, but native world cannot be reused/rendered and component stops/clears mesh. Actual JSI proxy/detachment tests remain a diagnostic runtime gate.

UI stop flag precedes frame event/physics work and mesh/index derivations; the first error disposes/clears world and reports once. Remount uses a new component stop flag/store handle. Install invocation and scheduling exceptions reject; native installation errors propagate in readiness poll;5seconddeadline bounds callback/scheduler loss. Ready flag is written last on UI. Unmount ignores Promise outcome, late completion cannot set unmounted component. Runtime weak holder and C++ hostfunction-owned store avoid retained raw JSI pointers.

Local checks: sanitizer malformed/lifecycle tests; TS typecheck; dependency autolinking both platforms; Codegen provider; JS exports both native platforms/web; two cleanprebuild hashes; pack archive content checks. These do NOT prove Android/iOS nativecompile, actualUIreload or speed. Prior NAPI exactness54cases12960frames and1440renderframes remain host evidence only. Same-runtime JSsin/cos retained; no libm substitution/tolerance waiver, no shard/solver change.

Run `g++ -std=c++20 -O0 -ffp-contract=off -fno-fast-math -fsanitize=address,undefined cpp/tests/boundary.cpp -o /tmp/shatter-boundary && /tmp/shatter-boundary` from this package. `cpp/tests/check-codegen.cjs GENERATED_HEADER` checks exact generated header. Mobile diagnostic source under showcase/diagnostics/shatterNativeBoundary.ts is intended for explicit actualUIJSI runs, not automatic product startup. Native FP flags remain strict.
