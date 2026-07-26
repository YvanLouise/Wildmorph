import type {
  ChunkCoord,
  GeneratedBerryBush,
  GeneratedChunkData,
  GeneratedDecoration,
  GeneratedDecorationKind,
  GeneratedGrassPatch,
  GeneratedObstacle,
  GeneratedObstacleKind,
  ProceduralWorldConfig,
  TerrainType,
  WaterColliderRun,
  WorldSeed,
  WorldAssetConfig,
  WorldAssetSlotId,
  WildlifeGlobalConfig,
} from '../types';
import { DEFAULT_WORLD_ASSET_CONFIG } from '../assets/worldAssetConfig';
import { DEFAULT_WILDLIFE_CONFIG } from '../wildlife/config';
import { generateWildlifeSpawns } from '../wildlife/generateWildlife';
import { chunkKey, chunkOrigin, worldToChunk } from './coordinates';
import { fractalNoise2D } from './noise';
import { DeterministicRandom, hashUnit } from './random';
import { hashText32 } from './seed';
import { createInteriorTerrainMask } from './terrainGeometry';
import {
  DEFAULT_SEEDED_RESOURCES_CONFIG,
  type SeededResourcesConfig,
} from '../resources/config';

export interface EnvironmentSample {
  readonly height: number;
  readonly moisture: number;
  readonly vegetation: number;
  readonly rockiness: number;
}

const TERRAIN_CODE: Readonly<Record<TerrainType, string>> = {
  grass: 'g',
  'wet-grass': 'w',
  mud: 'm',
  water: 'a',
};

export function sampleEnvironment(seed: WorldSeed, x: number, y: number): EnvironmentSample {
  return {
    height: fractalNoise2D(seed, 'terrain-height', x, y, 2304),
    moisture: fractalNoise2D(seed, 'terrain-moisture', x + 8173, y - 4219, 1792),
    vegetation: fractalNoise2D(seed, 'terrain-vegetation', x - 2911, y + 7331, 1280),
    rockiness: fractalNoise2D(seed, 'terrain-rockiness', x + 5167, y + 1831, 1024),
  };
}

function inSpawnClearing(x: number, y: number, config: ProceduralWorldConfig): boolean {
  const dx = x - config.spawn.x;
  const dy = y - config.spawn.y;
  if (Math.hypot(dx, dy) <= config.spawnClearRadius) return true;
  const eastPassage = Math.abs(dy - Math.sin(x / 96) * 34) < 54 && x > config.spawn.x - 40 && x < config.spawn.x + 620;
  const westPassage = Math.abs(dy - Math.cos(x / 112) * 30) < 54 && x < config.spawn.x + 40 && x > config.spawn.x - 620;
  return eastPassage || westPassage;
}

function rawTerrain(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  x: number,
  y: number,
): TerrainType {
  if (inSpawnClearing(x, y, config)) return 'grass';
  const sample = sampleEnvironment(seed, x, y);
  if (sample.height < config.waterThreshold) return 'water';
  if (sample.moisture >= config.mudThreshold && sample.height < config.mudHeightLimit) return 'mud';
  if (sample.moisture >= config.wetThreshold) return 'wet-grass';
  return 'grass';
}

export function terrainAtWorld(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  x: number,
  y: number,
): TerrainType {
  const terrain = rawTerrain(seed, config, x, y);
  if (terrain !== 'water' && terrain !== 'mud') return terrain;
  let matchingNeighbors = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (rawTerrain(
        seed,
        config,
        x + offsetX * config.tileSize,
        y + offsetY * config.tileSize,
      ) === terrain) matchingNeighbors += 1;
    }
  }
  if (matchingNeighbors >= 2) return terrain;
  return terrain === 'water' ? 'wet-grass' : 'grass';
}

interface Candidate {
  readonly gridX: number;
  readonly gridY: number;
  readonly x: number;
  readonly y: number;
  readonly priority: number;
}

function candidateAt(
  seed: WorldSeed,
  namespace: string,
  gridX: number,
  gridY: number,
  spacing: number,
): Candidate {
  return {
    gridX,
    gridY,
    x: (gridX + 0.18 + hashUnit(seed, `${namespace}:x`, gridX, gridY) * 0.64) * spacing,
    y: (gridY + 0.18 + hashUnit(seed, `${namespace}:y`, gridX, gridY) * 0.64) * spacing,
    priority: hashUnit(seed, `${namespace}:priority`, gridX, gridY),
  };
}

