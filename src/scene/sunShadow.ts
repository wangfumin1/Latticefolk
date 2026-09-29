import * as THREE from 'three';

const DIRECTION=new THREE.Vector3(12,22,8).normalize();
const RIGHT=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),DIRECTION).normalize();
const UP=new THREE.Vector3().crossVectors(DIRECTION,RIGHT).normalize();
const MAP_SIZE=2048;

/** Bounded presentation-only shadow window. Its inputs never discover or materialize a chunk. */
export class SunShadowView {
  private readonly focus=new THREE.Vector3();
  private readonly lightOffset=DIRECTION.clone().multiplyScalar(120);
  private halfExtent=0;
  mode:'firstPerson'|'god'='firstPerson';

  constructor(readonly sun:THREE.DirectionalLight) {
    sun.castShadow=true;
    sun.shadow.mapSize.set(MAP_SIZE,MAP_SIZE);
    sun.shadow.camera.near=.5;
    sun.shadow.camera.far=240;
  }

  update(mode:'firstPerson'|'god',focus:THREE.Vector3,godDistance=0) {
    if(!Number.isFinite(focus.x+focus.y+focus.z)||!Number.isFinite(godDistance))return;
    this.mode=mode;
    // First-person contact detail; God View has a bounded, quantized wider footprint.
    const half=mode==='firstPerson'?24:THREE.MathUtils.clamp(Math.ceil(godDistance/8)*8,32,96);
    if(half!==this.halfExtent){
      this.halfExtent=half;
      Object.assign(this.sun.shadow.camera,{left:-half,right:half,top:half,bottom:-half});
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    const texel=2*half/MAP_SIZE;
    // Bias is tied to this map's world-space texel footprint, not an arbitrary fixed
    // world-scale value. Double-sided source surfaces otherwise self-shadow in stripes.
    this.sun.shadow.bias=-texel/(this.sun.shadow.camera.far-this.sun.shadow.camera.near);
    this.sun.shadow.normalBias=2*texel;
    this.focus.copy(focus);
    // Quantize in light space, not world X/Z: camera motion must not swim the shadow texels.
    const x=this.focus.dot(RIGHT),y=this.focus.dot(UP);
    this.focus.addScaledVector(RIGHT,Math.round(x/texel)*texel-x);
    this.focus.addScaledVector(UP,Math.round(y/texel)*texel-y);
    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).add(this.lightOffset);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    this.sun.shadow.updateMatrices(this.sun);
  }

  diagnostics() {
    return {mode:this.mode,halfExtent:this.halfExtent,mapSize:MAP_SIZE,
      focus:this.focus.toArray(),near:this.sun.shadow.camera.near,far:this.sun.shadow.camera.far,
      bias:this.sun.shadow.bias,normalBias:this.sun.shadow.normalBias};
  }
}
