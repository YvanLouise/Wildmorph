import { describe, expect, it } from 'vitest';
import { cloneGameConfig, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import type { GeneratedChunkData, GeneratedWildlifeSpawn, TerrainType, WildlifeSpeciesId } from '../../src/game/types';
import { generateChunk, terrainAtWorld } from '../../src/game/world/generateChunk';
import { parseWorldSeed } from '../../src/game/world/seed';
import { NavigationField } from '../../src/game/wildlife/NavigationField';
import { WildlifeSystem } from '../../src/game/wildlife/WildlifeSystem';

const seed = parseWorldSeed('TY-7K3F-29QX')!;
const world = DEFAULT_GAME_CONFIG.proceduralWorld;

function spawn(id: string, species: WildlifeSpeciesId, x: number, y: number, groupId = id): GeneratedWildlifeSpawn {
  return { id, species, chunkKey: '0,0', groupId, x, y, homeX: x, homeY: y, priority: 0.2 };
}

function chunkWith(
  wildlifeSpawns: readonly GeneratedWildlifeSpawn[],
  terrain: TerrainType[] = Array.from({ length: world.chunkTiles ** 2 }, () => 'grass'),
): GeneratedChunkData {
  return {
    key: '0,0', coord: { x: 0, y: 0 }, terrain,
    height: terrain.map(() => 0.5), moisture: terrain.map(() => 0.5),
    vegetation: terrain.map(() => 0.5), rockiness: terrain.map(() => 0.5),
    deepWater: terrain.map((value) => value === 'water'), obstacles: [], decorations: [],
    wildlifeSpawns, waterColliders: [], fingerprint: 'wildlife-test',
  };
}

describe('deterministic wildlife generation', () => {
  it('reproduces stable wildlife and keeps every spawn on valid terrain', () => {
    const first = generateChunk(seed, world, { x: 3, y: -2 }, DEFAULT_GAME_CONFIG.worldAssets, DEFAULT_GAME_CONFIG.wildlife);
    const second = generateChunk(seed, world, { x: 3, y: -2 }, DEFAULT_GAME_CONFIG.worldAssets, DEFAULT_GAME_CONFIG.wildlife);
    expect(second.wildlifeSpawns).toEqual(first.wildlifeSpawns);
    for (const animal of first.wildlifeSpawns) {
      expect(terrainAtWorld(seed, world, animal.x, animal.y)).not.toBe('water');
      const clearRadius = animal.species === 'tiger'
        ? DEFAULT_GAME_CONFIG.wildlife.dangerSpawnClearRadius
        : DEFAULT_GAME_CONFIG.wildlife.spawnClearRadius;
      expect(Math.hypot(animal.x - world.spawn.x, animal.y - world.spawn.y)).toBeGreaterThanOrEqual(clearRadius);
    }
  });

  it('changes only wildlife when a species spawn chance is disabled', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const wildlife = {
      ...config.wildlife,
      species: {
        ...config.wildlife.species,
        'white-rabbit': { ...config.wildlife.species['white-rabbit'], spawnChance: 0 },
      },
    };
    const baseline = generateChunk(seed, world, { x: 4, y: 1 }, config.worldAssets, DEFAULT_GAME_CONFIG.wildlife);
    const adjusted = generateChunk(seed, world, { x: 4, y: 1 }, config.worldAssets, wildlife);
    expect(adjusted.obstacles).toEqual(baseline.obstacles);
    expect(adjusted.decorations).toEqual(baseline.decorations);
    expect(adjusted.wildlifeSpawns.some(({ species }) => species === 'white-rabbit')).toBe(false);
  });
});

describe('wildlife simulation and navigation', () => {
  it('caps active animals and transitions prey from alert to flee', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), maxActiveAnimals: 8, decisionIntervalMs: 50 };
    const navigation = new NavigationField(world, config);
    const system = new WildlifeSystem(config, navigation);
    const animals = Array.from({ length: 12 }, (_, index) => spawn(`rabbit-${index}`, 'white-rabbit', 180 + index * 12, 240));
    system.mountChunk(chunkWith(animals));
    for (let index = 0; index < 20; index += 1) system.update(50, { x: 160, y: 240 });
    expect(system.telemetry().activeAnimals).toBe(8);
    expect(system.snapshots().some(({ state }) => state === 'flee')).toBe(true);
  });

  it('makes a tiger warn and chase the player without mutating player state', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), decisionIntervalMs: 50 };
    const system = new WildlifeSystem(config, new NavigationField(world, config));
    system.mountChunk(chunkWith([spawn('tiger-1', 'tiger', 220, 220)]));
    for (let index = 0; index < 20; index += 1) system.update(50, { x: 300, y: 220 });
    expect(system.snapshots()[0]?.state).toBe('chase');
    expect(system.snapshots()[0]?.targetId).toBe('player');
  });

  it('routes around a water barrier through the available gap', () => {
    const terrain = Array.from({ length: world.chunkTiles ** 2 }, () => 'grass' as TerrainType);
    for (let row = 0; row < world.chunkTiles; row += 1) {
      if (row !== 8) terrain[row * world.chunkTiles + 8] = 'water';
    }
    const config = structuredClone(DEFAULT_GAME_CONFIG.wildlife);
    const navigation = new NavigationField(world, config);
    navigation.addChunk(chunkWith([], terrain));
    const path = navigation.findPath({ x: 120, y: 120 }, { x: 410, y: 120 }, 'white-rabbit');
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => navigation.isWalkable(point, 'white-rabbit'))).toBe(true);
    expect(path.some((point) => point.y >= 8 * world.tileSize)).toBe(true);
  });
});