function ownsPoint(coord: ChunkCoord, x: number, y: number, chunkSize: number): boolean {
  const owner = worldToChunk({ x, y }, chunkSize);
  return owner.x === coord.x && owner.y === coord.y;
}

function candidateSurvivesSpacing(
  seed: WorldSeed,
  namespace: string,
  candidate: Candidate,
  spacing: number,
  minimumDistance: number,
): boolean {
  for (let y = candidate.gridY - 2; y <= candidate.gridY + 2; y += 1) {
    for (let x = candidate.gridX - 2; x <= candidate.gridX + 2; x += 1) {
      if (x === candidate.gridX && y === candidate.gridY) continue;
      const neighbor = candidateAt(seed, namespace, x, y, spacing);
      if (Math.hypot(neighbor.x - candidate.x, neighbor.y - candidate.y) >= minimumDistance) continue;
      if (
        neighbor.priority > candidate.priority
        || (neighbor.priority === candidate.priority && `${x},${y}` < `${candidate.gridX},${candidate.gridY}`)
      ) return false;
    }
  }
  return true;
}

function generateObstacleKind(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  coord: ChunkCoord,
  kind: GeneratedObstacleKind,
  spacing: number,
  minimumDistance: number,
  density: number,
  worldAssets: WorldAssetConfig,
): GeneratedObstacle[] {
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);
  const namespace = `obstacle:${kind}`;
  const minimumGridX = Math.floor((origin.x - spacing) / spacing);
  const maximumGridX = Math.floor((origin.x + chunkSize + spacing) / spacing);
  const minimumGridY = Math.floor((origin.y - spacing) / spacing);
  const maximumGridY = Math.floor((origin.y + chunkSize + spacing) / spacing);
  const result: GeneratedObstacle[] = [];

  for (let gridY = minimumGridY; gridY <= maximumGridY; gridY += 1) {
    for (let gridX = minimumGridX; gridX <= maximumGridX; gridX += 1) {
      const candidate = candidateAt(seed, namespace, gridX, gridY, spacing);
      if (!ownsPoint(coord, candidate.x, candidate.y, chunkSize)) continue;
      if (inSpawnClearing(candidate.x, candidate.y, config)) continue;
      const terrain = terrainAtWorld(seed, config, candidate.x, candidate.y);
      if (terrain === 'water' || terrain === 'mud') continue;
      const environment = sampleEnvironment(seed, candidate.x, candidate.y);
      const suitability = kind === 'tree'
        ? environment.vegetation
        : kind === 'rock' ? environment.rockiness : environment.vegetation * 0.6;
      const visualRandom = new DeterministicRandom(seed, `${namespace}:visual`, gridX, gridY);
      const variant = kind === 'tree' || kind === 'rock' ? visualRandom.integer(0, 3) : 0;
      const slotId = (kind === 'tree'
        ? `seeded.tree.${variant}`
        : kind === 'rock' ? `seeded.rock.${variant}` : 'seeded.log') as WorldAssetSlotId;
      const binding = worldAssets.slots[slotId];
      const densityWeight = binding.densityWeight ?? 1;
      if (candidate.priority > Math.min(1, density * densityWeight * (0.45 + suitability))) continue;
      if (!candidateSurvivesSpacing(seed, namespace, candidate, spacing, minimumDistance)) continue;

      const scale = visualRandom.between(0.82, 1.15);
      const baseCollider = binding.collider ?? DEFAULT_WORLD_ASSET_CONFIG.slots[slotId].collider!;
      const collider = baseCollider.shape === 'circle'
        ? {
            shape: 'circle' as const,
            radius: baseCollider.radius * scale,
            ...(baseCollider.offsetX === undefined ? {} : { offsetX: baseCollider.offsetX * scale }),
            ...(baseCollider.offsetY === undefined ? {} : { offsetY: baseCollider.offsetY * scale }),
          }
        : {
            shape: 'rectangle' as const,
            width: baseCollider.width * scale,
            height: baseCollider.height * scale,
            ...(baseCollider.offsetX === undefined ? {} : { offsetX: baseCollider.offsetX * scale }),
            ...(baseCollider.offsetY === undefined ? {} : { offsetY: baseCollider.offsetY * scale }),
          };
      result.push({
        id: `${coord.x},${coord.y}:${kind}:${gridX},${gridY}`,
        kind,
        x: candidate.x,
        y: candidate.y,
        variant,
        scale,
        rotation: kind === 'fallen-log' ? visualRandom.between(-0.55, 0.55) : 0,
        collider,
      });
    }
  }
  return result;
}

