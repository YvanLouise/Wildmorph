import { WORLD_LAYOUT } from '../content/worldLayout';
import { DEFAULT_WORLD_ASSET_CONFIG, WORLD_ASSET_SLOT_IDS, getSlotDefinition } from '../assets/worldAssetConfig';
import {
  CHARACTER_IDS,
  cloneDefaultCharacterProfiles,
  type CharacterId,
  type CharacterProfileConfig,
} from './characterProfiles';
import { cloneDefaultWildlifeConfig, WILDLIFE_SPECIES_IDS } from '../wildlife/config';
import type {
  ColliderDefinition,
  ObstacleDefinition,
  PointDefinition,
  ProceduralWorldConfig,
  WorldLayout,
  WorldAssetConfig,
  WorldImageBinding,
  WildlifeGlobalConfig,
} from '../types';

export const GAME_CONFIG_SCHEMA_VERSION = 6 as const;

export type { CharacterId, CharacterProfileConfig } from './characterProfiles';

export interface PlayerConfig {
  readonly moveSpeed: number;
  readonly sprintMultiplier: number;
  readonly visualSize: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly footstepIntervalMs: number;
}

export interface CameraConfig {
  readonly zoomLevels: readonly [number, number, number];
  readonly defaultZoomIndex: number;
  readonly followLerp: number;
  readonly fadeInMs: number;
}

export interface AudioConfig {
  readonly titleMusicVolume: number;
  readonly ambienceVolume: number;
  readonly footstepVolume: number;
}

export interface InputConfig {
  readonly joystickDeadZone: number;
}

export interface GameConfig {
  readonly schemaVersion: typeof GAME_CONFIG_SCHEMA_VERSION;
  readonly player: PlayerConfig;
  readonly characterProfiles: Readonly<Record<CharacterId, CharacterProfileConfig>>;
  readonly camera: CameraConfig;
  readonly audio: AudioConfig;
  readonly input: InputConfig;
  readonly world: WorldLayout;
  readonly proceduralWorld: ProceduralWorldConfig;
  readonly worldAssets: WorldAssetConfig;
  readonly wildlife: WildlifeGlobalConfig;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ConfigValidationResult {
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
  player: {
    moveSpeed: 200,
    sprintMultiplier: 1.5,
    visualSize: 64,
    bodyWidth: 28,
    bodyHeight: 32,
    footstepIntervalMs: 285,
  },
  characterProfiles: cloneDefaultCharacterProfiles(),
  camera: {
    zoomLevels: [0.8, 1, 1.2],
    defaultZoomIndex: 1,
    followLerp: 0.1,
    fadeInMs: 700,
  },
  audio: {
    titleMusicVolume: 0.32,
    ambienceVolume: 0.38,
    footstepVolume: 0.38,
  },
  input: {
    joystickDeadZone: 0.17,
  },
  world: WORLD_LAYOUT,
  proceduralWorld: {
    generationVersion: 'worldgen-v1',
    configVersion: 'procedural-v1',
    tileSize: 32,
    chunkTiles: 16,
    loadRadius: 2,
    unloadRadius: 3,
    cacheSize: 64,
    generationBudgetMs: 4,
    spawn: { x: 256, y: 256 },
    spawnClearRadius: 300,
    waterThreshold: 0.28,
    wetThreshold: 0.58,
    mudThreshold: 0.72,
    mudHeightLimit: 0.58,
    treeDensity: 0.34,
    rockDensity: 0.18,
    logDensity: 0.07,
    decorationDensity: 0.62,
  },
  worldAssets: structuredClone(DEFAULT_WORLD_ASSET_CONFIG),
  wildlife: cloneDefaultWildlifeConfig(),
};

export function cloneGameConfig(config: Readonly<GameConfig>): GameConfig {
  return structuredClone(config);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
  minimum: number,
  maximum: number,
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ path, message: '必须是有限数字' });
    return false;
  }
  if (value < minimum || value > maximum) {
    errors.push({ path, message: `必须在 ${minimum}–${maximum} 之间` });
    return false;
  }
  return true;
}

function validatePoint(
  point: unknown,
  path: string,
  errors: ValidationIssue[],
  width: number,
  height: number,
): point is PointDefinition {
  if (!isRecord(point)) {
    errors.push({ path, message: '必须是坐标对象' });
    return false;
  }
  const validX = finiteNumber(point.x, `${path}.x`, errors, 0, width);
  const validY = finiteNumber(point.y, `${path}.y`, errors, 0, height);
  return validX && validY;
}

