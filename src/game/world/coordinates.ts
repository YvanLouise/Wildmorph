import type { ChunkCoord, ChunkKey, PointDefinition } from '../types';

export function chunkKey(coord: ChunkCoord): ChunkKey {
  return `${coord.x},${coord.y}`;
}

export function worldToChunk(point: PointDefinition, chunkSize: number): ChunkCoord {
  return {
    x: Math.floor(point.x / chunkSize),
    y: Math.floor(point.y / chunkSize),
  };
}

export function worldToLocal(point: PointDefinition, chunkSize: number): PointDefinition {
  const chunk = worldToChunk(point, chunkSize);
  return {
    x: point.x - chunk.x * chunkSize,
    y: point.y - chunk.y * chunkSize,
  };
}

export function chunkOrigin(coord: ChunkCoord, chunkSize: number): PointDefinition {
  return { x: coord.x * chunkSize, y: coord.y * chunkSize };
}

export function chebyshevDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function coordsInRadius(center: ChunkCoord, radius: number): ChunkCoord[] {
  const result: ChunkCoord[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      result.push({ x, y });
    }
  }
  return result;
}
