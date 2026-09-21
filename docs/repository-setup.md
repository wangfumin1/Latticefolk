# Repository maintenance

Latticefolk is developed on the `main` branch through reviewed changes.

Recommended GitHub settings:

- Issues: enabled
- Actions: enabled
- Discussions: optional for architecture and decision-provider proposals
- Private vulnerability reporting: enabled when available
- Squash merge: enabled
- Automatically delete merged head branches: enabled
- Branch ruleset: once CI is green, require the `CI / build-test` check before merging into `main`

Repository description:

> A 3D web sandbox for autonomous NPC towns with pluggable decision engines.

Recommended topics: `autonomous-agents`, `npc`, `simulation`, `threejs`, `webgl`, `game-ai`, `decision-model`, `agent-simulation`.

Never commit real provider credentials, `.env`, or runtime `data/dialogue.jsonl`.
