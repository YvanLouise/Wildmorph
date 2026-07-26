import { describe, expect, it } from 'vitest';
import {
  applyGameConfigOverrides,
  BASE_GAME_CONFIG,
  cloneGameConfig,
  createDefaultGameConfigOverrides,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
} from '../../src/game/config/GameConfig';
import { CHARACTER_IDS } from '../../src/game/config/characterProfiles';

describe('GameConfig', () => {
  it('stores only tuned differences and reconstructs the full default config', () => {
    const source = cloneGameConfig(BASE_GAME_CONFIG);
    const tuned = {
      ...source,
      player: { ...source.player, moveSpeed: 235 },
      camera: { ...source.camera, viewHalfWidthBodyMultipliers: [14, 9, 6.5] as const },
      dayNight: { ...source.dayNight, nightDarkness: 0.61 },
    };

    const overrides = createDefaultGameConfigOverrides(tuned);

    expect(overrides).toEqual({
      player: { moveSpeed: 235 },
      camera: { viewHalfWidthBodyMultipliers: [14, 9, 6.5] },
      dayNight: { nightDarkness: 0.61 },
    });
    expect(applyGameConfigOverrides(BASE_GAME_CONFIG, overrides)).toEqual(tuned);
  });

  it('reconstructs override-only fields when a collider changes shape', () => {
    const overrides = {
      worldAssets: {
        slots: {
          'fixed.white-rock': {
            collider: { shape: 'rectangle', width: 111, height: 66 },
          },
        },
      },
    } as const;
    expect(applyGameConfigOverrides(BASE_GAME_CONFIG, overrides).worldAssets.slots['fixed.white-rock'].collider)
      .toMatchObject({ shape: 'rectangle', width: 111, height: 66 });
  });

  it('ships a valid default configuration', () => {
    expect(validateGameConfig(DEFAULT_GAME_CONFIG)).toEqual({ errors: [], warnings: [] });
    expect(BASE_GAME_CONFIG.survival).toEqual({
      foodDrainAmount: 1,
      foodDrainIntervalSeconds: 3,
      waterDrainAmount: 1,
      waterDrainIntervalSeconds: 2,
      sprintConsumptionMultiplier: 1.5,
      staminaDrainPerSecond: 10,
      staminaRecoveryDelaySeconds: 3,
      staminaRecoveryPerSecond: 5,
      staminaStationaryRecoveryDelaySeconds: 3,
      staminaStationaryRecoveryPerSecond: 20,
      starvationDamagePerSecond: 1,
      dehydrationDamagePerSecond: 2,
    });
    expect(BASE_GAME_CONFIG.dayNight).toEqual({
      dawnDurationMinutes: 0.75,
      dayDurationMinutes: 3,
      duskDurationMinutes: 0.75,
      nightDurationMinutes: 3,
      nightDarkness: 0.52,
    });
    expect(BASE_GAME_CONFIG.seededResources).toEqual({
      berryMinPerChunk: 0,
      berryMaxPerChunk: 2,
      berryMinFood: 7,
      berryMaxFood: 15,
      playerConsumeSeconds: 5,
      wildlifeConsumeSeconds: 10,
      berryRegrowSeconds: 45,
      berryInteractionRadius: 72,
      shallowWaterRecoveryPerSecond: 7,
      grassMaxPerChunk: 12,
      grassSeekChance: 0.35,
      grassConsumeSeconds: 15,
      grassRefreshSeconds: 30,
      grassInteractionRadius: 56,
      grassMaxConsumersPerPatch: 3,
    });
  });

  it('contains a complete set of independent animal profiles', () => {
    expect(Object.keys(DEFAULT_GAME_CONFIG.characterProfiles)).toEqual([...CHARACTER_IDS]);
    expect(BASE_GAME_CONFIG.characterProfiles['yellow-fox']).toMatchObject({
      displayName: '黄狐狸',
      visualSize: 64,
      bodyWidth: 28,
      bodyHeight: 32,
    });
    const clone = cloneGameConfig(DEFAULT_GAME_CONFIG);
    expect(clone.characterProfiles.penguin).not.toBe(DEFAULT_GAME_CONFIG.characterProfiles.penguin);
    expect(clone.characterProfiles.raccoon.displayName).toBe('浣熊');
  });

  it('rejects duplicate obstacle ids and spawn-clearance violations', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const duplicate = {
      ...config.world.obstacles[0],
      x: config.world.spawn.x,
      y: config.world.spawn.y,
    };
    const result = validateGameConfig({
      ...config,
      world: {
        ...config.world,
        obstacles: [...config.world.obstacles, duplicate],
      },
    });
    expect(result.errors.some(({ message }) => message.includes('重复'))).toBe(true);
    expect(result.errors.some(({ message }) => message.includes('出生安全区域'))).toBe(true);
  });

  it('validates obstacle bounds and spawn clearance at the moved collider position', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const obstacle = config.world.obstacles[0];
    const result = validateGameConfig({
      ...config,
      world: {
        ...config.world,
        obstacles: config.world.obstacles.map((candidate) => candidate.id === obstacle.id
          ? {
              ...candidate,
              collider: {
                ...candidate.collider,
                offsetX: config.world.spawn.x - candidate.x,
                offsetY: config.world.spawn.y - candidate.y,
              },
            }
          : candidate),
      },
    });
    expect(result.errors.some(({ path, message }) => (
      path.startsWith('world.obstacles.') && message.includes('出生安全区域')
    ))).toBe(true);
  });

  it('rejects self-intersecting pond polygons', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      world: {
        ...config.world,
        pondPolygon: [
          { x: 100, y: 100 },
          { x: 300, y: 300 },
          { x: 100, y: 300 },
          { x: 300, y: 100 },
        ],
      },
    });
    expect(result.errors).toContainEqual({
      path: 'world.pondPolygon',
      message: '池塘多边形不能自相交',
    });
  });

  it('validates core tuning ranges and ordered view ranges', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      player: { ...config.player, moveSpeed: 0 },
      camera: { ...config.camera, viewHalfWidthBodyMultipliers: [10, 15, 7.5] },
    });
    expect(result.errors.some(({ path }) => path === 'player.moveSpeed')).toBe(true);
    expect(result.errors.some(({ path }) => path === 'camera.viewHalfWidthBodyMultipliers')).toBe(true);
  });

  it('validates survival tuning ranges', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      survival: {
        ...config.survival,
        foodDrainIntervalSeconds: 0,
        sprintConsumptionMultiplier: 6,
        staminaRecoveryDelaySeconds: -1,
        staminaStationaryRecoveryDelaySeconds: -1,
        staminaStationaryRecoveryPerSecond: 101,
        dehydrationDamagePerSecond: -1,
      },
    });
    expect(result.errors.map(({ path }) => path)).toEqual(expect.arrayContaining([
      'survival.foodDrainIntervalSeconds',
      'survival.sprintConsumptionMultiplier',
      'survival.staminaRecoveryDelaySeconds',
      'survival.staminaStationaryRecoveryDelaySeconds',
      'survival.staminaStationaryRecoveryPerSecond',
      'survival.dehydrationDamagePerSecond',
    ]));
  });

  it('validates day and night timing and darkness ranges', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      dayNight: {
        ...config.dayNight,
        dawnDurationMinutes: 0,
        nightDurationMinutes: 121,
        nightDarkness: 0.8,
      },
    });
    expect(result.errors.map(({ path }) => path)).toEqual(expect.arrayContaining([
      'dayNight.dawnDurationMinutes',
      'dayNight.nightDurationMinutes',
      'dayNight.nightDarkness',
    ]));
  });

  it('validates seeded resource ranges and ordered berry intervals', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      seededResources: {
        ...config.seededResources,
        berryMinPerChunk: 3,
        berryMaxPerChunk: 2,
        berryMinFood: 16,
        berryMaxFood: 15,
        berryRegrowSeconds: 0,
        grassMaxPerChunk: 33,
        grassSeekChance: 1.1,
        grassMaxConsumersPerPatch: 0,
      },
    });
    expect(result.errors.map(({ path }) => path)).toEqual(expect.arrayContaining([
      'seededResources.berryMaxPerChunk',
      'seededResources.berryMaxFood',
      'seededResources.berryRegrowSeconds',
      'seededResources.grassMaxPerChunk',
      'seededResources.grassSeekChance',
      'seededResources.grassMaxConsumersPerPatch',
    ]));
  });

  it('enables grass diets only for rabbits and sika deer by default', () => {
    expect(BASE_GAME_CONFIG.wildlife.species['white-rabbit'].eatsGrass).toBe(true);
    expect(BASE_GAME_CONFIG.wildlife.species['sika-deer'].eatsGrass).toBe(true);
    expect(BASE_GAME_CONFIG.wildlife.species.pig.eatsGrass).toBe(false);
    expect(BASE_GAME_CONFIG.wildlife.species.raccoon.eatsGrass).toBe(false);
    expect(BASE_GAME_CONFIG.wildlife.species['red-fox'].eatsGrass).toBe(false);
    expect(BASE_GAME_CONFIG.wildlife.species.tiger.eatsGrass).toBe(false);
  });

  it('rejects a far view that exceeds the seeded-world streaming budget', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      player: { ...config.player, visualSize: 80 },
      camera: { ...config.camera, viewHalfWidthBodyMultipliers: [15, 10, 7.5] },
    });
    expect(result.errors.some(({ path }) => path === 'camera.viewHalfWidthBodyMultipliers.0')).toBe(true);
  });

  it('validates animal profile text and tuning ranges', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      characterProfiles: {
        ...config.characterProfiles,
        tiger: {
          ...config.characterProfiles.tiger,
          displayName: '',
          facingOffsetDegrees: 220,
        },
      },
    });
    expect(result.errors.some(({ path }) => path === 'characterProfiles.tiger.displayName')).toBe(true);
    expect(result.errors.some(({ path }) => path === 'characterProfiles.tiger.facingOffsetDegrees')).toBe(true);
  });

  it('validates ordered AI wildlife size ranges', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      wildlife: {
        ...config.wildlife,
        species: {
          ...config.wildlife.species,
          tiger: { ...config.wildlife.species.tiger, minSizeScale: 1.4, maxSizeScale: 0.8 },
        },
      },
    });
    expect(result.errors.some(({ path }) => path === 'wildlife.species.tiger.maxSizeScale')).toBe(true);
  });
});
