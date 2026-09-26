# Coarse population accounting

This note records the narrow accounting repairs tracked in [#49](https://github.com/wangfumin1/Latticefolk/issues/49) and [#50](https://github.com/wangfumin1/Latticefolk/issues/50), within the [maintenance queue](maintenance-issues.md). It does not claim a complete human demographic lifecycle or a durable migration event journal.

## Migration policy is not a population source

`CoarseWorldRuntime.update()` still advances resource/ecology simulation and the existing neighbor-flow cadence. `attract`, `retain`, `release` and `evacuate` only affect migration pressure and attraction in the deterministic flow planner. They no longer directly increment/decrement population inside `simulate()`, and attraction no longer clamps a pre-existing population down to 120. With no eligible source/destination, migration cannot create or remove residents.

The runtime passes planned flows through regional/world policy modifiers and the shared `applyConservedFlows()` executor. Each accepted migration uses one source-limited actual amount for both endpoints and an applied receipt with source, destination, amount, kind, simulation time and reason. Fractional aggregate population is not independently rounded away. Materialized chunks remain excluded from coarse migration to avoid double-accounting across simulation scales. Seeded discovery establishes initial population; future births/deaths must have explicit deterministic demographic rules and evidence rather than disguising source-less migration as growth.

## Verification and remaining work

`tests/coarse-population-conservation.test.ts` exercises the real runtime update/flow path for all four policies; isolated zero/fractional/above-120 populations in viable and scarce habitats; repeated ticks; paired migration balance/receipt equality; and materialized-neighbor exclusion. Only external policy IO is held in these deterministic tests; the tick, ecology and flow implementation are not replaced. `tests/flow-conservation.test.ts` separately checks finite/bounds/precision and receipt behavior for all existing transfer resources.

Coarse flow receipts still have only a bounded in-memory recent view; durable provenance is #54. Save validation and stale-writer protection are #52/#51. Wildlife lifecycle and named fine transit already exist and are distinct from this human-population fix. Full browser streaming/follow/production/server-restart coverage remains #57; a passing home-town smoke is not evidence those paths were exercised.
