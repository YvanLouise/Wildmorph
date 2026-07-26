import type { GameConfig } from './config/GameConfig';

export type GamePhase = 'title' | 'playing' | 'paused' | 'resetting';

export type InputAction = 'move-up' | 'move-down' | 'move-left' | 'move-right' | 'pause';

export type InputMode = 'keyboard' | 'touch';

export type WorldMode = 'fixed' | 'seeded';

export interface WorldSeed {
  readonly text: string;
  readonly low: number;
  readonly high: number;
}

export interface WorldLaunchRequest {
  readonly mode: WorldMode;
  readonly seed?: string;
}

export interface TouchVector {
  readonly x: number;
  readonly y: number;
}

export interface TouchInputSnapshot {
  readonly active: boolean;
  readonly sprinting: boolean;
  readonly vector: TouchVector;
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ViewportState {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'landscape' | 'portrait';
  readonly inputMode: InputMode;
  readonly safeArea: SafeAreaInsets;
  readonly baseCameraZoom: number;
}

export interface PlayerState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly facingRadians: number;
  readonly moving: boolean;
}

export type SurvivalStat = 'health' | 'food' | 'water' | 'stamina';

export interface SurvivalState {
  readonly health: number;
  readonly food: number;
  readonly water: number;
  readonly stamina: number;
}

export type DayNightPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface DayNightLighting {
  readonly color: string;
  readonly opacity: number;
}

export interface DayNightState {
  readonly elapsedSeconds: number;
  readonly phase: DayNightPhase;
  readonly phaseProgress: number;
  readonly cycleProgress: number;
  readonly clockMinutes: number;
  readonly clockText: string;
  readonly lighting: DayNightLighting;
}

export type ColliderDefinition =
  | {
      readonly shape: 'rectangle';
      readonly width: number;
      readonly height: number;
      readonly offsetX?: number;
      readonly offsetY?: number;
    }
  | {
      readonly shape: 'circle';
      readonly radius: number;
      readonly offsetX?: number;
      readonly offsetY?: number;
    };

export type ObstacleKind =
  | 'tree'
  | 'ancient-tree'
  | 'rock'
  | 'white-rock'
  | 'fallen-log'
  | 'water';

export type WorldAssetSlotId =
  | 'fixed.tree'
  | 'fixed.ancient-tree'
  | 'fixed.rock'
  | 'fixed.white-rock'
  | 'fixed.fallen-log'
  | `seeded.tree.${0 | 1 | 2 | 3}`
  | `seeded.rock.${0 | 1 | 2 | 3}`
  | `seeded.pebble.${0 | 1 | 2 | 3 | 4}`
  | 'seeded.log'
  | `seeded.resource.${'berry-ripe' | 'berry-empty'}`
  | `seeded.decoration.${'grass' | 'bush' | 'flower' | 'leaf' | 'reed'}`;

export type WorldAssetCategory =
  | 'trees'
  | 'rocks'
  | 'wood'
  | 'vegetation'
  | 'terrain'
  | 'landmarks'
  | 'food'
  | 'remains'
  | 'uploaded';

export interface WorldImageBinding {
  readonly sourceId: string;
  readonly sizeMode: 'width' | 'height';
  readonly displaySize: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly canopyCutRatio?: number;
  /** Slot-level collision baseline. Decorative slots intentionally omit it. */
  readonly collider?: ColliderDefinition;
  /** Seeded-world spawn multiplier. 0 disables this slot; 1 is the baseline. */
  readonly densityWeight?: number;
}

export interface WorldAssetConfig {
  readonly slots: Readonly<Record<WorldAssetSlotId, WorldImageBinding>>;
}

export interface ObstacleDefinition {
  readonly id: string;
  readonly kind: ObstacleKind;
  readonly x: number;
  readonly y: number;
  readonly collider: ColliderDefinition;
  readonly visualScale?: number;
  readonly rotation?: number;
  readonly collisionOnly?: boolean;
  readonly assetOverride?: WorldImageBinding;
}

export interface PointDefinition {
  readonly x: number;
  readonly y: number;
}

export interface ChunkCoord {
  readonly x: number;
  readonly y: number;
}

export type ChunkKey = `${number},${number}`;

export type TerrainType = 'grass' | 'wet-grass' | 'mud' | 'water';

export type WildlifeSpeciesId =
  | 'white-rabbit'
  | 'sika-deer'
  | 'pig'
  | 'raccoon'
  | 'red-fox'
  | 'tiger';

export type WildlifeRole = 'prey' | 'forager' | 'mesopredator' | 'predator';

