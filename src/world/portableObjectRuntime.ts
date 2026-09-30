import type * as THREE from 'three';
import type { InventoryItem, ItemKind, NpcState, Vec2, WorldObjectState } from '../types.js';
import type { FinePhysicsAuthority } from './finePhysics.js';
import { ItemTransferCheckpoint, droppedItemCount, pickupWorldItem, planInventoryDrop, restoreDroppedItem } from './portableObjects.js';

export interface PortableObjectView {
  state: WorldObjectState;
  mesh: THREE.Object3D;
}
export interface PortableNpc {
  state: NpcState;
  removed?: boolean;
}
interface PortableChunk {
  objectIds: string[];
  groups: THREE.Object3D[];
}

/** Narrow adapter boundary: inventory rules stay independent of rendering and TownGame. */
export interface PortableObjectHost {
  objects: Map<string, PortableObjectView>;
  npcs: ReadonlyMap<string, PortableNpc>;
  materializedChunks: ReadonlyMap<string, PortableChunk>;
  fineChunkCache: ReadonlyMap<string, { objectStates: WorldObjectState[] }>;
  visualTargets: { group: THREE.Object3D }[];
  physics: Pick<FinePhysicsAuthority, 'unregisterStatic' | 'unregisterTrigger'>;
  coarseWorld: { chunkAtWorld(x: number, z: number): { id: string } | undefined };
  playerInventory: Record<ItemKind, number>;
  playerPosition: Vec2;
  cameraMode: 'firstPerson' | 'god';
  hoverEntity?: { type: string; id: string };
  selectedEntity?: { type: string; id: string };
  movableDirty: boolean;
  addObject(state: WorldObjectState): THREE.Group;
  registerWorldObjectPhysics(state: WorldObjectState): void;
  groundHeightAt(x: number, z: number): number;
  playerOverlapsObjectTrigger(id: string): boolean;
  scheduleMovablePersistence(delayMs?: number): void;
  itemName(kind: ItemKind): string;
  parcelLabel(kind: ItemKind, count: number): string;
  event(message: string): void;
}

/**
 * Register and remove one-shot parcels through the same live entity indexes used by
 * rendering, physics, chunk snapshots and fold-back. No test-only mutation surface.
 */
export class PortableObjectRuntime {
  readonly checkpoint = new ItemTransferCheckpoint();

  constructor(
    private readonly host: PortableObjectHost,
    private readonly newId: () => string = () => `drop_${crypto.randomUUID()}`
  ) {}

  private changed(...owners: (string | undefined)[]) {
    if (owners.some(owner => owner !== undefined)) this.checkpoint.markFineChange();
    this.host.movableDirty = true;
    this.host.scheduleMovablePersistence();
  }

  private track(object: PortableObjectView, chunkId?: string) {
    if (!chunkId) return;
    const chunk = this.host.materializedChunks.get(chunkId);
    if (!chunk) throw new Error(`Cannot register a parcel in an unloaded chunk: ${chunkId}`);
    if (!chunk.objectIds.includes(object.state.id)) chunk.objectIds.push(object.state.id);
    if (!chunk.groups.includes(object.mesh)) chunk.groups.push(object.mesh);
  }

  private attach(state: WorldObjectState) {
    if (this.host.objects.has(state.id)) throw new Error(`Duplicate parcel identity: ${state.id}`);
    if (state.chunkId && !this.host.materializedChunks.has(state.chunkId)) {
      throw new Error(`Cannot attach a parcel in an unloaded chunk: ${state.chunkId}`);
    }
    state.name = this.host.parcelLabel(state.item!, droppedItemCount(state));
    let mesh: THREE.Group | undefined;
    try {
      mesh = this.host.addObject(state);
      mesh.position.y = this.host.groundHeightAt(state.position.x, state.position.z);
      mesh.updateMatrixWorld(true);
      const object = this.host.objects.get(state.id);
      if (!object || object.state !== state || object.mesh !== mesh) {
        throw new Error(`Parcel registration failed: ${state.id}`);
      }
      this.track(object, state.chunkId);
      return object;
    } catch (error) {
      // A loader/physics failure must not leave a free parcel before the donor debit.
      const partial = this.host.objects.get(state.id);
      if (partial?.state === state) this.detach(partial);
      else mesh?.removeFromParent();
      throw error;
    }
  }

  drop(agent: PortableNpc): WorldObjectState | undefined {
    if (agent.removed || this.host.npcs.get(agent.state.id) !== agent) return;
    const owner = agent.state.chunkId;
    if (owner && !this.host.materializedChunks.has(owner)) return;
    const id = this.newId();
    if (this.host.objects.has(id) || [...this.host.fineChunkCache.values()].some(cache => cache.objectStates.some(s => s.id === id))) return;
    // Preserve the existing physical placement; ownership follows the source simulation.
    const position = { x: agent.state.position.x + .7, z: agent.state.position.z + .4 };
    const plan = planInventoryDrop(agent.state.inventory, id, 'Parcel', position, owner);
    if (!plan) return;
    this.attach(plan.object);
    plan.source.count--; // Synchronous registration succeeded; debit exactly once.
    this.changed(owner);
    this.host.event(`${agent.state.name} → ${plan.object.name}`);
    return plan.object;
  }

