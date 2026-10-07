import * as THREE from 'three';
import type {StaticCollider} from '../world/finePhysics.js';
import {SPAWN_SOURCE_GEOMETRY} from './spawnSourceGeometry.js';

export interface SpawnVisualSpec {
  asset:string;height:number;rotationY?:number;offsetZ?:number;
  targetWidth?:number;targetDepth?:number;fit?:'uniform'|'exactBounds';
}

function corners(box:THREE.Box3):THREE.Vector3[] {
  return [box.min.x,box.max.x].flatMap(x=>[box.min.y,box.max.y].flatMap(y=>
    [box.min.z,box.max.z].map(z=>new THREE.Vector3(x,y,z))));
}

// Rounding at the exact band boundary can change which source vertex is selected.
const withinBand=(height:number,min:number,max:number)=>height>min*(1+1e-10)&&height<max*(1-1e-10);

/** Stable before/after asset resolution. This reserves births, not movement colliders. */
export function actorSpawnBounds(spec:SpawnVisualSpec,matrixWorld:THREE.Matrix4,id:string,chunkId?:string):StaticCollider {
  const source=SPAWN_SOURCE_GEOMETRY[spec.asset];
  if(!source)throw new Error(`Missing spawn geometry: ${spec.asset}`);
  const yaw=spec.rotationY??0,offset=spec.offsetZ??0;
  if(!(spec.height>0)||![spec.height,yaw,offset,...matrixWorld.elements].every(Number.isFinite)||matrixWorld.determinant()===0)
    throw new Error('Invalid spawn geometry transform');
  const original=new THREE.Box3(new THREE.Vector3(...source.min),new THREE.Vector3(...source.max));
  const size=original.getSize(new THREE.Vector3()),rotation=new THREE.Matrix4().makeRotationY(yaw);
  let points:THREE.Vector3[];
  if(source.basal){
    const scale=spec.height/size.y;
    const rotated=corners(original).map(p=>p.multiplyScalar(scale).applyMatrix4(rotation));
    const whole=new THREE.Box3().setFromPoints(rotated);
    const fitUsesBasal=withinBand(spec.height,source.basal.minHeight,source.basal.maxHeight);
    if(fitUsesBasal){
      const basal=source.basal.points.map(p=>new THREE.Vector3(...p).multiplyScalar(scale).applyMatrix4(rotation));
      const center=new THREE.Box3().setFromPoints(basal).getCenter(new THREE.Vector3());
      const e=matrixWorld.elements,heightAtWorld=spec.height*e[5];
      const upright=Math.abs(e[1])<1e-12&&Math.abs(e[9])<1e-12&&e[5]>0;
      const worldUsesBasal=upright&&withinBand(heightAtWorld,source.basal.minHeight,source.basal.maxHeight);
      points=(worldUsesBasal?basal:rotated).map(p=>p.sub(new THREE.Vector3(center.x,whole.min.y,center.z)));
    }else{
      // The fitting band's center can lie anywhere in the full source footprint.
      // Preserve a conservative envelope for unusual legacy heights/reflections.
      const span=whole.getSize(new THREE.Vector3());
      points=corners(new THREE.Box3(new THREE.Vector3(-span.x,0,-span.z),new THREE.Vector3(span.x,span.y,span.z)));
    }
  }else{
    let scale=new THREE.Vector3().setScalar(spec.height/size.y);
    if(spec.targetWidth&&spec.targetDepth){
      if(spec.fit==='exactBounds')scale.set(spec.targetWidth/size.x,spec.height/size.y,spec.targetDepth/size.z);
      else scale.setScalar(Math.min(scale.y,spec.targetWidth/size.x,spec.targetDepth/size.z));
    }
    const scaled=original.clone().applyMatrix4(new THREE.Matrix4().makeScale(scale.x,scale.y,scale.z));
    const center=scaled.getCenter(new THREE.Vector3());
    // normalizeModel centers before applyVisualTarget assigns yaw; that translation
    // is outside the rotation and must not be rotated a second time.
    points=corners(scaled).map(p=>p.applyMatrix4(rotation).sub(new THREE.Vector3(center.x,scaled.min.y,center.z)));
  }
  for(const point of points){point.z+=offset;point.applyMatrix4(matrixWorld);}
  const bounds=new THREE.Box3().setFromPoints(points);
  if(bounds.isEmpty()||![bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z].every(Number.isFinite))throw new Error('Invalid spawn geometry bounds');
  return {id,chunkId,minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z};
}
