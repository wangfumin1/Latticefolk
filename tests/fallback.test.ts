import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackDecision, fallbackChunkDecisions } from '../server/decision/rules.js';
import type { DecisionRequest, NpcState } from '../src/types.js';

function npc(overrides: Partial<NpcState> = {}): NpcState {
  return {
    id: 'npc-1', name: 'Ari', role: 'resident', position: { x: 0, z: 0 }, home: { x: 0, z: 0 },
    mood: 'neutral', hunger: 20, energy: 80, social: 80, money: 5, inventory: [], relationships: {}, memories: [],
    currentAction: 'idle', goal: 'live normally', lastDecisionAt: 0, ...overrides,
  };
}

function request(overrides: Partial<NpcState> = {}): DecisionRequest {
  return {
    npc: npc(overrides),
    allowedActions: ['idle', 'wander', 'eat', 'rest', 'talk'],
    world: { gameTime: '12:00', minuteOfDay: 720, weather: 'clear', nearbyNpcs: [], nearbyObjects: [], recentEvents: [] },
  };
}

test('hungry NPC chooses eat when legal', () => {
  const result = fallbackDecision(request({ hunger: 90 }));
  assert.equal(result.action, 'eat');
});

test('exhausted NPC chooses rest when legal', () => {
  const result = fallbackDecision(request({ hunger: 10, energy: 10 }));
  assert.equal(result.action, 'rest');
});

test('fallback never returns an illegal action', () => {
  const req = request({ hunger: 99, energy: 1 });
  req.allowedActions = ['wander'];
  const result = fallbackDecision(req);
  assert.ok(req.allowedActions.includes(result.action));
});


test('coarse chunk fallback reacts to scarcity without inventing numeric mutations', () => {
  const result = fallbackChunkDecisions({
    day: 3,
    gameTime: '14:20',
    weather: 'clear',
    chunks: [{
      id:'chunk_2_0', cx:2, cz:0, biome:'plains', settlementLevel:1, population:18,
      food:12, wood:55, water:20, ecology:46, danger:25, prosperity:38,
      strategy:'sustain', migrationPolicy:'retain', ecologyPolicy:'balance',
      lastDecisionAt:0, decisionVersion:0
    }]
  });
  assert.equal(result.decisions[0]?.strategy, 'conserve');
  assert.equal(result.decisions[0]?.migrationPolicy, 'release');
  assert.equal(result.decisions[0]?.ecologyPolicy, 'recover');
});
