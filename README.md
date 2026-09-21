<p align="center">
  <img src="docs/assets/cover.svg" alt="Latticefolk — a living autonomous NPC world" width="100%" />
</p>

<h1 align="center">Latticefolk</h1>

<p align="center">
  <strong>A 3D web sandbox for autonomous NPC towns and evolving simulated worlds.</strong><br/>
  Pluggable decision engines choose bounded intent; deterministic simulation owns world state.
</p>

<p align="center">
  <a href="https://github.com/wangfumin1/Latticefolk/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/wangfumin1/Latticefolk/ci.yml?branch=main&label=CI&logo=github"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2ea44f"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-r180-black?logo=threedotjs">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white">
  <img alt="Decision providers" src="https://img.shields.io/badge/decision%20engines-pluggable-6f42c1">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/README.zh-CN.md">简体中文</a> ·
  <a href="docs/README.ja.md">日本語</a> ·
  <a href="docs/README.es.md">Español</a>
</p>

> [!NOTE]
> Latticefolk is under active development. The current build is already playable, but the long-term target is much larger: streamed procedural worlds, coarse↔fine simulation, persistent societies, ecosystems, life cycles, evolution, and richer physics.

## Why Latticefolk?

Most AI NPC demos stop at conversation. Latticefolk treats decisions as part of a **world simulation**: NPCs work, harvest, craft, trade, deliver, visit, patrol, rest, sleep, explore, manipulate resources, build relationships, and choose authored dialogue. Distant regions are simulated as coarse chunks and can also receive model-assisted policy decisions.

The project is deliberately **not tied to Jev**. Jev / TypeSafe System One is the first remote decision adapter, while the simulation talks only to the provider-neutral `DecisionProvider` contract.

## Current highlights

- **Playable Three.js town** with first-person controls and an out-of-world God View.
- **20 bounded NPC actions** including work, harvest, craft, trade, gift, delivery, water collection, patrol, visits, sleep, and exploration.
- **Unified interactive world objects**: buildings, wells, market stalls, workstations, storage, carts, trees, rocks, flowers, tools, beds, and more expose explicit capabilities instead of being decorative-only.
- **Authoritative deterministic simulation** for movement, pathfinding, inventory, money, relationships, needs, and legal state transitions.
- **Pluggable decision engines** with a deterministic fallback and optional Jev adapter.
- **Jev-aware distant chunks**: far regions keep population/resource/ecology/prosperity state and receive batched strategy, migration, and ecology decisions.
- **First coarse↔fine streaming pass**: entering a distant chunk in first person materializes representative residents, settlement sites, and resources; leaving folds fine consequences back into coarse state.
- **Token and cost controls** visible in the God-mode console: minute/hour/day input-token budgets, daily USD guard, confidence threshold, cache TTL, call-class statistics, and presets.
- **Authored dialogue retrieval** with line/fragment composition instead of unconstrained text generation.
- **Multilingual dialogue corpus and UI**: Simplified Chinese, English, Japanese, and Spanish.
- **CC0 low-poly assets** from Quaternius, with provenance tracked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Quick start

Requirements: **Node.js 20+**.

```bash
git clone https://github.com/wangfumin1/Latticefolk.git
cd Latticefolk
cp .env.example .env
npm install
npm run dev
```

Windows users can run `run.bat` or `run.ps1`.

Open the Vite URL printed by the terminal, usually `http://localhost:5173`.

### Optional Jev provider

The default `DECISION_PROVIDER=auto` keeps the game usable without any remote key.

```dotenv
DECISION_PROVIDER=jev
TYPESAFE_API_KEY=your_server_side_key
JEV_ENDPOINT=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
```

Provider credentials stay on the server. Never expose them to browser code.

See [Decision providers](docs/decision-providers.md) for token budgets, confidence gating, caching, batching, and runtime administration.

## Controls

| Mode | Controls |
| --- | --- |
| First person | `WASD` move · `Shift` run · mouse look · `E` interact |
| God View | `G` toggle · left-drag orbit · right-drag pan · wheel zoom · `WASD` pan · `Q/E` rotate · `F` focus · `Space` recenter |
| Console | `Tab` |

**God View is observer-only.** Entering it removes the player entity from NPC perception and decision targets; moving the observer camera does not affect the simulation.

## Decision architecture

