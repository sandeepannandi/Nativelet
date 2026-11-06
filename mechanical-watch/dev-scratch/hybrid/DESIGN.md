# Hybrid event-driven escapement (prototype A, approved 5:58 parent)
Goal: replace substep()'s contact/projection block with mode-based integration.
Keep: WatchPhysics, WatchState, WATCH_DEFAULTS, TRAIN, trainAngles, windCrown,
ENTRY/EXIT LOCK/IMP geometry, rotFace, contactFace, stepWatch(dtFrame) wrapper,
fixedDt substeps (renderer unchanged; renderer consumes s.e/s.p/s.b/s.beats).

Bodies: wheel (e,we; J=escapeJ; torque=-driveTorque*(floor+(1-floor)*wind));
fork (p,wp; J=forkJ; pivot friction 2.2); balance (b,wb; J=balanceJ; k; damp).
Wheel turns CLOCKWISE (we negative under torque). forkPivot=13.4, balancePivot=12,
rollerR=2.5, hornR=9.5, slotHalf=0.5, bankAngle=0.06.

MODES (wheel-fork subsystem):
- LOCK_ENTRY / LOCK_EXIT: tooth rests on entry/exit lock face. Draw holds fork
  ON banking (p=+/-bankAngle, wp=0) and wheel (we=0, e const). Only balance moves.
  Exit: jewel-slot engagement pushes fork off banking against draw (unlock).
  During unlock the tooth slides BACK along the lock face (recoil): constrained
  contact g=0 on the lock face while |p| decreases; wheel recoils (we>0 briefly).
  End of unlock: tooth reaches lock-face corner -> IMPULSE.
- IMPULSE_ENTRY / IMPULSE_EXIT: tooth slides on impulse face: holonomic
  constraint g(e,p)=0 (point on face segment). One DOF q (face parameter u):
  e(u), p(u) from the face line; wheel torque drives u forward; fork slot wall
  pushes jewel if jewel in slot (contact force along slot normal = coupling).
  End: tooth reaches impulse-face end -> DROP.
- DROP: wheel free (torque only); fork free (flung toward far banking; banking
  event when |p| reaches bankAngle, plastic: wp=0). Jewel may still be in slot.
  End: some tooth reaches the OTHER pallet's lock face -> LOCK event (plastic
  arrest: wheel normal velocity killed; fork held by banking => wheel loses the
  full normal component; friction mu=friction tangential). Beat counted HERE.

BALANCE-FORK (any mode): jewel point (rollerR at angle b from balance center
(0,F+balancePivot)) vs slot walls: two planes through fork-local (0,hornR)
perpendicular dist slotHalf, valid while |along|<1.6 (mouth window).
States: jewel FREE (outside slot region), IN_SLOT (between walls), ON_WALL(+/-)
(contact). Wall contact = one-sided plane constraint (restitution 0; small
Coulomb friction). Entry/exit are EVENTS on the mouth boundary.

EVENT DETECTION per substep: integrate active-mode ODE with RK4 over dt;
evaluate event functions at start/end; on sign change bisect to event time
(tol ~1e-6 s or 30 iters), apply transition (mode switch / plastic impulse
solved with current velocities), continue remainder of dt. Cap ~8 events per
substep; if exceeded, log + clamp (never silently drop).
Plastic impulse at event: Newton restitution e=0 along contact normal with
effective masses from geometry (same (r x n)^2/J terms as baseline).

ACCEPTANCE (same 4-metric x 3-dt long-run gate, no tuning to pass):
per dt in {1/960,1/1920,1/3840}, after 60s settle, measure 60s:
beats/s = 6 +/-0.5; advance/beat = half-pitch +/-5%; sustained amplitude
stable (no secular decay >5% over the window) and >=2.5 rad; energy audit:
sum(work by torque) = dE_kinetic+spring + damping loss + impact loss to 1%.
Also: wind sweep (wind=1, 0.5, floor) and 10-min sustained run at 960.
Compare against baseline-watchMath.ts (failing reference, DO NOT modify).

KNOWN FAILURE MODES THIS DESIGN MUST AVOID (evidence in parent reports 5:50):
no position teleports (energy fountains), no persistent Baumgarte velocity,
no banking rattle (banking is a persistent state, not a clamp), beat counting
structurally tied to lock arrests (can't beat without advance).

STATUS.md reference: baseline comments mention probe2/3/4.mjs - those probes
verified the face geometry itself; REUSE the geometry unchanged (verified).