function colliderRadius(collider: ColliderDefinition): number {
  return collider.shape === 'circle'
    ? collider.radius
    : Math.hypot(collider.width / 2, collider.height / 2);
}

function validateCollider(
  collider: unknown,
  path: string,
  errors: ValidationIssue[],
): collider is ColliderDefinition {
  if (!isRecord(collider)) {
    errors.push({ path, message: '必须是碰撞体对象' });
    return false;
  }
  let offsetValid = true;
  if (collider.offsetX !== undefined) {
    offsetValid = finiteNumber(collider.offsetX, `${path}.offsetX`, errors, -5000, 5000) && offsetValid;
  }
  if (collider.offsetY !== undefined) {
    offsetValid = finiteNumber(collider.offsetY, `${path}.offsetY`, errors, -5000, 5000) && offsetValid;
  }
  if (collider.shape === 'circle') {
    return finiteNumber(collider.radius, `${path}.radius`, errors, 1, 5000) && offsetValid;
  }
  if (collider.shape === 'rectangle') {
    const widthValid = finiteNumber(collider.width, `${path}.width`, errors, 1, 5000);
    const heightValid = finiteNumber(collider.height, `${path}.height`, errors, 1, 5000);
    return widthValid && heightValid && offsetValid;
  }
  errors.push({ path: `${path}.shape`, message: '只支持 circle 或 rectangle' });
  return false;
}

function validateWorldImageBinding(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
): value is WorldImageBinding {
  if (!isRecord(value)) {
    errors.push({ path, message: '必须是图片绑定对象' });
    return false;
  }
  let valid = true;
  if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
    errors.push({ path: `${path}.sourceId`, message: '素材 ID 不能为空' });
    valid = false;
  }
  if (value.sizeMode !== 'width' && value.sizeMode !== 'height') {
    errors.push({ path: `${path}.sizeMode`, message: '尺寸基准只能是 width 或 height' });
    valid = false;
  }
  valid = finiteNumber(value.displaySize, `${path}.displaySize`, errors, 4, 2048) && valid;
  valid = finiteNumber(value.anchorX, `${path}.anchorX`, errors, 0, 1) && valid;
  valid = finiteNumber(value.anchorY, `${path}.anchorY`, errors, 0, 1) && valid;
  if (value.canopyCutRatio !== undefined) {
    valid = finiteNumber(value.canopyCutRatio, `${path}.canopyCutRatio`, errors, 0.1, 0.95) && valid;
  }
  if (value.collider !== undefined) {
    valid = validateCollider(value.collider, `${path}.collider`, errors) && valid;
  }
  if (value.densityWeight !== undefined) {
    valid = finiteNumber(value.densityWeight, `${path}.densityWeight`, errors, 0, 3) && valid;
  }
  return valid;
}

