import type {
  ChunkCoord,
  GeneratedObstacle,
  GeneratedWildlifeSpawn,
  ProceduralWorldConfig,
  TerrainType,
  WildlifeGlobalConfig,
  WildlifeSpeciesId,
  WorldSeed,
} from '../types';
import { chunkKey, chunkOrigin } from '../world/coordinates';
import { DeterministicRandom } from '../world/random';
import { WILDLIFE_SPECIES_IDS } from './config';

function obstacleRadius(obstacle: GeneratedObstacle): number {
  return obstacle.collider.shape === 'circle'
    ? obstacle.collider.radius
    : Math.hypot(obstacle.collider.width / 2, obstacle.collider.height / 2);
}

function nearWater(
  world: ProceduralWorldConfig,
  terrainAt: (x: number, y: number) => TerrainType,
  x: number,
  y: number,
): boolean {
  const step = world.tileSize;
  for (let distance = 1; distance <= 3; distance += 1) {
    for (const [dx, dy] of [[distance, 0], [-distance, 0], [0, distance], [0, -distance]] as const) {
      if (terrainAt(x + dx * step, y + dy * step) === 'water') return true;
    }
  }
  return false;
}

function validPoint(
  world: ProceduralWorldConfig,
  wildlife: WildlifeGlobalConfig,
  species: WildlifeSpeciesId,
  terrain: TerrainType,
  x: number,
  y: number,
  obstacles: readonly GeneratedObstacle[],
  existing: readonly GeneratedWildlifeSpawn[],
  terrainAt: (x: number, y: number) => TerrainType,
): boolean {
  const speciesConfig = wildlife.species[species];
  if (terrain === 'water' || !speciesConfig.preferredTerrains.includes(terrain)) return false;
  const clearRadius = species === 'tiger' ? wildlife.dangerSpawnClearRadius : wildlife.spawnClearRadius;
  if (Math.hypot(x - world.spawn.x, y - world.spawn.y) < clearRadius) return false;
  if (species === 'raccoon' && !nearWater(world, terrainAt, x, y)) return false;
  if (obstacles.some((obstacle) => Math.hypot(obstacle.x - x, obstacle.y - y) < obstacleRadius(obstacle) + 32)) return false;
  if (existing.some((spawn) => Math.hypot(spawn.x - x, spawn.y - y) < 36)) return false;
  return true;
}

export function generateWildlifeSpawns(
  seed: WorldSeed,
  world: ProceduralWorldConfig,
  wildlife: WildlifeGlobalConfig,
  coord: ChunkCoord,
  obstacles: readonly GeneratedObstacle[],
  terrainAt: (x: number, y: number) => TerrainType,
): GeneratedWildlifeSpawn[] {
  const size = world.tileSize * world.chunkTiles;
  const origin = chunkOrigin(coord, size);
  const key = chunkKey(coord);
  const result: GeneratedWildlifeSpawn[] = [];

  for (const species of WILDLIFE_SPECIES_IDS) {
    const config = wildlife.species[species];
    if (!config.enabled) continue;
    const random = new DeterministicRandom(seed, `wildlife:${species}`, coord.x, coord.y);
    const priority = random.next();
    if (priority > config.spawnChance) continue;
    const count = random.integer(config.groupMin, config.groupMax);
    const groupId = `${key}:wildlife:${species}`;
    let homeX = 0;
    let homeY = 0;

    for (let member = 0; member < count; member += 1) {
      let placed = false;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const baseX = member === 0 ? origin.x + 80 + random.next() * (size - 160) : homeX + (random.next() - 0.5) * 116;
        const baseY = member === 0 ? origin.y + 80 + random.next() * (size - 160) : homeY + (random.next() - 0.5) * 116;
        const x = Math.max(origin.x + 64, Math.min(origin.x + size - 64, baseX));
        const y = Math.max(origin.y + 64, Math.min(origin.y + size - 64, baseY));
        const terrain = terrainAt(x, y);
        if (!validPoint(world, wildlife, species, terrain, x, y, obstacles, result, terrainAt)) continue;
        if (member === 0) {
          homeX = x;
          homeY = y;
        }
        result.push({
          id: `${groupId}:${member}`,
          species,
          chunkKey: key,
          groupId,
          x,
          y,
          homeX,
          homeY,
          priority,
        });
        placed = true;
        break;
      }
      if (!placed && member === 0) break;
    }
  }

  return result.sort((a, b) => a.id.localeCompare(b.id));
}
