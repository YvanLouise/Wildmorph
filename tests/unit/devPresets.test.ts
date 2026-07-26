import { describe, expect, it } from 'vitest';
import { cloneGameConfig, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
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
    expect(loadActiveGameConfig(false, storage).player.moveSpeed).toBe(200);
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
    expect(migrated.schemaVersion).toBe(6);
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
    expect(migrated.schemaVersion).toBe(6);
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
    expect(migrated.schemaVersion).toBe(6);
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
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.wildlife).toEqual(DEFAULT_GAME_CONFIG.wildlife);
  });
});
