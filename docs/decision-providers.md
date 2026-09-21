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
- relative budget weights for NPC, dialogue, and distant-chunk calls

The current public TypeSafe pricing is based on input tokens. Latticefolk uses the response's `usage.input_tokens` when present; when it is absent, it records a conservative local estimate so the guard remains useful.

Call optimization currently includes:

1. deterministic short-circuiting for emergency hunger/exhaustion, where paying for a fuzzy decision adds little value;
2. conditional questions — social-intent/target questions are omitted when no social action is legal;
3. trimmed memories, recent events, object/NPC fields, and dialogue candidate sets;
4. a short-lived response cache for identical decision payloads;
5. confidence gating: low-confidence NPC/dialogue decisions fall back safely, while low-confidence distant-chunk policies hold their current policy;
6. batched chunk decisions, so multiple distant regions share one System One query.

Runtime budget edits are available at `GET/PUT /api/decision/budget`. In production, writes are disabled unless `ALLOW_RUNTIME_ADMIN=true`.

This follows the provider-neutral project rule: the simulation remains authoritative and token/cost policy stays in the Jev adapter rather than leaking into world-state types.
