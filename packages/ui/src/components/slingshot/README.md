# Slingshot

Original React Native Skia and Gesture Handler component. Pull a leather pouch back and release a steel pellet from a walnut fork with tapered latex strips.

Copy Slingshot.tsx, slingMath.ts and LICENSE together. Requires react-native-gesture-handler and @shopify/react-native-skia. It wraps its own GestureHandlerRootView and needs no assets or network.

Each fork tip exerts tension along its own band. Bands resist extension, never compression, with a cubic strain-stiffening term. A shorter pull can settle back without launching. The aim dots use the same launch integrator. The pellet rides the accelerating pouch to separation, then follows gravity with restitution at the floor, walls and approximate fork. The empty pouch remains attached, recoils, and settles. Band width narrows as stretch increases. Resting pellets reload after a moment.

The renderer uses shaped walnut surfaces, growth lines, end grain, leather wraps and cup, latex ribbons, a reflected steel surface and layered contact shadows. The native and web adapters use the same solver and drawing list.

Props: slowMotion (about 4x slower), reducedMotion (quicker band settling; system preference respected). Fire, Reload and Slow motion buttons; keyboard and screen-reader actions included.

Limits: layered 2D material rendering, not 3D geometry. The elastic coefficients are tuned, not measured latex data. Bands have no distributed mass or twist; recoil uses a damped midpoint approximation. The pellet is a point mass with a collision radius; fork collisions use capsules rather than the visual silhouette. No spin or full rolling-friction model. The pull is limited to the region below the fork. No targets, sound or haptics. Device behavior and frame rate are unverified.
