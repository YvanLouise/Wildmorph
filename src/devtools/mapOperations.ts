import { cloneGameConfig, type GameConfig } from '../game/config/GameConfig';
import type { ObstacleDefinition, ObstacleKind, PointDefinition } from '../game/types';

export type MapSelection =
  | { readonly kind: 'spawn' }
  | { readonly kind: 'pond-center' }
  | { readonly kind: 'pond-vertex'; readonly index: number }
  | { readonly kind: 'teleport'; readonly index: number }
  | { readonly kind: 'obstacle'; readonly id: string };

function nextObstacleId(config: Readonly<GameConfig>, kind: ObstacleKind): string {
  const prefix = kind.replace(/[^a-z0-9]+/g, '-');
  let index = 1;
  while (config.world.obstacles.some(({ id }) => id === `${prefix}-${String(index).padStart(3, '0')}`)) {
    index += 1;
  }
  return `${prefix}-${String(index).padStart(3, '0')}`;
}

export function createObstacle(
  config: Readonly<GameConfig>,
  kind: ObstacleKind,
  point: PointDefinition,
): ObstacleDefinition {
  const circle = kind === 'rock' || kind === 'white-rock' || kind === 'water';
  return {
    id: nextObstacleId(config, kind),
    kind,
    x: point.x,
    y: point.y,
    visualScale: 1,
    rotation: 0,
    collider: circle
      ? { shape: 'circle', radius: kind === 'water' ? 100 : 28 }
      : { shape: 'rectangle', width: kind === 'fallen-log' ? 110 : 34, height: kind === 'fallen-log' ? 28 : 26 },
    collisionOnly: kind === 'water',
  };
}

export function moveSelection(
  config: Readonly<GameConfig>,
  selection: MapSelection,
  point: PointDefinition,
): GameConfig {
  const next = cloneGameConfig(config);
  if (selection.kind === 'spawn') {
    return { ...next, world: { ...next.world, spawn: point } };
  }
  if (selection.kind === 'pond-center') {
    return { ...next, world: { ...next.world, pondCenter: point } };
  }
  if (selection.kind === 'pond-vertex') {
    return {
      ...next,
      world: {
        ...next.world,
        pondPolygon: next.world.pondPolygon.map((vertex, index) => (
          index === selection.index ? point : vertex
        )),
      },
    };
  }
  if (selection.kind === 'teleport') {
    return {
      ...next,
      world: {
        ...next.world,
        teleportPoints: next.world.teleportPoints.map((teleport, index) => (
          index === selection.index ? point : teleport
        )),
      },
    };
  }
  if (selection.kind === 'obstacle') {
    return {
      ...next,
      world: {
        ...next.world,
        obstacles: next.world.obstacles.map((obstacle) => obstacle.id === selection.id
          ? { ...obstacle, x: point.x, y: point.y }
          : obstacle),
      },
    };
  }
  return next;
}
