# Pin Art Board

An original touch-driven metal-pin toy: 1,015 pins slide on fixed axes, retain a raised impression, and flatten with an erase brush or a left-to-right wipe. A damped axial contact model with static-friction targets, not a volumetric solid simulation. Six batched Skia passes draw shafts, cast shadows, chrome caps and slope-directed highlights. The web adapter uses the same simulation and point geometry with Canvas2D.

Copy `PinArtBoard.tsx` and `pinMath.ts` together. Requires React Native, Reanimated and `@shopify/react-native-skia`. See `Example.tsx` for controls. `resetKey` starts a wipe whenever it changes; `erase`, `slowMotion` and `reducedMotion` are optional. Reduced motion removes settling, not touch control. Accessibility actions provide a centre impression and clear action. `onFeedback` lets the host supply haptics.

No camera, microphone, network calls or third-party assets. Physical phone frame rate, haptics and spoken screen-reader behavior are untested. The rendered view is an oblique 2D projection, not a rotatable 3D mesh.
