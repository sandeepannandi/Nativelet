# Analytic escapement geometry - source extraction (2026-11-12)

Purpose: replace the GIF-digitized escapement geometry with an analytically
constructed Swiss club-tooth lever escapement from cited free full-text
sources, per parent direction (no fidelity waiver; formulas actually read
and cited before adoption).

## Primary source
H. R. Playtner, "An Analysis of the Lever Escapement" (1910), Project
Gutenberg eBook #21978, https://www.gutenberg.org/files/21978/21978-h/21978-h.htm
(local: sources/playtner.html, plain text sources/playtner.txt; line numbers
below refer to playtner.txt).

### Wheel
- 15 teeth, 24° pitch; "15 teeth divide evenly into 360° leaving an interval
  of 24° from tooth to tooth, which is also the angle at which the locking
  faces of the teeth are inclined from the center" (L436-441).
- Pallets span 2.5 tooth spaces: locking-to-locking angle at wheel center
  = 60° (L442-445). ABE and ABF = 30° each, FBE = 60° (L463-466).
- Tooth locking-face inclination: 24° from radial - "the angle on the tooth
  is made just twice the amount [of the 12° draw], namely 24°"; workable
  range 20-28° (L605-613).
- Club tooth: hollowed back, heel engages late in lift (L517-518, L726-735).

### Pallets / locking geometry
- Two forms: equidistant (lockings equal distance from pallet center A;
  unlocking on tangent intersections; used in finest Swiss/French/German
  work) and circular (L449-507). Plan: construct equidistant first.
- Tangents AC, AD from pallet center A to primitive circle GH; lockings at
  intersections of AC with EB and FB with AD (equidistant, L455-462).
- Locking circle MN struck from A (L466-467).
- Draw: locking planes inclined 12° from EB and FB at the locking edges
  (12° each deemed sufficient; some writers 15° engaging) (L582-599).
- Lock: 1.5° angular generally allowed (L619-620).
- Drop: 1.5° for club tooth (authorities), proportion to wheel size;
  7.5mm wheel -> 0.0983mm (L545-558).
- Run/slide at banking: 0.25-0.5° sufficient (L630).

### Lift
- Total pallet angle drop-to-drop 10° (modern watches; 8-9° finest)
  (L422-425, L660).
- Actual lift = 10° - 1.5° lock = 8.5° (L660-665).
- Engaging-pallet "loss" up to 2°; lifting plane needs 10.5° struck from
  AC to deliver 8.5° of work (L713-718).
- Division tooth/pallet: total width angle 10.5°, e.g. tooth 4.5° wide
  with 3° lift, pallet 6° wide; tooth 3/4 pallet width "very good"
  (L887-899).
- Lift distribution rule: smaller lifting angle on tooth than pallet;
  wider tooth -> greater tooth lifting angle (L765-776, L882-887).

### Center distance
- Example: primitive diameter 7.5mm (R=3.75) -> AB = 4.33mm, i.e.
  AB = R/cos(30°) = 1.1547R (L861-863). Planting on the tangents is the
  ideal (direction of tooth pressure through pallet center) (L838-852).
- With 3° tooth lift, heel-to-pallet-center distance 0.4691mm; clearances
  0.1mm wheel-pallet, 0.15mm stock (L863-867).

### Fork / roller
- Total fork motion: lift 8.5 + lock 1.5 + run 0.5 = 10.5°; 5.25° each
  side of line of centers (L1010-1017).
- Impulse-angle ratio 3:1 (balance:pallet) "good for an ordinary well-made
  watch" -> balance impulse angle 31.5° (L1017-1023).
- Impulse radius vs fork length: shorter impulse radius eases unlocking
  but enlarges impulse angle; 3:1 compromise (L966-1008).

