import type { WorldObjectState } from '../types';

/** Restore mutable building state, but derive its frontage from the current layout.
 * Building position is an interaction point, not a movable body anchor. An old
 * frontage must not separate the semantic target from the current model/trigger.
 */
export function restoreBuildingForLayout(current:WorldObjectState,saved:WorldObjectState):WorldObjectState {
  if(current.kind!=='building'||saved.kind!=='building'||current.id!==saved.id){
    throw new Error(`Mismatched building restore: ${current.id} / ${saved.id}`);
  }
  return {
    ...structuredClone(current),...structuredClone(saved),
    chunkId:current.chunkId,position:{...current.position}
  };
}
