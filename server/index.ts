import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DialogueStore } from './dialogueStore.js';
import { createDecisionProvider } from './decision/createProvider.js';
import type { DecisionRequest, DialogueRequest, ImportDialogueRequest } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dialogue = new DialogueStore(path.join(root, 'data', 'dialogue.jsonl'));
const selection = createDecisionProvider(dialogue);
const decision = selection.active;
const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '64mb' }));

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  project: 'latticefolk',
  decision: {
    requested: selection.requested,
    active: decision.id,
    status: decision.status(),
  },
  dialogue: dialogue.stats(),
}));

app.get('/api/dialogue/stats', (_req, res) => res.json(dialogue.stats()));

app.post('/api/dialogue/import', (req, res) => {
  try {
    const body = req.body as ImportDialogueRequest;
    if (!body || !['plain', 'jsonl', 'json'].includes(body.format) || typeof body.text !== 'string') {
      res.status(400).json({ error: 'Invalid import payload' });
      return;
    }
    res.json(dialogue.import(body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/decision', async (req, res) => {
  const body = req.body as DecisionRequest;
  if (!body?.npc || !body?.world || !Array.isArray(body.allowedActions)) {
    res.status(400).json({ error: 'Invalid decision payload' });
    return;
  }
  res.json(await decision.decide(body));
});

app.post('/api/dialogue', async (req, res) => {
  const body = req.body as DialogueRequest;
  if (!body?.speaker || !body?.listener || !body?.intent) {
    res.status(400).json({ error: 'Invalid dialogue payload' });
    return;
  }
  res.json(await decision.dialogueDecision(body));
});

const dist = path.join(root, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*splat', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  const status = decision.status();
  console.log(`[latticefolk] server on http://localhost:${port}`);
  console.log(`[latticefolk] decision provider: ${decision.id}${status.configured ? '' : ' (not configured; provider will fall back safely)'}`);
});
