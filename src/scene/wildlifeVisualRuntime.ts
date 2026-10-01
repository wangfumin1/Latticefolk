import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveWildlifeAsset } from './wildlifeAssetResolver';

export type WildlifeVisualAction = 'idle' | 'walk' | 'run' | 'eat' | 'death';

export interface WildlifeVisualState {
  status: 'loading' | 'ready' | 'failed';
  reason?: string;
}

interface CachedAsset {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  loading?: Promise<void>;
}

interface InstanceState {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current?: string;
  death?: boolean;
  scale: number;
  footOffset: number;
}

export class WildlifeVisualRuntime {
  private readonly cache = new Map<string, CachedAsset>();
  private readonly loader = new GLTFLoader();
  private readonly instances = new Map<THREE.Object3D, InstanceState>();
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
    const existing = this.cache.get(species);
    if (existing?.loading) return existing.loading;
    if (existing) {
      this.state.set(species, { status: 'ready' });
      return;
    }
    this.state.set(species, { status: 'loading' });
    const entry: CachedAsset = { scene: new THREE.Object3D(), animations: [] };
    this.cache.set(species, entry);
    entry.loading = this.loader.loadAsync(resolved.definition.asset).then(gltf => {
      entry.scene = gltf.scene;
      entry.animations = gltf.animations;
      this.state.set(species, { status: 'ready' });
      delete entry.loading;
    }).catch(error => {
      this.cache.delete(species);
      this.state.set(species, { status: 'failed', reason: error instanceof Error ? error.message : String(error) });
      delete entry.loading;
    });
    return entry.loading;
  }

  createInstance(species: string, groundHeight: number, scale = 1): THREE.Object3D | undefined {
    const asset = this.cache.get(species);
    if (!asset || this.state.get(species)?.status !== 'ready') return undefined;
    const root = cloneSkeleton(asset.scene);
    root.scale.setScalar(scale);
    const box = new THREE.Box3().setFromObject(root);
    const footOffset = -box.min.y * scale;
    root.position.y = groundHeight + footOffset;
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    const clips = resolveWildlifeAsset(species).definition?.clips ?? {};
    for (const [key, name] of Object.entries(clips)) {
      const clip = asset.animations.find(item => item.name === name);
      if (clip) actions.set(key, mixer.clipAction(clip));
    }
    this.instances.set(root, { mixer, actions, scale, footOffset });
    return root;
  }

  play(root: THREE.Object3D, action: WildlifeVisualAction): boolean {
    const instance = this.instances.get(root);
    if (!instance) return false;
    const next = instance.actions.get(action);
    if (!next) return false;
    if (instance.current === action) return true;
    instance.actions.get(instance.current ?? '')?.fadeOut(.15);
    next.reset().fadeIn(.15).play();
    if (action === 'death') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      instance.death = true;
    }
    instance.current = action;
    return true;
  }

  update(root: THREE.Object3D, deltaSeconds: number): void {
    this.instances.get(root)?.mixer.update(deltaSeconds);
  }

  dispose(root: THREE.Object3D): void {
    const instance = this.instances.get(root);
    if (!instance) return;
    for (const action of instance.actions.values()) action.stop();
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(root);
    this.instances.delete(root);
    root.removeFromParent();
  }
}