  private live(object: PortableObjectView) {
    return this.host.objects.get(object.state.id) === object && object.mesh.visible;
  }

  pickupForNpc(agent: PortableNpc, object: PortableObjectView): InventoryItem | undefined {
    if (agent.removed || this.host.npcs.get(agent.state.id) !== agent || !this.live(object)) return;
    if (Math.hypot(agent.state.position.x - object.state.position.x, agent.state.position.z - object.state.position.z) > 2.3) return;
    const received = pickupWorldItem(object.state, agent.state.inventory, Date.now());
    if (!received) return;
    this.finishPickup(object, agent.state.chunkId);
    this.host.event(`${agent.state.name} ← ${this.host.itemName(received.kind)} ×${received.count}`);
    return received;
  }

  pickupForPlayer(object: PortableObjectView): InventoryItem | undefined {
    if (this.host.cameraMode !== 'firstPerson' || !this.live(object) || !this.host.playerOverlapsObjectTrigger(object.state.id)) return;
    const inventory = (Object.entries(this.host.playerInventory) as [ItemKind, number][]).map(([kind, count]) => ({ kind, count }));
    const received = pickupWorldItem(object.state, inventory, Date.now());
    if (!received) return;
    for (const slot of inventory) this.host.playerInventory[slot.kind] = slot.count;
    this.finishPickup(object);
    return received;
  }

  private finishPickup(object: PortableObjectView, recipientChunkId?: string) {
    const owner = object.state.chunkId;
    if (object.state.kind === 'dropped_item') this.detach(object);
    else object.mesh.visible = false; // Existing authored pickup sources retain their timer.
    this.changed(owner, recipientChunkId);
  }

  private detach(object: PortableObjectView) {
    const id = object.state.id;
    this.host.physics.unregisterStatic(`object:${id}`);
    this.host.physics.unregisterTrigger(`object-trigger:${id}`);
    object.mesh.removeFromParent();
    this.host.objects.delete(id);
    // Loaded templates share geometry/materials. Detach this instance, never dispose a
    // shared source buffer or leave a visual target that could resurrect it on load.
    for (let i = this.host.visualTargets.length - 1; i >= 0; i--) {
      if (this.host.visualTargets[i].group === object.mesh) this.host.visualTargets.splice(i, 1);
    }
    const chunk = object.state.chunkId ? this.host.materializedChunks.get(object.state.chunkId) : undefined;
    if (chunk) {
      const index = chunk.objectIds.indexOf(id);
      if (index !== -1) chunk.objectIds.splice(index, 1);
      const group = chunk.groups.indexOf(object.mesh);
      if (group !== -1) chunk.groups.splice(group, 1);
    }
    if (this.host.hoverEntity?.type === 'object' && this.host.hoverEntity.id === id) this.host.hoverEntity = undefined;
    if (this.host.selectedEntity?.type === 'object' && this.host.selectedEntity.id === id) this.host.selectedEntity = undefined;
  }

  /** Returns true for every parcel row, including legacy consumed rows intentionally omitted. */
  restoreHome(saved: WorldObjectState): boolean {
    if (saved.kind !== 'dropped_item') return false;
    const state = restoreDroppedItem(saved);
    if (!state) return true;
    // Repair old far drops misfiled as home only when the corresponding visited fine
    // snapshot exists. Never create/discover a chunk or an empty replacement fine row.
    const owner = this.host.coarseWorld.chunkAtWorld(state.position.x, state.position.z)?.id;
    const cache = owner ? this.host.fineChunkCache.get(owner) : undefined;
    if (owner && cache) {
      if (cache.objectStates.some(object => object.id === state.id)) throw new Error(`Duplicate saved parcel: ${state.id}`);
      state.chunkId = owner;
      cache.objectStates.push(state);
      this.changed(owner);
    } else this.attach(state);
    return true;
  }

  restoreFine(states: readonly WorldObjectState[], chunkId: string) {
    for (const saved of states) {
      if (saved.kind !== 'dropped_item') continue;
      const state = restoreDroppedItem(saved, chunkId);
      if (state) this.attach(state);
    }
    // A legacy far parcel without a visited snapshot stays durable in home state
    // until first-person materialization supplies a real owner. This is not discovery.
    for (const object of this.host.objects.values()) {
      if (object.state.kind !== 'dropped_item' || object.state.chunkId !== undefined) continue;
      if (this.host.coarseWorld.chunkAtWorld(object.state.position.x, object.state.position.z)?.id !== chunkId) continue;
      object.state.chunkId = chunkId;
      object.mesh.position.y = this.host.groundHeightAt(object.state.position.x, object.state.position.z);
      this.host.registerWorldObjectPhysics(object.state);
      this.track(object, chunkId);
      this.changed(chunkId);
    }
  }

  diagnostics() {
    return {
      pendingFullSave: this.checkpoint.pending,
      parcels: [...this.host.objects.values()].filter(o => o.state.kind === 'dropped_item').map(object => ({
        id: object.state.id, chunkId: object.state.chunkId ?? null,
        item: object.state.item, count: droppedItemCount(object.state),
        position: { ...object.state.position }, visible: object.mesh.visible,
        renderedChildren: object.mesh.children.length
      }))
    };
  }
}
