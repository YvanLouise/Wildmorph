import type {
  ChunkCoord,
  ChunkKey,
  GeneratedChunkData,
  ProceduralWorldConfig,
  TouchVector,
  WorldSeed,
  WorldAssetConfig,
  WildlifeGlobalConfig,
  WildlifeBodySize,
  WildlifeSpeciesId,
} from '../types';
import { chebyshevDistance, chunkKey, coordsInRadius } from './coordinates';
import { ChunkCache } from './ChunkCache';
import { generateChunk } from './generateChunk';
import type { CameraWorldViewBounds } from '../camera/view';
import type { SeededResourcesConfig } from '../resources/config';

export interface ChunkDelta {
  readonly loaded: readonly GeneratedChunkData[];
  readonly unloaded: readonly ChunkKey[];
}

const MAX_ACTIVE_CHUNKS = 49;

function coordsCoveringView(
  bounds: CameraWorldViewBounds,
  chunkSize: number,
  marginChunks = 1,
): ChunkCoord[] {
  const minX = Math.floor(bounds.left / chunkSize) - marginChunks;
  const maxX = Math.ceil(bounds.right / chunkSize) - 1 + marginChunks;
  const minY = Math.floor(bounds.top / chunkSize) - marginChunks;
  const maxY = Math.ceil(bounds.bottom / chunkSize) - 1 + marginChunks;
  const result: ChunkCoord[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) result.push({ x, y });
  }
  return result;
}

export class ChunkManager {
  private seed: WorldSeed;
  private readonly cache: ChunkCache;
  private readonly active = new Map<ChunkKey, GeneratedChunkData>();
  private queue: ChunkCoord[] = [];
  private queued = new Set<ChunkKey>();
  private center: ChunkCoord = { x: Number.NaN, y: Number.NaN };
  private lastGenerationDuration = 0;
  private generationEpoch = 0;
  private desiredSignature = '';

  constructor(
    seed: WorldSeed,
    private readonly config: ProceduralWorldConfig,
    private readonly worldAssets?: WorldAssetConfig,
    private readonly wildlife?: WildlifeGlobalConfig,
    private readonly wildlifeBodySizes?: Readonly<Partial<Record<WildlifeSpeciesId, WildlifeBodySize>>>,
    private readonly resourceConfig?: SeededResourcesConfig,
  ) {
    this.seed = seed;
    this.cache = new ChunkCache(config.cacheSize);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get cachedCount(): number {
    return this.cache.size;
  }

  get lastGenerationMs(): number {
    return this.lastGenerationDuration;
  }

  initialize(center: ChunkCoord): ChunkDelta {
    this.center = { ...center };
    const loaded = this.prioritize(coordsInRadius(center, this.config.loadRadius), { x: 0, y: 0 })
      .map((coord) => this.obtain(coord));
    loaded.forEach((chunk) => this.active.set(chunk.key, chunk));
    return { loaded, unloaded: [] };
  }

  update(center: ChunkCoord, heading: TouchVector, viewBounds?: CameraWorldViewBounds): ChunkDelta {
    const unloaded: ChunkKey[] = [];
    const centerChanged = center.x !== this.center.x || center.y !== this.center.y;
    this.center = { ...center };
    const desiredByKey = new Map<ChunkKey, ChunkCoord>();
    coordsInRadius(center, this.config.loadRadius).forEach((coord) => desiredByKey.set(chunkKey(coord), coord));
    if (viewBounds) {
      coordsCoveringView(viewBounds, this.config.tileSize * this.config.chunkTiles)
        .forEach((coord) => desiredByKey.set(chunkKey(coord), coord));
    }
    const desired = this.prioritize([...desiredByKey.values()], heading).slice(0, MAX_ACTIVE_CHUNKS);
    const desiredKeys = new Set(desired.map(chunkKey));
    const signature = [...desiredKeys].sort().join('|');
    if (!centerChanged && signature === this.desiredSignature) {
      return { loaded: [], unloaded };
    }
    this.desiredSignature = signature;

    this.queue = this.queue.filter((coord) => desiredKeys.has(chunkKey(coord)));
    this.queued = new Set(this.queue.map(chunkKey));

    for (const [key, chunk] of this.active) {
      if (chebyshevDistance(chunk.coord, center) > this.config.unloadRadius) {
        this.active.delete(key);
        this.cache.set(chunk);
        unloaded.push(key);
      }
    }

    const missing = desired
      .filter((coord) => {
        const key = chunkKey(coord);
        return !this.active.has(key) && !this.queued.has(key);
      });
    for (const coord of this.prioritize(missing, heading)) {
      this.queue.push(coord);
      this.queued.add(chunkKey(coord));
    }
    return { loaded: [], unloaded };
  }

  processQueue(): readonly GeneratedChunkData[] {
    const loaded: GeneratedChunkData[] = [];
    const started = performance.now();
    const epoch = this.generationEpoch;
    while (this.queue.length > 0 && (loaded.length === 0 || performance.now() - started < this.config.generationBudgetMs)) {
      const coord = this.queue.shift()!;
      const key = chunkKey(coord);
      this.queued.delete(key);
      if (chebyshevDistance(coord, this.center) > this.config.unloadRadius) continue;
      const chunk = this.obtain(coord);
      if (epoch !== this.generationEpoch) break;
      this.active.set(key, chunk);
      loaded.push(chunk);
    }
    return loaded;
  }

  reset(seed: WorldSeed): ChunkDelta {
    const unloaded = [...this.active.keys()];
    this.generationEpoch += 1;
    this.seed = seed;
    this.active.clear();
    this.cache.clear();
    this.queue = [];
    this.queued.clear();
    this.center = { x: Number.NaN, y: Number.NaN };
    this.desiredSignature = '';
    return { loaded: [], unloaded };
  }

  refresh(): ChunkDelta {
    const center = { ...this.center };
    const unloaded = [...this.active.keys()];
    this.generationEpoch += 1;
    this.active.clear();
    this.cache.clear();
    this.queue = [];
    this.queued.clear();
    this.center = { x: Number.NaN, y: Number.NaN };
    this.desiredSignature = '';
    const initialized = this.initialize(center);
    return { loaded: initialized.loaded, unloaded };
  }

  getChunk(coord: ChunkCoord): GeneratedChunkData | undefined {
    const key = chunkKey(coord);
    return this.active.get(key) ?? this.cache.get(key);
  }

  destroy(): readonly ChunkKey[] {
    const keys = [...this.active.keys()];
    this.active.clear();
    this.cache.clear();
    this.queue = [];
    this.queued.clear();
    this.generationEpoch += 1;
    this.desiredSignature = '';
    return keys;
  }

  private obtain(coord: ChunkCoord): GeneratedChunkData {
    const key = chunkKey(coord);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const started = performance.now();
    const generated = generateChunk(
      this.seed,
      this.config,
      coord,
      this.worldAssets,
      this.wildlife,
      this.wildlifeBodySizes,
      this.resourceConfig,
    );
    this.lastGenerationDuration = performance.now() - started;
    return generated;
  }

  private prioritize(coords: readonly ChunkCoord[], heading: TouchVector): ChunkCoord[] {
    return [...coords].sort((a, b) => {
      const aForward = (a.x - this.center.x) * heading.x + (a.y - this.center.y) * heading.y;
      const bForward = (b.x - this.center.x) * heading.x + (b.y - this.center.y) * heading.y;
      if (aForward !== bForward) return bForward - aForward;
      const aDistance = chebyshevDistance(a, this.center);
      const bDistance = chebyshevDistance(b, this.center);
      return aDistance - bDistance || a.y - b.y || a.x - b.x;
    });
  }
}
