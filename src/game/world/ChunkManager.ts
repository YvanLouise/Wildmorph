import type {
  ChunkCoord,
  ChunkKey,
  GeneratedChunkData,
  ProceduralWorldConfig,
  TouchVector,
  WorldSeed,
  WorldAssetConfig,
  WildlifeGlobalConfig,
} from '../types';
import { chebyshevDistance, chunkKey, coordsInRadius } from './coordinates';
import { ChunkCache } from './ChunkCache';
import { generateChunk } from './generateChunk';

export interface ChunkDelta {
  readonly loaded: readonly GeneratedChunkData[];
  readonly unloaded: readonly ChunkKey[];
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

  constructor(
    seed: WorldSeed,
    private readonly config: ProceduralWorldConfig,
    private readonly worldAssets?: WorldAssetConfig,
    private readonly wildlife?: WildlifeGlobalConfig,
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

  update(center: ChunkCoord, heading: TouchVector): ChunkDelta {
    const unloaded: ChunkKey[] = [];
    if (center.x === this.center.x && center.y === this.center.y) {
      return { loaded: [], unloaded };
    }
    this.center = { ...center };

    for (const [key, chunk] of this.active) {
      if (chebyshevDistance(chunk.coord, center) > this.config.unloadRadius) {
        this.active.delete(key);
        this.cache.set(chunk);
        unloaded.push(key);
      }
    }

    const missing = coordsInRadius(center, this.config.loadRadius)
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
    return keys;
  }

  private obtain(coord: ChunkCoord): GeneratedChunkData {
    const key = chunkKey(coord);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const started = performance.now();
    const generated = generateChunk(this.seed, this.config, coord, this.worldAssets, this.wildlife);
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
