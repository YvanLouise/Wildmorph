import { describe, expect, it } from 'vitest';
import { cloneGameConfig, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import type { GeneratedChunkData, WorldAssetConfig, WorldAssetSlotId, WorldImageBinding } from '../../src/game/types';
import { ChunkCache } from '../../src/game/world/ChunkCache';
import { ChunkManager } from '../../src/game/world/ChunkManager';
import { chunkKey, worldToChunk, worldToLocal } from '../../src/game/world/coordinates';
import { generateChunk, sampleEnvironment, terrainAtWorld } from '../../src/game/world/generateChunk';
import { generateWorldSeed, normalizeWorldSeed, parseWorldSeed } from '../../src/game/world/seed';

const seed = parseWorldSeed('TY-7K3F-29QX')!;
const config = DEFAULT_GAME_CONFIG.proceduralWorld;

describe('world seeds and coordinates', () => {
  it('normalizes, validates and parses a stable seed', () => {
    expect(normalizeWorldSeed('  ty-7k3f-29qx ')).toBe('TY-7K3F-29QX');
    expect(parseWorldSeed('ty-7k3f-29qx')).toEqual(seed);
    expect(parseWorldSeed('TY-I000-OOOO')).toBeUndefined();
  });

  it('creates a copy-friendly seed without ambiguous characters', () => {
    const generated = generateWorldSeed((values) => {
      values[0] = 0x12345678;
      values[1] = 0x90abcdef;
      return values;
    });
    expect(generated.text).toMatch(/^TY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('handles negative world coordinates with floor semantics', () => {
    expect(worldToChunk({ x: -1, y: -513 }, 512)).toEqual({ x: -1, y: -2 });
    expect(worldToLocal({ x: -1, y: -513 }, 512)).toEqual({ x: 511, y: 511 });
    expect(chunkKey({ x: -1, y: 2 })).toBe('-1,2');
  });
});

describe('deterministic chunk generation', () => {
  it('reproduces chunks independently of generation order', () => {
    const first = generateChunk(seed, config, { x: -3, y: 4 });
    generateChunk(seed, config, { x: 18, y: -21 });
    const second = generateChunk(seed, config, { x: -3, y: 4 });
    expect(second).toEqual(first);
  });

  it('changes the world for a different seed', () => {
    const other = parseWorldSeed('TY-8M4G-3R5W')!;
    expect(generateChunk(other, config, { x: 3, y: -2 }).fingerprint)
      .not.toBe(generateChunk(seed, config, { x: 3, y: -2 }).fingerprint);
  });

  it('keeps obstacles stable when decoration density changes', () => {
    const sparse = { ...config, decorationDensity: 0 };
    expect(generateChunk(seed, sparse, { x: 2, y: 2 }).obstacles)
      .toEqual(generateChunk(seed, config, { x: 2, y: 2 }).obstacles);
  });

  it('applies deterministic per-slot density without moving other generated content', () => {
    const baselineAssets = cloneGameConfig(DEFAULT_GAME_CONFIG).worldAssets;
    const disabledTrees: WorldAssetConfig = {
      slots: Object.fromEntries(Object.entries(baselineAssets.slots).map(([slot, binding]) => [
        slot,
        slot.startsWith('seeded.tree.') ? { ...binding, densityWeight: 0 } : binding,
      ])) as Record<WorldAssetSlotId, WorldImageBinding>,
    };
    const coord = { x: 3, y: -2 };
    const baseline = generateChunk(seed, config, coord, baselineAssets);
    const adjusted = generateChunk(seed, config, coord, disabledTrees);
    expect(adjusted.obstacles.filter(({ kind }) => kind === 'tree')).toHaveLength(0);
    expect(adjusted.obstacles.filter(({ kind }) => kind !== 'tree'))
      .toEqual(baseline.obstacles.filter(({ kind }) => kind !== 'tree'));
    expect(generateChunk(seed, config, coord, disabledTrees)).toEqual(adjusted);
  });

  it('uses slot collision dimensions without changing object identity or position', () => {
    const baselineAssets = cloneGameConfig(DEFAULT_GAME_CONFIG).worldAssets;
    const adjustedAssets: WorldAssetConfig = {
      slots: Object.fromEntries(Object.entries(baselineAssets.slots).map(([slot, binding]) => [
        slot,
        slot.startsWith('seeded.tree.')
          ? { ...binding, collider: { shape: 'rectangle', width: 10, height: 12 } }
          : binding,
      ])) as Record<WorldAssetSlotId, WorldImageBinding>,
    };
    const coord = { x: 3, y: -2 };
    const baseline = generateChunk(seed, config, coord, baselineAssets);
    const adjusted = generateChunk(seed, config, coord, adjustedAssets);
    const baselineTree = baseline.obstacles.find(({ kind }) => kind === 'tree');
    const adjustedTree = adjusted.obstacles.find(({ id }) => id === baselineTree?.id);
    expect(baselineTree).toBeDefined();
    expect(adjustedTree?.x).toBe(baselineTree?.x);
    expect(adjustedTree?.y).toBe(baselineTree?.y);
    expect(adjustedTree?.collider).toEqual({
      shape: 'rectangle',
      width: 10 * adjustedTree!.scale,
      height: 12 * adjustedTree!.scale,
    });
    expect(adjusted.fingerprint).toBe(baseline.fingerprint);
  });

  it('compacts a continuous water chunk into one render and collision rectangle', () => {
    const allWaterConfig = {
      ...config,
      spawn: { x: 1_000_000, y: 1_000_000 },
      waterThreshold: 1,
    };
    const chunk = generateChunk(seed, allWaterConfig, { x: 0, y: 0 });
    expect(chunk.terrain.every((terrain) => terrain === 'water')).toBe(true);
    expect(chunk.deepWater.every(Boolean)).toBe(true);
    expect(chunk.waterColliders).toEqual([{
      x: 256,
      y: 256,
      width: 512,
      height: 512,
    }]);
  });

  it('keeps the spawn clearing walkable and obstacle-free', () => {
    const chunks = [
      generateChunk(seed, config, { x: -1, y: -1 }),
      generateChunk(seed, config, { x: 0, y: -1 }),
      generateChunk(seed, config, { x: -1, y: 0 }),
      generateChunk(seed, config, { x: 0, y: 0 }),
    ];
    for (const chunk of chunks) {
      for (const obstacle of chunk.obstacles) {
        expect(Math.hypot(obstacle.x - config.spawn.x, obstacle.y - config.spawn.y))
          .toBeGreaterThanOrEqual(config.spawnClearRadius);
      }
    }
    for (let y = -32; y <= 544; y += 32) {
      for (let x = -32; x <= 544; x += 32) {
        if (Math.hypot(x - config.spawn.x, y - config.spawn.y) <= config.spawnClearRadius) {
          expect(terrainAtWorld(seed, config, x, y)).toBe('grass');
        }
      }
    }
  });

  it('samples smoothly across chunk boundaries and four-way intersections', () => {
    const samples = [
      [511.9, 220], [512.1, 220],
      [320, 511.9], [320, 512.1],
      [511.9, 511.9], [512.1, 512.1],
      [-0.1, -0.1], [0.1, 0.1],
    ] as const;
    for (let index = 0; index < samples.length; index += 2) {
      const a = sampleEnvironment(seed, samples[index][0], samples[index][1]);
      const b = sampleEnvironment(seed, samples[index + 1][0], samples[index + 1][1]);
      expect(Math.abs(a.height - b.height)).toBeLessThan(0.01);
      expect(Math.abs(a.moisture - b.moisture)).toBeLessThan(0.01);
    }
  });
});

describe('chunk lifecycle bounds', () => {
  it('evicts generated data with an LRU bound', () => {
    const cache = new ChunkCache(2);
    const chunks = [0, 1, 2].map((x) => generateChunk(seed, config, { x, y: 0 }));
    chunks.forEach((chunk) => cache.set(chunk));
    expect(cache.size).toBe(2);
    expect(cache.get(chunks[0].key)).toBeUndefined();
  });

  it('keeps active and cached chunks bounded during long travel', () => {
    const manager = new ChunkManager(seed, config);
    manager.initialize({ x: 0, y: 0 });
    for (let x = 1; x <= 18; x += 1) {
      manager.update({ x, y: x % 3 - 1 }, { x: 1, y: 0 });
      for (let index = 0; index < 30; index += 1) manager.processQueue();
      expect(manager.activeCount).toBeLessThanOrEqual((config.unloadRadius * 2 + 1) ** 2);
      expect(manager.cachedCount).toBeLessThanOrEqual(config.cacheSize);
    }
  });

  it('restores an evicted chunk with the same fingerprint', () => {
    const manager = new ChunkManager(seed, { ...config, cacheSize: 1 });
    const original = manager.initialize({ x: 0, y: 0 }).loaded.find(({ key }) => key === '0,0') as GeneratedChunkData;
    manager.update({ x: 8, y: 0 }, { x: 1, y: 0 });
    for (let index = 0; index < 40; index += 1) manager.processQueue();
    expect(generateChunk(seed, config, { x: 0, y: 0 }).fingerprint).toBe(original.fingerprint);
  });
});
