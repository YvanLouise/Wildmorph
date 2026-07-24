import { WORLD_LAYOUT } from '../content/worldLayout';
import type {
  ColliderDefinition,
  ObstacleDefinition,
  PointDefinition,
  WorldLayout,
} from '../types';

export const GAME_CONFIG_SCHEMA_VERSION = 1 as const;

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
  readonly camera: CameraConfig;
  readonly audio: AudioConfig;
  readonly input: InputConfig;
  readonly world: WorldLayout;
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
  if (collider.shape === 'circle') {
    return finiteNumber(collider.radius, `${path}.radius`, errors, 1, 5000);
  }
  if (collider.shape === 'rectangle') {
    const widthValid = finiteNumber(collider.width, `${path}.width`, errors, 1, 5000);
    const heightValid = finiteNumber(collider.height, `${path}.height`, errors, 1, 5000);
    return widthValid && heightValid;
  }
  errors.push({ path: `${path}.shape`, message: '只支持 circle 或 rectangle' });
  return false;
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
    if (
      obstacle.x - radius < 0
      || obstacle.y - radius < 0
      || obstacle.x + radius > width
      || obstacle.y + radius > height
    ) {
      errors.push({ path: `world.obstacles.${index}`, message: '碰撞体超出世界边界' });
    }
    if (spawnValid && typeof value.spawnClearRadius === 'number') {
      const spawn = value.spawn as PointDefinition;
      if (Math.hypot(obstacle.x - spawn.x, obstacle.y - spawn.y) - radius < value.spawnClearRadius) {
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
  return { errors, warnings };
}

export function isGameConfig(value: unknown): value is GameConfig {
  return validateGameConfig(value).errors.length === 0;
}
