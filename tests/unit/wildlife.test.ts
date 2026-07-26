import { describe, expect, it } from 'vitest';
import { cloneGameConfig, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import type { GeneratedChunkData, GeneratedWildlifeSpawn, TerrainType, WildlifeSpeciesId } from '../../src/game/types';
import { generateChunk, terrainAtWorld } from '../../src/game/world/generateChunk';
import { chunkKey } from '../../src/game/world/coordinates';
import { parseWorldSeed } from '../../src/game/world/seed';
import { NavigationField } from '../../src/game/wildlife/NavigationField';
import { WildlifeSystem, WILDLIFE_MAX_TURN_RADIANS_PER_SECOND } from '../../src/game/wildlife/WildlifeSystem';
import { generateWildlifeSpawns } from '../../src/game/wildlife/generateWildlife';
import { WILDLIFE_SPECIES_IDS } from '../../src/game/wildlife/config';

const seed = parseWorldSeed('TY-7K3F-29QX')!;
const world = DEFAULT_GAME_CONFIG.proceduralWorld;
const wildlifeBodySizes = Object.fromEntries(WILDLIFE_SPECIES_IDS.map((species) => [species, {
  width: DEFAULT_GAME_CONFIG.characterProfiles[species].bodyWidth,
  height: DEFAULT_GAME_CONFIG.characterProfiles[species].bodyHeight,
}])) as Record<WildlifeSpeciesId, { width: number; height: number }>;

function spawn(id: string, species: WildlifeSpeciesId, x: number, y: number, groupId = id, sizeScale = 1): GeneratedWildlifeSpawn {
  return { id, species, chunkKey: '0,0', groupId, x, y, homeX: x, homeY: y, sizeScale, priority: 0.2 };
}

function chunkWith(
  wildlifeSpawns: readonly GeneratedWildlifeSpawn[],
  terrain: TerrainType[] = Array.from({ length: world.chunkTiles ** 2 }, () => 'grass'),
  coord = { x: 0, y: 0 },
): GeneratedChunkData {
  const key = chunkKey(coord);
  return {
    key, coord, terrain,
    height: terrain.map(() => 0.5), moisture: terrain.map(() => 0.5),
    vegetation: terrain.map(() => 0.5), rockiness: terrain.map(() => 0.5),
    deepWater: terrain.map((value) => value === 'water'), obstacles: [], decorations: [], berryBushes: [], grassCandidates: [],
    wildlifeSpawns, waterColliders: [], fingerprint: 'wildlife-test',
  };
}

describe('deterministic wildlife generation', () => {
  it('reproduces stable wildlife and keeps every spawn on valid terrain', () => {
    const first = generateChunk(seed, world, { x: 3, y: -2 }, DEFAULT_GAME_CONFIG.worldAssets, DEFAULT_GAME_CONFIG.wildlife, wildlifeBodySizes);
    const second = generateChunk(seed, world, { x: 3, y: -2 }, DEFAULT_GAME_CONFIG.worldAssets, DEFAULT_GAME_CONFIG.wildlife, wildlifeBodySizes);
    expect(second.wildlifeSpawns).toEqual(first.wildlifeSpawns);
    for (const animal of first.wildlifeSpawns) {
      expect(animal.sizeScale).toBeGreaterThanOrEqual(0.85);
      expect(animal.sizeScale).toBeLessThanOrEqual(1.15);
      const body = wildlifeBodySizes[animal.species];
      for (const [offsetX, offsetY] of [
        [-body.width / 2, -body.height / 2], [body.width / 2, -body.height / 2],
        [-body.width / 2, body.height / 2], [body.width / 2, body.height / 2],
      ]) {
        expect(terrainAtWorld(seed, world, animal.x + offsetX * animal.sizeScale, animal.y + offsetY * animal.sizeScale)).not.toBe('water');
      }
      expect(terrainAtWorld(seed, world, animal.x, animal.y)).not.toBe('water');
      const clearRadius = animal.species === 'tiger'
        ? DEFAULT_GAME_CONFIG.wildlife.dangerSpawnClearRadius
        : DEFAULT_GAME_CONFIG.wildlife.spawnClearRadius;
      expect(Math.hypot(animal.x - world.spawn.x, animal.y - world.spawn.y)).toBeGreaterThanOrEqual(clearRadius);
    }
  });

  it('samples individual sizes deterministically without consuming the position stream', () => {
    const base = structuredClone(DEFAULT_GAME_CONFIG.wildlife);
    const species = Object.fromEntries(WILDLIFE_SPECIES_IDS.map((id) => [id, {
      ...base.species[id],
      enabled: id === 'white-rabbit',
      spawnChance: id === 'white-rabbit' ? 1 : 0,
      groupMin: id === 'white-rabbit' ? 4 : base.species[id].groupMin,
      groupMax: id === 'white-rabbit' ? 4 : base.species[id].groupMax,
      minSizeScale: id === 'white-rabbit' ? 0.6 : base.species[id].minSizeScale,
      maxSizeScale: id === 'white-rabbit' ? 1.4 : base.species[id].maxSizeScale,
    }])) as typeof base.species;
    const wildlife = { ...base, species };
    const fixedWildlife = {
      ...wildlife,
      species: {
        ...wildlife.species,
        'white-rabbit': { ...wildlife.species['white-rabbit'], minSizeScale: 1, maxSizeScale: 1 },
      },
    };
    const openWorld = { ...world, spawn: { x: -10_000, y: -10_000 } };
    const bodySizes = { 'white-rabbit': { width: 1, height: 1 } };
    const generate = (config: typeof wildlife) => generateWildlifeSpawns(
      seed, openWorld, config, { x: 4, y: 4 }, [], () => 'grass', bodySizes,
    );
    const first = generate(wildlife);
    const second = generate(wildlife);
    const fixed = generate(fixedWildlife);
    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(new Set(first.map(({ sizeScale }) => sizeScale)).size).toBeGreaterThan(1);
    expect(first.map(({ id, x, y }) => ({ id, x, y }))).toEqual(fixed.map(({ id, x, y }) => ({ id, x, y })));
    expect(fixed.every(({ sizeScale }) => sizeScale === 1)).toBe(true);
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
    const baseline = generateChunk(seed, world, { x: 4, y: 1 }, config.worldAssets, DEFAULT_GAME_CONFIG.wildlife, wildlifeBodySizes);
    const adjusted = generateChunk(seed, world, { x: 4, y: 1 }, config.worldAssets, wildlife, wildlifeBodySizes);
    expect(adjusted.obstacles).toEqual(baseline.obstacles);
    expect(adjusted.decorations).toEqual(baseline.decorations);
    expect(adjusted.wildlifeSpawns.some(({ species }) => species === 'white-rabbit')).toBe(false);
  });
});

describe('wildlife simulation and navigation', () => {
  it('lets configured foragers seek and eat assigned berries', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), decisionIntervalMs: 50 };
    const system = new WildlifeSystem(config, new NavigationField(world, config));
    system.mountChunk(chunkWith([spawn('rabbit-berry', 'white-rabbit', 220, 220)]));
    const assignments = new Map([
      ['rabbit-berry', { id: 'berry-1', x: 260, y: 220, interactionRadius: 72 }],
    ]);
    for (let index = 0; index < 8; index += 1) {
      system.update(50, { x: 510, y: 260 }, { berries: assignments, grass: new Map() });
    }
    expect(system.snapshots().find(({ id }) => id === 'rabbit-berry')).toMatchObject({
      state: 'eat-berry',
      targetId: 'berry-1',
    });
  });

  it('seeks grass after berries and interrupts grazing for threats', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), decisionIntervalMs: 50 };
    const system = new WildlifeSystem(config, new NavigationField(world, config));
    system.mountChunk(chunkWith([spawn('rabbit-grass', 'white-rabbit', 220, 220)]));
    const grass = new Map([
      ['rabbit-grass', { id: 'grass-1', x: 240, y: 220, interactionRadius: 56 }],
    ]);
    for (let index = 0; index < 8; index += 1) {
      system.update(50, { x: 510, y: 510 }, { berries: new Map(), grass });
    }
    expect(system.snapshots()[0]).toMatchObject({ state: 'eat-grass', targetId: 'grass-1' });

    const berries = new Map([
      ['rabbit-grass', { id: 'berry-1', x: 240, y: 220, interactionRadius: 72 }],
    ]);
    system.update(50, { x: 510, y: 510 }, { berries, grass });
    expect(system.snapshots()[0]).toMatchObject({ state: 'eat-berry', targetId: 'berry-1' });

    for (let index = 0; index < 10; index += 1) {
      system.update(50, { x: 225, y: 220 }, { berries: new Map(), grass });
    }
    expect(system.snapshots()[0].state).toMatch(/alert|flee/);
    expect(system.snapshots()[0].targetId).toBe('player');
  });

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
    for (let index = 0; index < 30; index += 1) system.update(50, { x: 300, y: 220 });
    expect(system.snapshots()[0]?.state).toBe('chase');
    expect(system.snapshots()[0]?.targetId).toBe('player');
  });

  it('waits for the configured reaction delay and exposes each species collision volume', () => {
    const baseConfig = structuredClone(DEFAULT_GAME_CONFIG.wildlife);
    const config = {
      ...baseConfig,
      decisionIntervalMs: 50,
      species: {
        ...baseConfig.species,
        'white-rabbit': {
          ...baseConfig.species['white-rabbit'],
          reactionDelayMs: 500,
          alertDurationMs: 0,
        },
      },
    };
    const bodies = { 'white-rabbit': { width: 24, height: 34 } };
    const navigation = new NavigationField(world, config, bodies);
    const system = new WildlifeSystem(config, navigation, bodies);
    system.mountChunk(chunkWith([spawn('rabbit-delay', 'white-rabbit', 220, 220, 'rabbit-delay', 1.5)]));
    for (let index = 0; index < 6; index += 1) system.update(50, { x: 180, y: 220 });
    expect(system.snapshots()[0]).toMatchObject({
      state: 'idle',
      targetId: 'player',
      sizeScale: 1.5,
      bodyWidth: 36,
      bodyHeight: 51,
    });
    expect(system.snapshots()[0]!.reactionRemainingMs).toBeGreaterThan(0);
    for (let index = 0; index < 8; index += 1) system.update(50, { x: 180, y: 220 });
    expect(system.snapshots()[0]?.state).toBe('flee');
    expect(system.snapshots()[0]?.reactionRemainingMs).toBe(0);
  });

  it('keeps a pursued animal alive after it leaves an unloaded home chunk', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), decisionIntervalMs: 50 };
    const navigation = new NavigationField(world, config);
    const system = new WildlifeSystem(config, navigation);
    const rabbit = spawn('rabbit-cross-chunk', 'white-rabbit', 500, 240);
    system.mountChunk(chunkWith([rabbit]));
    system.mountChunk(chunkWith([], undefined, { x: 1, y: 0 }));

    for (let index = 0; index < 36; index += 1) system.update(50, { x: 470, y: 240 });
    const escaped = system.snapshots().find(({ id }) => id === rabbit.id);
    expect(escaped?.x).toBeGreaterThan(world.tileSize * world.chunkTiles);

    system.unmountChunk('0,0');
    system.update(50, { x: escaped!.x - 80, y: escaped!.y });
    expect(system.snapshots().some(({ id }) => id === rabbit.id)).toBe(true);

    system.update(50, { x: 5000, y: 5000 });
    system.mountChunk(chunkWith([rabbit]));
    system.update(50, { x: 470, y: 240 });
    expect(system.snapshots().find(({ id }) => id === rabbit.id)).toMatchObject({ x: 500, y: 240 });
  });

  it('limits rapid direction reversals when an AI target crosses from side to side', () => {
    const config = { ...structuredClone(DEFAULT_GAME_CONFIG.wildlife), decisionIntervalMs: 50 };
    const system = new WildlifeSystem(config, new NavigationField(world, config));
    const tiger = spawn('tiger-steering', 'tiger', 220, 240);
    system.mountChunk(chunkWith([tiger]));

    for (let index = 0; index < 30; index += 1) system.update(50, { x: 430, y: 240 });
    expect(system.snapshots()[0]?.state).toBe('chase');

    const facings: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      system.update(50, { x: index % 2 === 0 ? 80 : 430, y: 240 });
      facings.push(system.snapshots()[0]!.facingRadians);
    }
    const maximumStep = WILDLIFE_MAX_TURN_RADIANS_PER_SECOND * 0.05 + 0.0001;
    for (let index = 1; index < facings.length; index += 1) {
      const delta = Math.abs(Math.atan2(
        Math.sin(facings[index] - facings[index - 1]),
        Math.cos(facings[index] - facings[index - 1]),
      ));
      expect(delta).toBeLessThanOrEqual(maximumStep);
    }
  });

  it('rejects positions where the animal collision volume overlaps water', () => {
    const terrain = Array.from({ length: world.chunkTiles ** 2 }, () => 'grass' as TerrainType);
    for (let row = 0; row < world.chunkTiles; row += 1) terrain[row * world.chunkTiles + 8] = 'water';
    const config = structuredClone(DEFAULT_GAME_CONFIG.wildlife);
    const navigation = new NavigationField(world, config, { 'white-rabbit': { width: 24, height: 34 } });
    navigation.addChunk(chunkWith([], terrain));
    expect(navigation.isWalkable({ x: 240, y: 220 }, 'white-rabbit')).toBe(true);
    expect(navigation.isWalkable({ x: 250, y: 220 }, 'white-rabbit')).toBe(false);
    expect(navigation.isWalkable({ x: 245, y: 220 }, 'white-rabbit', 0.5)).toBe(true);
    expect(navigation.isWalkable({ x: 245, y: 220 }, 'white-rabbit', 1.5)).toBe(false);
  });

  it('routes around a water barrier through the available gap', () => {
    const terrain = Array.from({ length: world.chunkTiles ** 2 }, () => 'grass' as TerrainType);
    for (let row = 0; row < world.chunkTiles; row += 1) {
      if (row < 6 || row > 10) terrain[row * world.chunkTiles + 8] = 'water';
    }
    const config = structuredClone(DEFAULT_GAME_CONFIG.wildlife);
    const navigation = new NavigationField(world, config);
    navigation.addChunk(chunkWith([], terrain));
    const path = navigation.findPath({ x: 120, y: 120 }, { x: 410, y: 120 }, 'white-rabbit');
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => navigation.isWalkable(point, 'white-rabbit'))).toBe(true);
    expect(path.at(-1)!.x).toBeGreaterThan(8 * world.tileSize);
  });
});