function validateWildlife(value: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(value)) {
    errors.push({ path: 'wildlife', message: '缺少 AI 动物配置' });
    return;
  }
  finiteNumber(value.maxActiveAnimals, 'wildlife.maxActiveAnimals', errors, 1, 128);
  finiteNumber(value.activationRadius, 'wildlife.activationRadius', errors, 128, 4096);
  finiteNumber(value.sleepRadius, 'wildlife.sleepRadius', errors, 128, 8192);
  finiteNumber(value.simulationStepMs, 'wildlife.simulationStepMs', errors, 16, 250);
  finiteNumber(value.decisionIntervalMs, 'wildlife.decisionIntervalMs', errors, 50, 2000);
  finiteNumber(value.pathSearchRadiusTiles, 'wildlife.pathSearchRadiusTiles', errors, 4, 64);
  finiteNumber(value.maxPathNodes, 'wildlife.maxPathNodes', errors, 32, 4096);
  finiteNumber(value.pathSearchesPerStep, 'wildlife.pathSearchesPerStep', errors, 0, 16);
  finiteNumber(value.pathBudgetMs, 'wildlife.pathBudgetMs', errors, 0.1, 8);
  finiteNumber(value.spawnClearRadius, 'wildlife.spawnClearRadius', errors, 0, 2048);
  finiteNumber(value.dangerSpawnClearRadius, 'wildlife.dangerSpawnClearRadius', errors, 0, 4096);
  if (
    typeof value.activationRadius === 'number'
    && typeof value.sleepRadius === 'number'
    && value.sleepRadius < value.activationRadius
  ) {
    errors.push({ path: 'wildlife.sleepRadius', message: '休眠半径不能小于激活半径' });
  }
  if (!isRecord(value.species)) {
    errors.push({ path: 'wildlife.species', message: '缺少 AI 物种配置' });
    return;
  }
  const roles = new Set(['prey', 'forager', 'mesopredator', 'predator']);
  const terrains = new Set(['grass', 'wet-grass', 'mud', 'water']);
  for (const speciesId of WILDLIFE_SPECIES_IDS) {
    const path = `wildlife.species.${speciesId}`;
    const species = value.species[speciesId];
    if (!isRecord(species)) {
      errors.push({ path, message: '缺少物种配置' });
      continue;
    }
    if (typeof species.enabled !== 'boolean') errors.push({ path: `${path}.enabled`, message: '必须是布尔值' });
    if (typeof species.role !== 'string' || !roles.has(species.role)) errors.push({ path: `${path}.role`, message: '未知的生态角色' });
    finiteNumber(species.spawnChance, `${path}.spawnChance`, errors, 0, 1);
    finiteNumber(species.groupMin, `${path}.groupMin`, errors, 1, 12);
    finiteNumber(species.groupMax, `${path}.groupMax`, errors, 1, 12);
    if (typeof species.groupMin === 'number' && typeof species.groupMax === 'number' && species.groupMax < species.groupMin) {
      errors.push({ path: `${path}.groupMax`, message: '群体上限不能小于下限' });
    }
    if (!Array.isArray(species.preferredTerrains) || species.preferredTerrains.length === 0 || species.preferredTerrains.some((terrain) => typeof terrain !== 'string' || !terrains.has(terrain))) {
      errors.push({ path: `${path}.preferredTerrains`, message: '至少需要一种有效地形' });
    }
    finiteNumber(species.walkSpeed, `${path}.walkSpeed`, errors, 0, 600);
    finiteNumber(species.fleeSpeed, `${path}.fleeSpeed`, errors, 0, 600);
    finiteNumber(species.chaseSpeed, `${path}.chaseSpeed`, errors, 0, 600);
    finiteNumber(species.detectionRadius, `${path}.detectionRadius`, errors, 16, 2000);
    finiteNumber(species.giveUpRadius, `${path}.giveUpRadius`, errors, 16, 3000);
    finiteNumber(species.territoryRadius, `${path}.territoryRadius`, errors, 32, 3000);
    finiteNumber(species.alertDurationMs, `${path}.alertDurationMs`, errors, 0, 30000);
    finiteNumber(species.chaseDurationMs, `${path}.chaseDurationMs`, errors, 0, 30000);
    finiteNumber(species.restDurationMs, `${path}.restDurationMs`, errors, 0, 30000);
    finiteNumber(species.cooldownMs, `${path}.cooldownMs`, errors, 0, 60000);
  }
}

const OBSTACLE_KINDS = new Set([
  'tree',
  'ancient-tree',
  'rock',
  'white-rock',
  'fallen-log',
  'water',
]);

function validateObstacle(
  obstacle: unknown,
  index: number,
  errors: ValidationIssue[],
  width: number,
  height: number,
): obstacle is ObstacleDefinition {
  const path = `world.obstacles.${index}`;
  if (!isRecord(obstacle)) {
    errors.push({ path, message: '必须是障碍物对象' });
    return false;
  }
  let valid = true;
  if (typeof obstacle.id !== 'string' || !obstacle.id.trim()) {
    errors.push({ path: `${path}.id`, message: 'ID 不能为空' });
    valid = false;
  }
  if (typeof obstacle.kind !== 'string' || !OBSTACLE_KINDS.has(obstacle.kind)) {
    errors.push({ path: `${path}.kind`, message: '未知的障碍物类型' });
    valid = false;
  }
  valid = finiteNumber(obstacle.x, `${path}.x`, errors, 0, width) && valid;
  valid = finiteNumber(obstacle.y, `${path}.y`, errors, 0, height) && valid;
  valid = validateCollider(obstacle.collider, `${path}.collider`, errors) && valid;
  if (obstacle.visualScale !== undefined) {
    valid = finiteNumber(obstacle.visualScale, `${path}.visualScale`, errors, 0.1, 10) && valid;
  }
  if (obstacle.rotation !== undefined) {
    valid = finiteNumber(obstacle.rotation, `${path}.rotation`, errors, -Math.PI * 2, Math.PI * 2) && valid;
  }
  if (obstacle.collisionOnly !== undefined && typeof obstacle.collisionOnly !== 'boolean') {
    errors.push({ path: `${path}.collisionOnly`, message: '必须是布尔值' });
    valid = false;
  }
  if (obstacle.assetOverride !== undefined) {
    valid = validateWorldImageBinding(obstacle.assetOverride, `${path}.assetOverride`, errors) && valid;
  }
  return valid;
}

