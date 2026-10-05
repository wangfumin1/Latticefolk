# Decision providers

Decision engines are adapters behind `DecisionProvider` in `server/decision/types.ts`.

A provider implements:

- `status()`
- `decide(request)`
- `dialogueDecision(request)`

Provider implementations belong under `server/decision/providers/`. They should not leak vendor request types into `src/` or the simulation runtime.

## Selection

Set `DECISION_PROVIDER` in `.env`:

- `auto` — use Jev when credentials exist; otherwise use the local fallback provider.
- `fallback` — always use local deterministic logic.
- `jev` — select the Jev adapter. If its request fails, the current adapter safely falls back per decision.

## Adding another provider

1. Implement `DecisionProvider`.
2. Convert the generic `DecisionRequest` into the provider's schema.
3. Validate every returned action/target against the request's legal candidates.
4. Keep credentials server-side.
5. Add the provider to `createDecisionProvider()`.
6. Document provider-specific environment variables here.

## Jev adapter

The current Jev adapter uses the TypeSafe System One endpoint with structured state and typed questions. It is intentionally optional; Latticefolk's core has no Jev-specific type dependency.


## Jev budget and call optimization

Jev is treated as a paid, bounded decision service rather than an unlimited per-frame brain. The adapter has a runtime `JevBudgetController` and the God-mode console exposes the same controls.

Budget controls:

- maximum calls per minute
- maximum input tokens per minute, hour, and day
- maximum estimated USD spend per day
- minimum confidence before a result is accepted
- response cache TTL
- per-class budget weights for NPC, dialogue, chunk, region, world, and wildlife calls

The current public TypeSafe pricing is based on input tokens. Latticefolk uses the response's `usage.input_tokens` when present; when it is absent, it records a conservative local estimate so the guard remains useful.

All six Jev call classes share one synchronous admission/reservation boundary. A valid cache hit returns before admission. On a cache miss, the controller immediately counts one attempted call and reserves the greater of the raw token estimate and the rounded-up class-weighted estimate against the minute/hour/day token and daily estimated-USD limits. In-flight reservations remain counted across window rollover until the request settles.

Settlement replaces the reservation with finite, nonnegative reported input tokens (including zero). Missing or invalid usage, network/timeout failures, HTTP errors, and unreadable JSON retain one call and the unweighted local token estimate because the request may have reached the provider. Settlement occurs once, releases the in-flight state, and starts the completed-usage rolling window at settlement time. Local serialization or signal preparation failures before admission consume no allowance. Snapshots include reserved usage while requests are in flight; completed usage remains unweighted. Class weights at or below one cannot discount estimated input cost; weights above one add conservative admission headroom. Configuration values are unchanged. Reported usage above the raw estimate is recorded in full and governs subsequent admission.

Call optimization currently includes:

1. deterministic short-circuiting for emergency hunger/exhaustion, where paying for a fuzzy decision adds little value;
2. conditional questions — social-intent/target questions are omitted when no social action is legal;
3. trimmed memories, recent events, object/NPC fields, and dialogue candidate sets;
4. a short-lived response cache for identical decision payloads;
5. confidence gating: low-confidence NPC/dialogue decisions fall back safely, while low-confidence distant-chunk policies hold their current policy;
6. batched chunk decisions, so multiple distant regions share one System One query.

Runtime budget edits are available at `GET/PUT /api/decision/budget`. In production, writes are disabled unless `ALLOW_RUNTIME_ADMIN=true`.

## Wildlife domestication boundary

Individual domestication is authoritative simulation state, not a Decision Provider output. Tame progress, resource cost, ownership, owner commands, breeding permission, ownership inheritance and owner-follow transfer conservation are resolved locally by deterministic rules.

Wildlife requests may expose the bounded domestication fields `tameProgress`, `command` and `breedingAllowed` as read-only context. Owner identity is deliberately withheld: before a wildlife request leaves the client, `ownerId` is removed from the decision copy, so a player-owned sheep does not put the `player` entity into Jev perception. Active owner-command animals are excluded from wildlife provider batches entirely; commands are executed by the simulation. An owned animal with command `none` can use the ordinary provider/fallback path, but the provider still cannot mutate any domestication field.

This is also part of the God View invariant. Switching to God View suspends player-follow paths because the player entity no longer exists in the simulated world. The observer UI may display persisted ownership facts, but neither the God camera nor observer presence becomes a candidate target.

This follows the provider-neutral project rule: the simulation remains authoritative and token/cost policy stays in the Jev adapter rather than leaking into world-state types.
