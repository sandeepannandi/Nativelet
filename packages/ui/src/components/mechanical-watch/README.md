# Mechanical Watch

A Swiss-lever escapement simulated with contact/constraint physics (impulse
solver, positional correction, no Baumgarte bias) and rendered as true 3D
meshes - case, bezel, movement plate, gear train, pallet fork with ruby
jewels, balance wheel and hairspring, hands - through a shared software
perspective pipeline (lathe/ring/extrude/gear builders, two-light rig with
Blinn specular, painter sort). The same flat triangle list draws on Skia
(`createPicture`) natively and Canvas2D on the web.

- 15-tooth club escape wheel, half-pitch advance per beat, one arrest per
  half-swing; 6 beats/s at 3 Hz balance (21,600 vph).
- Pallet draw holds the train against mainspring torque; impulse from the
  escape wheel sustains balance amplitude; the train stops when the
  mainspring unwinds.
- Drag to orbit the camera; the movement idles on a slow turntable.

Validated by node tests (kinematic and energy checks); contact-role
correction is still being tuned, so treat the escapement as a faithful
kinematic model rather than a fully validated Swiss-lever simulation.
Physical-device performance is untested (CI emulator evidence only).
