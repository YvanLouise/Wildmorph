import { describe, expect, it } from 'vitest';
import type { TerrainType } from '../../src/game/types';
import {
  collectMaskRectangles,
  collectTerrainRectangles,
  createInteriorTerrainMask,
} from '../../src/game/world/terrainGeometry';

describe('terrain geometry batching', () => {
  it('collapses a full 16 by 16 mud patch into one rectangle', () => {
    const terrain: TerrainType[] = Array.from({ length: 16 * 16 }, () => 'mud');

    expect(collectTerrainRectangles(terrain, 16, 'mud')).toEqual([
      { column: 0, row: 0, width: 16, height: 16 },
    ]);
  });

  it('merges matching spans vertically while preserving an irregular edge', () => {
    const terrain: TerrainType[] = [
      'grass', 'mud', 'mud', 'grass',
      'grass', 'mud', 'mud', 'grass',
      'mud', 'mud', 'mud', 'grass',
      'mud', 'grass', 'grass', 'grass',
    ];

    expect(collectTerrainRectangles(terrain, 4, 'mud')).toEqual([
      { column: 1, row: 0, width: 2, height: 2 },
      { column: 0, row: 2, width: 3, height: 1 },
      { column: 0, row: 3, width: 1, height: 1 },
    ]);
  });

  it('returns no geometry when the requested terrain is absent', () => {
    expect(collectTerrainRectangles(['grass', 'wet-grass'], 2, 'mud')).toEqual([]);
  });

  it('keeps the outermost water ring walkable and marks only the interior as deep', () => {
    const terrain: TerrainType[] = Array.from({ length: 5 * 5 }, () => 'water');
    const deepWater = createInteriorTerrainMask(terrain, 5, 'water');

    expect(deepWater).toEqual([
      false, false, false, false, false,
      false, true, true, true, false,
      false, true, true, true, false,
      false, true, true, true, false,
      false, false, false, false, false,
    ]);
    expect(collectMaskRectangles(deepWater, 5)).toEqual([
      { column: 1, row: 1, width: 3, height: 3 },
    ]);
  });

  it('treats water next to a diagonal shoreline as shallow', () => {
    const terrain: TerrainType[] = Array.from({ length: 3 * 3 }, () => 'water');
    terrain[0] = 'grass';

    const deepWater = createInteriorTerrainMask(terrain, 3, 'water', () => 'water');

    expect(deepWater[4]).toBe(false);
  });
});