function decorationKindFor(
  terrain: TerrainType,
  random: DeterministicRandom,
): GeneratedDecorationKind {
  if (terrain === 'wet-grass') return random.next() < 0.45 ? 'reed' : random.next() < 0.72 ? 'bush' : 'flower';
  const value = random.next();
  if (value < 0.3) return 'bush';
  if (value < 0.55) return 'flower';
  if (value < 0.8) return 'leaf';
  return 'pebble';
}

function generateDecorations(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  coord: ChunkCoord,
  obstacles: readonly GeneratedObstacle[],
  worldAssets: WorldAssetConfig,
): GeneratedDecoration[] {
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);
  const spacing = 48;
  const minimumX = Math.floor(origin.x / spacing);
  const maximumX = Math.floor((origin.x + chunkSize) / spacing);
  const minimumY = Math.floor(origin.y / spacing);
  const maximumY = Math.floor((origin.y + chunkSize) / spacing);
  const result: GeneratedDecoration[] = [];

  for (let gridY = minimumY; gridY <= maximumY; gridY += 1) {
    for (let gridX = minimumX; gridX <= maximumX; gridX += 1) {
      const random = new DeterministicRandom(seed, 'decoration', gridX, gridY);
      const densityRoll = random.next();
      const x = (gridX + 0.12 + random.next() * 0.76) * spacing;
      const y = (gridY + 0.12 + random.next() * 0.76) * spacing;
      if (!ownsPoint(coord, x, y, chunkSize) || inSpawnClearing(x, y, config)) continue;
      const terrain = terrainAtWorld(seed, config, x, y);
      if (terrain === 'water' || terrain === 'mud') continue;
      if (obstacles.some((obstacle) => Math.hypot(obstacle.x - x, obstacle.y - y) < 42)) continue;
      const kind = decorationKindFor(terrain, random);
      const variant = kind === 'pebble' ? random.integer(0, 4) : 0;
      const slotId = (kind === 'pebble'
        ? `seeded.pebble.${variant}`
        : `seeded.decoration.${kind}`) as WorldAssetSlotId;
      if (densityRoll > Math.min(1, config.decorationDensity * (worldAssets.slots[slotId].densityWeight ?? 1))) continue;
      const rotation = kind === 'leaf' || kind === 'pebble'
        ? random.between(-Math.PI, Math.PI)
        : kind === 'grass' || kind === 'reed'
          ? random.between(-0.12, 0.12)
          : 0;
      result.push({
        id: `${coord.x},${coord.y}:decor:${gridX},${gridY}`,
        kind,
        x,
        y,
        variant,
        scale: random.between(0.68, 1.12),
        rotation,
      });
    }
  }
  return result;
}

function generateBerryBushes(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  resourceConfig: SeededResourcesConfig,
  coord: ChunkCoord,
  obstacles: readonly GeneratedObstacle[],
): GeneratedBerryBush[] {
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);
  const countRandom = new DeterministicRandom(seed, 'berry-count', coord.x, coord.y);
  const minimum = Math.ceil(resourceConfig.berryMinPerChunk);
  const maximum = Math.floor(resourceConfig.berryMaxPerChunk);
  const targetCount = countRandom.integer(minimum, Math.max(minimum, maximum));
  const result: GeneratedBerryBush[] = [];
  const candidateLimit = Math.max(12, targetCount * 8);

  for (let candidateIndex = 0; candidateIndex < candidateLimit && result.length < targetCount; candidateIndex += 1) {
    const positionRandom = new DeterministicRandom(seed, 'berry-position', coord.x, coord.y, candidateIndex);
    const margin = 44;
    const x = origin.x + margin + positionRandom.next() * (chunkSize - margin * 2);
    const y = origin.y + margin + positionRandom.next() * (chunkSize - margin * 2);
    const terrain = terrainAtWorld(seed, config, x, y);
    if (terrain !== 'grass' && terrain !== 'wet-grass') continue;
    if (obstacles.some((obstacle) => Math.hypot(obstacle.x - x, obstacle.y - y) < 64)) continue;
    if (result.some((berry) => Math.hypot(berry.x - x, berry.y - y) < 96)) continue;

    const yieldRandom = new DeterministicRandom(seed, 'berry-yield', coord.x, coord.y, candidateIndex);
    result.push({
      id: `${coord.x},${coord.y}:berry:${candidateIndex}`,
      chunkKey: chunkKey(coord),
      x,
      y,
      maxFood: yieldRandom.integer(
        Math.ceil(resourceConfig.berryMinFood),
        Math.max(Math.ceil(resourceConfig.berryMinFood), Math.floor(resourceConfig.berryMaxFood)),
      ),
    });
  }
  return result;
}

