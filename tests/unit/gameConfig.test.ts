import { describe, expect, it } from 'vitest';
import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
} from '../../src/game/config/GameConfig';

describe('GameConfig', () => {
  it('ships a valid default configuration', () => {
    expect(validateGameConfig(DEFAULT_GAME_CONFIG)).toEqual({ errors: [], warnings: [] });
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
});
