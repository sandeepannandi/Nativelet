# Domino Run

Original React Native Skia and Gesture Handler component. Dominoes stand along a spiral on a wooden table. Tap one to topple the chain, drag one to a new spot, or drag across empty table to draw your own path and a fresh run lines up along it.

Copy DominoRun.tsx, dominoMath.ts and LICENSE together. Requires react-native-gesture-handler and @shopify/react-native-skia. It wraps its own GestureHandlerRootView and needs no asset or network.

Every domino is a rigid box that rotates about the bottom edge it is tipping over. Gravity torque follows the centre of mass past that edge, so a gentle rock settles back and a push past the balance angle falls. When a falling face reaches the next domino's back face, a contact impulse splits their velocities, and leaning contact keeps transmitting force every substep, so the cascade wave and the leaning pile at the end come out of the same rule. Hard knocks and floor landings kick a little dust. Spacing wider than a domino is tall leaves the gap standing.

Props: slowMotion (about 4x slower), reducedMotion (slower, no dust; the system setting is also respected). Buttons push the first domino and stand the run back up, and screen readers get the same two actions.

Honest limits: a simplified rigid-body chain. Dominoes do not slide or spin, contact is checked between path neighbours only, and face contact is modelled at one moving contact point, so glancing hits and sideways shoves are not simulated. No sound or haptics. Web and native share one solver and one drawing list. Device frame rate has not been measured.
