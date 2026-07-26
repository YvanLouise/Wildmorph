import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import {
  BerryResourceSystem,
  BerryWorldSessionRegistry,
} from '../../src/game/resources/BerryResourceSystem';
import { DEFAULT_SEEDED_RESOURCES_CONFIG } from '../../src/game/resources/config';
import type { GeneratedChunkData, WildlifeEntitySnapshot } from '../../src/game/types';
import { generateChunk } from '../../src/game/world/generateChunk';
import { parseWorldSeed } from '../../src/game/world/seed';

const seed = parseWorldSeed('TY-ABCD-EFGH')!;

const resourceConfig = {
  ...DEFAULT_SEEDED_RESOURCES_CONFIG,
  berryMinPerChunk: 2,
  berryMaxPerChunk: 2,
};

function chunk(): GeneratedChunkData {
  return generateChunk(
    seed,
    DEFAULT_GAME_CONFIG.proceduralWorld,
    { x: 0, y: 0 },
    DEFAULT_GAME_CONFIG.worldAssets,
    DEFAULT_GAME_CONFIG.wildlife,
    {},
    resourceConfig,
  );
}

function rabbit(targetId: string, x: number, y: number): WildlifeEntitySnapshot {
  return {
    id: 'rabbit:test',
    species: 'white-rabbit',
    state: 'eat-berry',
    groupId: 'rabbit:group',
    homeChunkKey: '0,0',
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX: 0,
    velocityY: 0,
    facingRadians: 0,
    sizeScale: 1,
    bodyWidth: 24,
    bodyHeight: 34,
    reactionRemainingMs: 0,
    targetId,
    path: [],
  };
}

describe('seeded berry resources', () => {
  it('generates stable bushes and yields without changing other generated streams', () => {
    const first = chunk();
    const second = chunk();
    expect(first.berryBushes).toEqual(second.berryBushes);
    expect(first.berryBushes).toHaveLength(2);
    expect(first.berryBushes.every(({ maxFood }) => maxFood >= 7 && maxFood <= 15)).toBe(true);

    const noBerries = generateChunk(
      seed,
      DEFAULT_GAME_CONFIG.proceduralWorld,
      { x: 0, y: 0 },
      DEFAULT_GAME_CONFIG.worldAssets,
      DEFAULT_GAME_CONFIG.wildlife,
      {},
      { ...resourceConfig, berryMinPerChunk: 0, berryMaxPerChunk: 0 },
    );
    expect(noBerries.obstacles).toEqual(first.obstacles);
    expect(noBerries.decorations).toEqual(first.decorations);
    expect(noBerries.wildlifeSpawns).toEqual(first.wildlifeSpawns);
  });

  it('keeps partial food, combines player and one AI rates, and regrows while unloaded', () => {
    const data = chunk();
    const berry = data.berryBushes[0];
    const registry = new BerryWorldSessionRegistry();
    const system = new BerryResourceSystem(resourceConfig, DEFAULT_GAME_CONFIG.wildlife, registry.get(seed.text));
    system.mountChunk(data);

    const half = system.update(2500, berry, 0, []);
    expect(half.playerFoodDelta).toBeCloseTo(berry.maxFood / 2, 5);
    expect(system.snapshots().find(({ id }) => id === berry.id)?.remainingFood).toBeCloseTo(berry.maxFood / 2, 5);

    const shared = system.update(1000, berry, 0, [rabbit(berry.id, berry.x, berry.y)]);
    expect(shared.playerFoodDelta).toBeCloseTo(berry.maxFood / 5, 5);
    expect(system.snapshots().find(({ id }) => id === berry.id)?.remainingFood).toBeCloseTo(berry.maxFood / 5, 5);

    system.update(1000, berry, 0, [rabbit(berry.id, berry.x, berry.y)]);
    expect(system.snapshots().find(({ id }) => id === berry.id)?.state).toBe('empty');

    system.unmountChunk(data.key);
    system.update(resourceConfig.berryRegrowSeconds * 1000, { x: 9999, y: 9999 }, 100, []);
    system.mountChunk(data);
    const regrown = system.snapshots().find(({ id }) => id === berry.id);
    expect(regrown?.state).toBe('ripe');
    expect(regrown?.remainingFood).toBe(berry.maxFood);
  });

  it('allows player foraging only while the player is stationary', () => {
    const data = chunk();
    const berry = data.berryBushes[0];
    const registry = new BerryWorldSessionRegistry();
    const system = new BerryResourceSystem(resourceConfig, DEFAULT_GAME_CONFIG.wildlife, registry.get(seed.text));
    system.mountChunk(data);

    const moving = system.update(1000, berry, 0, [], false);
    expect(moving.playerFoodDelta).toBe(0);
    expect(moving.foraging.active).toBe(false);
    expect(system.snapshots().find(({ id }) => id === berry.id)?.remainingFood).toBe(berry.maxFood);

    const stationary = system.update(1000, berry, 0, [], true);
    expect(stationary.playerFoodDelta).toBeGreaterThan(0);
    expect(stationary.foraging.active).toBe(true);
    expect(system.snapshots().find(({ id }) => id === berry.id)?.remainingFood).toBeLessThan(berry.maxFood);
  });

  it('assigns each bush to at most one eligible AI and excludes predators', () => {
    const data = chunk();
    const berry = data.berryBushes[0];
    const registry = new BerryWorldSessionRegistry();
    const system = new BerryResourceSystem(resourceConfig, DEFAULT_GAME_CONFIG.wildlife, registry.get(seed.text));
    system.mountChunk(data);
    const nearRabbit = rabbit('', berry.x + 5, berry.y);
    const farRabbit = { ...rabbit('', berry.x + 12, berry.y), id: 'rabbit:far' };
    const tiger = { ...rabbit('', berry.x + 2, berry.y), id: 'tiger:test', species: 'tiger' as const };
    const assignments = system.assignWildlifeTargets([farRabbit, tiger, nearRabbit]);
    expect(assignments.get(nearRabbit.id)?.id).toBe(berry.id);
    expect(new Set([...assignments.values()].map(({ id }) => id)).size).toBe(assignments.size);
    expect(assignments.has(tiger.id)).toBe(false);
  });
});
