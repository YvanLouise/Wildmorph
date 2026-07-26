import type {
  ChunkKey,
  GeneratedChunkData,
  PointDefinition,
  ProceduralWorldConfig,
  WildlifeBodySize,
  WildlifeGlobalConfig,
  WildlifeSpeciesId,
} from '../types';
import { chunkKey, chunkOrigin, worldToChunk } from '../world/coordinates';

interface SearchNode {
  readonly x: number;
  readonly y: number;
  readonly g: number;
  readonly f: number;
  readonly parent?: SearchNode;
}

export class NavigationField {
  private readonly chunks = new Map<ChunkKey, GeneratedChunkData>();

  constructor(
    private readonly world: ProceduralWorldConfig,
    private readonly wildlife: WildlifeGlobalConfig,
    private readonly bodySizes: Readonly<Partial<Record<WildlifeSpeciesId, WildlifeBodySize>>> = {},
  ) {}

  addChunk(data: GeneratedChunkData): void {
    this.chunks.set(data.key, data);
  }

  removeChunk(key: ChunkKey): void {
    this.chunks.delete(key);
  }

  clear(): void {
    this.chunks.clear();
  }

  chunkKeyAt(point: PointDefinition): ChunkKey {
    const size = this.world.tileSize * this.world.chunkTiles;
    return chunkKey(worldToChunk(point, size));
  }

  isWalkable(point: PointDefinition, species: WildlifeSpeciesId, sizeScale = 1): boolean {
    const body = this.bodySizes[species] ?? { width: 28, height: 32 };
    const halfWidth = body.width * sizeScale / 2;
    const halfHeight = body.height * sizeScale / 2;
    const terrainSamples = [
      point,
      { x: point.x - halfWidth, y: point.y - halfHeight },
      { x: point.x + halfWidth, y: point.y - halfHeight },
      { x: point.x - halfWidth, y: point.y + halfHeight },
      { x: point.x + halfWidth, y: point.y + halfHeight },
    ];
    for (const sample of terrainSamples) {
      const terrain = this.terrainAt(sample);
      if (!terrain || terrain === 'water' || (terrain === 'mud' && species !== 'pig')) return false;
    }
    const size = this.world.tileSize * this.world.chunkTiles;
    const coord = worldToChunk(point, size);
    for (let chunkY = coord.y - 1; chunkY <= coord.y + 1; chunkY += 1) {
      for (let chunkX = coord.x - 1; chunkX <= coord.x + 1; chunkX += 1) {
        for (const obstacle of this.chunks.get(chunkKey({ x: chunkX, y: chunkY }))?.obstacles ?? []) {
          const colliderX = obstacle.x + (obstacle.collider.offsetX ?? 0);
          const colliderY = obstacle.y + (obstacle.collider.offsetY ?? 0);
          if (obstacle.collider.shape === 'circle') {
            const nearestX = Math.max(point.x - halfWidth, Math.min(colliderX, point.x + halfWidth));
            const nearestY = Math.max(point.y - halfHeight, Math.min(colliderY, point.y + halfHeight));
            if (Math.hypot(nearestX - colliderX, nearestY - colliderY) < obstacle.collider.radius) return false;
          } else if (
            Math.abs(point.x - colliderX) < obstacle.collider.width / 2 + halfWidth
            && Math.abs(point.y - colliderY) < obstacle.collider.height / 2 + halfHeight
          ) return false;
        }
      }
    }
    return true;
  }

  private terrainAt(point: PointDefinition) {
    const size = this.world.tileSize * this.world.chunkTiles;
    const coord = worldToChunk(point, size);
    const chunk = this.chunks.get(chunkKey(coord));
    if (!chunk) return undefined;
    const origin = chunkOrigin(coord, size);
    const column = Math.floor((point.x - origin.x) / this.world.tileSize);
    const row = Math.floor((point.y - origin.y) / this.world.tileSize);
    if (column < 0 || row < 0 || column >= this.world.chunkTiles || row >= this.world.chunkTiles) return undefined;
    return chunk.terrain[row * this.world.chunkTiles + column];
  }

  hasLineOfTravel(from: PointDefinition, to: PointDefinition, species: WildlifeSpeciesId, sizeScale = 1): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const samples = Math.max(1, Math.ceil(distance / (this.world.tileSize * 0.5)));
    for (let index = 1; index <= samples; index += 1) {
      const progress = index / samples;
      if (!this.isWalkable({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      }, species, sizeScale)) return false;
    }
    return true;
  }

  findPath(from: PointDefinition, desiredTarget: PointDefinition, species: WildlifeSpeciesId, sizeScale = 1): PointDefinition[] {
    const tile = this.world.tileSize;
    const startX = Math.floor(from.x / tile);
    const startY = Math.floor(from.y / tile);
    const rawTargetX = Math.floor(desiredTarget.x / tile);
    const rawTargetY = Math.floor(desiredTarget.y / tile);
    const deltaX = rawTargetX - startX;
    const deltaY = rawTargetY - startY;
    const distance = Math.hypot(deltaX, deltaY);
    const limit = this.wildlife.pathSearchRadiusTiles;
    const targetX = distance > limit ? Math.round(startX + deltaX / distance * limit) : rawTargetX;
    const targetY = distance > limit ? Math.round(startY + deltaY / distance * limit) : rawTargetY;
    const keyFor = (x: number, y: number) => `${x},${y}`;
    const open: SearchNode[] = [{ x: startX, y: startY, g: 0, f: Math.abs(targetX - startX) + Math.abs(targetY - startY) }];
    const best = new Map<string, number>([[keyFor(startX, startY), 0]]);
    let closest = open[0];
    let visited = 0;

    while (open.length > 0 && visited < this.wildlife.maxPathNodes) {
      open.sort((a, b) => a.f - b.f || a.g - b.g || a.y - b.y || a.x - b.x);
      const current = open.shift()!;
      visited += 1;
      if (Math.abs(current.x - targetX) + Math.abs(current.y - targetY) < Math.abs(closest.x - targetX) + Math.abs(closest.y - targetY)) closest = current;
      if (current.x === targetX && current.y === targetY) {
        closest = current;
        break;
      }
      for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = current.x + offsetX;
        const y = current.y + offsetY;
        if (Math.abs(x - startX) > limit || Math.abs(y - startY) > limit) continue;
        const point = { x: (x + 0.5) * tile, y: (y + 0.5) * tile };
        if (!this.isWalkable(point, species, sizeScale)) continue;
        const g = current.g + 1;
        const key = keyFor(x, y);
        if ((best.get(key) ?? Infinity) <= g) continue;
        best.set(key, g);
        open.push({ x, y, g, f: g + Math.abs(targetX - x) + Math.abs(targetY - y), parent: current });
      }
    }

    const reversed: PointDefinition[] = [];
    let node: SearchNode | undefined = closest;
    while (node?.parent) {
      reversed.push({ x: (node.x + 0.5) * tile, y: (node.y + 0.5) * tile });
      node = node.parent;
    }
    return reversed.reverse();
  }
}
