# Foreground simulation clock and input

TownGame integrates monotonic foreground time in steps of at most 50 ms, with
at most 2 seconds of simulation per animation callback. Longer foreground gaps
retain chronological time and input debt. Pending time is exposed in the existing
read-only world diagnostics. Sustained rendering slower than this work budget
can increase pending time and input latency.

First-person key edges and pointer-look events retain their timestamps and
headings. Movement keeps the existing 4.5 m/s walking and 7.2 m/s sprint speeds,
collision authority, terrain checks, NPC head clearance and movable-prop solver.
Streaming is checked after each player substep. The input-seconds counter records
actual attempted physical steps, including collision-blocked attempts.

## Boundaries

- Hidden documents and window focus loss clear pending time and input. Resume
  starts a new timeline and requires a fresh movement press.
- Menus, admin-panel changes, editable focus, pointer-lock changes and camera-mode
  changes cancel unconsumed player input. The visible, focused world keeps running.
- A key held through persistence loading starts contributing time only after
  readiness. A press released during loading contributes no movement.
- At most 256 input transitions are pending. Identical states are omitted and
  same-time transitions coalesce. The final slot holds a release boundary.
  Overflow retains accepted input and world-time debt, rejects excess new input,
  releases held controls and increments a cumulative diagnostic counter. A fresh
  press is needed after capacity becomes available.
- A callback performs at most 40 regular time steps plus 256 input-boundary steps.
  God-camera input retains its separate observer timeline. Existing wall-clock
  decision, network, autosave and respawn deadlines are unchanged.

## Verification

Local validation on 2026-10-10 passed 1,251 deterministic tests, TypeScript checks,
production build, strict E2E typechecking and discovery of all 30 browser cases.
The 39 new controlled tests cover actual TownGame construction, DOM input,
PointerLockControls, animate and collision; 1 FPS versus 20 FPS; an 800 ms
between-frame press; 5-second foreground gaps and debt draining; interruption and
queue-overflow recovery. Rendering and pre-boot world consumers are test doubles.

The native-input browser case records real key receipt, physical response,
natural RAF intervals, clock debt and a scene screenshot. Its execution and the
full exact-head Chromium/WebGL suite remain unverified locally: Chromium startup
is blocked by socket permissions. Real-browser response, frame cost and artifact
review remain outstanding acceptance requirements.
