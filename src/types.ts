export type Vec2 = { x: number; z: number };
export type LocaleCode = 'zh-CN' | 'en' | 'ja' | 'es';

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
  | 'water_patch'
  | 'farm_plot'
  | 'building'
  | 'road'
  | 'bush'
  | 'rock'
  | 'flower'
  | 'cart'
  | 'tool_prop'
  | 'dropped_item';

export type InteractionCapability =
  | 'inspect'
  | 'rest'
  | 'sit'
  | 'sleep'
  | 'draw_water'
  | 'drink'
  | 'wash'
  | 'harvest'
  | 'forage'
  | 'chop'
  | 'mine'
  | 'craft'
  | 'work'
  | 'buy'
  | 'sell'
  | 'trade'
  | 'store'
  | 'take'
  | 'load'
  | 'unload'
  | 'pickup'
  | 'visit';

export type ItemKind = 'apple' | 'bread' | 'wood' | 'coin' | 'flower' | 'grain' | 'flour' | 'water' | 'stone' | 'plank' | 'tool';

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
  chunkId?: string;
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
  chunkId?: string;
  kind: ObjectKind;
  name: string;
  position: Vec2;
  tags: string[];
  usable: boolean;
  pickupable: boolean;
  item?: ItemKind;
  capabilities?: InteractionCapability[];
  storage?: InventoryItem[];
  resourceAmount?: number;
  resourceCapacity?: number;
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
  capabilities?: InteractionCapability[];
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
  locale?: LocaleCode | string;
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
  locale?: LocaleCode | string;
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
  locale?: LocaleCode | string;
  text: string;
}


export type ChunkBiome = 'plains' | 'forest' | 'hills' | 'wetlands' | 'dryland';
export type ChunkStrategy = 'sustain' | 'grow_settlement' | 'conserve' | 'extract_resources' | 'fortify' | 'trade_route';
export type ChunkMigrationPolicy = 'attract' | 'retain' | 'release' | 'evacuate';
export type ChunkEcologyPolicy = 'recover' | 'balance' | 'harvest' | 'protect';

export type WildlifeSpecies = 'rabbit' | 'deer' | 'boar' | 'goat' | 'fox' | 'wolf';
export type WildlifeAction = 'graze' | 'forage' | 'drink' | 'rest' | 'flee' | 'hunt' | 'wander' | 'seek_mate' | 'migrate';
export type WorldSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export interface PlantBiomassState {
  grass: number;
  shrub: number;
  fruit: number;
  crop: number;
}

export interface TrophicFluxState {
  primaryProduction: number;
  herbivory: number;
  predation: number;
  mortalityReturn: number;
}

export interface WildlifeCompetitionPair {
  speciesA: WildlifeSpecies;
  speciesB: WildlifeSpecies;
  nicheOverlap: number;
  pressure: number;
}

export interface WildlifeNicheCompetitionState {
  speciesPressure: Record<WildlifeSpecies,number>;
  meanPressure: number;
  strongestPair?: WildlifeCompetitionPair;
}

export interface WildlifeDiseasePair {
  fromSpecies: WildlifeSpecies;
  toSpecies: WildlifeSpecies;
  pressure: number;
}

export interface WildlifeDiseasePressureState {
  environmentalPressure: number;
  speciesPressure: Record<WildlifeSpecies,number>;
  localContactPressure: Record<WildlifeSpecies,number>;
  crossSpeciesPressure: Record<WildlifeSpecies,number>;
  importedPressure: Record<WildlifeSpecies,number>;
  meanPressure: number;
  strongestPair?: WildlifeDiseasePair;
}

export interface CoarseWildlifePopulation {
  species: WildlifeSpecies;
  count: number;
  carryingCapacity: number;
  health: number;
  diseaseLoad?: number;
  competitionPressure?: number;
  importedDiseasePressure?: number;
}

export interface WildlifeTraits {
  speed: number;
  size: number;
  fertility: number;
  wariness: number;
}

export interface WildlifeHabitatSnapshot {
  biome: ChunkBiome;
  ecology: number;
  food: number;
  water: number;
  danger: number;
  settlementLevel: number;
  plantBiomass: number;
  /** Species-specific coarse niche pressure observed at this habitat snapshot; absent in legacy records. */
  competitionPressure?: number;
  /** Species-specific seasonal habitat suitability observed at this snapshot; absent in legacy records. */
  seasonalSuitability?: number;
  /** Species-specific disease transmission pressure observed at this snapshot; absent in legacy records. */
  diseasePressure?: number;
}

export interface WildlifeHabitatExposure {
  observedDays: number;
  habitatMean: Omit<WildlifeHabitatSnapshot,'biome'>;
  biomeDays: Partial<Record<ChunkBiome,number>>;
  chunkDays: Record<string,number>;
  observedTransitions: number;
  lastObservedDay?: number;
  lastChunk?: string;
  lastBiome?: ChunkBiome;
}

export type WildlifeSelectionSignal = 'insufficient' | 'weak' | 'persistent';