function orientation(a: PointDefinition, b: PointDefinition, c: PointDefinition): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(
  a: PointDefinition,
  b: PointDefinition,
  c: PointDefinition,
  d: PointDefinition,
): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second < 0 && third * fourth < 0;
}

function polygonSelfIntersects(points: readonly PointDefinition[]): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) {
        continue;
      }
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
        return true;
      }
    }
  }
  return false;
}

function validateWorld(
  value: unknown,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): value is WorldLayout {
  if (!isRecord(value)) {
    errors.push({ path: 'world', message: '必须是地图对象' });
    return false;
  }
  const widthValid = finiteNumber(value.width, 'world.width', errors, 320, 20000);
  const heightValid = finiteNumber(value.height, 'world.height', errors, 320, 20000);
  if (!widthValid || !heightValid) {
    return false;
  }
  const width = value.width as number;
  const height = value.height as number;
  const spawnValid = validatePoint(value.spawn, 'world.spawn', errors, width, height);
  finiteNumber(value.spawnClearRadius, 'world.spawnClearRadius', errors, 0, Math.min(width, height));
  validatePoint(value.pondCenter, 'world.pondCenter', errors, width, height);

  if (!Array.isArray(value.pondPolygon) || value.pondPolygon.length < 3) {
    errors.push({ path: 'world.pondPolygon', message: '池塘至少需要三个顶点' });
  } else {
    const pointsValid = value.pondPolygon.every((point, index) => (
      validatePoint(point, `world.pondPolygon.${index}`, errors, width, height)
    ));
    if (pointsValid && polygonSelfIntersects(value.pondPolygon as PointDefinition[])) {
      errors.push({ path: 'world.pondPolygon', message: '池塘多边形不能自相交' });
    }
  }

  if (!Array.isArray(value.teleportPoints)) {
    errors.push({ path: 'world.teleportPoints', message: '必须是传送点数组' });
  } else {
    value.teleportPoints.forEach((point, index) => {
      validatePoint(point, `world.teleportPoints.${index}`, errors, width, height);
    });
    if (value.teleportPoints.length === 0) {
      warnings.push({ path: 'world.teleportPoints', message: '没有调试传送点' });
    }
  }

  if (!Array.isArray(value.obstacles)) {
    errors.push({ path: 'world.obstacles', message: '必须是障碍物数组' });
    return false;
  }
  const ids = new Set<string>();
  for (let index = 0; index < value.obstacles.length; index += 1) {
    const obstacle = value.obstacles[index];
    if (!validateObstacle(obstacle, index, errors, width, height)) {
      continue;
    }
    if (ids.has(obstacle.id)) {
      errors.push({ path: `world.obstacles.${index}.id`, message: `ID “${obstacle.id}” 重复` });
    }
    ids.add(obstacle.id);
    const radius = colliderRadius(obstacle.collider);
    const colliderX = obstacle.x + (obstacle.collider.offsetX ?? 0);
    const colliderY = obstacle.y + (obstacle.collider.offsetY ?? 0);
    if (
      colliderX - radius < 0
      || colliderY - radius < 0
      || colliderX + radius > width
      || colliderY + radius > height
    ) {
      errors.push({ path: `world.obstacles.${index}`, message: '碰撞体超出世界边界' });
    }
    if (spawnValid && typeof value.spawnClearRadius === 'number') {
      const spawn = value.spawn as PointDefinition;
      if (Math.hypot(colliderX - spawn.x, colliderY - spawn.y) - radius < value.spawnClearRadius) {
        errors.push({ path: `world.obstacles.${index}`, message: '侵入出生安全区域' });
      }
    }
  }
  return true;
}

