export type Vec2 = { x: number; z: number };

export type NpcRole = 'farmer' | 'baker' | 'shopkeeper' | 'guard' | 'maker' | 'resident';
export type Mood = 'happy' | 'calm' | 'neutral' | 'sad' | 'annoyed' | 'curious' | 'tired';
export type SocialIntent = 'greet' | 'smalltalk' | 'ask_help' | 'offer_help' | 'trade' | 'joke' | 'praise' | 'complain' | 'share_news' | 'leave';
export type StateShift = 'stable' | 'mood_up' | 'mood_down' | 'social_seek' | 'social_withdraw' | 'energy_conserve' | 'goal_intensify';
export type RelationEffect = 'positive' | 'neutral' | 'negative';

export type DecisionAction =
  | 'idle'
  | 'wander'
  | 'talk'
  | 'work'
  | 'rest'
  | 'eat'
  | 'pickup'
  | 'use_object'
  | 'inspect'
  | 'drop_item'
  | 'harvest'
  | 'craft'
  | 'trade'
  | 'gift'
  | 'deliver'
  | 'fetch_water'
  | 'patrol'
  | 'visit'
  | 'sleep'
  | 'explore';

export type ObjectKind =
  | 'bed'
  | 'bench'
  | 'workstation'
  | 'food_stall'
  | 'tree'
  | 'crate'
  | 'well'
  | 'farm_plot'
  | 'dropped_item';

export type ItemKind = 'apple' | 'bread' | 'wood' | 'coin' | 'flower' | 'grain' | 'water' | 'stone' | 'tool';

export interface InventoryItem {
  kind: ItemKind;
  count: number;
}

export interface RelationshipState {
  affinity: number;
  trust: number;
  familiarity: number;
}

export interface NpcMemory {
  id: string;
  at: number;
  summary: string;
  importance: number;
}

export interface NpcState {
  id: string;
  name: string;
  role: NpcRole;
  position: Vec2;
  home: Vec2;
  workAt?: string;
  mood: Mood;
  hunger: number;
  energy: number;
  social: number;
  money: number;
  inventory: InventoryItem[];
  relationships: Record<string, RelationshipState>;
  memories: NpcMemory[];
  currentAction: DecisionAction;
  targetNpcId?: string;
  targetObjectId?: string;
  goal: string;
  lastDecisionAt: number;
  lastDialogue?: string;
}

export interface WorldObjectState {
  id: string;
  kind: ObjectKind;
  name: string;
  position: Vec2;
  tags: string[];
  usable: boolean;
  pickupable: boolean;
  item?: ItemKind;
  respawnAt?: number;
  occupiedBy?: string;
}

export interface NearbyNpc {
  id: string;
  name: string;
  role: NpcRole | 'player';
  mood: Mood;
  distance: number;
  isPlayer?: boolean;
  relationship: RelationshipState;
  currentAction: DecisionAction;
}

export interface NearbyObject {
  id: string;
  kind: ObjectKind;
  name: string;
  tags: string[];
  distance: number;
  usable: boolean;
  pickupable: boolean;
  item?: ItemKind;
}

export interface DecisionWorldSnapshot {
  gameTime: string;
  minuteOfDay: number;
  weather: string;
  nearbyNpcs: NearbyNpc[];
  nearbyObjects: NearbyObject[];
  recentEvents: string[];
}

export interface DecisionRequest {
  npc: NpcState;
  world: DecisionWorldSnapshot;
  allowedActions: DecisionAction[];
}

export interface DecisionResponse {
  source: string;
  action: DecisionAction;
  targetNpcId?: string;
  targetObjectId?: string;
  socialIntent?: SocialIntent;
  stateShift: StateShift;
  commitment: number;
  confidence: number;
  reasonCode: string;
  raw?: unknown;
}

export interface DialogueActor {
  id: string;
  name: string;
  role: string;
  mood: Mood | string;
  relationship?: RelationshipState;
}

export interface DialogueRequest {
  speaker: DialogueActor;
  listener: DialogueActor;
  situation: string;
  intent: SocialIntent;
  world: {
    gameTime: string;
    weather: string;
    nearbyTags: string[];
  };
  recentLines: string[];
}

export interface DialogueResponse {
  source: string;
  mode: 'line' | 'fragments';
  text: string;
  selectedIds: string[];
  confidence: number;
  relationEffect: RelationEffect;
}

export type DialogueKind = 'line' | 'fragment';
export type FragmentSlot = 'opener' | 'body' | 'closer';

export interface DialogueEntry {
  id: string;
  kind: DialogueKind;
  slot?: FragmentSlot;
  text: string;
  tags: string[];
  intents: SocialIntent[];
  moods: string[];
  roles: string[];
  weight: number;
}

export interface ImportDialogueRequest {
  format: 'plain' | 'jsonl' | 'json';
  text: string;
}


export type ChunkBiome = 'plains' | 'forest' | 'hills' | 'wetlands' | 'dryland';
export type ChunkStrategy = 'sustain' | 'grow_settlement' | 'conserve' | 'extract_resources' | 'fortify' | 'trade_route';
export type ChunkMigrationPolicy = 'attract' | 'retain' | 'release' | 'evacuate';
export type ChunkEcologyPolicy = 'recover' | 'balance' | 'harvest' | 'protect';

export interface CoarseChunkState {
  id: string;
  cx: number;
  cz: number;
  biome: ChunkBiome;
  settlementLevel: number;
  population: number;
  food: number;
  wood: number;
  water: number;
  ecology: number;
  danger: number;
  prosperity: number;
  strategy: ChunkStrategy;
  migrationPolicy: ChunkMigrationPolicy;
  ecologyPolicy: ChunkEcologyPolicy;
  lastDecisionAt: number;
  decisionVersion: number;
}

export interface ChunkDecisionRequest {
  day: number;
  gameTime: string;
  weather: string;
  chunks: CoarseChunkState[];
}

export interface ChunkDecision {
  chunkId: string;
  strategy: ChunkStrategy;
  migrationPolicy: ChunkMigrationPolicy;
  ecologyPolicy: ChunkEcologyPolicy;
  confidence: number;
  reasonCode: string;
  source: string;
}

export interface ChunkDecisionResponse {
  source: string;
  decisions: ChunkDecision[];
}
