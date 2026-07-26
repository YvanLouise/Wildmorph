import { describe, expect, it } from 'vitest';
import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
} from '../../src/game/config/GameConfig';
import { CHARACTER_IDS } from '../../src/game/config/characterProfiles';

describe('GameConfig', () => {
  it('ships a valid default configuration', () => {
    expect(validateGameConfig(DEFAULT_GAME_CONFIG)).toEqual({ errors: [], warnings: [] });
  });

  it('contains a complete set of independent animal profiles', () => {
    expect(Object.keys(DEFAULT_GAME_CONFIG.characterProfiles)).toEqual([...CHARACTER_IDS]);
    expect(DEFAULT_GAME_CONFIG.characterProfiles['yellow-fox']).toMatchObject({
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

  it('validates core tuning ranges and ordered zoom levels', () => {
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const result = validateGameConfig({
      ...config,
      player: { ...config.player, moveSpeed: 0 },
      camera: { ...config.camera, zoomLevels: [1.2, 1, 0.8] },
    });
    expect(result.errors.some(({ path }) => path === 'player.moveSpeed')).toBe(true);
    expect(result.errors.some(({ path }) => path === 'camera.zoomLevels')).toBe(true);
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
});