export type WildlifeBehaviorState =
  | 'idle'
  | 'wander'
  | 'forage'
  | 'seek-berry'
  | 'eat-berry'
  | 'seek-grass'
  | 'eat-grass'
  | 'alert'
  | 'flee'
  | 'stalk'
  | 'chase'
  | 'return'
  | 'rest';

export interface WildlifeSpeciesConfig {
  readonly enabled: boolean;
  readonly eatsBerries: boolean;
  readonly eatsGrass: boolean;
  readonly role: WildlifeRole;
  readonly spawnChance: number;
  readonly groupMin: number;
  readonly groupMax: number;
  readonly minSizeScale: number;
  readonly maxSizeScale: number;
  readonly preferredTerrains: readonly TerrainType[];
  readonly walkSpeed: number;
  readonly fleeSpeed: number;
  readonly chaseSpeed: number;
  readonly detectionRadius: number;
  readonly giveUpRadius: number;
  readonly territoryRadius: number;
  readonly reactionDelayMs: number;
  readonly alertDurationMs: number;
  readonly chaseDurationMs: number;
  readonly restDurationMs: number;
  readonly cooldownMs: number;
}

export interface WildlifeGlobalConfig {
  readonly maxActiveAnimals: number;
  readonly activationRadius: number;
  readonly sleepRadius: number;
  readonly simulationStepMs: number;
  readonly decisionIntervalMs: number;
  readonly pathSearchRadiusTiles: number;
  readonly maxPathNodes: number;
  readonly pathSearchesPerStep: number;
  readonly pathBudgetMs: number;
  readonly spawnClearRadius: number;
  readonly dangerSpawnClearRadius: number;
  readonly species: Readonly<Record<WildlifeSpeciesId, WildlifeSpeciesConfig>>;
}

export type GeneratedObstacleKind = 'tree' | 'rock' | 'fallen-log';

export type GeneratedDecorationKind = 'grass' | 'bush' | 'flower' | 'leaf' | 'reed' | 'pebble';

export interface GeneratedObstacle {
  readonly id: string;
  readonly kind: GeneratedObstacleKind;
  readonly x: number;
  readonly y: number;
  readonly variant: number;
  readonly scale: number;
  readonly rotation: number;
  readonly collider: ColliderDefinition;
}

export interface GeneratedDecoration {
  readonly id: string;
  readonly kind: GeneratedDecorationKind;
  readonly x: number;
  readonly y: number;
  readonly variant: number;
  readonly scale: number;
  readonly rotation: number;
}

export type BerryBushState = 'ripe' | 'empty';

export interface GeneratedBerryBush {
  readonly id: string;
  readonly chunkKey: ChunkKey;
  readonly x: number;
  readonly y: number;
  readonly maxFood: number;
}

export interface GeneratedGrassPatch {
  readonly id: string;
  readonly chunkKey: ChunkKey;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
}

export interface GrassPatchRuntimeSnapshot extends GeneratedGrassPatch {
  readonly grazingProgress: number;
  readonly consumerIds: readonly string[];
}

export interface BerryBushRuntimeSnapshot extends GeneratedBerryBush {
  readonly state: BerryBushState;
  readonly remainingFood: number;
  readonly regrowRemainingMs: number;
  readonly wildlifeConsumerId: string | null;
  readonly playerConsuming: boolean;
}

export interface PlayerForagingSnapshot {
  readonly active: boolean;
  readonly berryId: string | null;
  readonly remainingFood: number;
  readonly maxFood: number;
  readonly progress: number;
}

export interface GeneratedWildlifeSpawn {
  readonly id: string;
  readonly species: WildlifeSpeciesId;
  readonly chunkKey: ChunkKey;
  readonly groupId: string;
  readonly x: number;
  readonly y: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly sizeScale: number;
  readonly priority: number;
}

export interface WildlifeEntitySnapshot {
  readonly id: string;
  readonly species: WildlifeSpeciesId;
  readonly state: WildlifeBehaviorState;
  readonly groupId: string;
  readonly homeChunkKey: ChunkKey;
  readonly x: number;
  readonly y: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly facingRadians: number;
  readonly sizeScale: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly reactionRemainingMs: number;
  readonly targetId: string | 'player' | null;
  readonly path: readonly PointDefinition[];
}

export interface WildlifeBodySize {
  readonly width: number;
  readonly height: number;
}

export interface WildlifeTelemetry {
  readonly activeAnimals: number;
  readonly sleepingAnimals: number;
  readonly pathSearches: number;
  readonly lastSimulationMs: number;
  readonly bySpecies: Readonly<Partial<Record<WildlifeSpeciesId, number>>>;
  readonly byState: Readonly<Partial<Record<WildlifeBehaviorState, number>>>;
}

