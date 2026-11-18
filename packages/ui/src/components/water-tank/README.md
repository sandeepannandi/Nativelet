# Water Tank

Original React Native Skia and Gesture Handler scene. Drag the submerged ceramic ball to disturb the water. Wave, Pause, Slow motion and Reset are available without dragging.

Copy all source files with LICENSE. Requires React Native, @shopify/react-native-skia and react-native-gesture-handler. Import WaterTank and render it in a GestureHandlerRootView-enabled app. The component measures its container up to 380 points wide.

The 128 by 96 finite-difference heightfield uses a fixed 1/120-second step, reflecting boundaries and velocity damping. Sphere motion injects a volume-neutral dipole wake. Snell refraction and Fresnel blending bend the tiled pool through the surface. Caustic brightness is a local ray-focusing estimate, not full light transport. The sphere is dragged kinematically; there is no buoyancy, breaking wave, spray or volumetric fluid solver. Optical and wave parameters are shared with the WebGL preview.

System reduced motion freezes autonomous time; controls and ball positioning remain available. Android API 34 x86_64 emulator validation passed rendering, sphere drag and return, continuing waves and tested-path crash checks (Actions run 44330123525). The software-GPU emulator renders slowly and emits Skia SurfaceTexture release warnings; passing this test is not a smooth-frame-rate certification. Physical-phone FPS and iOS remain unverified.
