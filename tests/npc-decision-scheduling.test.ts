import test from 'node:test';
import assert from 'node:assert/strict';
import { dueNpcDecisions, type NpcDecisionDue } from '../src/world/npcDecisionScheduling.js';

const actor = (id: string, nextDecisionAt: number, extra: Partial<NpcDecisionDue> = {}): NpcDecisionDue => ({
  state: { id }, nextDecisionAt, pendingDecision: false, ...extra
});

test('new fine residents receive their first decision before repeatedly-idle home actors', () => {
  const home = Array.from({ length: 10 }, (_, i) => actor(`home_${i}`, 0));
  const fine = Array.from({ length: 6 }, (_, i) => actor(`fine_${i}`, 800));
  const actors = [...home, ...fine];
  const served = new Set<string>();
  for (let frame = 0; frame < 6; frame++) {
    const now = 10_000 + frame * 3_000;
    const chosen = dueNpcDecisions(actors, now, 3);
    assert.ok(chosen.length <= 3);
    for (const entry of chosen) {
      served.add(entry.state.id);
      // Same minimum idle backoff as the live adapter. Fine actors are not moved,
      // forcibly requested, given extra slots or given a test-only priority.
      entry.nextDecisionAt = now + 2_500;
    }
  }
  assert.equal(served.size, 16);
  assert.ok(fine.every(entry => served.has(entry.state.id)));
});

test('selection respects free slots, due times, in-flight tasks and removal without mutation', () => {
  const actors = [actor('late', 200), actor('due', 100), actor('busy', 0, { pendingDecision: true }),
    actor('working', 0, { task: {} }), actor('removed', 0, { removed: true }), actor('invalid', NaN)];
  const before = structuredClone(actors);
  assert.deepEqual(dueNpcDecisions(actors, 150, 1).map(x => x.state.id), ['due']);
  assert.deepEqual(dueNpcDecisions(actors, 150, 0), []);
  assert.deepEqual(dueNpcDecisions(actors, 150, -1), []);
  assert.deepEqual(dueNpcDecisions(actors, NaN, 3), []);
  assert.deepEqual(dueNpcDecisions(actors, 150, Infinity), []);
  assert.deepEqual(actors, before);
});

test('equal due times have stable ID ordering and never exceed the available slot count', () => {
  const a = actor('a', 100), b = actor('b', 100), c = actor('c', 50);
  assert.deepEqual(dueNpcDecisions([b, a, c], 100, 2), [c, a]);
  assert.deepEqual(dueNpcDecisions([a, c, b], 100, 2.9), [c, a]);
});
