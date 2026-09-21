# Latticefolk

**A 3D web sandbox for autonomous NPC towns with pluggable decision engines.**

Latticefolk is an open-source experiment in making NPCs choose what to do, who to approach, how their internal state should shift, what objects to use, and which authored dialogue to speak — while keeping movement, collision, inventory, pathfinding, legality, and numeric state changes deterministic inside the game simulation.

The project currently ships with a local fallback decision provider and an optional **Jev / TypeSafe System One** adapter. Jev is an integration, not the project architecture: additional decision engines can be added under `server/decision/providers/` without changing the world simulation.

## Current features

- Playable Three.js 3D town with first-person controls, a 72×72 expanded demo district, and multiple connected neighborhoods.
- God mode (`G`) with orbit, pan, zoom, selection, focus, path inspection, and NPC decision inspection.
- God mode is a true observer state: the player entity is absent from NPC perception and decision targets.
- Autonomous NPC needs, mood, social state, money, inventory, relationships, short-term memory, goals, work, rest, eating, wandering, pickup/drop, object use, and NPC/player social interactions.
- Bounded decision API for actions, targets, social intent, state tendencies, and action commitment.
- Large authored-dialogue library with local indexed retrieval plus complete-line or fragment selection.
- Animated low-poly characters from Quaternius Cube World Kit plus buildings/props from Ultimate Fantasy RTS (CC0).
- Graceful local fallback when no remote decision provider is configured or a remote decision fails.

## Quick start

Requirements: **Node.js 20+**.

```bash
cp .env.example .env
npm install
npm run dev
```

On Windows, `run.bat` or `run.ps1` performs the setup automatically.

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

### Optional remote provider

The default `DECISION_PROVIDER=auto` uses the local fallback engine unless a supported remote provider is configured. To enable the current Jev adapter:

```dotenv
DECISION_PROVIDER=jev
TYPESAFE_API_KEY=your_server_side_key
JEV_ENDPOINT=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
```

Never put provider credentials in browser code.

## Controls

First person: `WASD` move, `Shift` run, mouse look, `E` interact.

God mode: `G` toggle, left-drag orbit, right-drag pan, wheel zoom, `WASD` pan, `Q/E` rotate, `F` focus selected entity, `Space` recenter.

`Tab` opens the town console and dialogue import tools.

## Repository layout

```text
src/                         Three.js client, simulation runtime, shared types
server/                      HTTP API and dialogue persistence
server/decision/             provider-neutral decision layer
server/decision/providers/   concrete decision adapters (fallback, Jev, future providers)
data/                        example dialogue data; runtime dialogue DB is ignored
public/assets/                redistributable game assets and provenance notes
docs/                        architecture and extension documentation
tests/                       deterministic/provider contract tests
.github/                     CI and contribution templates
```

## Design principles

1. **Simulation is authoritative.** Decision models suggest bounded intent; game systems execute validated consequences.
2. **Providers are replaceable.** Vendor-specific schemas stay behind adapters.
3. **NPC perception is explicit.** A model only sees entities and facts the NPC is allowed to perceive.
4. **Authored dialogue scales locally.** Retrieval reduces a large corpus to a small candidate set before model selection.
5. **The town keeps running offline.** A local decision provider is always available.

See [Architecture](docs/architecture.md), [Decision providers](docs/decision-providers.md), [Dialogue library](docs/dialogue-library.md), or the [中文简介](docs/README.zh-CN.md).

## Development

```bash
npm run typecheck
npm test
npm run build
# or all three
npm run check
```

The repository intentionally excludes `node_modules`, build output, runtime-generated `data/dialogue.jsonl`, and local `.env` files from version control.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). New decision integrations should implement the provider contract rather than adding provider-specific fields to the simulation.

## License

Source code: [MIT](LICENSE).

Included Quaternius Cube World Kit and Ultimate Fantasy RTS assets are CC0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and third-party licensing details.
