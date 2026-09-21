import type { DialogueRequest } from '../../src/types.js';
import type { DialogueStore } from '../dialogueStore.js';

export function retrieveDialogueCandidates(dialogue: DialogueStore, req: DialogueRequest) {
  const tags = [req.intent, String(req.speaker.mood), req.world.weather, ...req.world.nearbyTags];
  const lines = dialogue.retrieve({
    kind: 'line', tags, intent: req.intent, mood: String(req.speaker.mood), role: req.speaker.role,
    limit: 40, excludeText: req.recentLines,
  });
  const fragments = {
    opener: dialogue.retrieve({ kind: 'fragment', slot: 'opener', tags, intent: req.intent, mood: String(req.speaker.mood), role: req.speaker.role, limit: 20 }),
    body: dialogue.retrieve({ kind: 'fragment', slot: 'body', tags, intent: req.intent, mood: String(req.speaker.mood), role: req.speaker.role, limit: 40 }),
    closer: dialogue.retrieve({ kind: 'fragment', slot: 'closer', tags, intent: req.intent, mood: String(req.speaker.mood), role: req.speaker.role, limit: 20 }),
  };
  return { lines, fragments };
}