function generateGrassCandidates(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  resourceConfig: SeededResourcesConfig,
  coord: ChunkCoord,
  obstacles: readonly GeneratedObstacle[],
  berryBushes: readonly GeneratedBerryBush[],
): GeneratedGrassPatch[] {
  const maximumCandidates = Math.min(48, Math.max(0, Math.ceil(resourceConfig.grassMaxPerChunk) * 4));
  if (maximumCandidates === 0) return [];
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);
  const result: GeneratedGrassPatch[] = [];
  const candidateLimit = Math.max(192, maximumCandidates * 12);

  for (let candidateIndex = 0; candidateIndex < candidateLimit && result.length < maximumCandidates; candidateIndex += 1) {
    const random = new DeterministicRandom(seed, 'grass-resource', coord.x, coord.y, candidateIndex);
    const margin = 28;
    const x = origin.x + margin + random.next() * (chunkSize - margin * 2);
    const y = origin.y + margin + random.next() * (chunkSize - margin * 2);
    const terrain = terrainAtWorld(seed, config, x, y);
    if ((terrain !== 'grass' && terrain !== 'wet-grass') || inSpawnClearing(x, y, config)) continue;
    if (obstacles.some((obstacle) => Math.hypot(obstacle.x - x, obstacle.y - y) < 42)) continue;
    if (berryBushes.some((berry) => Math.hypot(berry.x - x, berry.y - y) < 96)) continue;
    if (result.some((grass) => Math.hypot(grass.x - x, grass.y - y) < 48)) continue;
    result.push({
      id: `${coord.x},${coord.y}:grass:${candidateIndex}`,
      chunkKey: chunkKey(coord),
      x,
      y,
      scale: random.between(0.68, 1.12),
      rotation: random.between(-0.12, 0.12),
    });
  }
  return result;
}

function createWaterColliders(
  deepWater: readonly boolean[],
  coord: ChunkCoord,
  config: ProceduralWorldConfig,
): WaterColliderRun[] {
  interface PendingRun {
    readonly startColumn: number;
    readonly endColumn: number;
    readonly startRow: number;
    endRow: number;
  }

  const completed: PendingRun[] = [];
  let active = new Map<string, PendingRun>();
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);

  for (let row = 0; row < config.chunkTiles; row += 1) {
    const next = new Map<string, PendingRun>();
    let start = -1;
    for (let column = 0; column <= config.chunkTiles; column += 1) {
      const water = column < config.chunkTiles && deepWater[row * config.chunkTiles + column] === true;
      if (water && start < 0) start = column;
      if (!water && start >= 0) {
        const key = `${start}:${column}`;
        const previous = active.get(key);
        const run = previous ?? {
          startColumn: start,
          endColumn: column,
          startRow: row,
          endRow: row,
        };
        run.endRow = row;
        next.set(key, run);
        start = -1;
      }
    }
    for (const [key, run] of active) {
      if (!next.has(key)) completed.push(run);
    }
    active = next;
  }
  completed.push(...active.values());

  return completed.map((run) => {
    const widthInTiles = run.endColumn - run.startColumn;
    const heightInTiles = run.endRow - run.startRow + 1;
    return {
      x: origin.x + (run.startColumn + widthInTiles / 2) * config.tileSize,
      y: origin.y + (run.startRow + heightInTiles / 2) * config.tileSize,
      width: widthInTiles * config.tileSize,
      height: heightInTiles * config.tileSize,
    };
  });
}

