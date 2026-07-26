import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import {
  GrassResourceSystem,
  GrassWorldSessionRegistry,
} from '../../src/game/resources/GrassResourceSystem';
import type {
  GeneratedChunkData,
  GeneratedGrassPatch,
  WildlifeBehaviorState,
  WildlifeEntitySnapshot,
  WildlifeSpeciesId,
} from '../../src/game/types';
import { generateChunk, terrainAtWorld } from '../../src/game/world/generateChunk';
import { hashText32, parseWorldSeed } from '../../src/game/world/seed';

const seedText = 'TY-GRAS-TEST';
const seed = parseWorldSeed(seedText)!;

function grass(id: string, x: number, y: number): GeneratedGrassPatch {
  return { id, chunkKey: '0,0', x, y, scale: 1, rotation: 0 };
}

function chunk(grassCandidates: readonly GeneratedGrassPatch[]): GeneratedChunkData {
  const count = DEFAULT_GAME_CONFIG.proceduralWorld.chunkTiles ** 2;
  return {
    key: '0,0',
    coord: { x: 0, y: 0 },
    terrain: Array.from({ length: count }, () => 'grass'),
    height: Array.from({ length: count }, () => 0.5),
    moisture: Array.from({ length: count }, () => 0.5),
    vegetation: Array.from({ length: count }, () => 0.5),
    rockiness: Array.from({ length: count }, () => 0.5),
    deepWater: Array.from({ length: count }, () => false),
    obstacles: [],
    decorations: [],
    berryBushes: [],
    grassCandidates,
    wildlifeSpawns: [],
    waterColliders: [],
    fingerprint: 'grass-test',
  };
}

function animal(
  id: string,
  species: WildlifeSpeciesId,
  x: number,
  y: number,
  state: WildlifeBehaviorState = 'idle',
  targetId: string | null = null,
): WildlifeEntitySnapshot {
  return {
    id,
    species,
    state,
    groupId: id,
    homeChunkKey: '0,0',
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX: 0,
    velocityY: 0,
    facingRadians: 0,
    sizeScale: 1,
    bodyWidth: 20,
    bodyHeight: 20,
    reactionRemainingMs: 0,
    targetId,
    path: [],
  };
}

function createSystem(overrides: Partial<typeof DEFAULT_GAME_CONFIG.seededResources> = {}) {
  const config = {
    ...DEFAULT_GAME_CONFIG.seededResources,
    grassMaxPerChunk: 2,
    grassSeekChance: 1,
    grassConsumeSeconds: 2,
    grassRefreshSeconds: 2,
    grassInteractionRadius: 56,
    grassMaxConsumersPerPatch: 3,
    ...overrides,
  };
  const registry = new GrassWorldSessionRegistry();
  return {
    config,
    registry,
    system: new GrassResourceSystem(seedText, config, DEFAULT_GAME_CONFIG.wildlife, registry.get(seedText)),
  };
}

