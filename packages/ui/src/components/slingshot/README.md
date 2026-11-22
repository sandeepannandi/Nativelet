# Slingshot

Original React Native Skia and Gesture Handler component. A wooden Y-frame holds a rubber band and a leather pouch with a ball. Drag the pouch back to stretch the band and aim, then let go to launch.

Copy Slingshot.tsx, slingMath.ts and LICENSE together. Requires react-native-gesture-handler and @shopify/react-native-skia. It wraps its own GestureHandlerRootView and needs no asset or network.

The band is a Hooke spring toward the fork, so the further you pull, the faster the ball leaves. While you hold, a dotted path shows where the ball will go, computed with the same integrator as the shot. On release the ball rides the spring until the pouch passes the fork, then flies under gravity, bounces off the walls, the floor and the frame, and settles. The slack band overshoots and wobbles as a damped spring, and it thins as it stretches. A resting ball is reloaded after a moment.

Props: slowMotion (about 4x slower), reducedMotion (no trail, quicker band settle; the system setting is also respected). Buttons fire a medium shot and reload, and screen readers get the same two actions.

Honest limits: a point-mass ball in a 2D side view, with a linear band and no band mass or twist. The pull is limited to the region below the fork. The ball does not spin and has no friction model beyond rolling loss on the floor. No targets, sound or haptics. Web and native share one solver and one drawing list. Device frame rate has not been measured.
