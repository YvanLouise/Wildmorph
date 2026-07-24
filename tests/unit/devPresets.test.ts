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
    const original = createDevPreset('可导出预设', DEFAULT_GAME_CONFIG);
    const store = upsertPreset(EMPTY_PRESET_STORE, original, true);
    const imported = importPreset(exportPreset(original), store);
    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toContain('导入副本');
    expect(imported.config).toEqual(original.config);
  });

  it('recovers from malformed local storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRESET_STORAGE_KEY, '{not json');
    expect(loadPresetStore(storage)).toEqual(EMPTY_PRESET_STORE);
  });
});
