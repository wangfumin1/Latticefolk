import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveWildlifeAsset } from './wildlifeAssetResolver';

export type WildlifeVisualAction = 'idle' | 'walk' | 'run' | 'eat' | 'death';

export interface WildlifeVisualState {
  status: 'loading' | 'ready' | 'failed';
  reason?: string;
}

export class WildlifeVisualRuntime {
  private readonly cache = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();
  private readonly loader = new GLTFLoader();
  private readonly mixer = new Map<THREE.Object3D, THREE.AnimationMixer>();
  private readonly state = new Map<string, WildlifeVisualState>();

  getState(species: string): WildlifeVisualState | undefined {
    return this.state.get(species);
  }

  async load(species: string): Promise<void> {
    const resolved = resolveWildlifeAsset(species);
    if (!resolved.definition) {
      this.state.set(species, { status: 'failed', reason: resolved.reason });
      return;
    }
    if (this.cache.has(species)) {
      this.state.set(species, { status: 'ready' });
      return;
    }
    this.state.set(species, { status: 'loading' });
    try {
      const gltf = await this.loader.loadAsync(resolved.definition.asset);
      this.cache.set(species, { scene: gltf.scene, animations: gltf.animations });
      this.state.set(species, { status: 'ready' });
    } catch (error) {
      this.state.set(species, { status: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  }

  createInstance(species: string, groundHeight: number, scale = 1): THREE.Object3D | undefined {
    const asset = this.cache.get(species);
    if (!asset) return undefined;
    const root = cloneSkeleton(asset.scene);
    root.scale.setScalar(scale);
    root.position.y = groundHeight;
    const mixer = new THREE.AnimationMixer(root);
    this.mixer.set(root, mixer);
    return root;
  }

  play(root: THREE.Object3D, species: string, action: WildlifeVisualAction): boolean {
    const asset = this.cache.get(species);
    const mixer = this.mixer.get(root);
    if (!asset || !mixer) return false;
    const clipName = resolveWildlifeAsset(species).definition?.clips[action];
    const clip = asset.animations.find(item => item.name === clipName);
    if (!clip) return false;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    return true;
  }

  update(root: THREE.Object3D, deltaSeconds: number): void {
    this.mixer.get(root)?.update(deltaSeconds);
  }

  dispose(root: THREE.Object3D): void {
    this.mixer.delete(root);
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.filter(Boolean).forEach(material => material.dispose());
    });
  }
}
