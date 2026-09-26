import type { Express } from 'express';
import { WorldPersistence } from './worldPersistence.js';
import { validateWorldPersistenceSnapshot, WorldSnapshotValidationError } from './worldSnapshotValidation.js';

export function registerWorldStateRoutes(app:Express,worldStore:WorldPersistence) {
  app.get('/api/world/state', (_req, res) => {
    res.json({ snapshot:worldStore.load(), stats:worldStore.stats() });
  });

  app.post('/api/world/state', (req, res) => {
    try {
      const snapshot=validateWorldPersistenceSnapshot(req.body);
      res.json(worldStore.save(snapshot));
    } catch(error) {
      if(error instanceof WorldSnapshotValidationError){
        res.status(400).json({error:'Invalid world persistence payload',details:error.issues});
        return;
      }
      res.status(400).json({error:error instanceof Error?error.message:String(error)});
    }
  });

  app.delete('/api/world/state', (_req, res) => {
    const runtimeAdminAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_RUNTIME_ADMIN === 'true';
    if(!runtimeAdminAllowed){
      res.status(403).json({error:'World reset is disabled in production. Set ALLOW_RUNTIME_ADMIN=true to enable.'});
      return;
    }
    res.json(worldStore.clear());
  });
}
