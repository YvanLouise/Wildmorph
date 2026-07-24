import { describe, expect, it } from 'vitest';
import { WORLD_LAYOUT, distanceBetween, validateWorldLayout } from '../../src/game/content/worldLayout';

describe('WORLD_LAYOUT', () => {
  it('uses the planned world dimensions and spawn point', () => {
    expect(WORLD_LAYOUT.width).toBe(2400);
    expect(WORLD_LAYOUT.height).toBe(1600);
    expect(WORLD_LAYOUT.spawn).toEqual({ x: 1200, y: 960 });
  });

  it('keeps every collider inside the world and the spawn clearing empty', () => {
    expect(validateWorldLayout(WORLD_LAYOUT)).toEqual([]);
  });

  it('provides four distinct safe corner teleport points', () => {
    expect(WORLD_LAYOUT.teleportPoints).toHaveLength(4);
    for (const point of WORLD_LAYOUT.teleportPoints) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.y).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(WORLD_LAYOUT.width);
      expect(point.y).toBeLessThan(WORLD_LAYOUT.height);
      expect(distanceBetween(point, WORLD_LAYOUT.spawn)).toBeGreaterThan(500);
    }
  });

  it('contains the three recognizable landmarks', () => {
    expect(WORLD_LAYOUT.obstacles.some(({ id }) => id === 'ancient-tree')).toBe(true);
    expect(WORLD_LAYOUT.obstacles.some(({ id }) => id === 'broken-white-stone')).toBe(true);
    expect(WORLD_LAYOUT.pondCenter).toEqual({ x: 1960, y: 770 });
  });
});
