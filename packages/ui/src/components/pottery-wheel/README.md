# Pottery Wheel

Original React Native Skia and Gesture Handler component. A lump of clay spins on a wheel. Drag across its side to press it in or pull it out, and shape a bowl or a vase.

Copy PotteryWheel.tsx, potteryMath.ts and LICENSE together. Requires react-native-gesture-handler and @shopify/react-native-skia. It wraps its own GestureHandlerRootView and needs no asset or network.

The clay is a stack of slices that each keep their own volume. A slice squeezed in climbs and a slice pulled out sinks, so the total volume stays fixed and the height follows the shape. Height is capped to the canvas, so a squeeze that would overflow is scaled back. Every push also kicks a damped off-centre chain that the base holds still, which shows as a wobble on the rim that settles when you let go. Contact makes the clay wet and glossy for a few seconds. Finger grooves are real dents in the profile.

Props: slowMotion (about 4x slower), reducedMotion (no wobble, slower wheel; the system setting is also respected). The New clay button resets the lump. Screen readers get increment and decrement actions that press the waist in or pull it out.

Honest limits: this is a one dimensional profile of a solid of revolution, not a 3D clay simulation. The inside of the opening is drawn, not modelled, and the wall thickness is cosmetic. Wobble is a model of an off-centre clay column, not measured clay. No sound or haptics. Web and native share one solver and one drawing list. Device frame rate has not been measured.