export type WildlifeDeathReason = 'predation' | 'starvation' | 'dehydration' | 'disease' | 'senescence' | 'other';

export interface WildlifeMigrationEvent {
  fromChunkId: string;
  toChunkId: string;
  day: number;
  fromBiome: ChunkBiome;
  toBiome: ChunkBiome;
  representedPopulation: number;
  reason: 'behavioral_migration';
}

export interface WildlifeLineageRecord {
  entityId: string;
  species: WildlifeSpecies;
  motherId?: string;
  fatherId?: string;
  birthDay: number;
  deathDay?: number;
  deathReason?: WildlifeDeathReason;
  generation: number;
  birthChunk: string;
  deathChunk?: string;
  traitsAtBirth: WildlifeTraits;
  traitsAtDeath?: WildlifeTraits;
  birthHabitat?: WildlifeHabitatSnapshot;
  deathHabitat?: WildlifeHabitatSnapshot;
  habitatExposure?: WildlifeHabitatExposure;
  migrationHistory?: WildlifeMigrationEvent[];
  origin: 'founder' | 'reproduction';
  offspringCount: number;
  reproductiveSuccess: boolean;
}

export interface WildlifeGenerationCohortStats {
  generation: number;
  population: number;
  living: number;
  deaths: number;
  meanLifespan: number;
  offspringMean: number;
  breederRate: number;
  traitMean: WildlifeTraits;
  traitVariance: WildlifeTraits;
}

export type WildlifeFitnessExposureDimension = 'competitionPressure' | 'seasonalSuitability' | 'diseasePressure';
export type WildlifeFitnessBand = 'low' | 'medium' | 'high';

export interface WildlifeFitnessBandStats {
  band: WildlifeFitnessBand;
  population: number;
  eligiblePopulation: number;
  living: number;
  deaths: number;
  breeders: number;
  breederRate: number;
  offspringMean: number;
  lifespanMean: number;
  exposureMean: number;
  traitMean: WildlifeTraits;
  breederTraitMean: WildlifeTraits;
  selectionDifferential: WildlifeTraits;
}

export interface WildlifeHabitatFitnessStats {
  dimension: WildlifeFitnessExposureDimension;
  sampleSize: number;
  reproductionEligibleSamples: number;
  lifespanSamples: number;
  observedExposureDaysMean: number;
  exposureMean: number;
  breederExposureMean: number | null;
  nonBreederExposureMean: number | null;
  reproductionAssociation: number | null;
  offspringAssociation: number | null;
  lifespanAssociation: number | null;
  bands: WildlifeFitnessBandStats[];
}

export interface WildlifeBiomeSelectionStats {
  basis: 'origin' | 'lifetime';
  biome: ChunkBiome;
  population: number;
  breeders: number;
  generationsObserved: number;
  breederRate: number;
  offspringMean: number;
  lifespanMean: number;
  observedExposureDaysMean: number;
  habitatMean: Omit<WildlifeHabitatSnapshot,'biome'>;
  traitMean: WildlifeTraits;
  breederTraitMean: WildlifeTraits;
  selectionDifferential: WildlifeTraits;
  normalizedSelectionDifferential: WildlifeTraits;
  selectionConsistency: WildlifeTraits;
  comparableSelectionGenerations: WildlifeTraits;
  traitTrendPerGeneration: WildlifeTraits;
  signal: Record<keyof WildlifeTraits, WildlifeSelectionSignal>;
}

export interface WildlifeEvolutionStats {
  species: WildlifeSpecies;
  livingPopulation: number;
  historicalPopulation: number;
  births: number;
  deaths: number;
  generationMean: number;
  generationMax: number;
  lifespanMean: number;
  offspringMean: number;
  traitMean: WildlifeTraits;
  traitVariance: WildlifeTraits;
  traitTrendPerGeneration: WildlifeTraits;
  mortality: Record<WildlifeDeathReason, number>;
  reproductiveSuccess: number;
  survivalToReproductionRate: number;
  cohorts: WildlifeGenerationCohortStats[];
  biomeSelection: WildlifeBiomeSelectionStats[];
  lifetimeBiomeSelection: WildlifeBiomeSelectionStats[];
  exposureFitness: WildlifeHabitatFitnessStats[];
}

export interface WildlifeState {
  id: string;
  chunkId: string;
  species: WildlifeSpecies;
  position: Vec2;
  ageDays: number;
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
  sex: 'female' | 'male';
  generation: number;
  traits: WildlifeTraits;
  currentAction: WildlifeAction;
  targetObjectId?: string;
  targetWildlifeId?: string;
  targetChunkId?: string;
  lastDecisionAt: number;
  birthDay: number;
  diseaseLoad?: number;
  motherId?: string;
  fatherId?: string;
  pregnantById?: string;
  pregnantUntilDay?: number;
  lastBirthDay?: number;
  /** Coarse population represented by this named fine individual after identity-preserving migration. */
  representedPopulation?: number;
}

