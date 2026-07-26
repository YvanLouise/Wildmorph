import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_ASSET_CONFIG, WORLD_ASSET_SLOT_DEFINITIONS } from '../../src/game/assets/worldAssetConfig';
import { referencedWorldAssetIds, resolveWorldAssets } from '../../src/game/assets/worldAssetLibrary';
import { cloneGameConfig, DEFAULT_GAME_CONFIG, validateGameConfig } from '../../src/game/config/GameConfig';

describe('world image assets', () => {
  it('defines every fixed and seeded slot with valid defaults', () => {
    expect(WORLD_ASSET_SLOT_DEFINITIONS).toHaveLength(26);
    expect(Object.keys(DEFAULT_WORLD_ASSET_CONFIG.slots)).toHaveLength(26);
    expect(validateGameConfig(DEFAULT_GAME_CONFIG).errors).toEqual([]);
  });

  it('rejects invalid display metadata without changing collision data', () => {
    const base = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const config = {
      ...base,
      worldAssets: { slots: { ...base.worldAssets.slots, 'fixed.tree': { ...base.worldAssets.slots['fixed.tree'], anchorY: 2 } } },
    };
    const validation = validateGameConfig(config);
    expect(validation.errors.some(({ path }) => path.endsWith('fixed.tree.anchorY'))).toBe(true);
    expect(config.world.obstacles).toEqual(DEFAULT_GAME_CONFIG.world.obstacles);
  });

  it('tracks slot and per-object references', () => {
    const base = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const treeBinding = { ...base.worldAssets.slots['fixed.tree'], sourceId: 'upload:tree' };
    const config = {
      ...base,
      worldAssets: { slots: { ...base.worldAssets.slots, 'fixed.tree': treeBinding } },
      world: {
        ...base.world,
        obstacles: base.world.obstacles.map((obstacle, index) => index === 0
          ? { ...obstacle, assetOverride: { ...treeBinding, sourceId: 'upload:single' } }
          : obstacle),
      },
    };
    const references = referencedWorldAssetIds([config]);
    expect(references.get('upload:tree')).toContain('预设 1 · fixed.tree');
    expect(references.get('upload:single')?.[0]).toContain(config.world.obstacles[0].id);
  });

  it('falls back to the slot default when an uploaded blob is missing', async () => {
    const base = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const config = {
      ...base,
      worldAssets: { slots: { ...base.worldAssets.slots, 'fixed.tree': { ...base.worldAssets.slots['fixed.tree'], sourceId: 'upload:missing' } } },
    };
    const resolved = await resolveWorldAssets(config.worldAssets, config.world.obstacles, false);
    expect(resolved.missingSourceIds).toContain('upload:missing');
    expect(resolved.slots['fixed.tree'].sourceId).toBe(DEFAULT_WORLD_ASSET_CONFIG.slots['fixed.tree'].sourceId);
    resolved.dispose();
  });
});
