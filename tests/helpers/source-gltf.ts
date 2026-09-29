import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Numeric geometry/skin tests only. Real textures and visibility are exercised in Chromium.
if(!globalThis.ProgressEvent){
  globalThis.ProgressEvent=class extends Event {
    readonly lengthComputable:boolean;
    readonly loaded:number;
    readonly total:number;
    constructor(type:string,init:ProgressEventInit={}) {
      super(type);this.lengthComputable=init.lengthComputable??false;
      this.loaded=init.loaded??0;this.total=init.total??0;
    }
  } as typeof ProgressEvent;
}
export async function sourceGltf(relativePath:string) {
  const loader=new GLTFLoader();
  loader.register(()=>({name:'numeric-test-textures',loadTexture:async()=>new THREE.Texture()}));
  const bytes=fs.readFileSync(new URL(`../../public/assets/${relativePath}`,import.meta.url));
  return loader.parseAsync(relativePath.endsWith('.gltf')?bytes.toString('utf8'):bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
}
