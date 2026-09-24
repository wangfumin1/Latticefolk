# Authoritative wildlife domestication

Latticefolk separates immutable **species form** from mutable **individual domestication state**.

A species profile may have `form.kind === 'domesticated'`, which only means that the species is eligible for individual domestication rules and has the corresponding coarse habitat semantics. It does **not** mean that every individual is owned or tame. Ownership, taming progress, commands, and breeding permission live on each `WildlifeState` and are deterministic authoritative world state.

## State model

`WildlifeState.domestication` is optional and currently contains:

- `tameProgress`: bounded 0–100 progress.
- `ownerId`: durable owner entity identifier. The current first-person player uses the stable ID `player`.
- `command`: `none | follow | stay | graze`.
- `breedingAllowed`: explicit owner permission for reproduction.
- `claimedDay`: world day on which ownership was established.
- `lastInteractionDay`: last deterministic owner interaction.

Only species whose code-owned profile has `form.kind === 'domesticated'` can retain this mutable state. Normalization removes domestication state from wild/monster species instead of allowing a provider or malformed save to make them tameable accidentally.

The current validation species is sheep. The species form says sheep are domestication-capable; a particular sheep remains unowned until the rules below establish ownership.

## Taming and ownership

Taming is a first-person gameplay operation, never a Decision Provider action.

The initial rule is deliberately small and auditable:

1. the player must be in first-person mode and interact with a domestication-capable animal;
2. one taming feed consumes exactly one real `grain` from player inventory;
3. each successful feed adds 25 tame progress;
4. progress is clamped to 100;
5. ownership is assigned only when progress reaches 100;
6. a newly claimed animal starts with `command='none'` and `breedingAllowed=false`;
7. an animal already owned by another owner cannot be claimed by a different owner through feeding.

The resource mutation and ownership transition are deterministic simulation truth. Jev does not select the tame increment, resource cost, threshold, owner, or claim result.

## Owner commands

Only the current owner may change commands. The current player UI exposes:

- `none`: return the individual to normal bounded wildlife decisions;
- `follow`: follow the player while the player exists as a first-person world entity;
- `stay`: stop and remain at the current location;
- `graze`: self-feed using the species' existing legal feeding action/resource rules.

An active owner command is executed by deterministic simulation and the individual is excluded from the Decision Provider batch. This prevents a provider from overriding an explicit authoritative command.

`graze` does not create food. It reuses the species profile's existing `feedingAction`, resource targeting, plant/resource consumption, hunger relief, pathfinding, and energy rules.

## God View invariant

God View remains an out-of-world observer mode.

When the player switches to God View:

- player-follow paths are immediately cleared;
- a player-owned animal with `follow` rests while the player entity is absent;
- the God camera never becomes a follow target;
- camera motion cannot transfer an owned animal or generate a new chunk;
- owner commands do not put `player` into NPC/wildlife perception or provider candidates.

God View may display the persisted fact that an animal is player-owned. Observability is not perception: showing ownership in the observer UI does not create a player entity inside the simulation.

For ordinary wildlife decisions, the client projects domestication state into an owner-anonymous form before sending it to the server. Jev may receive tame progress, command, and breeding permission as read-only context, but `ownerId='player'` is stripped. Active owner-command animals do not enter the provider batch at all.

## Breeding permission and inheritance

Unowned animals retain the existing natural reproduction rules.

Once ownership is involved, reproduction is stricter:

- an owned individual may seek a mate only when its owner explicitly enables breeding;
- an owned pair may reproduce only when both animals have the same owner and both have breeding enabled;
- the same rule is checked in candidate construction, mate targeting, and the authoritative reproduction function;
- changing permission does not retroactively abort an already established pregnancy.

If both parents share the same owner and were breeding-enabled, offspring inherit that owner at birth. The child starts fully tame but with `command='none'` and `breedingAllowed=false`, so breeding does not recursively become enabled without a later owner action.

If a father dies after conception, his durable lineage domestication snapshot can still provide the factual ownership state required for offspring inheritance.

## Chunk transfer and LOD

Owned identity must not be lost when fine simulation changes chunks.

A player-owned animal with the `follow` command uses the existing identity-preserving fine wildlife transfer when the first-person player crosses into an adjacent chunk:

1. source and target must be adjacent;
2. target coarse population must have free carrying capacity;
3. the existing conservation helper moves the represented population weight from source to target;
4. only after a successful conserved transfer is the fine position committed to the target entry point;
5. transfer provenance is recorded as `reason='owner_follow'`;
6. the same `WildlifeState`, including owner/tame/command/breeding fields, is materialized in the destination.

If capacity or another conservation precondition fails, the transfer fails without changing the individual's source position/chunk state. The old chunk then folds normally.

When an owned animal is unloaded without an immediate follow transfer, its fine state remains in the persistent fine-chunk cache. Commands sleep while the individual is not materialized; distant population/ecology remains coarse-authoritative.

## Persistence

Mutable domestication state reuses existing identity-preserving persistence paths.

Living fine individuals:
- stored in `fine_chunks.wildlife_json` as part of `WildlifeState`.

In-transit individuals:
- stored in `wildlife_transfers.transfer_json`, preserving domestication fields and represented population.

Durable lineage:
- `wildlife_lineage.domestication_at_birth_json`
- `wildlife_lineage.domestication_at_death_json`

Both lineage columns are nullable and added with backward-compatible SQLite migrations. A birth snapshot is present when domestication was inherited at birth; a later player claim is not rewritten backward into birth history. The death snapshot records the terminal factual state, including owner, command, breeding permission, claim day, and last interaction day when present.

These records are descriptive facts. Current evolution statistics do not interpret domestication as a causal selection variable.

## Decision-provider boundary

Decision Providers cannot:

- assign or transfer ownership;
- increment tame progress;
- consume taming food;
- issue or clear owner commands;
- toggle breeding permission;
- force inherited ownership;
- bypass carrying capacity during owner-follow transfer;
- mutate domestication fields directly.

With `command='none'`, an owned animal may return to the ordinary bounded wildlife decision pipeline, but the provider still receives only legal actions and owner-anonymous domestication context. All returned actions/targets remain validated against deterministic candidates.

## Current scope

Implemented now:

- individual tame progress and claim threshold;
- player ownership;
- first-person taming with real grain consumption;
- `none/follow/stay/graze` commands;
- explicit breeding permission;
- same-owner breeding rule and ownership inheritance;
- first-person adjacent-chunk owner-follow transfers with conservation/provenance;
- fine-state, transfer, and lineage persistence;
- God View inspection;
- owner-anonymous Jev context;
- multilingual interaction labels.

Not yet implemented:

- ownership transfer/release UI;
- NPC/faction ownership workflows;
- pens, leashes, herding groups, stable assignments, or livestock jobs;
- animal products such as wool/milk and production scheduling;
- domestication-specific economic accounting;
- physical leash/contact constraints;
- a generalized command queue;
- causal evolution statistics for domestication pressure.

Those should be added as explicit deterministic state/systems rather than inferred from `form.kind` or delegated to a Decision Provider.