describe('grass candidate generation', () => {
  it('is deterministic and respects terrain, spacing, obstacles, berries, and the spawn clearing', () => {
    const first = generateChunk(
      seed,
      DEFAULT_GAME_CONFIG.proceduralWorld,
      { x: 1, y: 1 },
      DEFAULT_GAME_CONFIG.worldAssets,
      DEFAULT_GAME_CONFIG.wildlife,
      {},
      DEFAULT_GAME_CONFIG.seededResources,
    );
    const second = generateChunk(
      seed,
      DEFAULT_GAME_CONFIG.proceduralWorld,
      { x: 1, y: 1 },
      DEFAULT_GAME_CONFIG.worldAssets,
      DEFAULT_GAME_CONFIG.wildlife,
      {},
      DEFAULT_GAME_CONFIG.seededResources,
    );
    expect(first.grassCandidates).toEqual(second.grassCandidates);
    expect(first.grassCandidates.length).toBeGreaterThan(0);
    expect(first.grassCandidates.length).toBeLessThanOrEqual(48);
    expect(first.decorations.some(({ kind }) => kind === 'grass')).toBe(false);
    first.grassCandidates.forEach((candidate, index) => {
      expect(['grass', 'wet-grass']).toContain(terrainAtWorld(
        seed,
        DEFAULT_GAME_CONFIG.proceduralWorld,
        candidate.x,
        candidate.y,
      ));
      expect(Math.hypot(
        candidate.x - DEFAULT_GAME_CONFIG.proceduralWorld.spawn.x,
        candidate.y - DEFAULT_GAME_CONFIG.proceduralWorld.spawn.y,
      )).toBeGreaterThanOrEqual(DEFAULT_GAME_CONFIG.proceduralWorld.spawnClearRadius);
      expect(first.obstacles.every((obstacle) => Math.hypot(obstacle.x - candidate.x, obstacle.y - candidate.y) >= 42)).toBe(true);
      expect(first.berryBushes.every((berry) => Math.hypot(berry.x - candidate.x, berry.y - candidate.y) >= 96)).toBe(true);
      expect(first.grassCandidates.slice(0, index).every((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 48)).toBe(true);
    });
  });
});

describe('GrassResourceSystem', () => {
  it('activates no more than the configured chunk cap and selects only grass-eating species', () => {
    const { system } = createSystem();
    system.mountChunk(chunk([
      grass('g0', 100, 100), grass('g1', 160, 100), grass('g2', 220, 100),
    ]));
    expect(system.snapshots().map(({ id }) => id)).toEqual(['g0', 'g1']);
    const assignments = system.assignWildlifeTargets([
      animal('rabbit', 'white-rabbit', 110, 100),
      animal('deer', 'sika-deer', 110, 100),
      animal('pig', 'pig', 110, 100),
    ], new Map());
    expect([...assignments.keys()].sort()).toEqual(['deer', 'rabbit']);
  });

  it('keeps the 35% selection stable for an epoch and gives berries priority', () => {
    const { system } = createSystem({
      grassMaxPerChunk: 32,
      grassSeekChance: 0.35,
      grassMaxConsumersPerPatch: 8,
    });
    const candidates = Array.from({ length: 32 }, (_, index) => grass(`g${index}`, 100, 100));
    system.mountChunk(chunk(candidates));
    const animals = Array.from({ length: 100 }, (_, index) => animal(`rabbit-${index}`, 'white-rabbit', 100, 100));
    const expected = animals.filter(({ id }) => (
      hashText32(`${seedText}:${id}:0:grass`) / 0x100000000 < 0.35
    )).map(({ id }) => id).sort();
    const first = [...system.assignWildlifeTargets(animals, new Map()).keys()].sort();
    const second = [...system.assignWildlifeTargets(animals, new Map()).keys()].sort();
    expect(first).toEqual(expected);
    expect(second).toEqual(first);

    const berries = new Map([[first[0], { id: 'berry', x: 100, y: 100, interactionRadius: 72 }]]);
    expect(system.assignWildlifeTargets(animals, berries).has(first[0])).toBe(false);
  });

  it('caps each patch at three consumers while preserving valid targets', () => {
    const { system } = createSystem({ grassMaxPerChunk: 1 });
    system.mountChunk(chunk([grass('g0', 100, 100)]));
    const animals = Array.from({ length: 5 }, (_, index) => animal(`rabbit-${index}`, 'white-rabbit', 100, 100));
    const first = system.assignWildlifeTargets(animals, new Map());
    const second = system.assignWildlifeTargets([...animals].reverse(), new Map());
    expect(first.size).toBe(3);
    expect([...second.keys()].sort()).toEqual([...first.keys()].sort());
  });

  it('uses one shared timer, pauses it without consumers, and preserves progress through interruption', () => {
    const { system } = createSystem();
    system.mountChunk(chunk([grass('g0', 100, 100)]));
    system.update(500, [animal('rabbit-1', 'white-rabbit', 100, 100, 'eat-grass', 'g0')]);
    expect(system.snapshots()[0].grazingProgress).toBeCloseTo(0.25);
    system.update(500, []);
    expect(system.snapshots()[0].grazingProgress).toBeCloseTo(0.25);
    system.update(500, [
      animal('rabbit-1', 'white-rabbit', 100, 100, 'eat-grass', 'g0'),
      animal('rabbit-2', 'white-rabbit', 100, 100, 'eat-grass', 'g0'),
    ]);
    expect(system.snapshots()[0].grazingProgress).toBeCloseTo(0.5);
    system.update(500, [animal('rabbit-1', 'white-rabbit', 100, 100, 'flee', 'player')]);
    expect(system.snapshots()[0].grazingProgress).toBeCloseTo(0.5);
    system.update(1000, [animal('rabbit-1', 'white-rabbit', 100, 100, 'eat-grass', 'g0')]);
    expect(system.snapshots()).toHaveLength(0);
  });

  it('refreshes a consumed patch at a new candidate and catches up after unload', () => {
    const { system } = createSystem();
    const data = chunk([grass('g0', 100, 100), grass('g1', 160, 100), grass('g2', 220, 100)]);
    system.mountChunk(data);
    system.update(2000, [animal('rabbit', 'white-rabbit', 100, 100, 'eat-grass', 'g0')]);
    expect(system.snapshots().map(({ id }) => id)).toEqual(['g1']);
    system.unmountChunk('0,0');
    system.update(4000, []);
    system.mountChunk(data);
    expect(system.snapshots().map(({ id }) => id).sort()).toEqual(['g1', 'g2']);
    expect(system.telemetry().grassRefreshes).toBe(3);
  });
});
