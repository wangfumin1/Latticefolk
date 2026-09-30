import type { InventoryItem, ItemKind, Vec2, WorldObjectState } from '../types.js';

/** A dropped parcel transfers existing inventory. It is never a renewable resource. */
export function droppedItemCount(state: WorldObjectState): number {
  if (state.kind !== 'dropped_item' || !state.pickupable || !state.item) return 0;
  const count = state.resourceAmount ?? 1; // Version-1 drops represented one item implicitly.
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** Keep identity and quantity; an old pickup timer must not resurrect a consumed drop. */
export function restoreDroppedItem(state: WorldObjectState, chunkId?: string): WorldObjectState | undefined {
  const count = droppedItemCount(state);
  if (!count) return undefined;
  const restored = structuredClone(state);
  restored.chunkId = chunkId;
  restored.usable = false;
  restored.pickupable = true;
  restored.resourceAmount = count;
  delete restored.resourceCapacity;
  delete restored.respawnAt;
  restored.capabilities = ['inspect', 'pickup'];
  return restored;
}

export interface DropPlan {
  source: InventoryItem;
  object: WorldObjectState;
}

/** Plan first; the adapter registers the object before debiting this source slot once. */
export function planInventoryDrop(
  inventory: InventoryItem[], id: string, name: string, position: Vec2, chunkId?: string
): DropPlan | undefined {
  if (!id || id.length > 256 || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return undefined;
  const source = inventory.find(slot => Number.isFinite(slot.count) && slot.count >= 1 && slot.count <= Number.MAX_SAFE_INTEGER);
  if (!source) return undefined;
  return {
    source,
    object: {
      id, chunkId, kind: 'dropped_item', name, position: { ...position },
      tags: ['dropped', 'parcel', source.kind], usable: false, pickupable: true,
      item: source.kind, resourceAmount: 1, capabilities: ['inspect', 'pickup']
    }
  };
}

/** Validate both sides before a synchronous, exactly-once inventory transfer. */
export function pickupWorldItem(
  state: WorldObjectState, inventory: InventoryItem[], timestamp: number
): InventoryItem | undefined {
  if (!state.pickupable || !state.item || !Number.isFinite(timestamp)) return undefined;
  const count = state.kind === 'dropped_item' ? droppedItemCount(state) : 1;
  if (!count) return undefined;
  const matches = inventory.filter(slot => slot.kind === state.item);
  if (matches.length > 1) return undefined;
  const slot = matches[0], previous = slot?.count ?? 0;
  const next = previous + count;
  if (!Number.isFinite(previous) || previous < 0 || !Number.isFinite(next) || next > Number.MAX_SAFE_INTEGER || next <= previous) return undefined;
  if (slot) slot.count = next;
  else inventory.push({ kind: state.item, count });
  state.pickupable = false;
  if (state.kind === 'dropped_item') {
    state.resourceAmount = 0;
    delete state.resourceCapacity;
    delete state.respawnAt;
    state.capabilities = ['inspect'];
  } else {
    // Preserve the existing authored pickup-source rule; it does not apply to drops.
    state.respawnAt = timestamp + 45_000;
  }
  return { kind: state.item, count };
}

/** Only existing authored pickup sources participate in their original timed respawn. */
export function advancePickupRespawn(state: WorldObjectState, timestamp: number): boolean {
  if (state.kind === 'dropped_item' || !Number.isFinite(timestamp) || state.respawnAt === undefined || timestamp < state.respawnAt) return false;
  delete state.respawnAt;
  state.pickupable = true;
  return true;
}

/** A parcel and the NPC inventory it came from contribute identically on coarse fold-back. */
export function portableItemMetrics(kind: ItemKind, count: number) {
  return {
    food: kind === 'apple' || kind === 'grain' || kind === 'bread' ? count : 0,
    wood: kind === 'wood' ? count : 0,
    prosperity: kind === 'tool' ? count * 2 : count * .1
  };
}

/** Zero is a valid absolute coordinate, not a request to use the start location. */
export function restoredPlayerPosition(position: Partial<Vec2> | undefined): Vec2 {
  return {
    x: typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : 0,
    z: typeof position?.z === 'number' && Number.isFinite(position.z) ? position.z : 7
  };
}

/**
 * The compact unload snapshot omits fine rows. Until a full CAS save acknowledges
 * every fine item transfer, sending that compact snapshot would save only one side
 * (for example the player's reward but not the removed fine parcel). Skip that
 * partial checkpoint; retain the last complete durable transaction instead.
 */
export class ItemTransferCheckpoint {
  private latest = 0;
  private durable = 0;

  markFineChange() {
    if (!Number.isSafeInteger(this.latest + 1)) throw new Error('Item transfer checkpoint exhausted');
    this.latest++;
  }

  capture() { return this.latest; }

  acknowledge(version: number) {
    if (!Number.isSafeInteger(version) || version < 0 || version > this.latest) throw new Error('Invalid item transfer acknowledgement');
    this.durable = Math.max(this.durable, version);
  }

  get pending() { return this.durable < this.latest; }
}
