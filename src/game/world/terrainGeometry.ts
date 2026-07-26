import type { TerrainType } from '../types';

export interface TerrainRectangle {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

interface MutableTerrainRectangle {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  height: number;
}

function collectMatchingRectangles(
  matches: readonly boolean[],
  columns: number,
): readonly TerrainRectangle[] {
  if (columns <= 0 || matches.length === 0) return [];

  const completed: MutableTerrainRectangle[] = [];
  let active = new Map<string, MutableTerrainRectangle>();
  const rows = Math.ceil(matches.length / columns);

  for (let row = 0; row < rows; row += 1) {
    const next = new Map<string, MutableTerrainRectangle>();
    let startColumn = -1;

    for (let column = 0; column <= columns; column += 1) {
      const matchingTile = column < columns && matches[row * columns + column] === true;
      if (matchingTile && startColumn < 0) startColumn = column;
      if (matchingTile || startColumn < 0) continue;

      const width = column - startColumn;
      const key = `${startColumn}:${width}`;
      const rectangle = active.get(key) ?? {
        column: startColumn,
        row,
        width,
        height: 0,
      };
      rectangle.height += 1;
      next.set(key, rectangle);
      startColumn = -1;
    }

    for (const [key, rectangle] of active) {
      if (!next.has(key)) completed.push(rectangle);
    }
    active = next;
  }

  completed.push(...active.values());
  return completed;
}

export function collectTerrainRectangles(
  terrain: readonly TerrainType[],
  columns: number,
  target: TerrainType,
): readonly TerrainRectangle[] {
  return collectMatchingRectangles(terrain.map((value) => value === target), columns);
}

export function collectMaskRectangles(
  mask: readonly boolean[],
  columns: number,
): readonly TerrainRectangle[] {
  return collectMatchingRectangles(mask, columns);
}

export function createInteriorTerrainMask(
  terrain: readonly TerrainType[],
  columns: number,
  target: TerrainType,
  terrainOutsideChunk: (column: number, row: number) => TerrainType = () => 'grass',
): readonly boolean[] {
  if (columns <= 0 || terrain.length === 0) return [];
  const rows = Math.ceil(terrain.length / columns);

  const terrainAt = (column: number, row: number): TerrainType => {
    if (column >= 0 && column < columns && row >= 0 && row < rows) {
      return terrain[row * columns + column];
    }
    return terrainOutsideChunk(column, row);
  };

  return terrain.map((value, index) => {
    if (value !== target) return false;
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        if (terrainAt(column + offsetX, row + offsetY) !== target) return false;
      }
    }
    return true;
  });
}