export interface WaterColliderRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GeneratedChunkData {
  readonly key: ChunkKey;
  readonly coord: ChunkCoord;
  readonly terrain: readonly TerrainType[];
  readonly height: readonly number[];
  readonly moisture: readonly number[];
  readonly vegetation: readonly number[];
  readonly rockiness: readonly number[];
  readonly deepWater: readonly boolean[];
  readonly obstacles: readonly GeneratedObstacle[];
  readonly decorations: readonly GeneratedDecoration[];
  readonly berryBushes: readonly GeneratedBerryBush[];
  readonly grassCandidates: readonly GeneratedGrassPatch[];
  readonly wildlifeSpawns: readonly GeneratedWildlifeSpawn[];
  readonly waterColliders: readonly WaterColliderRun[];
  readonly fingerprint: string;
}

export interface ProceduralWorldConfig {
  readonly generationVersion: 'worldgen-v1';
  readonly configVersion: 'procedural-v1';
  readonly tileSize: number;
  readonly chunkTiles: number;
  readonly loadRadius: number;
  readonly unloadRadius: number;
  readonly cacheSize: number;
  readonly generationBudgetMs: number;
  readonly spawn: PointDefinition;
  readonly spawnClearRadius: number;
  readonly waterThreshold: number;
  readonly wetThreshold: number;
  readonly mudThreshold: number;
  readonly mudHeightLimit: number;
  readonly treeDensity: number;
  readonly rockDensity: number;
  readonly logDensity: number;
  readonly decorationDensity: number;
}

export interface WorldLayout {
  readonly width: number;
  readonly height: number;
  readonly spawn: PointDefinition;
  readonly spawnClearRadius: number;
  readonly pondCenter: PointDefinition;
  readonly pondPolygon: readonly PointDefinition[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly teleportPoints: readonly PointDefinition[];
}

export interface RuntimeTelemetry {
  readonly fps: number;
  readonly cameraZoom: number;
  readonly cameraViewIndex: number;
  readonly cameraHalfWidthWorld: number;
  readonly cameraHalfWidthBodyMultiplier: number;
  readonly cameraWorldWidth: number;
  readonly cameraWorldHeight: number;
}

export interface WorldGenerationTelemetry {
  readonly mode: WorldMode;
  readonly seed: string | null;
  readonly generationVersion: string | null;
  readonly chunk: ChunkCoord | null;
  readonly activeChunks: number;
  readonly cachedChunks: number;
  readonly lastGenerationMs: number;
  readonly objectCount: number;
  readonly colliderCount: number;
  readonly resources: SeededResourceTelemetry;
  readonly wildlife: WildlifeTelemetry;
}

export interface SeededResourceTelemetry {
  readonly activeRipeBushes: number;
  readonly activeEmptyBushes: number;
  readonly modifiedBushes: number;
  readonly activeConsumers: number;
  readonly activeGrassPatches: number;
  readonly grazingGrassPatches: number;
  readonly grassConsumers: number;
  readonly grassRefreshes: number;
  readonly playerInShallowWater: boolean;
}

export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly player: PlayerState;
  readonly survival: SurvivalState;
  readonly dayNight: DayNightState;
  readonly foraging: PlayerForagingSnapshot;
  readonly runtime: RuntimeTelemetry;
  readonly world: WorldGenerationTelemetry;
}

export interface TuyeDebugApi {
  getSnapshot(): Readonly<GameSnapshot>;
  getConfig(): Readonly<GameConfig>;
  teleport(index: number): void;
  resetPlayer(): void;
  setViewRange(multiplier: number): void;
  getChunkFingerprint(x: number, y: number): string | undefined;
  getChunkData(x: number, y: number): Readonly<GeneratedChunkData> | undefined;
  teleportToWorld(x: number, y: number): void;
  teleportToChunk(x: number, y: number): void;
  refreshWorld(): void;
  getWildlifeSnapshots(): readonly Readonly<WildlifeEntitySnapshot>[];
  getBerrySnapshots(): readonly Readonly<BerryBushRuntimeSnapshot>[];
  teleportToBerry(id: string): void;
  getGrassSnapshots(): readonly Readonly<GrassPatchRuntimeSnapshot>[];
  teleportToGrass(id: string): void;
  setSurvival(update: Partial<SurvivalState>): void;
  teleportToWildlife(id: string): void;
}

declare global {
  interface Window {
    __TUYE_DEBUG__?: TuyeDebugApi;
  }
}
