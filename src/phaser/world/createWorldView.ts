import Phaser from 'phaser';
import type { ObstacleDefinition, WorldLayout } from '../../game/types';

export interface TreeOccluder {
  readonly x: number;
  readonly y: number;
  readonly canopyWidth: number;
  readonly canopyHeight: number;
  readonly canopy: Phaser.GameObjects.Graphics;
  readonly display: Phaser.GameObjects.Container;
}

export interface WorldView {
  readonly trees: readonly TreeOccluder[];
  readonly objects: ReadonlyMap<string, Phaser.GameObjects.Container>;
}

export interface WorldViewOptions {
  readonly animated?: boolean;
  readonly ambientMotion?: boolean;
}

const COLORS = {
  ground: 0x657256,
  groundLight: 0x798365,
  groundDark: 0x4f6049,
  wetEarth: 0x596052,
  water: 0x476d68,
  waterDeep: 0x365a58,
  waterLight: 0x75918a,
  trunk: 0x554233,
  trunkLight: 0x725743,
  crownDark: 0x2e513d,
  crown: 0x42694d,
  crownLight: 0x5e7d58,
  rock: 0x6c7168,
  rockLight: 0x96998a,
  whiteRock: 0xc7c4ad,
  whiteRockShadow: 0x898b7d,
  grass: 0x465f43,
  grassLight: 0x70805a,
  reed: 0x78835b,
  flower: 0xd8c887,
  leaf: 0xa07b46,
} as const;

function createGround(scene: Phaser.Scene, layout: WorldLayout): void {
  const random = new Phaser.Math.RandomDataGenerator(['tuye-demo-0.1-ground']);
  const ground = scene.add.graphics().setDepth(0);

  ground.fillStyle(COLORS.ground, 1);
  ground.fillRect(0, 0, layout.width, layout.height);

  ground.fillStyle(COLORS.groundDark, 0.18);
  ground.fillEllipse(680, 1210, 1150, 690);
  ground.fillStyle(COLORS.groundLight, 0.12);
  ground.fillEllipse(1210, 850, 980, 620);
  ground.fillStyle(COLORS.wetEarth, 0.24);
  ground.fillEllipse(layout.pondCenter.x, layout.pondCenter.y + 12, 720, 560);
  ground.fillStyle(0x324b3a, 0.2);
  ground.fillRect(0, 0, layout.width, 600);

  for (let index = 0; index < 620; index += 1) {
    const x = random.between(16, layout.width - 16);
    const y = random.between(16, layout.height - 16);
    const radius = random.realInRange(1.2, 4.8);
    const shade = random.pick([COLORS.groundLight, COLORS.groundDark, 0x8b8968]);
    ground.fillStyle(shade, random.realInRange(0.05, 0.14));
    ground.fillCircle(x, y, radius);
  }

  for (let index = 0; index < 180; index += 1) {
    const x = random.between(28, layout.width - 28);
    const y = random.between(40, layout.height - 28);
    if (Phaser.Math.Distance.Between(x, y, layout.spawn.x, layout.spawn.y) < 220) {
      continue;
    }
    const size = random.realInRange(4, 10);
    ground.lineStyle(1.6, random.pick([COLORS.grass, COLORS.grassLight]), 0.52);
    ground.beginPath();
    ground.moveTo(x, y);
    ground.lineTo(x - size * 0.28, y - size);
    ground.moveTo(x, y);
    ground.lineTo(x + size * 0.38, y - size * 0.86);
    ground.strokePath();
  }

  for (let index = 0; index < 34; index += 1) {
    const x = random.between(360, 1540);
    const y = random.between(690, 1250);
    if (Phaser.Math.Distance.Between(x, y, layout.spawn.x, layout.spawn.y) < 170) {
      continue;
    }
    ground.fillStyle(COLORS.flower, 0.72);
    ground.fillCircle(x, y, random.realInRange(1.8, 3.2));
  }
}

