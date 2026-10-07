import * as THREE from 'three';
import type { CoarseChunkState } from '../../src/types.js';
import { projectFineActors } from '../../src/world/actorGeneration.js';
import { prepareFirstActors } from '../../src/world/actorActivation.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldRandom.js';
import {createStreamedLayout} from '../../src/world/streamedLayouts.js';
import {streamedUnitForCoarseCell,streamedUnitOwnerCells} from '../../src/world/streamedUnits.js';
import { ensureWildlifePopulations } from '../../src/world/ecology.js';
import { FinePhysicsAuthority } from '../../src/world/finePhysics.js';
import { PLAYER_BODY_RADIUS, NPC_BODY_RADIUS, playerHeadConstraint } from '../../src/world/characterContact.js';
import { fitTreeModel, treePhysics, treeVisualHeight } from '../../src/scene/treePresentation.js';
import { sourceGltf } from '../../tests/helpers/source-gltf.js';

/**
 * Choose an existing donor with a physically valid setup for the same A/D route.
 * The whole 72m static layout supplies sourced geometry; residents and wildlife
 * retain their 24m authority. Selection never moves or removes scene entities.
 */
export async function fineParcelFixture(input: CoarseChunkState, chunkSize = 24) {
  const chunk = structuredClone(input);
  // This is the same normalization used by restoreKnownChunks before planning.
  ensureWildlifePopulations(chunk);
  const unit=streamedUnitForCoarseCell(chunk.cx,chunk.cz);
  const coarseChunks=streamedUnitOwnerCells(unit.ux,unit.uz).map(owner=>{
    const state={...structuredClone(input),...owner};ensureWildlifePopulations(state);return state;
  });
  const generated=createStreamedLayout(unit.ux,unit.uz,coarseChunks,[]);
  const randomness={version:1 as const,seed:DEFAULT_WORLD_SEED};
  const descriptors=projectFineActors(chunk,generated.layout,randomness);
  if(generated.layout.buildings.length)throw new Error('Parcel fixture requires a wilderness unit');
  const staticObjects=generated.objectStates.map(state=>({state,...generated.layout.objects.find(object=>object.id===state.id)!}));
  if (chunk.settlementLevel !== 0) throw new Error('Parcel fixture requires the existing wilderness plan');
  const physics = new FinePhysicsAuthority();
  const treeColliders = [];
  for (const object of staticObjects) {
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
  const exitX = chunk.cx * chunkSize - chunkSize / 2 - .4;
  const rejected = [];
  for (const donor of descriptors.residents.filter(n => n.inventory.some(i => i.kind === 'water' && i.count > 0))) {
    const start = {x:donor.x+.7,z:donor.z+1.8};
    const accepted=prepareFirstActors(chunk,generated.layout,randomness,1,[],new Map(),{
      blocked:physics.isBlocked.bind(physics),static:[],player:start,dynamic:[{id:'player',...start,radius:PLAYER_BODY_RADIUS}]
    });
    const actual=accepted?.npcs.find(n=>n.state.id===donor.id);
    if(!accepted||!actual||actual.state.position.x!==donor.x||actual.state.position.z!==donor.z){rejected.push({id:donor.id,start,reason:'spawn correction'});continue;}
    const constraints=accepted.npcs.map(n=>playerHeadConstraint(`npc:${n.state.id}`,n.asset,n.state.position,0));
    // Use the same complete founding batch that fine activation will accept.
    const wildlifeColliders=accepted.wildlife.map(a=>({id:`wildlife:${a.id}`,...a.position,
      radius:Math.max(.24,Math.min(.48,.20+a.traits.size*.10))}));
    const dynamic=[...accepted.npcs.map(n=>({id:`npc:${n.state.id}`,...n.state.position,radius:NPC_BODY_RADIUS})),...wildlifeColliders];
    const outbound = physics.moveKinematic({id:'player',position:start,
      displacement:{x:exitX-start.x,z:0},radius:PLAYER_BODY_RADIUS,dynamic,constraints,maxSubstep:.05});
    const returned = physics.moveKinematic({id:'player',position:{x:exitX,z:start.z},
      displacement:{x:start.x-exitX,z:0},radius:PLAYER_BODY_RADIUS,dynamic,constraints,maxSubstep:.05});
    if (Math.abs(outbound.position.x-exitX) < 1e-8 && Math.abs(returned.position.x-start.x) < 1e-8) {
      return {chunk,coarseChunks,donor,start,exitX,treeColliders,wildlifeColliders,rejected};
    }
    rejected.push({id:donor.id,start,staticHits:outbound.staticHits,dynamicHits:outbound.dynamicHits,
      outbound:outbound.position,returned:returned.position});
  }
  throw new Error(`No collision-valid generated parcel donor: ${JSON.stringify(rejected)}`);
}