## Cross-check source (drafting recipe, consistent)
abbeyclock.com "Drawing a Club-Tooth Escape Wheel",
https://www.abbeyclock.com/wxeb12.html (local: sources/abbey12.txt):
- 15 teeth / 24° rotation per tooth duplication (matches Playtner).
- Tooth locking faces "lean forwards by 24°" (matches Playtner 24°).
- Impulse-face line at 45° to the tooth radial line in the drafting
  construction; lock set by 3° rotation in the drawing (author notes ideal
  lock 1°, uses 3° for simulation visibility - we use Playtner's 1.5°).
- Club curve formed by an ellipse/circle template; tooth drawn thin enough
  for pallet clearance (cross-check only; club curve shape is aesthetic
  within clearance constraints).

## Derived construction plan (prototype units, wheel tip radius R = 10)
1. Wheel center B at origin; R_tip = 10, primitive circle = tip circle
   (club-tooth primitive radius is to the tooth locking edge per Playtner
   L726-735 note SB = primitive radius).
2. Pallet center A at distance AB = R/cos(30°) = 11.547 from B on the
   line of centers.
3. Locking rays EB, FB at +-30° from BA. Tangents from A to primitive
   circle; locking points = tangent/ray intersections (equidistant).
4. Stone slabs: locking face through locking point inclined 12° from the
   EB/FB direction (draw, toward/away from A per pallet); lifting (impulse)
   face set for 8.5° actual lift with the 10.5° striking allowance;
   slab angular width 6°.
5. Tooth: locking face at 24° from radial at the tip; lifting face for
   3° lift over 4.5° angular width; club heel per L863 clearances.
6. Lock engagement 1.5°, inside/outside drop 1.5°, run 0.5°; total pallet
   rotation 10° drop-to-drop (10.5° including run).
7. Fork/roller: fork total 10.5°, balance impulse angle 31.5° (3:1);
   roller/pin radii scaled to existing balance/fork bodies.
8. Validate generated polygons against the unchanged gates in
   test-polygon.mjs (energy accounting, timestep convergence,
   unwind/rest/restart, visual), plus the independent solver-qualification
   metrics (per-contact work-energy audit, free-segment momentum
   conservation).

Open derivation details to fix during implementation: exact impulse-face
orientation from the 10.5° striking construction (needs Fig. 8/9 geometry
reconstruction from text); entry vs exit asymmetry under the equidistant
choice; club heel radius choice within the 0.4691mm-scale clearance rule.

## Updates (2026-11-12, abbeyclock ch13/14/22 read - see ABBEY-EXTRACT.md)
- Beat budget confirmed by two independent sources: 12° wheel rotation per
  beat = drop + tooth impulse-face span + pallet span. Playtner's division
  (1.5 + 4.5 + 6) adopted; abbeyclock's (2 + 2 + 8) recorded as alternative.
- Impulse face bisects escape radius and pallet radius (45° construction),
  giving 90° between tooth force and pallet radius at mid-lift (max
  efficiency) - resolves the impulse-face orientation open item.
- Symmetric/mirrored arm placement leaves exit release ~1° early ("out of
  angle"); apply the 0.5° fork+roller rotation correction or place the exit
  arm directly from the exit drop-lock condition. Verify via the
  contact-sequence mapper: drop-lock symmetric both sides (ch22 rule).
- SCALE DECISION: keep production fork arbor at world (0,13.4) and scale the
  escapement up (proportions are scale-invariant): R_tip = 13.4*cos(30°) =
  11.6047 so that AB = R/cos30° = 13.4 exactly. Fork/pin/balance subsystem
  stays at production values; only wheel+stones are replaced.
- Fork/roller: Playtner 3:1 ratio -> balance impulse angle 31.5° for 10.5°
  fork; abbeyclock ch22 gives the roller-jewel radius formula
  X = L*sin(forkHalf)/sin(jewelHalf) and banking = drop-lock position + 2°
  slide. Use to size the roller IF the production fork/roller proves
  incompatible; first attempt keeps production fork/roller unchanged.
