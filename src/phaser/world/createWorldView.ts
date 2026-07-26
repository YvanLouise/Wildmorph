import Phaser from 'phaser';
import { defaultSlotForObstacle } from '../../game/assets/worldAssetConfig';
import { worldTextureKey, type ResolvedWorldAssets } from '../../game/assets/worldAssetLibrary';
import type { ObstacleDefinition, WorldImageBinding, WorldLayout } from '../../game/types';

export interface TreeOccluder {
  readonly x: number;
  readonly y: number;
  readonly canopyWidth: number;
  readonly canopyHeight: number;
  readonly canopy: Phaser.GameObjects.Image;
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
  binding: WorldImageBinding,
): TreeOccluder {
  const key = worldTextureKey(binding.sourceId);
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height)
    * (obstacle.visualScale ?? 1);
  const ancient = obstacle.kind === 'ancient-tree';
  const canopyCut = Math.round(source.height * (binding.canopyCutRatio ?? 0.76));
  const canopyWidth = source.width * scale;
  const canopyHeight = canopyCut * scale;
  const container = scene.add.container(obstacle.x, obstacle.y)
    .setDepth(obstacle.y + 1)
    .setRotation(obstacle.rotation ?? 0);
  const trunk = scene.add.image(0, 0, key)
    .setOrigin(binding.anchorX, binding.anchorY)
    .setScale(scale)
    .setCrop(0, canopyCut, source.width, source.height - canopyCut);
  const canopy = scene.add.image(0, 0, key)
    .setOrigin(binding.anchorX, binding.anchorY)
    .setScale(scale)
    .setCrop(0, 0, source.width, canopyCut);
  container.add([trunk, canopy]);
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
  binding: WorldImageBinding,
): Phaser.GameObjects.Container {
  const key = worldTextureKey(binding.sourceId);
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height)
    * (obstacle.visualScale ?? 1);
  const image = scene.add.image(0, 0, key)
    .setOrigin(binding.anchorX, binding.anchorY)
    .setScale(scale);
  const container = scene.add.container(obstacle.x, obstacle.y, [image])
    .setDepth(obstacle.y)
    .setRotation(obstacle.rotation ?? 0);
  return container;
}

function createFallenLog(
  scene: Phaser.Scene,
  obstacle: ObstacleDefinition,
  binding: WorldImageBinding,
): Phaser.GameObjects.Container {
  const key = worldTextureKey(binding.sourceId);
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height)
    * (obstacle.visualScale ?? 1);
  const image = scene.add.image(0, 0, key)
    .setOrigin(binding.anchorX, binding.anchorY)
    .setScale(scale);
  const container = scene.add.container(obstacle.x, obstacle.y)
    .setDepth(obstacle.y)
    .setRotation(obstacle.rotation ?? 0);
  container.add(image);
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
  assets: ResolvedWorldAssets,
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
        const slot = defaultSlotForObstacle(obstacle.kind)!;
        const tree = createTree(scene, obstacle, animated, assets.obstacleOverrides.get(obstacle.id) ?? assets.slots[slot]);
        trees.push(tree);
        objects.set(obstacle.id, tree.display);
        break;
      }
      case 'rock':
      case 'white-rock':
        objects.set(obstacle.id, createRock(scene, obstacle, assets.obstacleOverrides.get(obstacle.id) ?? assets.slots[defaultSlotForObstacle(obstacle.kind)!]));
        break;
      case 'fallen-log':
        objects.set(obstacle.id, createFallenLog(scene, obstacle, assets.obstacleOverrides.get(obstacle.id) ?? assets.slots['fixed.fallen-log']));
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
