# Gyroscope

A rotor in two moving gimbals. Flick to add or reverse rotor spin. Switch to Drag frame to apply hand torque to the gimbals. Slow motion advances the same simulation at one quarter speed. Reset restores the initial state. Reduced motion holds the scene still.

Copy the component, math, controller, shader, example and LICENSE together. Requires React Native, Skia and Reanimated. Web preview uses the same simulation and analytic ray geometry through WebGL.

## Model

Coordinates are outer yaw a, inner tilt b and relative rotor spin g. Their rotations are Rz(a), Rx(b), Rz(g). The finite-inertia rings and rotor are coupled through a Lagrangian mass matrix, integrated in generalized momenta by RK4 at a nominal1/960s, refined automatically when angular-momentum coupling becomes faster. Up to100ms of each elapsed frame is accepted; longer pauses are explicitly recorded as discarded time rather than sent through a giant unstable step. A4096-substep safety bound also records any discarded remainder. No animation prescribes precession or wobble.

The 150g rotor has45mm radius,8mm thickness and a named1.5mm axial center-of-mass offset. Transverse inertia includes its parallel-axis contribution. The small offset supplies gravity torque. A balanced no-torque gyro keeps its axis fixed. Bearings have linear drag; a hand drag is a bounded spring/damper torque. Flick is an external angular impulse with the appropriate projections into both cyclic momenta, not a speed assignment.

The two gimbals have effective finite moments. The axle and thin bearing bridges are treated as massless, the bodies are perfectly rigid, and the bearings are ideal intersecting-axis constraints. This is not a measured instrument, flexible bearing/contact simulation or air-flow model. No physical-device claims are made.

## Rendering

Perspective rays intersect finite annular cylinders for the rings, rotor, axle, bearing bridges and base. The rotor is separated from its support bars. Environment lighting, radial brushing, bevel bands and one-sample hard light visibility are approximations, not full global illumination. Engraved radial marks rotate with the actual spin coordinate; fast rotation can alias. Fixed studio camera.

## Verification

Run `node gyroMath.test.mjs`, `node gyroControl.test.mjs` and `node gyroGeometry.test.mjs` (Node22.23 or newer) for energy, cyclic momenta, analytic steady precession, balanced/no-torque behavior, force-free world angular momentum, step refinement, dissipative energy and frame-partition checks. These validate this idealized model and its numerics, not physical hardware. Skia shader compilation, Android gestures, crash history and native performance still need native evidence. Web checks do not replace those gates. No native-device verification flag is set.

`node gyroWorklets.test.cjs` (with showcase dependencies installed) checks the actual Expo transform, default constructor and a10-second isolated generated-closure replay. Keep helper worklets before their callers: generated factories capture functions at module initialization. Resolve captured parameter defaults in the body, after closure binding. These regression checks do not replace Android execution.
