# Contributing to Latticefolk

Contributions are welcome. Keep changes focused, reproducible, and provider-neutral unless the change is explicitly an adapter for one decision service.

## Development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Before opening a pull request, run `npm run check`.

A remote decision provider is optional. `DECISION_PROVIDER=fallback` provides a local development path with no API credentials.

## Architectural rules

- The simulation owns movement, pathfinding, collision, inventory, state mutation, and action legality.
- Decision providers choose only from bounded, game-supplied choices.
- Provider-specific request/response details stay under `server/decision/providers/`.
- Never expose API keys to browser code or commit `.env` files.
- Dialogue text must remain authored/imported content unless a future feature explicitly introduces generated dialogue behind a separate interface.
- God mode is an out-of-world observer. The player must not appear in NPC perception while god mode is active.

## Pull requests

Describe the player-visible change, architectural impact, tests performed, and any new third-party license obligations. Add or update documentation for new public extension points.
