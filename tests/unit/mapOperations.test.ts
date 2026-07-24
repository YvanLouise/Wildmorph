import { describe, expect, it } from 'vitest';
import { cloneGameConfig, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import { createObstacle, moveSelection } from '../../src/devtools/mapOperations';

describe('map editor operations', () => {
  it('creates supported objects with unique ids and useful collider defaults', () => {
    const first = createObstacle(DEFAULT_GAME_CONFIG, 'tree', { x: 100, y: 100 });
    const config = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const second = createObstacle({
      ...config,
      world: { ...config.world, obstacles: [...config.world.obstacles, first] },
    }, 'tree', { x: 200, y: 200 });
    expect(second.id).not.toBe(first.id);
    expect(second.collider.shape).toBe('rectangle');
  });

  it('moves every selectable map point without mutating the source', () => {
    const source = cloneGameConfig(DEFAULT_GAME_CONFIG);
    const moved = moveSelection(source, { kind: 'spawn' }, { x: 900, y: 900 });
    expect(moved.world.spawn).toEqual({ x: 900, y: 900 });
    expect(source.world.spawn).toEqual({ x: 1200, y: 960 });

    const obstacleId = source.world.obstacles[0].id;
    const movedObstacle = moveSelection(source, { kind: 'obstacle', id: obstacleId }, { x: 50, y: 60 });
    expect(movedObstacle.world.obstacles[0]).toMatchObject({ x: 50, y: 60 });
    expect(source.world.obstacles[0]).not.toMatchObject({ x: 50, y: 60 });
  });
});