export function validateGameConfig(value: unknown): ConfigValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { errors: [{ path: 'config', message: '配置必须是对象' }], warnings };
  }
  if (value.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', message: `仅支持版本 ${GAME_CONFIG_SCHEMA_VERSION}` });
  }

  const player = value.player;
  if (!isRecord(player)) {
    errors.push({ path: 'player', message: '缺少玩家参数' });
  } else {
    finiteNumber(player.moveSpeed, 'player.moveSpeed', errors, 50, 600);
    finiteNumber(player.sprintMultiplier, 'player.sprintMultiplier', errors, 1, 3);
    finiteNumber(player.visualSize, 'player.visualSize', errors, 16, 160);
    finiteNumber(player.bodyWidth, 'player.bodyWidth', errors, 4, 128);
    finiteNumber(player.bodyHeight, 'player.bodyHeight', errors, 4, 128);
    finiteNumber(player.footstepIntervalMs, 'player.footstepIntervalMs', errors, 80, 1000);
  }

  const characterProfiles = value.characterProfiles;
  if (!isRecord(characterProfiles)) {
    errors.push({ path: 'characterProfiles', message: '缺少动物角色档案' });
  } else {
    for (const characterId of CHARACTER_IDS) {
      const path = `characterProfiles.${characterId}`;
      const profile = characterProfiles[characterId];
      if (!isRecord(profile)) {
        errors.push({ path, message: '缺少角色档案' });
        continue;
      }
      if (typeof profile.displayName !== 'string' || !profile.displayName.trim() || profile.displayName.length > 32) {
        errors.push({ path: `${path}.displayName`, message: '显示名称必须为 1–32 个字符' });
      }
      if (typeof profile.notes !== 'string' || profile.notes.length > 2000) {
        errors.push({ path: `${path}.notes`, message: '调参备注不能超过 2000 个字符' });
      }
      finiteNumber(profile.visualSize, `${path}.visualSize`, errors, 16, 160);
      finiteNumber(profile.anchorX, `${path}.anchorX`, errors, 0, 1);
      finiteNumber(profile.anchorY, `${path}.anchorY`, errors, 0, 1);
      finiteNumber(profile.facingOffsetDegrees, `${path}.facingOffsetDegrees`, errors, -180, 180);
      finiteNumber(profile.bodyWidth, `${path}.bodyWidth`, errors, 4, 128);
      finiteNumber(profile.bodyHeight, `${path}.bodyHeight`, errors, 4, 128);
      finiteNumber(profile.moveSpeed, `${path}.moveSpeed`, errors, 50, 600);
      finiteNumber(profile.sprintMultiplier, `${path}.sprintMultiplier`, errors, 1, 3);
      finiteNumber(profile.footstepIntervalMs, `${path}.footstepIntervalMs`, errors, 80, 1000);
    }
  }

  const camera = value.camera;
  if (!isRecord(camera)) {
    errors.push({ path: 'camera', message: '缺少镜头参数' });
  } else {
    const zoomLevels = camera.zoomLevels;
    if (!Array.isArray(zoomLevels) || zoomLevels.length !== 3) {
      errors.push({ path: 'camera.zoomLevels', message: '必须恰好包含三个缩放档位' });
    } else {
      zoomLevels.forEach((zoom, index) => {
        finiteNumber(zoom, `camera.zoomLevels.${index}`, errors, 0.25, 3);
      });
      if (zoomLevels.some((zoom, index) => (
        typeof zoom === 'number'
        && index > 0
        && typeof zoomLevels[index - 1] === 'number'
        && zoom <= zoomLevels[index - 1]
      ))) {
        errors.push({ path: 'camera.zoomLevels', message: '缩放档位必须严格递增' });
      }
    }
    const defaultZoomIndex = camera.defaultZoomIndex;
    if (
      typeof defaultZoomIndex !== 'number'
      || !Number.isInteger(defaultZoomIndex)
      || defaultZoomIndex < 0
      || defaultZoomIndex > 2
    ) {
      errors.push({ path: 'camera.defaultZoomIndex', message: '默认档位必须是 0、1 或 2' });
    }
    finiteNumber(camera.followLerp, 'camera.followLerp', errors, 0, 1);
    finiteNumber(camera.fadeInMs, 'camera.fadeInMs', errors, 0, 3000);
  }

  const audio = value.audio;
  if (!isRecord(audio)) {
    errors.push({ path: 'audio', message: '缺少音频参数' });
  } else {
    finiteNumber(audio.titleMusicVolume, 'audio.titleMusicVolume', errors, 0, 1);
    finiteNumber(audio.ambienceVolume, 'audio.ambienceVolume', errors, 0, 1);
    finiteNumber(audio.footstepVolume, 'audio.footstepVolume', errors, 0, 1);
  }

  const input = value.input;
  if (!isRecord(input)) {
    errors.push({ path: 'input', message: '缺少输入参数' });
  } else {
    finiteNumber(input.joystickDeadZone, 'input.joystickDeadZone', errors, 0, 0.5);
  }
  validateWorld(value.world, errors, warnings);
  const procedural = value.proceduralWorld;
  if (!isRecord(procedural)) {
    errors.push({ path: 'proceduralWorld', message: '缺少种子世界参数' });
  } else {
    if (procedural.generationVersion !== 'worldgen-v1') {
      errors.push({ path: 'proceduralWorld.generationVersion', message: '不支持的地图生成版本' });
    }
    if (procedural.configVersion !== 'procedural-v1') {
      errors.push({ path: 'proceduralWorld.configVersion', message: '不支持的地图配置版本' });
    }
    finiteNumber(procedural.tileSize, 'proceduralWorld.tileSize', errors, 8, 128);
    finiteNumber(procedural.chunkTiles, 'proceduralWorld.chunkTiles', errors, 4, 64);
    finiteNumber(procedural.loadRadius, 'proceduralWorld.loadRadius', errors, 1, 5);
    finiteNumber(procedural.unloadRadius, 'proceduralWorld.unloadRadius', errors, 1, 8);
    finiteNumber(procedural.cacheSize, 'proceduralWorld.cacheSize', errors, 1, 512);
    finiteNumber(procedural.generationBudgetMs, 'proceduralWorld.generationBudgetMs', errors, 1, 16);
    if (!isRecord(procedural.spawn)) {
      errors.push({ path: 'proceduralWorld.spawn', message: '必须是坐标对象' });
    } else {
      finiteNumber(procedural.spawn.x, 'proceduralWorld.spawn.x', errors, -1000000, 1000000);
      finiteNumber(procedural.spawn.y, 'proceduralWorld.spawn.y', errors, -1000000, 1000000);
    }
    finiteNumber(procedural.spawnClearRadius, 'proceduralWorld.spawnClearRadius', errors, 64, 1024);
    finiteNumber(procedural.waterThreshold, 'proceduralWorld.waterThreshold', errors, 0, 1);
    finiteNumber(procedural.wetThreshold, 'proceduralWorld.wetThreshold', errors, 0, 1);
    finiteNumber(procedural.mudThreshold, 'proceduralWorld.mudThreshold', errors, 0, 1);
    finiteNumber(procedural.mudHeightLimit, 'proceduralWorld.mudHeightLimit', errors, 0, 1);
    finiteNumber(procedural.treeDensity, 'proceduralWorld.treeDensity', errors, 0, 1);
    finiteNumber(procedural.rockDensity, 'proceduralWorld.rockDensity', errors, 0, 1);
    finiteNumber(procedural.logDensity, 'proceduralWorld.logDensity', errors, 0, 1);
    finiteNumber(procedural.decorationDensity, 'proceduralWorld.decorationDensity', errors, 0, 1);
    if (
      typeof procedural.loadRadius === 'number'
      && typeof procedural.unloadRadius === 'number'
      && procedural.unloadRadius < procedural.loadRadius
    ) {
      errors.push({ path: 'proceduralWorld.unloadRadius', message: '卸载半径不能小于加载半径' });
    }
  }
  const worldAssets = value.worldAssets;
  if (!isRecord(worldAssets) || !isRecord(worldAssets.slots)) {
    errors.push({ path: 'worldAssets', message: '缺少世界图片素材配置' });
  } else {
    for (const slotId of WORLD_ASSET_SLOT_IDS) {
      const binding = worldAssets.slots[slotId];
      validateWorldImageBinding(binding, `worldAssets.slots.${slotId}`, errors);
      const definition = getSlotDefinition(slotId);
      if (isRecord(binding) && definition.collidable && binding.collider === undefined) {
        errors.push({ path: `worldAssets.slots.${slotId}.collider`, message: '该槽位缺少碰撞箱配置' });
      }
      if (isRecord(binding) && definition.generated && binding.densityWeight === undefined) {
        errors.push({ path: `worldAssets.slots.${slotId}.densityWeight`, message: '该槽位缺少生成密度倍率' });
      }
    }
  }
  validateWildlife(value.wildlife, errors);
  return { errors, warnings };
}

export function isGameConfig(value: unknown): value is GameConfig {
  return validateGameConfig(value).errors.length === 0;
}
