// Candidate hunk only. Apply against b16af25579a2f9810ba8974c76afe3293c34b247 after exact context verification.

// 1. Add optional fields near TownGame runtime state:
// frameDiagnosticsEnabled=false;
// frameDiagnosticsCapacity=120;
// frameDiagnostics=[];

// 2. In animate preserve:
// requestAnimationFrame -> raw delta -> clamped dt -> updatePlayer -> world update -> updateUi -> render
// and only when frameDiagnosticsEnabled call performance.now() and append bounded samples.

// 3. Do not add diagnostics work to the default path.
// Do not modify playerInputSeconds, playerPosition, physics.moveKinematic, or acceptance predicates.
