import type { ColliderDefinition, ObstacleDefinition, PointDefinition, WorldLayout } from '../types';

const tree = (
  id: string,
  x: number,
  y: number,
  visualScale = 1,
  kind: ObstacleDefinition['kind'] = 'tree',
): ObstacleDefinition => ({
  id,
  kind,
  x,
  y,
  visualScale,
  collider: kind === 'ancient-tree'
    ? { shape: 'rectangle', width: 70, height: 46 }
    : { shape: 'rectangle', width: 34, height: 26 },
});

const rock = (
  id: string,
  x: number,
  y: number,
  radius: number,
  kind: ObstacleDefinition['kind'] = 'rock',
): ObstacleDefinition => ({
  id,
  kind,
  x,
  y,
  visualScale: radius / 28,
  collider: { shape: 'circle', radius },
});

const waterCollider = (
  id: string,
  x: number,
  y: number,
  collider: ColliderDefinition,
): ObstacleDefinition => ({
  id,
  kind: 'water',
  x,
  y,
  collider,
  collisionOnly: true,
});

export const WORLD_LAYOUT: WorldLayout = {
  width: 2400,
  height: 1600,
  spawn: { x: 1200, y: 960 },
  spawnClearRadius: 300,
  pondCenter: { x: 1960, y: 770 },
  pondPolygon: [
    { x: 1690, y: 705 },
    { x: 1760, y: 595 },
    { x: 1925, y: 555 },
    { x: 2090, y: 590 },
    { x: 2240, y: 700 },
    { x: 2260, y: 835 },
    { x: 2170, y: 945 },
    { x: 1980, y: 985 },
    { x: 1810, y: 930 },
    { x: 1695, y: 825 },
  ],
  obstacles: [
    tree('ancient-tree', 1200, 270, 1.7, 'ancient-tree'),
    tree('tree-n01', 245, 285, 1.08),
    tree('tree-n02', 420, 170, 0.96),
    tree('tree-n03', 505, 425, 1.14),
    tree('tree-n04', 690, 245, 0.9),
    tree('tree-n05', 815, 520, 1.12),
    tree('tree-n06', 980, 150, 1.04),
    tree('tree-n07', 1050, 565, 0.96),
    tree('tree-n08', 1370, 160, 1.1),
    tree('tree-n09', 1480, 440, 1.16),
    tree('tree-n10', 1655, 220, 0.98),
    tree('tree-n11', 1815, 490, 1.05),
    tree('tree-n12', 2050, 255, 1.12),
    tree('tree-n13', 2220, 505, 0.92),
    tree('tree-west-01', 155, 650, 1.02),
    tree('tree-west-02', 310, 760, 0.94),
    tree('tree-east-01', 2280, 1080, 1.04),
    rock('rock-sw01', 280, 1060, 30),
    rock('rock-sw02', 405, 1160, 24),
    rock('broken-white-stone', 520, 1240, 50, 'white-rock'),
    rock('rock-sw03', 680, 1090, 34),
    rock('rock-sw04', 785, 1335, 42),
    rock('rock-sw05', 920, 1175, 26),
    rock('rock-sw06', 300, 1400, 34),
    {
      id: 'log-sw01',
      kind: 'fallen-log',
      x: 610,
      y: 1430,
      rotation: -0.18,
      collider: { shape: 'rectangle', width: 118, height: 28 },
    },
    {
      id: 'log-sw02',
      kind: 'fallen-log',
      x: 830,
      y: 1000,
      rotation: 0.12,
      collider: { shape: 'rectangle', width: 104, height: 26 },
    },
    waterCollider('water-west', 1805, 780, { shape: 'circle', radius: 128 }),
    waterCollider('water-center', 1970, 765, { shape: 'circle', radius: 180 }),
    waterCollider('water-east', 2140, 770, { shape: 'circle', radius: 120 }),
    waterCollider('water-north', 1970, 635, { shape: 'rectangle', width: 235, height: 105 }),
    waterCollider('water-south', 1980, 900, { shape: 'rectangle', width: 250, height: 92 }),
  ],
  teleportPoints: [
    { x: 150, y: 150 },
    { x: 2250, y: 150 },
    { x: 150, y: 1450 },
    { x: 2250, y: 1450 },
  ],
};

function colliderRadius(collider: ColliderDefinition): number {
  return collider.shape === 'circle'
    ? collider.radius
    : Math.hypot(collider.width / 2, collider.height / 2);
}

export function distanceBetween(a: PointDefinition, b: PointDefinition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function validateWorldLayout(layout: WorldLayout): readonly string[] {
  const errors: string[] = [];

  for (const obstacle of layout.obstacles) {
    const radius = colliderRadius(obstacle.collider);
    const colliderCenter = {
      x: obstacle.x + (obstacle.collider.offsetX ?? 0),
      y: obstacle.y + (obstacle.collider.offsetY ?? 0),
    };
    if (
      colliderCenter.x - radius < 0 ||
      colliderCenter.y - radius < 0 ||
      colliderCenter.x + radius > layout.width ||
      colliderCenter.y + radius > layout.height
    ) {
      errors.push(`${obstacle.id} exceeds world bounds`);
    }

    const distanceFromSpawn = distanceBetween(layout.spawn, colliderCenter);
    if (distanceFromSpawn - radius < layout.spawnClearRadius) {
      errors.push(`${obstacle.id} violates spawn clearance`);
    }
  }

  return errors;
}
