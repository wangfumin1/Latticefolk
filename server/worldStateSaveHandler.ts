import type { RequestHandler } from 'express';
import type { WorldPersistence } from './worldPersistence.js';
import { WorldSnapshotValidationError } from './worldSnapshotValidation.js';

export function createWorldStateSaveHandler(worldStore:WorldPersistence):RequestHandler{
  return (req,res)=>{
    try{
      res.json(worldStore.save(req.body));
    }catch(error){
      if(error instanceof WorldSnapshotValidationError){
        res.status(400).json({error:'Invalid world persistence payload',issues:error.issues});
        return;
      }
      res.status(400).json({error:error instanceof Error?error.message:String(error)});
    }
  };
}
