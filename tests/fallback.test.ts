import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackDecision } from '../server/decision/rules.js';
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
