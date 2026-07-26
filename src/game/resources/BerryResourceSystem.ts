import type { SeededResourcesConfig } from './config';
import type {
  BerryBushRuntimeSnapshot,
  ChunkKey,
  GeneratedBerryBush,
  GeneratedChunkData,
  PlayerForagingSnapshot,
  PointDefinition,
  WildlifeEntitySnapshot,
  WildlifeGlobalConfig,
} from '../types';

interface StoredBerryState {
  remainingFood: number;
  emptiedAtMs?: number;
}

interface BerryWorldSessionState {
  elapsedMs: number;
  readonly berries: Map<string, StoredBerryState>;
}

export interface BerryForageTarget extends PointDefinition {
  readonly id: string;
  readonly interactionRadius: number;
}

export type BerryTargetAssignments = ReadonlyMap<string, BerryForageTarget>;

export interface BerryResourceUpdate {
  readonly playerFoodDelta: number;
  readonly foraging: PlayerForagingSnapshot;
}

const idleForaging = (): PlayerForagingSnapshot => ({
  active: false,
  berryId: null,
  remainingFood: 0,
  maxFood: 0,
  progress: 0,
});

const distance = (a: PointDefinition, b: PointDefinition): number => Math.hypot(a.x - b.x, a.y - b.y);

export class BerryWorldSessionRegistry {
  private readonly sessions = new Map<string, BerryWorldSessionState>();

