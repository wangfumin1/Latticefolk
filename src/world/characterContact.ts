/** Source-calibrated player/NPC personal space, separate from body/tool/static collision. */
export const PLAYER_BODY_RADIUS=.30;
export const NPC_BODY_RADIUS=.32;

// The four unchanged 1.82 m Cube World rigs have unusually wide heads/hair. These
// envelopes cover their current 1.3–1.9 m geometry across supported grounded clips.
// Source-loader tests guard this policy against model/normalization drift.
const PLAYER_CONTACT_RADIUS:Readonly<Record<string,number>>={female1:1.05,female2:1.45,male1:.9,male2:1.10};
export function npcPlayerContactRadius(asset:string) {
  return PLAYER_CONTACT_RADIUS[asset]??1.45;
}
export function npcPlayerSeparation(asset:string) {
  return PLAYER_BODY_RADIUS+npcPlayerContactRadius(asset);
}

/** Other-body radius for a motion query. Identical separation whichever participant moves. */
export function characterContactRadius(
  subject:'player'|'npc',subjectAsset:string|undefined,mover:'player'|'npc'|undefined,moverAsset?:string
) {
  if(subject==='npc')return mover==='player'?npcPlayerContactRadius(subjectAsset??''):NPC_BODY_RADIUS;
  return mover==='npc'?npcPlayerSeparation(moverAsset??'')-NPC_BODY_RADIUS:PLAYER_BODY_RADIUS;
}

/** Conversation is reached before the wide source head's collision envelope. */
export const PLAYER_CONVERSATION_REACH=2.2;
export function reachedPlayerConversation(playerExists:boolean,action:string|undefined,targetId:string|undefined,distance:number) {
  return playerExists&&targetId==='player'&&(action==='talk'||action==='visit')&&
    Number.isFinite(distance)&&distance>=0&&distance<=PLAYER_CONVERSATION_REACH;
}
