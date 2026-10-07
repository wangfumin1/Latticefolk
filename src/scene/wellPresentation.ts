import * as THREE from 'three';

const MATERIALS=['Wood','Bag','RoofTiles_Red','Stone_Dark','Stone_Light'];

/** Prepare the opaque Medieval Village well before its geometry is shared by visual clones. */
export function prepareWellGeometry(scene:THREE.Object3D) {
  if(scene.animations.length)return;
  scene.traverse(node=>{
    const mesh=node as THREE.Mesh;
    if(!mesh.isMesh||mesh.name!=='Well'||mesh.animations.length||(mesh as THREE.SkinnedMesh).isSkinnedMesh)return;
    const geometry=mesh.geometry,materials=mesh.material;
    if(geometry.index||Object.keys(geometry.morphAttributes).length||!Array.isArray(materials)
      ||materials.length!==MATERIALS.length||materials.some((material,i)=>material.name!==MATERIALS[i]
        ||material.transparent||material.opacity!==1||!material.depthWrite))return;
    const count=geometry.getAttribute('position')?.count;
    if(count!==5610||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)return;
    let covered=0;
    for(const group of geometry.groups){
      if(group.start!==covered||!Number.isInteger(group.count)||group.count<=0||group.count%3
        ||group.materialIndex===undefined||!Number.isInteger(group.materialIndex)||group.materialIndex<0||group.materialIndex>=materials.length)return;
      covered+=group.count;
    }
    if(covered!==count)return;
    const indices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
    for(let materialIndex=0;materialIndex<materials.length;materialIndex++){
      const start=indices.length;
      for(const group of geometry.groups)if(group.materialIndex===materialIndex){
        for(let i=group.start;i<group.start+group.count;i++)indices.push(i);
      }
      if(indices.length>start)groups.push({start,count:indices.length-start,materialIndex});
    }
    // Vertex attributes and materials stay shared. Only triangle submission order changes.
    geometry.setIndex(new THREE.Uint16BufferAttribute(indices,1));
    geometry.clearGroups();for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
  });
}