  get(seed: string): BerryWorldSessionState {
    let session = this.sessions.get(seed);
    if (!session) {
      session = { elapsedMs: 0, berries: new Map() };
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

export const berryWorldSessions = new BerryWorldSessionRegistry();

export class BerryResourceSystem {
  private readonly active = new Map<string, GeneratedBerryBush>();
  private readonly activeByChunk = new Map<ChunkKey, Set<string>>();
  private readonly wildlifeConsumers = new Map<string, string>();
  private playerBerryId: string | null = null;

  constructor(
    private readonly config: Readonly<SeededResourcesConfig>,
    private readonly wildlifeConfig: Readonly<WildlifeGlobalConfig>,
    private readonly session: BerryWorldSessionState,
  ) {}

  mountChunk(chunk: Readonly<GeneratedChunkData>): void {
    const ids = this.activeByChunk.get(chunk.key) ?? new Set<string>();
    for (const berry of chunk.berryBushes) {
      this.active.set(berry.id, berry);
      ids.add(berry.id);
    }
    this.activeByChunk.set(chunk.key, ids);
  }

  unmountChunk(key: ChunkKey): void {
    for (const id of this.activeByChunk.get(key) ?? []) this.active.delete(id);
    this.activeByChunk.delete(key);
  }

  clearActive(): void {
    this.active.clear();
    this.activeByChunk.clear();
    this.wildlifeConsumers.clear();
    this.playerBerryId = null;
  }

  assignWildlifeTargets(animals: readonly Readonly<WildlifeEntitySnapshot>[]): BerryTargetAssignments {
    const candidates: { animal: WildlifeEntitySnapshot; berry: GeneratedBerryBush; distance: number }[] = [];
    for (const animal of animals) {
      const species = this.wildlifeConfig.species[animal.species];
      if (!species.enabled || !species.eatsBerries) continue;
      for (const berry of this.active.values()) {
        if (this.remainingFood(berry) <= 0) continue;
        const berryDistance = distance(animal, berry);
        if (berryDistance <= species.detectionRadius) candidates.push({ animal, berry, distance: berryDistance });
      }
    }
    candidates.sort((a, b) => (
      a.distance - b.distance
      || a.animal.id.localeCompare(b.animal.id)
      || a.berry.id.localeCompare(b.berry.id)
    ));
    const assignedAnimals = new Set<string>();
    const assignedBerries = new Set<string>();
    const assignments = new Map<string, BerryForageTarget>();
    for (const candidate of candidates) {
      if (assignedAnimals.has(candidate.animal.id) || assignedBerries.has(candidate.berry.id)) continue;
      assignedAnimals.add(candidate.animal.id);
      assignedBerries.add(candidate.berry.id);
      assignments.set(candidate.animal.id, {
        id: candidate.berry.id,
        x: candidate.berry.x,
        y: candidate.berry.y,
        interactionRadius: this.config.berryInteractionRadius,
      });
    }
    return assignments;
  }

  update(
    deltaMs: number,
    player: Readonly<PointDefinition>,
    playerFood: number,
    animals: readonly Readonly<WildlifeEntitySnapshot>[],
    playerCanForage = true,
  ): BerryResourceUpdate {
    const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.session.elapsedMs += safeDeltaMs;
    this.pruneRegrown();

    const playerBerry = playerCanForage && playerFood < 100
      ? [...this.active.values()]
        .filter((berry) => this.remainingFood(berry) > 0 && distance(player, berry) <= this.config.berryInteractionRadius)
        .sort((a, b) => distance(player, a) - distance(player, b) || a.id.localeCompare(b.id))[0]
      : undefined;
    const wildlifeConsumers = new Map<string, WildlifeEntitySnapshot>();
    for (const animal of animals) {
      if (animal.state !== 'eat-berry' || !animal.targetId) continue;
      const berry = this.active.get(animal.targetId);
      if (!berry || this.remainingFood(berry) <= 0) continue;
      if (distance(animal, berry) > this.config.berryInteractionRadius) continue;
      const current = wildlifeConsumers.get(berry.id);
      if (!current || distance(animal, berry) < distance(current, berry) || (
        distance(animal, berry) === distance(current, berry) && animal.id.localeCompare(current.id) < 0
      )) wildlifeConsumers.set(berry.id, animal);
    }
    this.wildlifeConsumers.clear();
    wildlifeConsumers.forEach((animal, berryId) => this.wildlifeConsumers.set(berryId, animal.id));
    this.playerBerryId = playerBerry?.id ?? null;

    let playerFoodDelta = 0;
    const deltaSeconds = safeDeltaMs / 1000;
    const affected = new Set<string>(wildlifeConsumers.keys());
    if (playerBerry) affected.add(playerBerry.id);
    for (const berryId of affected) {
      const berry = this.active.get(berryId);
      if (!berry) continue;
      const remaining = this.remainingFood(berry);
      if (remaining <= 0) continue;
      const playerRequest = playerBerry?.id === berryId
        ? Math.min(100 - playerFood - playerFoodDelta, berry.maxFood / this.config.playerConsumeSeconds * deltaSeconds)
        : 0;
      const wildlifeRequest = wildlifeConsumers.has(berryId)
        ? berry.maxFood / this.config.wildlifeConsumeSeconds * deltaSeconds
        : 0;
      const requested = Math.max(0, playerRequest) + wildlifeRequest;
      if (requested <= 0) continue;
      const scale = Math.min(1, remaining / requested);
      playerFoodDelta += Math.max(0, playerRequest) * scale;
      const nextRemaining = Math.max(0, remaining - requested * scale);
      this.session.berries.set(berry.id, nextRemaining <= 1e-6
        ? { remainingFood: 0, emptiedAtMs: this.session.elapsedMs }
        : { remainingFood: nextRemaining });
    }

    if (!playerBerry) return { playerFoodDelta, foraging: idleForaging() };
    const remainingFood = this.remainingFood(playerBerry);
    return {
      playerFoodDelta,
      foraging: remainingFood > 0 && playerFood + playerFoodDelta < 100
        ? {
            active: true,
            berryId: playerBerry.id,
            remainingFood,
            maxFood: playerBerry.maxFood,
            progress: Math.min(1, Math.max(0, 1 - remainingFood / playerBerry.maxFood)),
          }
        : idleForaging(),
    };
  }

  snapshots(): readonly BerryBushRuntimeSnapshot[] {
    return [...this.active.values()].map((berry) => this.snapshot(berry));
  }

  telemetry(
    playerInShallowWater: boolean,
    foraging: Readonly<PlayerForagingSnapshot>,
  ): Pick<import('../types').SeededResourceTelemetry, 'activeRipeBushes' | 'activeEmptyBushes' | 'modifiedBushes' | 'activeConsumers' | 'playerInShallowWater'> {
    const snapshots = this.snapshots();
    return {
      activeRipeBushes: snapshots.filter(({ state }) => state === 'ripe').length,
      activeEmptyBushes: snapshots.filter(({ state }) => state === 'empty').length,
      modifiedBushes: this.session.berries.size,
      activeConsumers: snapshots.filter(({ wildlifeConsumerId }) => wildlifeConsumerId !== null).length + (foraging.active ? 1 : 0),
      playerInShallowWater,
    };
  }

  private snapshot(berry: GeneratedBerryBush): BerryBushRuntimeSnapshot {
    const stored = this.currentState(berry);
    const remainingFood = stored?.remainingFood ?? berry.maxFood;
    return {
      ...berry,
      state: remainingFood > 0 ? 'ripe' : 'empty',
      remainingFood,
      regrowRemainingMs: remainingFood > 0 || stored?.emptiedAtMs === undefined
        ? 0
        : Math.max(0, stored.emptiedAtMs + this.config.berryRegrowSeconds * 1000 - this.session.elapsedMs),
      wildlifeConsumerId: this.wildlifeConsumers.get(berry.id) ?? null,
      playerConsuming: this.playerBerryId === berry.id,
    };
  }

  private remainingFood(berry: GeneratedBerryBush): number {
    return this.currentState(berry)?.remainingFood ?? berry.maxFood;
  }

  private currentState(berry: GeneratedBerryBush): StoredBerryState | undefined {
    const stored = this.session.berries.get(berry.id);
    if (
      stored?.remainingFood === 0
      && stored.emptiedAtMs !== undefined
      && this.session.elapsedMs - stored.emptiedAtMs >= this.config.berryRegrowSeconds * 1000
    ) {
      this.session.berries.delete(berry.id);
      return undefined;
    }
    return stored;
  }

  private pruneRegrown(): void {
    for (const [id, stored] of this.session.berries) {
      if (
        stored.remainingFood === 0
        && stored.emptiedAtMs !== undefined
        && this.session.elapsedMs - stored.emptiedAtMs >= this.config.berryRegrowSeconds * 1000
      ) this.session.berries.delete(id);
    }
  }
}
