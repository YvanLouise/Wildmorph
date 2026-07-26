import { describe, expect, it } from 'vitest';
import { BASE_GAME_CONFIG, cloneGameConfig, DEFAULT_GAME_CONFIG, GAME_CONFIG_SCHEMA_VERSION } from '../../src/game/config/GameConfig';
import {
  createDevPreset,
  EMPTY_PRESET_STORE,
  exportPreset,
  importPreset,
  loadActiveGameConfig,
  loadPresetStore,
  PRESET_STORAGE_KEY,
  savePresetStore,
  upsertPreset,
} from '../../src/game/config/devPresets';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('developer presets', () => {
  it('stores and loads an active valid preset', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const preset = createDevPreset('高速预设', {
      ...config,
      player: { ...config.player, moveSpeed: 260 },
    });
    const store = upsertPreset(EMPTY_PRESET_STORE, preset, true);
    savePresetStore(storage, store);

    expect(loadPresetStore(storage).activePresetId).toBe(preset.id);
    expect(loadActiveGameConfig(true, storage).player.moveSpeed).toBe(260);
  });

  it('always uses defaults outside development', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const preset = createDevPreset('不会上线', {
      ...config,
      player: { ...config.player, moveSpeed: 590 },
    });
    savePresetStore(storage, upsertPreset(EMPTY_PRESET_STORE, preset, true));
    expect(loadActiveGameConfig(false, storage).player.moveSpeed).toBe(DEFAULT_GAME_CONFIG.player.moveSpeed);
  });

  it('round-trips JSON and duplicates colliding ids safely', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const original = createDevPreset('可导出预设', {
      ...config,
      characterProfiles: {
        ...config.characterProfiles,
        tiger: { ...config.characterProfiles.tiger, displayName: '山林幼虎', notes: '专项碰撞记录' },
      },
    });
    const store = upsertPreset(EMPTY_PRESET_STORE, original, true);
    const imported = importPreset(exportPreset(original), store);
    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toContain('导入副本');
    expect(imported.config).toEqual(original.config);
    expect(imported.config.characterProfiles.tiger.notes).toBe('专项碰撞记录');
  });

  it('recovers from malformed local storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRESET_STORAGE_KEY, '{not json');
    expect(loadPresetStore(storage)).toEqual(EMPTY_PRESET_STORE);
  });

  it('migrates schema v1 presets by preserving the fixed map and adding seeded defaults', () => {
    const storage = new MemoryStorage();
    const {
      proceduralWorld: _proceduralWorld,
      worldAssets: _worldAssets,
      characterProfiles: _characterProfiles,
      ...legacyConfig
    } = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const legacyStore = {
      schemaVersion: 1,
      activePresetId: 'legacy',
      presets: [{
        id: 'legacy',
        name: '旧地图预设',
        updatedAt: '2026-01-01T00:00:00.000Z',
        config: { ...legacyConfig, schemaVersion: 1 },
      }],
    };
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(legacyStore));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.world).toEqual(DEFAULT_GAME_CONFIG.world);
    expect(migrated.proceduralWorld).toEqual(DEFAULT_GAME_CONFIG.proceduralWorld);
    expect(migrated.worldAssets).toEqual(DEFAULT_GAME_CONFIG.worldAssets);
    expect(migrated.characterProfiles).toEqual(DEFAULT_GAME_CONFIG.characterProfiles);
  });

  it('migrates schema v2 presets by adding default world image slots', () => {
    const storage = new MemoryStorage();
    const { worldAssets: _worldAssets, characterProfiles: _characterProfiles, ...legacyConfig } = DEFAULT_GAME_CONFIG;
    const legacyStore = {
      schemaVersion: 2,
      activePresetId: 'legacy-v2',
      presets: [{ id: 'legacy-v2', name: '旧版二', updatedAt: new Date(0).toISOString(), config: { ...legacyConfig, schemaVersion: 2 } }],
    };
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(legacyStore));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.worldAssets).toEqual(DEFAULT_GAME_CONFIG.worldAssets);
    expect(migrated.characterProfiles).toEqual(DEFAULT_GAME_CONFIG.characterProfiles);
  });

  it('migrates schema v3 presets by adding default animal profiles', () => {
    const storage = new MemoryStorage();
    const { characterProfiles: _characterProfiles, ...legacyConfig } = DEFAULT_GAME_CONFIG;
    const legacyStore = {
      schemaVersion: 3,
      activePresetId: 'legacy-v3',
      presets: [{
        id: 'legacy-v3',
        name: '旧版三',
        updatedAt: new Date(0).toISOString(),
        config: { ...legacyConfig, schemaVersion: 3 },
      }],
    };
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(legacyStore));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.characterProfiles).toEqual(DEFAULT_GAME_CONFIG.characterProfiles);
  });

  it('migrates schema v5 presets by adding wildlife defaults', () => {
    const storage = new MemoryStorage();
    const { wildlife: _wildlife, ...legacyConfig } = cloneGameConfig(DEFAULT_GAME_CONFIG);
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 5,
      activePresetId: 'legacy-v5',
      presets: [{
        id: 'legacy-v5',
        name: '旧版五',
        updatedAt: new Date(0).toISOString(),
        config: { ...legacyConfig, schemaVersion: 5 },
      }],
    }));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.wildlife).toEqual(BASE_GAME_CONFIG.wildlife);
  });

  it('migrates schema v6 presets by preserving AI tuning and adding reaction delays', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const species = Object.fromEntries(Object.entries(config.wildlife.species).map(([id, profile]) => {
      const { reactionDelayMs: _reactionDelayMs, ...legacyProfile } = profile;
      return [id, id === 'tiger' ? { ...legacyProfile, chaseSpeed: 247 } : legacyProfile];
    }));
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 6,
      activePresetId: 'legacy-v6',
      presets: [{
        id: 'legacy-v6',
        name: 'legacy wildlife',
        updatedAt: new Date(0).toISOString(),
        config: { ...config, schemaVersion: 6, wildlife: { ...config.wildlife, species } },
      }],
    }));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.wildlife.species.tiger.chaseSpeed).toBe(247);
    expect(migrated.wildlife.species.tiger.reactionDelayMs).toBe(BASE_GAME_CONFIG.wildlife.species.tiger.reactionDelayMs);
  });

  it('migrates schema v7 presets by preserving AI tuning and adding size ranges', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const species = Object.fromEntries(Object.entries(config.wildlife.species).map(([id, profile]) => {
      const { minSizeScale: _minSizeScale, maxSizeScale: _maxSizeScale, ...legacyProfile } = profile;
      return [id, id === 'sika-deer' ? { ...legacyProfile, reactionDelayMs: 333 } : legacyProfile];
    }));
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 7,
      activePresetId: 'legacy-v7',
      presets: [{
        id: 'legacy-v7',
        name: 'legacy size ranges',
        updatedAt: new Date(0).toISOString(),
        config: { ...config, schemaVersion: 7, wildlife: { ...config.wildlife, species } },
      }],
    }));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.wildlife.species['sika-deer'].reactionDelayMs).toBe(333);
    expect(migrated.wildlife.species['sika-deer'].minSizeScale).toBe(0.85);
    expect(migrated.wildlife.species['sika-deer'].maxSizeScale).toBe(1.15);
  });

  it('migrates schema v8 default zooms to the new player-relative view defaults', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 8,
      activePresetId: 'legacy-v8',
      presets: [{
        id: 'legacy-v8',
        name: 'legacy camera defaults',
        updatedAt: new Date(0).toISOString(),
        config: {
          ...config,
          schemaVersion: 8,
          camera: {
            zoomLevels: [0.8, 1, 1.2],
            defaultZoomIndex: 1,
            followLerp: 0.1,
            fadeInMs: 700,
          },
        },
      }],
    }));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.camera.viewHalfWidthBodyMultipliers).toEqual(DEFAULT_GAME_CONFIG.camera.viewHalfWidthBodyMultipliers);
    expect(migrated.camera.defaultViewIndex).toBe(DEFAULT_GAME_CONFIG.camera.defaultViewIndex);
  });

  it('converts custom schema v8 zooms using the preset player size', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 8,
      activePresetId: 'custom-v8',
      presets: [{
        id: 'custom-v8',
        name: 'custom legacy camera',
        updatedAt: new Date(0).toISOString(),
        config: {
          ...config,
          schemaVersion: 8,
          player: { ...config.player, visualSize: 80 },
          camera: {
            zoomLevels: [0.625, 0.8, 1],
            defaultZoomIndex: 2,
            followLerp: 0.2,
            fadeInMs: 500,
          },
        },
      }],
    }));
    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.camera.viewHalfWidthBodyMultipliers).toEqual([12.8, 10, 8]);
    expect(migrated.camera.defaultViewIndex).toBe(2);
    expect(migrated.camera.followLerp).toBe(0.2);
  });

  it('migrates schema v9 presets by adding default survival tuning', () => {
    const storage = new MemoryStorage();
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const { survival: _survival, ...legacyConfig } = config;
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 9,
      activePresetId: 'legacy-v9',
      presets: [{
        id: 'legacy-v9',
        name: 'legacy survival defaults',
        updatedAt: new Date(0).toISOString(),
        config: { ...legacyConfig, schemaVersion: 9 },
      }],
    }));

    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.survival).toEqual(DEFAULT_GAME_CONFIG.survival);
  });

  it('migrates schema v10 presets by adding seeded resources and berry diets', () => {
    const storage = new MemoryStorage();
    const legacy = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<string, unknown>;
    delete legacy.seededResources;
    legacy.schemaVersion = 10;
    const wildlife = legacy.wildlife as { species: Record<string, Record<string, unknown>> };
    Object.values(wildlife.species).forEach((species) => delete species.eatsBerries);
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 10,
      activePresetId: 'legacy-v10',
      presets: [{
        id: 'legacy-v10',
        name: 'legacy resource defaults',
        updatedAt: new Date(0).toISOString(),
        config: legacy,
      }],
    }));

    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.seededResources).toEqual(BASE_GAME_CONFIG.seededResources);
    expect(migrated.wildlife.species['white-rabbit'].eatsBerries).toBe(true);
    expect(migrated.wildlife.species.tiger.eatsBerries).toBe(false);
  });

  it('migrates schema v11 presets by adding default day and night tuning', () => {
    const storage = new MemoryStorage();
    const legacy = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<string, unknown>;
    delete legacy.dayNight;
    legacy.schemaVersion = 11;
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 11,
      activePresetId: 'legacy-v11',
      presets: [{
        id: 'legacy-v11',
        name: 'legacy day and night defaults',
        updatedAt: new Date(0).toISOString(),
        config: legacy,
      }],
    }));

    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.dayNight).toEqual(DEFAULT_GAME_CONFIG.dayNight);
  });

  it('migrates schema v12 presets by adding grass settings without replacing existing tuning', () => {
    const storage = new MemoryStorage();
    const legacy = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 12;
    const resources = legacy.seededResources as Record<string, unknown>;
    resources.berryRegrowSeconds = 123;
    delete resources.grassMaxPerChunk;
    delete resources.grassSeekChance;
    delete resources.grassConsumeSeconds;
    delete resources.grassRefreshSeconds;
    delete resources.grassInteractionRadius;
    delete resources.grassMaxConsumersPerPatch;
    const wildlife = legacy.wildlife as { species: Record<string, Record<string, unknown>> };
    wildlife.species.tiger.chaseSpeed = 247;
    Object.values(wildlife.species).forEach((species) => delete species.eatsGrass);
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 12,
      activePresetId: 'legacy-v12',
      presets: [{
        id: 'legacy-v12',
        name: 'legacy grass defaults',
        updatedAt: new Date(0).toISOString(),
        config: legacy,
      }],
    }));

    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.seededResources.berryRegrowSeconds).toBe(123);
    expect(migrated.seededResources.grassMaxPerChunk).toBe(12);
    expect(migrated.seededResources.grassSeekChance).toBe(0.35);
    expect(migrated.wildlife.species.tiger.chaseSpeed).toBe(247);
    expect(migrated.wildlife.species['white-rabbit'].eatsGrass).toBe(true);
    expect(migrated.wildlife.species['sika-deer'].eatsGrass).toBe(true);
    expect(migrated.wildlife.species.tiger.eatsGrass).toBe(false);
  });

  it('migrates schema v13 presets by adding stationary stamina recovery defaults', () => {
    const storage = new MemoryStorage();
    const legacy = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 13;
    const survival = legacy.survival as Record<string, unknown>;
    survival.staminaRecoveryPerSecond = 7;
    delete survival.staminaStationaryRecoveryDelaySeconds;
    delete survival.staminaStationaryRecoveryPerSecond;
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
      schemaVersion: 13,
      activePresetId: 'legacy-v13',
      presets: [{
        id: 'legacy-v13',
        name: 'legacy stationary stamina defaults',
        updatedAt: new Date(0).toISOString(),
        config: legacy,
      }],
    }));

    const migrated = loadActiveGameConfig(true, storage);
    expect(migrated.schemaVersion).toBe(GAME_CONFIG_SCHEMA_VERSION);
    expect(migrated.survival.staminaRecoveryPerSecond).toBe(7);
    expect(migrated.survival.staminaStationaryRecoveryDelaySeconds).toBe(3);
    expect(migrated.survival.staminaStationaryRecoveryPerSecond).toBe(20);
  });
});
