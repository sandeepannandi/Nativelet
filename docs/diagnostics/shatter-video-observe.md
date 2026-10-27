# Direct short-video behavior proposal (not executed)

Purpose: observe first fracture, a meaningfully changed/cleared state, Reset restoration and second fracture. No CPU profiling/performance ranking. Previous behavior and quality gates remain FAILED; Prism remains unresolved.

Retained diagnostic APK artifacts from run40543979710 are candidates: baseline12753211555 andphysics-mesh12752503055, both built successfully from4332fcc. No rebuild should be needed for behavior recording: flags are already embedded, same UI layout exists in retained screenshots, no external service is needed at runtime. Bytes have NOT been re-downloaded/hashed for this proposal. Before using, download existing artifacts via authorized route, verify artifact/commit/ABI and record APKSHA256 plus installed bytes. This is a prerequisite, not a newbuild or claim of current local APKavailability.

Why the previous check is unresolved: fixed0.5s snapshots were pixel-identical for baselinebothcycles andBfirst, while terminalmarkers followedcreateWorldby~4.2–7.8seconds, and Bsecond had visible shards. A single unchanged frame cannot distinguish pre-first-presentation delay, queuedUI/input, missedvisualinterval or renderingfailure. Do NOT assume animation completed too fast or count terminalmarkers as visiblefractureproof. EarlierBcapturealso lostlatepackets. Video can resolve visual sequence independently of that profile but must actually be inspected.

Smallest useful step after review: record ONE continuous50second screenrecord at device resolution using one retained APK, preferably B because its finalmesh/quiescentResetordering is the specific pending behavior. Keep existing settings/shards/solver/CanvasKeepAlive. Sequence: intact2s -> tap ->15s -> Reset ->2s -> secondtap ->15s -> remainingtime. No warmupfracture/no retry. If full baseline/B comparison remains required, approve one50srecording per artifact explicitly, rather than silently doubling work. Attached local script does not install, launch, build, download or touchcredentials. The operator must start a fresh intact screen once and verify package/layout before invoking it.

Review the WHOLE decoded video, not an automatically sampled montage alone. Extract frames near each firstvisiblechange, peakfracture, clearedstate, Resettransition and secondfracture; retain timestamps and originalvideo. Decode check must flag lost/corruptframes or recordingstart failure. Screenrecordhas overhead and may omit/displayframes differently; never infer smoothness/FPS/CPU/GPUcost from it. Hostuptimebrackets annotateinputorder only, not precise frame synchronization.

Per-cycle outcomes:
- PASSvisiblefracture only with actual shards/edges/motion visible in multiple sequentialvideo frames after eachtap; mereintact->clearjumponly is not enough.
- PASSReset only when pre-reset state was visibly different and video shows transition back to intactrim/sheens, followed by a second visiblefracture. Staticinitial/resettemplatematch alone insufficient.
- Record first/secondterminalclear separately, any freeze/blank/crash separately. If recording fails or evidence ambiguous, fail/unknown and stop, no automaticretry.
- Retain old gatesFAILED and avoid a performanceclaim. A passedbehaviorvideo does not pass stackquality or resolve activesmoothness/Prism.

Cost: zero native compile time, one retainedAPKdownload/install and emulator startup, then50seconds device capture plus whole-video/manualframe review. Actualhoststartup/download time unknown; likely cheaper than rebuilding bothAPKs, no numerical speed promise. Need an authorized artifact-download/execution route; no token/request/remote action created for this proposal.
