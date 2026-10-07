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
export async function sourceGltf(relativePath:string,transform?:(bytes:Buffer)=>Buffer) {
  const loader=new GLTFLoader();
  loader.register(()=>({name:'numeric-test-textures',loadTexture:async()=>new THREE.Texture()}));
  const file=new URL(`../../public/assets/${relativePath}`,import.meta.url),original=fs.readFileSync(file),bytes=transform?transform(original):original;
  if(relativePath.endsWith('.gltf')){
    const document=JSON.parse(bytes.toString('utf8'));
    for(const buffer of document.buffers||[])if(buffer.uri&&!buffer.uri.startsWith('data:')){
      const local=new URL(buffer.uri,file);if(local.protocol!=='file:')throw new Error('Numeric source tests require local buffers');
      buffer.uri=`data:application/octet-stream;base64,${fs.readFileSync(local).toString('base64')}`;
    }
    return loader.parseAsync(JSON.stringify(document),'');
  }
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
}
