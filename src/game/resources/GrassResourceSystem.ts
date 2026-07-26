import type { BerryTargetAssignments } from './BerryResourceSystem';
import type { SeededResourcesConfig } from './config';
import type {
  ChunkKey,
  GeneratedChunkData,
  GeneratedGrassPatch,
  GrassPatchRuntimeSnapshot,
  PointDefinition,
  WildlifeEntitySnapshot,
  WildlifeGlobalConfig,
} from '../types';
import { hashText32 } from '../world/seed';

interface GrassChunkSessionState {
  readonly activeIds: Set<string>;
  nextCandidateIndex: number;
  lastRefreshEpoch: number;
  recentlyConsumedId: string | null;
}

interface GrassWorldSessionState {
  elapsedMs: number;
  refreshes: number;
  readonly progressMs: Map<string, number>;
  readonly chunks: Map<ChunkKey, GrassChunkSessionState>;
}

export interface GrassForageTarget extends PointDefinition {
  readonly id: string;
  readonly interactionRadius: number;
}

export type GrassTargetAssignments = ReadonlyMap<string, GrassForageTarget>;

const distance = (a: PointDefinition, b: PointDefinition): number => Math.hypot(a.x - b.x, a.y - b.y);

export class GrassWorldSessionRegistry {
  private readonly sessions = new Map<string, GrassWorldSessionState>();

  get(seed: string): GrassWorldSessionState {
    let session = this.sessions.get(seed);
    if (!session) {
      session = { elapsedMs: 0, refreshes: 0, progressMs: new Map(), chunks: new Map() };
      this.sessions.set(seed, session);
    }
    return session;
  }