```text
                         ┌─────────────────────────────┐
                         │        World State          │
                         └──────────────┬──────────────┘
                                        │ bounded perception
                         ┌──────────────▼──────────────┐
                         │      DecisionProvider       │
                         │ fallback · Jev · future...  │
                         └──────────────┬──────────────┘
                                        │ typed intent
          ┌─────────────────────────────▼────────────────────────────┐
          │               Deterministic Simulation                  │
          │ legality · pathfinding · inventory · economy · physics  │
          └───────────┬───────────────────────────┬──────────────────┘
                      │                           │
            ┌─────────▼─────────┐       ┌────────▼─────────┐
            │ Fine local world │       │ Coarse far world │
            │ NPCs / objects   │       │ chunks / policy  │
            └───────────────────┘       └──────────────────┘
```

A model never directly mutates arbitrary numbers or invents world facts. It chooses among bounded legal options; game systems execute and validate consequences.

## Jev call optimization

The current adapter is designed around **useful decisions per input token**, not maximum request frequency.

- deterministic emergency short-circuits for obvious hunger/exhaustion cases;
- unnecessary questions omitted when no matching action is legal;
- trimmed memories, events, visible object fields, and dialogue candidates;
- short-lived response cache for identical decision payloads;
- confidence gating with safe fallback / policy hold;
- distant chunks batched into one System One query;
- independent budgets for calls, minute/hour/day input tokens, and daily estimated spend.

The God-mode console exposes **Economy / Balanced / Quality** presets plus manual controls. Production runtime budget edits are opt-in through `ALLOW_RUNTIME_ADMIN=true`.

## Dialogue and languages

Latticefolk uses a retrieval-first authored corpus:

```text
large corpus
   ↓ local tags / role / mood / intent / locale retrieval
small candidate set
   ↓ bounded decision
complete line OR opener + body + closer
   ↓
exact authored text
```

The repository currently includes a versioned multilingual seed corpus for **zh-CN, English, Japanese, and Spanish**, while user imports are preserved separately in the runtime dialogue file.

See [Dialogue library](docs/dialogue-library.md) and [Internationalization](docs/i18n.md).

## Repository map

```text
src/
  main.ts                  Three.js game runtime
  i18n.ts                  UI localization
  world/                   world simulation layers
server/
  decision/
    providers/             fallback / Jev adapters
    budget.ts              token & cost budget controller
  dialogueStore.ts         indexed authored-dialogue store
data/
  dialogue-seed.multilingual.jsonl
public/assets/             redistributable game assets
docs/                      architecture, roadmap and language docs
tests/                     deterministic/provider budget tests
.github/                   CI and contribution templates
```

## Roadmap

The current development order is intentionally architecture-first:

1. ✅ first-pass coarse ↔ fine chunk materialization;
2. **world persistence / SQLite**;
3. conserved migration, resource, trade, and ecology flows across chunks;
4. Region / World level decision layers;
5. dynamic chunk streaming and real travel;
6. procedural settlements, buildings, environments, and content;
7. richer production chains and interactions;
8. plants, animals, and ecological systems;
9. complete life cycles, reproduction, inheritance, and evolution;
10. a fuller physics layer.

See the living [Roadmap](docs/roadmap.md) and [Long-term vision](docs/long-term-vision.md). Documentation is updated as each implementation stage lands.

## Development

```bash
npm run typecheck
npm test
npm run build
# all checks
npm run check
```

Pull requests should preserve the authority boundary between **decision intent** and **simulation mutation**. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [Architecture](docs/architecture.md) first.

## Credits

Latticefolk builds on excellent open-source work and freely redistributable art:

- **Three.js** — browser 3D rendering and scene infrastructure.
- **Quaternius** — CC0 Cube World, Ultimate Fantasy RTS, and Medieval Village assets used by the current demo. See [third-party notices](THIRD_PARTY_NOTICES.md).
- **TypeSafe / Jev System One** — optional typed probabilistic decision-provider integration and inspiration for bounded decision workflows.
- All contributors, testers, issue reporters, and future world-builders.

Third-party names and trademarks belong to their respective owners. Inclusion here does not imply endorsement.

## Citation

If Latticefolk is useful in research, demos, teaching, or derivative simulation work, you can cite the repository using [CITATION.cff](CITATION.cff). GitHub will expose the **Cite this repository** action automatically.

## License

Source code is licensed under [MIT](LICENSE). Bundled third-party assets retain their original licenses; currently redistributed Quaternius assets used by the demo are CC0 and documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