export interface WildlifeMigrationCandidate {
  id: string;
  biome: ChunkBiome;
  distance: number;
  ecology: number;
  food: number;
  water: number;
  danger: number;
  settlementLevel: number;
  population: number;
  carryingCapacity: number;
  density: number;
  competitionPressure: number;
  seasonalSuitability: number;
  diseasePressure: number;
}

export interface WildlifeDecisionRequest {
  wildlife: WildlifeState;
  world: {
    gameTime: string;
    minuteOfDay: number;
    weather: string;
    currentHabitat: WildlifeMigrationCandidate;
    nearbyChunks: WildlifeMigrationCandidate[];
    nearbyResources: Array<{ id:string; tags:string[]; distance:number; resourceAmount?:number }>;
    nearbyWildlife: Array<{ id:string; species:WildlifeSpecies; sex:'female'|'male'; ageDays:number; distance:number; health:number; currentAction:WildlifeAction; mateAvailable:boolean }>;
  };
  allowedActions: WildlifeAction[];
}

export interface WildlifeDecisionResponse {
  source: string;
  action: WildlifeAction;
  targetObjectId?: string;
  targetWildlifeId?: string;
  targetChunkId?: string;
  confidence: number;
  reasonCode: string;
}

export interface WildlifeDecisionResult extends WildlifeDecisionResponse {
  wildlifeId: string;
}

export interface WildlifeDecisionBatchRequest {
  requests: WildlifeDecisionRequest[];
}

export interface WildlifeDecisionBatchResponse {
  source: string;
  decisions: WildlifeDecisionResult[];
}

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
  plants?: PlantBiomassState;
  trophicFlux?: TrophicFluxState;
  nicheCompetition?: WildlifeNicheCompetitionState;
  wildlifeDisease?: WildlifeDiseasePressureState;
  wildlife?: CoarseWildlifePopulation[];
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

export type RegionPriority =
  | 'balanced'
  | 'food_security'
  | 'trade_network'
  | 'settlement_growth'
  | 'ecology_recovery'
  | 'security_coordination';

export type RegionMovementPolicy = 'open' | 'stabilize' | 'redistribute' | 'restrict';
export type RegionEcologyPolicy = 'restore_corridors' | 'balanced_use' | 'protected_network' | 'productive_landscape';

export interface RegionState {
  id: string;
  rx: number;
  rz: number;
  chunkIds: string[];
  population: number;
  settlements: number;
  food: number;
  wood: number;
  water: number;
  ecology: number;
  danger: number;
  prosperity: number;
}

export interface RegionDecisionRequest {
  day: number;
  gameTime: string;
  weather: string;
  regions: RegionState[];
}

export interface RegionDecision {
  regionId: string;
  priority: RegionPriority;
  movementPolicy: RegionMovementPolicy;
  ecologyPolicy: RegionEcologyPolicy;
  confidence: number;
  reasonCode: string;
  source: string;
}

export interface RegionDecisionResponse {
  source: string;
  decisions: RegionDecision[];
}

export type WorldPriority = 'resilience' | 'prosperity' | 'expansion' | 'ecology' | 'security' | 'exploration';
export type WorldConnectivityPolicy = 'localism' | 'balanced_networks' | 'trade_corridors' | 'migration_corridors';
export type WorldGrowthPolicy = 'steady' | 'compact' | 'frontier' | 'conserve';

export interface WorldStrategicSummary {
  population: number;
  settlements: number;
  food: number;
  wood: number;
  water: number;
  ecology: number;
  danger: number;
  prosperity: number;
  activeRegions: number;
}

export interface WorldDecisionRequest {
  day: number;
  gameTime: string;
  weather: string;
  summary: WorldStrategicSummary;
  regions: RegionDecision[];
}

export interface WorldDecision {
  priority: WorldPriority;
  connectivity: WorldConnectivityPolicy;
  growth: WorldGrowthPolicy;
  confidence: number;
  reasonCode: string;
  source: string;
}

export interface WorldDecisionResponse {
  source: string;
  decision: WorldDecision;
}


export interface PersistedWildlifeTransfer {
  entityId: string;
  state: WildlifeState;
  fromChunkId: string;
  toChunkId: string;
  representedPopulation: number;
  transferredDay: number;
}

export interface PersistedFineChunk {
  chunkId: string;
  npcStates: NpcState[];
  objectStates: WorldObjectState[];
  wildlifeStates?: WildlifeState[];
}

export interface WorldPersistenceMeta {
  day: number;
  minuteOfDay: number;
  weather: string;
  playerPosition: Vec2;
  playerInventory: Record<ItemKind, number>;
}

export interface WorldPersistenceSnapshot {
  version: 1;
  meta: WorldPersistenceMeta;
  coarseChunks: CoarseChunkState[];
  fineChunks: PersistedFineChunk[];
  homeNpcs: NpcState[];
  homeObjects: WorldObjectState[];
  wildlifeLineage?: WildlifeLineageRecord[];
  wildlifeTransfers?: PersistedWildlifeTransfer[];
  savedAt?: number;
}