  reset(seed: string): void {
    this.sessions.delete(seed);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export const grassWorldSessions = new GrassWorldSessionRegistry();

export class GrassResourceSystem {
  private readonly active = new Map<string, GeneratedGrassPatch>();
  private readonly candidatesByChunk = new Map<ChunkKey, readonly GeneratedGrassPatch[]>();
  private readonly targetByAnimal = new Map<string, string>();
  private readonly consumersByGrass = new Map<string, readonly string[]>();

  constructor(
    private readonly seed: string,
    private readonly config: Readonly<SeededResourcesConfig>,
    private readonly wildlifeConfig: Readonly<WildlifeGlobalConfig>,
    private readonly session: GrassWorldSessionState,
  ) {}

  mountChunk(chunk: Readonly<GeneratedChunkData>): void {
    this.candidatesByChunk.set(chunk.key, chunk.grassCandidates);
    let state = this.session.chunks.get(chunk.key);
    if (!state) {
      const activeIds = new Set(chunk.grassCandidates
        .slice(0, this.config.grassMaxPerChunk)
        .map(({ id }) => id));
      state = {
        activeIds,
        nextCandidateIndex: activeIds.size,
        lastRefreshEpoch: this.refreshEpoch(),
        recentlyConsumedId: null,
      };
      this.session.chunks.set(chunk.key, state);
    }
    this.normalizeChunkState(chunk.key, state);
    this.refreshChunk(chunk.key, state, this.refreshEpoch());
    this.syncMountedChunk(chunk.key, state);
  }

  unmountChunk(key: ChunkKey): void {
    const candidates = this.candidatesByChunk.get(key) ?? [];
    const ids = new Set(candidates.map(({ id }) => id));
    ids.forEach((id) => this.active.delete(id));
    for (const [animalId, grassId] of this.targetByAnimal) {
      if (ids.has(grassId)) this.targetByAnimal.delete(animalId);
    }
    this.candidatesByChunk.delete(key);
  }

  clearActive(): void {
    this.active.clear();
    this.candidatesByChunk.clear();
    this.targetByAnimal.clear();
    this.consumersByGrass.clear();
  }

  assignWildlifeTargets(
    animals: readonly Readonly<WildlifeEntitySnapshot>[],
    berryAssignments: BerryTargetAssignments,
  ): GrassTargetAssignments {
    const epoch = this.refreshEpoch();
    const eligible = animals.filter((animal) => {
      const species = this.wildlifeConfig.species[animal.species];
      if (!species.enabled || !species.eatsGrass || berryAssignments.has(animal.id)) return false;
      if (['alert', 'flee', 'stalk', 'chase'].includes(animal.state)) return false;
      const interest = hashText32(`${this.seed}:${animal.id}:${epoch}:grass`) / 0x100000000;
      return interest < this.config.grassSeekChance;
    });
    const eligibleIds = new Set(eligible.map(({ id }) => id));
    const assignments = new Map<string, GrassForageTarget>();
    const counts = new Map<string, number>();

    for (const animal of eligible) {
      const grassId = this.targetByAnimal.get(animal.id);
      const grass = grassId ? this.active.get(grassId) : undefined;
      const species = this.wildlifeConfig.species[animal.species];
      if (!grass || distance(animal, grass) > species.detectionRadius) continue;
      const count = counts.get(grass.id) ?? 0;
      if (count >= this.config.grassMaxConsumersPerPatch) continue;
      assignments.set(animal.id, this.target(grass));
      counts.set(grass.id, count + 1);
    }

    const candidates = eligible.flatMap((animal) => {
      if (assignments.has(animal.id)) return [];
      const radius = this.wildlifeConfig.species[animal.species].detectionRadius;
      return [...this.active.values()].flatMap((grass) => {
        const grassDistance = distance(animal, grass);
        return grassDistance <= radius ? [{ animal, grass, distance: grassDistance }] : [];
      });
    }).sort((a, b) => (
      a.distance - b.distance
      || a.animal.id.localeCompare(b.animal.id)
      || a.grass.id.localeCompare(b.grass.id)
    ));

    for (const candidate of candidates) {
      if (assignments.has(candidate.animal.id)) continue;
      const count = counts.get(candidate.grass.id) ?? 0;
      if (count >= this.config.grassMaxConsumersPerPatch) continue;
      assignments.set(candidate.animal.id, this.target(candidate.grass));
      counts.set(candidate.grass.id, count + 1);
    }

    this.targetByAnimal.clear();
    assignments.forEach((target, animalId) => this.targetByAnimal.set(animalId, target.id));
    for (const animalId of [...this.targetByAnimal.keys()]) {
      if (!eligibleIds.has(animalId)) this.targetByAnimal.delete(animalId);
    }
    return assignments;
  }

  update(
    deltaMs: number,
    animals: readonly Readonly<WildlifeEntitySnapshot>[],
  ): void {
    const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.session.elapsedMs += safeDeltaMs;
    const epoch = this.refreshEpoch();
    this.session.refreshes = Math.max(this.session.refreshes, epoch);
    for (const [key, candidates] of this.candidatesByChunk) {
      const state = this.session.chunks.get(key);
      if (!state) continue;
      this.refreshChunk(key, state, epoch);
      this.syncMountedChunk(key, state);
      if (candidates.length === 0) continue;
    }

    const consumers = new Map<string, string[]>();
    for (const animal of animals) {
      if (animal.state !== 'eat-grass' || !animal.targetId) continue;
      const grass = this.active.get(animal.targetId);
      if (!grass || distance(animal, grass) > this.config.grassInteractionRadius) continue;
      const ids = consumers.get(grass.id) ?? [];
      if (ids.length < this.config.grassMaxConsumersPerPatch) ids.push(animal.id);
      consumers.set(grass.id, ids);
    }
    this.consumersByGrass.clear();
    consumers.forEach((ids, grassId) => this.consumersByGrass.set(grassId, ids.sort()));

    const consumed: string[] = [];
    for (const grassId of consumers.keys()) {
      const next = (this.session.progressMs.get(grassId) ?? 0) + safeDeltaMs;
      if (next + 1e-6 >= this.config.grassConsumeSeconds * 1000) consumed.push(grassId);
      else this.session.progressMs.set(grassId, next);
    }
    consumed.forEach((id) => this.consume(id));
  }

  snapshots(): readonly Readonly<GrassPatchRuntimeSnapshot>[] {
    const consumeMs = this.config.grassConsumeSeconds * 1000;
    return [...this.active.values()]
      .map((grass) => ({
        ...grass,
        grazingProgress: Math.min(1, (this.session.progressMs.get(grass.id) ?? 0) / consumeMs),
        consumerIds: [...(this.consumersByGrass.get(grass.id) ?? [])],
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  telemetry(): Pick<import('../types').SeededResourceTelemetry, 'activeGrassPatches' | 'grazingGrassPatches' | 'grassConsumers' | 'grassRefreshes'> {
    const snapshots = this.snapshots();
    return {
      activeGrassPatches: snapshots.length,
      grazingGrassPatches: snapshots.filter(({ consumerIds }) => consumerIds.length > 0).length,
      grassConsumers: snapshots.reduce((sum, { consumerIds }) => sum + consumerIds.length, 0),
      grassRefreshes: this.session.refreshes,
    };
  }

  private target(grass: GeneratedGrassPatch): GrassForageTarget {
    return { id: grass.id, x: grass.x, y: grass.y, interactionRadius: this.config.grassInteractionRadius };
  }

  private refreshEpoch(): number {
    return Math.floor(this.session.elapsedMs / (this.config.grassRefreshSeconds * 1000));
  }

  private normalizeChunkState(key: ChunkKey, state: GrassChunkSessionState): void {
    const candidates = this.candidatesByChunk.get(key) ?? [];
    const validIds = new Set(candidates.map(({ id }) => id));
    for (const id of [...state.activeIds]) if (!validIds.has(id)) state.activeIds.delete(id);
    const overflow = state.activeIds.size - this.config.grassMaxPerChunk;
    if (overflow > 0) [...state.activeIds].sort().slice(-overflow).forEach((id) => state.activeIds.delete(id));
  }

  private refreshChunk(key: ChunkKey, state: GrassChunkSessionState, epoch: number): void {
    if (epoch <= state.lastRefreshEpoch) return;
    state.lastRefreshEpoch = epoch;
    const candidates = this.candidatesByChunk.get(key) ?? [];
    const targetCount = Math.min(this.config.grassMaxPerChunk, candidates.length);
    let attempts = 0;
    while (state.activeIds.size < targetCount && attempts < candidates.length * 2) {
      const candidate = candidates[state.nextCandidateIndex % candidates.length];
      state.nextCandidateIndex += 1;
      attempts += 1;
      if (!candidate || state.activeIds.has(candidate.id)) continue;
      if (candidate.id === state.recentlyConsumedId && attempts <= candidates.length) continue;
      state.activeIds.add(candidate.id);
    }
    state.recentlyConsumedId = null;
  }

  private syncMountedChunk(key: ChunkKey, state: GrassChunkSessionState): void {
    const candidates = this.candidatesByChunk.get(key) ?? [];
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    for (const candidate of candidates) {
      if (!state.activeIds.has(candidate.id)) this.active.delete(candidate.id);
    }
    for (const id of state.activeIds) {
      const candidate = byId.get(id);
      if (candidate) this.active.set(id, candidate);
    }
  }

  private consume(id: string): void {
    const grass = this.active.get(id);
    if (!grass) return;
    const state = this.session.chunks.get(grass.chunkKey);
    state?.activeIds.delete(id);
    if (state) state.recentlyConsumedId = id;
    this.active.delete(id);
    this.session.progressMs.delete(id);
    this.consumersByGrass.delete(id);
    for (const [animalId, grassId] of this.targetByAnimal) {
      if (grassId === id) this.targetByAnimal.delete(animalId);
    }
  }
}
