# Zipper Reveal

Original React Native Skia and Gesture Handler reveal. Requires react-native-gesture-handler and @shopify/react-native-skia. Wraps its own GestureHandlerRootView.

Copy ZipperReveal.tsx, zipperMath.ts and LICENSE together. The demo renders a procedural landscape, with no remote asset or network requirement. initialOpening is 0..1, slowMotion and reducedMotion are optional. onOpeningChange receives the target opening after a gesture or button. System reduced motion removes settling but preserves direct manipulation. Open/Close buttons and adjustable accessibility actions avoid requiring a drag.

Cloth is a constrained, damped edge approximation, not a full woven fabric or metal contact simulation. Native and web share exact geometry, palette and solver. No sound or haptics implied. Device performance and screen-reader speech require separate testing.
