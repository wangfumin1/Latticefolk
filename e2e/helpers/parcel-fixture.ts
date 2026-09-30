import * as THREE from 'three';
import type { CoarseChunkState } from '../../src/types.js';
import { planFineChunk } from '../../src/world/materialization.js';
import { ensureWildlifePopulations } from '../../src/world/ecology.js';
import { FinePhysicsAuthority } from '../../src/world/finePhysics.js';
import { PLAYER_BODY_RADIUS, NPC_BODY_RADIUS, playerHeadConstraint } from '../../src/world/characterContact.js';
import { fitTreeModel, treePhysics, treeVisualHeight } from '../../src/scene/treePresentation.js';
import { sourceGltf } from '../../tests/helpers/source-gltf.js';

/**
 * Choose an existing donor with a physically valid setup for the same A/D route.
 * Never move/remove generated NPCs, trees or fixtures to make a test pass. The
 * first donor's old (+.7,+1.8) start intersects the resolved tree_11 trunk; a
 * fixed resident index is not a valid collision precondition for this scenario.
 */
export async function fineParcelFixture(input: CoarseChunkState, chunkSize = 24) {
  const chunk = structuredClone(input);
  // This is the same normalization used by restoreKnownChunks before planning.
  ensureWildlifePopulations(chunk);
  const plan = planFineChunk(chunk, chunkSize);
  if (plan.buildings.length || chunk.settlementLevel !== 0) throw new Error('Parcel fixture requires the existing wilderness plan');
  const physics = new FinePhysicsAuthority();
  const treeColliders = [];
  for (const object of plan.objects) {
    const state = object.state;
    if (state.kind === 'tree') {
      const asset = object.asset!;
      if (!/^tree[123]$/.test(asset)) throw new Error(`Uncalibrated fixture tree: ${asset}`);
      const source = await sourceGltf(`quaternius/cube-world/Tree_${asset.slice(-1)}.gltf`);
      const model = source.scene;
      fitTreeModel(model, treeVisualHeight(asset, object.height), object.rotationY ?? 0);
      const anchor = new THREE.Group();
      anchor.position.set(state.position.x, 0, state.position.z);
      anchor.add(model); anchor.updateMatrixWorld(true);
      const collider = treePhysics(model, `object:${state.id}`, chunk.id).collider;
      physics.registerStatic(collider); treeColliders.push(collider);
    } else if (state.kind === 'rock') {
      // The existing ordinary-rock collision contract, not its decorative mesh.
      physics.registerStatic({id:`object:${state.id}`,chunkId:chunk.id,
        minX:state.position.x-.44,maxX:state.position.x+.44,minZ:state.position.z-.44,maxZ:state.position.z+.44});
    } else if (!['bush','flower','water_patch'].includes(state.kind)) {
      throw new Error(`Fixture must explicitly account for ${state.kind} collision`);
    }
  }
  const constraints = plan.residents.map(n => playerHeadConstraint(`npc:${n.id}`, n.characterAsset, n, 0));
  const dynamic = plan.residents.map(n => ({id:`npc:${n.id}`,x:n.x,z:n.z,radius:NPC_BODY_RADIUS}));
  const exitX = chunk.cx * chunkSize - chunkSize / 2 - .4;
  const rejected = [];
  for (const donor of plan.residents.filter(n => n.inventory.some(i => i.kind === 'water' && i.count > 0))) {
    const start = {x:donor.x+.7,z:donor.z+1.8};
    const outbound = physics.moveKinematic({id:'player',position:start,
      displacement:{x:exitX-start.x,z:0},radius:PLAYER_BODY_RADIUS,dynamic,constraints,maxSubstep:.05});
    const returned = physics.moveKinematic({id:'player',position:{x:exitX,z:start.z},
      displacement:{x:start.x-exitX,z:0},radius:PLAYER_BODY_RADIUS,dynamic,constraints,maxSubstep:.05});
    if (Math.abs(outbound.position.x-exitX) < 1e-8 && Math.abs(returned.position.x-start.x) < 1e-8) {
      return {chunk,donor,start,exitX,treeColliders,rejected};
    }
    rejected.push({id:donor.id,start,staticHits:outbound.staticHits,dynamicHits:outbound.dynamicHits,
      outbound:outbound.position,returned:returned.position});
  }
  throw new Error(`No collision-valid generated parcel donor: ${JSON.stringify(rejected)}`);
}