function createPond(scene: Phaser.Scene, layout: WorldLayout, animated: boolean): void {
  const points = layout.pondPolygon.map(({ x, y }) => new Phaser.Geom.Point(x, y));
  const water = scene.add.graphics().setDepth(18);
  water.fillStyle(0x465148, 0.55);
  water.fillPoints(points.map((point) => new Phaser.Geom.Point(
    layout.pondCenter.x + (point.x - layout.pondCenter.x) * 1.06,
    layout.pondCenter.y + (point.y - layout.pondCenter.y) * 1.08,
  )), true);
  water.fillStyle(COLORS.waterDeep, 1);
  water.fillPoints(points, true);
  water.fillStyle(COLORS.water, 1);
  water.fillEllipse(layout.pondCenter.x, layout.pondCenter.y + 8, 510, 355);
  water.fillStyle(COLORS.waterLight, 0.1);
  water.fillEllipse(layout.pondCenter.x - 42, layout.pondCenter.y - 42, 360, 190);

  const rippleData = [
    [1815, 710, 78, 24],
    [1985, 675, 104, 30],
    [2110, 835, 72, 22],
    [1925, 900, 120, 32],
  ] as const;

  rippleData.forEach(([x, y, width, height], index) => {
    const ripple = scene.add.ellipse(x, y, width, height)
      .setStrokeStyle(2, COLORS.waterLight, 0.4)
      .setFillStyle(0x000000, 0)
      .setDepth(19);
    if (animated) {
      scene.tweens.add({
        targets: ripple,
        scaleX: 1.34,
        scaleY: 1.34,
        alpha: 0.05,
        duration: 2600 + index * 310,
        repeat: -1,
        delay: index * 460,
      });
    }
  });

  const random = new Phaser.Math.RandomDataGenerator(['tuye-demo-0.1-pond']);
  for (let index = 0; index < 26; index += 1) {
    const angle = random.realInRange(0, Math.PI * 2);
    const radiusX = random.realInRange(260, 330);
    const radiusY = random.realInRange(185, 245);
    const x = layout.pondCenter.x + Math.cos(angle) * radiusX;
    const y = layout.pondCenter.y + Math.sin(angle) * radiusY;
    const reed = scene.add.rectangle(x, y - 10, 3, random.between(18, 34), COLORS.reed, 0.9)
      .setOrigin(0.5, 1)
      .setRotation(random.realInRange(-0.18, 0.18))
      .setDepth(25 + y);
    if (animated) {
      scene.tweens.add({
        targets: reed,
        angle: reed.angle + random.realInRange(-3, 3),
        duration: random.between(1800, 3100),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  for (let index = 0; index < 7; index += 1) {
    const leaf = scene.add.ellipse(
      random.between(1780, 2170),
      random.between(630, 920),
      random.between(10, 17),
      random.between(5, 8),
      COLORS.leaf,
      0.72,
    ).setDepth(21).setRotation(random.realInRange(0, Math.PI));
    if (animated) {
      scene.tweens.add({
        targets: leaf,
        x: leaf.x + random.between(-20, 28),
        y: leaf.y + random.between(-8, 12),
        angle: leaf.angle + random.between(-18, 18),
        duration: random.between(3800, 6800),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }
}

function createTree(
  scene: Phaser.Scene,
  obstacle: ObstacleDefinition,
  animated: boolean,
): TreeOccluder {
  const scale = obstacle.visualScale ?? 1;
  const ancient = obstacle.kind === 'ancient-tree';
  const canopyWidth = (ancient ? 220 : 118) * scale;
  const canopyHeight = (ancient ? 205 : 126) * scale;
  const container = scene.add.container(obstacle.x, obstacle.y).setDepth(obstacle.y + 1);
  const shadow = scene.add.ellipse(0, 5, canopyWidth * 0.58, 28 * scale, 0x17231c, 0.28);
  const trunk = scene.add.rectangle(0, -28 * scale, (ancient ? 34 : 20) * scale, (ancient ? 86 : 58) * scale, COLORS.trunk)
    .setStrokeStyle(3 * scale, COLORS.trunkLight, 0.62);
  const trunkMark = scene.add.rectangle(-4 * scale, -32 * scale, 3 * scale, 42 * scale, COLORS.trunkLight, 0.38);
  const canopy = scene.add.graphics();

  canopy.fillStyle(COLORS.crownDark, 0.98);
  canopy.fillEllipse(0, -82 * scale, canopyWidth, canopyHeight * 0.76);
  canopy.fillStyle(COLORS.crown, 1);
  canopy.fillCircle(-canopyWidth * 0.22, -86 * scale, canopyWidth * 0.29);
  canopy.fillCircle(canopyWidth * 0.2, -92 * scale, canopyWidth * 0.31);
  canopy.fillCircle(0, -118 * scale, canopyWidth * 0.3);
  canopy.fillStyle(COLORS.crownLight, 0.54);
  canopy.fillEllipse(-canopyWidth * 0.12, -126 * scale, canopyWidth * 0.38, canopyHeight * 0.2);

  if (ancient) {
    canopy.lineStyle(4, 0x90a06d, 0.28);
    canopy.beginPath();
    canopy.moveTo(-64, -154);
    canopy.lineTo(-102, -185);
    canopy.moveTo(74, -152);
    canopy.lineTo(116, -177);
    canopy.strokePath();
  }

  container.add([shadow, trunk, trunkMark, canopy]);
  if (animated) {
    scene.tweens.add({
      targets: canopy,
      angle: ancient ? 0.55 : 0.9,
      x: ancient ? 1.5 : 1,
      duration: ancient ? 4300 : 3000 + (obstacle.x % 900),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  return {
    x: obstacle.x,
    y: obstacle.y,
    canopyWidth,
    canopyHeight,
    canopy,
    display: container,
  };
}

function createRock(
  scene: Phaser.Scene,
  obstacle: ObstacleDefinition,
): Phaser.GameObjects.Container {
  const scale = obstacle.visualScale ?? 1;
  const white = obstacle.kind === 'white-rock';
  const width = (white ? 118 : 62) * scale;
  const height = (white ? 90 : 48) * scale;
  const container = scene.add.container(obstacle.x, obstacle.y).setDepth(obstacle.y);
  const shadow = scene.add.ellipse(2, 7, width * 0.94, height * 0.42, 0x1b241f, 0.3);
  const graphic = scene.add.graphics();
  const points = [
    new Phaser.Geom.Point(-width * 0.48, 5),
    new Phaser.Geom.Point(-width * 0.28, -height * 0.42),
    new Phaser.Geom.Point(width * 0.12, -height * 0.52),
    new Phaser.Geom.Point(width * 0.47, -height * 0.12),
    new Phaser.Geom.Point(width * 0.36, height * 0.38),
    new Phaser.Geom.Point(-width * 0.22, height * 0.44),
  ];
  graphic.fillStyle(white ? COLORS.whiteRockShadow : COLORS.rock, 1);
  graphic.fillPoints(points, true);
  graphic.fillStyle(white ? COLORS.whiteRock : COLORS.rockLight, white ? 0.95 : 0.58);
  graphic.fillPoints([
    points[0],
    points[1],
    points[2],
    new Phaser.Geom.Point(width * 0.12, 0),
    new Phaser.Geom.Point(-width * 0.12, height * 0.08),
  ], true);
  if (white) {
    graphic.lineStyle(3, 0x6f746b, 0.8);
    graphic.beginPath();
    graphic.moveTo(-8, -height * 0.44);
    graphic.lineTo(-18, -8);
    graphic.lineTo(4, 7);
    graphic.lineTo(-5, height * 0.3);
    graphic.strokePath();
  }
  container.add([shadow, graphic]);
  return container;
}

function createFallenLog(
  scene: Phaser.Scene,
  obstacle: ObstacleDefinition,
): Phaser.GameObjects.Container {
  const width = obstacle.collider.shape === 'rectangle' ? obstacle.collider.width : 110;
  const height = obstacle.collider.shape === 'rectangle' ? obstacle.collider.height : 28;
  const container = scene.add.container(obstacle.x, obstacle.y)
    .setDepth(obstacle.y)
    .setRotation(obstacle.rotation ?? 0);
  const shadow = scene.add.ellipse(0, 7, width + 14, height * 0.72, 0x17201b, 0.28);
  const trunk = scene.add.rectangle(0, 0, width, height, COLORS.trunk)
    .setStrokeStyle(3, 0x3b3027, 0.8);
  const end = scene.add.ellipse(-width / 2, 0, 13, height - 4, COLORS.trunkLight)
    .setStrokeStyle(2, 0x3b3027, 0.8);
  const branch = scene.add.rectangle(width * 0.18, -10, 30, 8, COLORS.trunk)
    .setOrigin(0.1, 0.5)
    .setRotation(-0.65);
  container.add([shadow, trunk, end, branch]);
  return container;
}

function createAmbientMotion(scene: Phaser.Scene, layout: WorldLayout): void {
  const random = new Phaser.Math.RandomDataGenerator(['tuye-demo-0.1-air']);

  for (let index = 0; index < 28; index += 1) {
    const pollen = scene.add.ellipse(
      random.between(30, layout.width - 30),
      random.between(30, layout.height - 30),
      random.realInRange(2, 4),
      random.realInRange(2, 4),
      0xe6d8a0,
      random.realInRange(0.15, 0.36),
    ).setDepth(5000);
    scene.tweens.add({
      targets: pollen,
      x: pollen.x + random.between(30, 95),
      y: pollen.y + random.between(-35, 30),
      alpha: random.realInRange(0.08, 0.28),
      duration: random.between(4800, 9000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  for (let index = 0; index < 13; index += 1) {
    const leaf = scene.add.ellipse(
      random.between(50, layout.width - 50),
      random.between(20, layout.height - 250),
      random.between(8, 14),
      random.between(4, 7),
      random.pick([0x9d7542, 0xb28b51, 0x7e6d3e]),
      0.62,
    ).setDepth(5100).setRotation(random.realInRange(0, Math.PI));
    scene.tweens.add({
      targets: leaf,
      y: leaf.y + random.between(130, 260),
      x: leaf.x + random.between(-70, 70),
      angle: leaf.angle + random.between(120, 260),
      duration: random.between(5200, 9200),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }
}

export function createWorldView(
  scene: Phaser.Scene,
  layout: WorldLayout,
  options: WorldViewOptions = {},
): WorldView {
  const animated = options.animated ?? true;
  createGround(scene, layout);
  createPond(scene, layout, animated);

  const trees: TreeOccluder[] = [];
  const objects = new Map<string, Phaser.GameObjects.Container>();
  for (const obstacle of layout.obstacles) {
    if (obstacle.collisionOnly) {
      continue;
    }
    switch (obstacle.kind) {
      case 'tree':
      case 'ancient-tree': {
        const tree = createTree(scene, obstacle, animated);
        trees.push(tree);
        objects.set(obstacle.id, tree.display);
        break;
      }
      case 'rock':
      case 'white-rock':
        objects.set(obstacle.id, createRock(scene, obstacle));
        break;
      case 'fallen-log':
        objects.set(obstacle.id, createFallenLog(scene, obstacle));
        break;
      case 'water':
        break;
    }
  }

  if (options.ambientMotion ?? true) {
    createAmbientMotion(scene, layout);
  }
  return { trees, objects };
}
