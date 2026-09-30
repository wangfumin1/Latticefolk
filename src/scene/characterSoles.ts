import * as THREE from 'three';

interface SoleMesh {mesh:THREE.SkinnedMesh;indices:Uint32Array;}

/** Cache existing foot-weighted source vertices once, not a full-body Box3 every frame. */
export class CharacterSoles {
  private readonly parts:SoleMesh[]=[];
  private readonly vertex=new THREE.Vector3();
  private readonly delta=new THREE.Vector3();
  private readonly origin=new THREE.Vector3();
  readonly vertexCount:number;

  constructor(readonly model:THREE.Object3D) {
    model.traverse(child=>{
      const mesh=child as THREE.SkinnedMesh;
      if(!mesh.isSkinnedMesh)return;
      const footBones=new Set(mesh.skeleton.bones.flatMap((bone,index)=>/^Foot[LR]$/.test(bone.name)?[index]:[]));
      const skinIndex=mesh.geometry.getAttribute('skinIndex');
      const skinWeight=mesh.geometry.getAttribute('skinWeight');
      if(!footBones.size||!skinIndex||!skinWeight)return;
      const indices:number[]=[];
      for(let i=0;i<skinIndex.count;i++){
        for(let component=0;component<4;component++){
          if(skinWeight.getComponent(i,component)>0&&footBones.has(skinIndex.getComponent(i,component))){
            indices.push(i);break;
          }
        }
      }
      if(indices.length)this.parts.push({mesh,indices:Uint32Array.from(indices)});
    });
    this.vertexCount=this.parts.reduce((count,part)=>count+part.indices.length,0);
  }

  /** Current skin deformation, including a freshly changed mixer pose and ancestor transform. */
  minimumWorldY() {
    this.model.parent?.updateWorldMatrix(true,false);
    this.model.updateMatrixWorld(true);
    let minimum=Infinity;
    for(const {mesh,indices} of this.parts){
      mesh.skeleton.update();
      for(const index of indices){
        mesh.getVertexPosition(index,this.vertex).applyMatrix4(mesh.matrixWorld);
        minimum=Math.min(minimum,this.vertex.y);
      }
    }
    return Number.isFinite(minimum)?minimum:undefined;
  }

  /** Visual support only. Never move the simulation container, collider or saved position. */
  ground(groundHeight:number) {
    if(!Number.isFinite(groundHeight))return false;
    const minimum=this.minimumWorldY();
    if(minimum===undefined)return false;
    this.delta.set(0,groundHeight-minimum,0);
    const parent=this.model.parent;
    if(parent){
      this.origin.set(0,0,0);
      parent.worldToLocal(this.delta);
      parent.worldToLocal(this.origin);
      this.delta.sub(this.origin);
    }
    this.model.position.add(this.delta);
    this.model.parent?.updateWorldMatrix(true,false);
    this.model.updateMatrixWorld(true);
    return true;
  }
}