function fingerprintChunk(
  terrain: readonly TerrainType[],
  obstacles: readonly GeneratedObstacle[],
  decorations: readonly GeneratedDecoration[],
  berryBushes: readonly GeneratedBerryBush[],
  grassCandidates: readonly GeneratedGrassPatch[],
  wildlifeSpawns: readonly import('../types').GeneratedWildlifeSpawn[],
): string {
  const serialized = [
    terrain.map((value) => TERRAIN_CODE[value]).join(''),
    ...obstacles.map((value) => `${value.id}:${value.variant}:${value.x.toFixed(3)}:${value.y.toFixed(3)}`),
    ...decorations.map((value) => `${value.id}:${value.kind}:${value.variant}`),
    ...berryBushes.map((value) => `${value.id}:${value.x.toFixed(3)}:${value.y.toFixed(3)}:${value.maxFood}`),
    ...grassCandidates.map((value) => `${value.id}:${value.x.toFixed(3)}:${value.y.toFixed(3)}`),
    ...wildlifeSpawns.map((value) => `${value.id}:${value.x.toFixed(3)}:${value.y.toFixed(3)}:${value.sizeScale.toFixed(6)}`),
  ].join('|');
  return hashText32(serialized).toString(16).padStart(8, '0');
}

export function generateChunk(
  seed: WorldSeed,
  config: ProceduralWorldConfig,
  coord: ChunkCoord,
  worldAssets: WorldAssetConfig = DEFAULT_WORLD_ASSET_CONFIG,
  wildlife: WildlifeGlobalConfig = DEFAULT_WILDLIFE_CONFIG,
  wildlifeBodySizes: Readonly<Partial<Record<import('../types').WildlifeSpeciesId, import('../types').WildlifeBodySize>>> = {},
  resourceConfig: SeededResourcesConfig = DEFAULT_SEEDED_RESOURCES_CONFIG,
): GeneratedChunkData {
  const chunkSize = config.tileSize * config.chunkTiles;
  const origin = chunkOrigin(coord, chunkSize);
  const terrain: TerrainType[] = [];
  const height: number[] = [];
  const moisture: number[] = [];
  const vegetation: number[] = [];
  const rockiness: number[] = [];

  for (let row = 0; row < config.chunkTiles; row += 1) {
    for (let column = 0; column < config.chunkTiles; column += 1) {
      const x = origin.x + (column + 0.5) * config.tileSize;
      const y = origin.y + (row + 0.5) * config.tileSize;
      const sample = sampleEnvironment(seed, x, y);
      height.push(sample.height);
      moisture.push(sample.moisture);
      vegetation.push(sample.vegetation);
      rockiness.push(sample.rockiness);
      terrain.push(terrainAtWorld(seed, config, x, y));
    }
  }

  const obstacles = [
    ...generateObstacleKind(seed, config, coord, 'tree', 96, 82, config.treeDensity, worldAssets),
    ...generateObstacleKind(seed, config, coord, 'rock', 112, 72, config.rockDensity, worldAssets),
    ...generateObstacleKind(seed, config, coord, 'fallen-log', 160, 118, config.logDensity, worldAssets),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const decorations = generateDecorations(seed, config, coord, obstacles, worldAssets)
    .sort((a, b) => a.id.localeCompare(b.id));
  const berryBushes = generateBerryBushes(seed, config, resourceConfig, coord, obstacles)
    .sort((a, b) => a.id.localeCompare(b.id));
  const grassCandidates = generateGrassCandidates(seed, config, resourceConfig, coord, obstacles, berryBushes)
    .sort((a, b) => a.id.localeCompare(b.id));
  const deepWater = createInteriorTerrainMask(
    terrain,
    config.chunkTiles,
    'water',
    (column, row) => terrainAtWorld(
      seed,
      config,
      origin.x + (column + 0.5) * config.tileSize,
      origin.y + (row + 0.5) * config.tileSize,
    ),
  );
  const wildlifeSpawns = generateWildlifeSpawns(
    seed,
    config,
    wildlife,
    coord,
    obstacles,
    (x, y) => terrainAtWorld(seed, config, x, y),
    wildlifeBodySizes,
  );

  return {
    key: chunkKey(coord),
    coord: { ...coord },
    terrain,
    height,
    moisture,
    vegetation,
    rockiness,
    deepWater,
    obstacles,
    decorations,
    berryBushes,
    grassCandidates,
    wildlifeSpawns,
    waterColliders: createWaterColliders(deepWater, coord, config),
    fingerprint: fingerprintChunk(terrain, obstacles, decorations, berryBushes, grassCandidates, wildlifeSpawns),
  };
}
