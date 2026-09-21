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
