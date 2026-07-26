import Phaser from 'phaser';
import { WILDLIFE_ASSET_KEYS } from '../../game/assets/manifest';
import { worldTextureKey, type ResolvedWorldAssets } from '../../game/assets/worldAssetLibrary';
import type { CharacterId, CharacterProfileConfig } from '../../game/config/characterProfiles';
import type {
  ChunkCoord,
  ChunkKey,
  GeneratedChunkData,
  GeneratedDecoration,
  GeneratedObstacle,
  ProceduralWorldConfig,
  TouchVector,
  WorldGenerationTelemetry,
  WorldSeed,
  WorldAssetSlotId,
  WildlifeEntitySnapshot,
  WildlifeGlobalConfig,
} from '../../game/types';
import { ChunkManager } from '../../game/world/ChunkManager';
import { chunkOrigin, worldToChunk } from '../../game/world/coordinates';
import { generateChunk } from '../../game/world/generateChunk';
import { NavigationField } from '../../game/wildlife/NavigationField';
import { WildlifeSystem } from '../../game/wildlife/WildlifeSystem';
import {
  collectMaskRectangles,
  collectTerrainRectangles,
  type TerrainRectangle,
} from '../../game/world/terrainGeometry';

interface Occluder {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly canopy: Phaser.GameObjects.Image;
}

interface ChunkView {
  readonly data: GeneratedChunkData;
  readonly objects: Phaser.GameObjects.GameObject[];
  readonly colliders: Phaser.GameObjects.Zone[];
  readonly occluders: Occluder[];
  readonly terrainTextureKey: string;
}

export interface SeededDebugLayers {
  readonly chunks: boolean;
  readonly terrain: boolean;
  readonly collision: boolean;
  readonly spawn: boolean;
  readonly wildlife: boolean;
}

const TERRAIN_COLORS = {
  grass: 0x657256,
  'wet-grass': 0x536955,
  mud: 0x615b49,
  water: 0x3e6968,
} as const;

function colorCss(color: number, alpha = 1): string {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function appendRoundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function hashUnit(x: number, y: number, salt: number): number {
  let value = Math.imul(x ^ salt, 0x45d9f3b) ^ Math.imul(y + salt, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

export class SeededWorldRuntime {
  private seed: WorldSeed;
  private manager: ChunkManager;
  private readonly views = new Map<ChunkKey, ChunkView>();
  private readonly collisionGroup: Phaser.Physics.Arcade.StaticGroup;
  private readonly playerCollider: Phaser.Physics.Arcade.Collider;
  private readonly terrainLayer: Phaser.GameObjects.Layer;
  private readonly entityLayer: Phaser.GameObjects.Layer;
  private objectCount = 0;
  private colliderCount = 0;
  private currentChunk: ChunkCoord = { x: 0, y: 0 };
  private readonly navigation: NavigationField;
  private readonly wildlifeSystem: WildlifeSystem;
  private readonly wildlifeImages = new Map<string, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Zone,
    playerSprite: Phaser.GameObjects.Image,
    seed: WorldSeed,
    private readonly config: ProceduralWorldConfig,
    private readonly worldAssets: ResolvedWorldAssets,
    private readonly characterProfiles: Readonly<Record<CharacterId, CharacterProfileConfig>>,
    private readonly wildlifeConfig: WildlifeGlobalConfig,
  ) {
    this.seed = seed;
    this.manager = new ChunkManager(seed, config, worldAssets, wildlifeConfig);
    this.navigation = new NavigationField(config, wildlifeConfig);
    this.wildlifeSystem = new WildlifeSystem(wildlifeConfig, this.navigation);
    this.collisionGroup = scene.physics.add.staticGroup();
    this.playerCollider = scene.physics.add.collider(player, this.collisionGroup);
    this.terrainLayer = scene.add.layer().setDepth(-300);
    this.entityLayer = scene.add.layer().setDepth(0);
    this.entityLayer.add(playerSprite);
  }

  initialize(): void {
    this.currentChunk = worldToChunk(this.config.spawn, this.chunkSize);
    const delta = this.manager.initialize(this.currentChunk);
    delta.loaded.forEach((chunk) => this.mount(chunk));
    this.wildlifeSystem.update(this.wildlifeConfig.simulationStepMs, this.config.spawn);
    this.syncWildlifeImages();
  }

  update(playerX: number, playerY: number, heading: TouchVector, deltaMs: number): void {
    const chunk = worldToChunk({ x: playerX, y: playerY }, this.chunkSize);
    const delta = this.manager.update(chunk, heading);
    delta.unloaded.forEach((key) => this.unmount(key));
    this.currentChunk = chunk;
    this.manager.processQueue().forEach((data) => this.mount(data));
    this.wildlifeSystem.update(deltaMs, { x: playerX, y: playerY });
    this.syncWildlifeImages();
  }

  resetSeed(seed: WorldSeed): void {
    const delta = this.manager.reset(seed);
    delta.unloaded.forEach((key) => this.unmount(key));
    this.wildlifeSystem.clear();
    this.seed = seed;
    this.currentChunk = worldToChunk(this.config.spawn, this.chunkSize);
    this.manager.initialize(this.currentChunk).loaded.forEach((chunk) => this.mount(chunk));
    this.wildlifeSystem.update(this.wildlifeConfig.simulationStepMs, this.config.spawn);
    this.syncWildlifeImages();
  }

  refresh(): void {
    const delta = this.manager.refresh();
    delta.unloaded.forEach((key) => this.unmount(key));
    this.wildlifeSystem.clear();
    delta.loaded.forEach((chunk) => this.mount(chunk));
    this.wildlifeSystem.update(this.wildlifeConfig.simulationStepMs, this.config.spawn);
    this.syncWildlifeImages();
  }

  getFingerprint(x: number, y: number): string {
    return this.manager.getChunk({ x, y })?.fingerprint
      ?? generateChunk(this.seed, this.config, { x, y }, this.worldAssets, this.wildlifeConfig).fingerprint;
  }

  getChunkData(x: number, y: number): Readonly<GeneratedChunkData> {
    return this.manager.getChunk({ x, y }) ?? generateChunk(this.seed, this.config, { x, y }, this.worldAssets, this.wildlifeConfig);
  }

  getWildlifeSnapshots(): readonly Readonly<WildlifeEntitySnapshot>[] {
    return this.wildlifeSystem.snapshots();
  }

  updateOcclusion(playerX: number, playerY: number): void {
    for (const view of this.views.values()) {
      for (const tree of view.occluders) {
        const behind = playerY < tree.y + 8
          && playerY > tree.y - tree.height
          && Math.abs(playerX - tree.x) < tree.width * 0.45;
        tree.canopy.setAlpha(behind ? 0.68 : 1);
      }
    }
  }

  drawDebug(graphics: Phaser.GameObjects.Graphics, layers: SeededDebugLayers): void {
    if (layers.terrain) {
      for (const view of this.views.values()) {
        const origin = chunkOrigin(view.data.coord, this.chunkSize);
        view.data.terrain.forEach((terrain, index) => {
          graphics.fillStyle(TERRAIN_COLORS[terrain], 0.35);
          graphics.fillRect(
            origin.x + (index % this.config.chunkTiles) * this.config.tileSize,
            origin.y + Math.floor(index / this.config.chunkTiles) * this.config.tileSize,
            this.config.tileSize,
            this.config.tileSize,
          );
        });
      }
    }
    if (layers.collision) {
      graphics.lineStyle(2, 0x8edbc3, 0.72);
      for (const view of this.views.values()) {
        for (const zone of view.colliders) {
          const body = zone.body as Phaser.Physics.Arcade.StaticBody;
          graphics.strokeRect(body.x, body.y, body.width, body.height);
        }
      }
    }
    if (layers.chunks) {
      graphics.lineStyle(3, 0xf2cf72, 0.76);
      for (const key of this.views.keys()) {
        const [x, y] = key.split(',').map(Number);
        const origin = chunkOrigin({ x, y }, this.chunkSize);
        graphics.strokeRect(origin.x, origin.y, this.chunkSize, this.chunkSize);
      }
    }
    if (layers.spawn) {
      graphics.lineStyle(4, 0xdde79c, 0.85);
      graphics.strokeCircle(this.config.spawn.x, this.config.spawn.y, this.config.spawnClearRadius);
    }
    if (layers.wildlife) {
      const animals = this.wildlifeSystem.snapshots();
      const byId = new Map(animals.map((animal) => [animal.id, animal]));
      const groupLeaders = new Map<string, WildlifeEntitySnapshot>();
      for (const animal of animals) {
        const leader = groupLeaders.get(animal.groupId);
        if (!leader || animal.id.localeCompare(leader.id) < 0) groupLeaders.set(animal.groupId, animal);
      }
      for (const animal of animals) {
        const config = this.wildlifeConfig.species[animal.species];
        graphics.lineStyle(1, 0xffd27a, 0.5);
        graphics.strokeCircle(animal.x, animal.y, config.detectionRadius);
        graphics.lineStyle(1, 0x8ccf9b, 0.28);
        graphics.strokeCircle(animal.x, animal.y, config.territoryRadius);
        graphics.lineStyle(2, 0xff8f70, 0.7);
        graphics.strokeCircle(animal.x, animal.y, 12);
        const target = animal.targetId === 'player'
          ? this.player
          : animal.targetId ? byId.get(animal.targetId) : undefined;
        if (target) {
          graphics.lineStyle(2, 0xff8f70, 0.7);
          graphics.lineBetween(animal.x, animal.y, target.x, target.y);
        }
        const leader = groupLeaders.get(animal.groupId);
        if (leader && leader.id !== animal.id) {
          graphics.lineStyle(1, 0x8fd8ff, 0.35);
          graphics.lineBetween(animal.x, animal.y, leader.x, leader.y);
        }
        graphics.lineStyle(1, 0x9bd8ff, 0.65);
        let fromX = animal.x;
        let fromY = animal.y;
        for (const point of animal.path) {
          graphics.lineBetween(fromX, fromY, point.x, point.y);
          fromX = point.x;
          fromY = point.y;
        }
      }
    }
  }

  telemetry(): WorldGenerationTelemetry {
    return {
      mode: 'seeded',
      seed: this.seed.text,
      generationVersion: this.config.generationVersion,
      chunk: { ...this.currentChunk },
      activeChunks: this.manager.activeCount,
      cachedChunks: this.manager.cachedCount,
      lastGenerationMs: this.manager.lastGenerationMs,
      objectCount: this.objectCount + this.wildlifeImages.size,
      colliderCount: this.colliderCount,
      wildlife: this.wildlifeSystem.telemetry(),
    };
  }

  destroy(): void {
    this.manager.destroy().forEach((key) => this.unmount(key));
    this.playerCollider.destroy();
    this.collisionGroup.destroy(true);
    this.terrainLayer.destroy();
    this.entityLayer.destroy();
    this.wildlifeImages.clear();
    this.wildlifeSystem.clear();
  }

  private get chunkSize(): number {
    return this.config.tileSize * this.config.chunkTiles;
  }

  private mount(data: GeneratedChunkData): void {
    if (this.views.has(data.key)) return;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const colliders: Phaser.GameObjects.Zone[] = [];
    const occluders: Occluder[] = [];
    const origin = chunkOrigin(data.coord, this.chunkSize);
    const terrainTextureKey = this.terrainTextureKey(data);
    const terrainImage = this.createTerrainImage(data, terrainTextureKey, origin.x, origin.y);
    this.terrainLayer.add(terrainImage);
    objects.push(terrainImage);

    for (const run of data.waterColliders) {
      colliders.push(this.createCollider(run.x, run.y, run.width, run.height));
    }
    for (const obstacle of data.obstacles) {
      const mounted = this.createObstacle(obstacle);
      this.entityLayer.add(mounted.objects);
      objects.push(...mounted.objects);
      colliders.push(this.createCollider(
        obstacle.x + (obstacle.collider.offsetX ?? 0),
        obstacle.y + (obstacle.collider.offsetY ?? 0),
        obstacle.collider.shape === 'circle' ? obstacle.collider.radius * 2 : obstacle.collider.width,
        obstacle.collider.shape === 'circle' ? obstacle.collider.radius * 2 : obstacle.collider.height,
        obstacle.collider.shape === 'circle' ? obstacle.collider.radius : undefined,
      ));
      if (mounted.occluder) occluders.push(mounted.occluder);
    }
    for (const decoration of data.decorations) {
      const image = this.createDecoration(decoration);
      this.entityLayer.add(image);
      objects.push(image);
    }

    this.views.set(data.key, { data, objects, colliders, occluders, terrainTextureKey });
    this.wildlifeSystem.mountChunk(data);
    this.objectCount += objects.length;
    this.colliderCount += colliders.length;
  }

  private terrainTextureKey(data: GeneratedChunkData): string {
    return `wildmorph:terrain:${this.scene.sys.settings.key}:${data.key}:${data.fingerprint}`;
  }

  private createTerrainImage(
    data: GeneratedChunkData,
    textureKey: string,
    worldX: number,
    worldY: number,
  ): Phaser.GameObjects.Image {
    const texture = this.scene.textures.createCanvas(textureKey, this.chunkSize, this.chunkSize);
    if (!texture) throw new Error(`Unable to create terrain texture: ${textureKey}`);
    const context = texture.context;
    context.imageSmoothingEnabled = true;
    this.drawGround(context, data);
    this.drawMud(context, data);
    this.drawWater(context, data);
    texture.refresh();
    return this.scene.add.image(worldX, worldY, textureKey).setOrigin(0);
  }

  private drawGround(context: CanvasRenderingContext2D, data: GeneratedChunkData): void {
    const size = this.config.tileSize;
    const columns = this.config.chunkTiles;
    context.fillStyle = colorCss(TERRAIN_COLORS.grass);
    context.fillRect(0, 0, this.chunkSize, this.chunkSize);
    context.fillStyle = colorCss(TERRAIN_COLORS['wet-grass']);

    for (let row = 0; row < columns; row += 1) {
      let start = -1;
      for (let column = 0; column <= columns; column += 1) {
        const terrain = column < columns ? data.terrain[row * columns + column] : 'grass';
        const wet = terrain !== 'grass';
        if (wet && start < 0) start = column;
        if (wet || start < 0) continue;
        context.fillRect(start * size, row * size, (column - start) * size + 0.5, size + 0.5);
        start = -1;
      }
    }
  }

  private appendTerrainPath(
    context: CanvasRenderingContext2D,
    rectangles: readonly TerrainRectangle[],
    padding: number,
    radius: number,
  ): void {
    const size = this.config.tileSize;
    for (const rectangle of rectangles) {
      appendRoundedRectangle(
        context,
        rectangle.column * size - padding,
        rectangle.row * size - padding,
        rectangle.width * size + padding * 2,
        rectangle.height * size + padding * 2,
        radius,
      );
    }
  }

  private drawMud(context: CanvasRenderingContext2D, data: GeneratedChunkData): void {
    const rectangles = collectTerrainRectangles(data.terrain, this.config.chunkTiles, 'mud');
    if (rectangles.length === 0) return;

    context.beginPath();
    this.appendTerrainPath(context, rectangles, 5, 13);
    context.fillStyle = '#45483a';
    context.fill();

    context.beginPath();
    this.appendTerrainPath(context, rectangles, 1.5, 10);
    const surface = context.createLinearGradient(0, 0, this.chunkSize, this.chunkSize);
    surface.addColorStop(0, '#756b50');
    surface.addColorStop(0.52, '#695f48');
    surface.addColorStop(1, '#5e5946');
    context.fillStyle = surface;
    context.fill();

    context.save();
    context.beginPath();
    this.appendTerrainPath(context, rectangles, 1.5, 10);
    context.clip();

    const mudTiles: number[] = [];
    for (let index = 0; index < data.terrain.length; index += 1) {
      if (data.terrain[index] === 'mud') mudTiles.push(index);
    }

    const patchCount = Math.min(6, Math.max(2, Math.ceil(mudTiles.length / 64)));
    for (let patch = 0; patch < patchCount; patch += 1) {
      const tileIndex = mudTiles[Math.floor(
        hashUnit(data.coord.x, data.coord.y, patch + 509) * mudTiles.length,
      )];
      const column = tileIndex % this.config.chunkTiles;
      const row = Math.floor(tileIndex / this.config.chunkTiles);
      const x = (column + 0.5) * this.config.tileSize;
      const y = (row + 0.5) * this.config.tileSize;
      const width = 52 + hashUnit(column, row, patch + 601) * 58;
      const height = 22 + hashUnit(row, column, patch + 701) * 30;
      context.beginPath();
      context.ellipse(x, y, width, height, hashUnit(column, row, patch + 809) * 0.4 - 0.2, 0, Math.PI * 2);
      context.fillStyle = patch % 2 === 0
        ? 'rgba(151, 134, 91, 0.08)'
        : 'rgba(48, 47, 39, 0.09)';
      context.fill();
    }

    const detailCount = Math.min(18, Math.max(4, Math.ceil(mudTiles.length / 18)));
    for (let detail = 0; detail < detailCount; detail += 1) {
      const offset = hashUnit(data.coord.x, data.coord.y, detail + 17);
      const tileIndex = mudTiles[Math.min(
        mudTiles.length - 1,
        Math.floor((detail + offset) * mudTiles.length / detailCount),
      )];
      const column = tileIndex % this.config.chunkTiles;
      const row = Math.floor(tileIndex / this.config.chunkTiles);
      const driftX = (hashUnit(data.coord.x, data.coord.y, detail + 71) - 0.5) * this.config.tileSize * 0.72;
      const driftY = (hashUnit(data.coord.y, data.coord.x, detail + 131) - 0.5) * this.config.tileSize * 0.56;
      const x = (column + 0.5) * this.config.tileSize + driftX;
      const y = (row + 0.5) * this.config.tileSize + driftY;
      const width = 9 + hashUnit(column, row, detail + 211) * 14;

      context.beginPath();
      context.ellipse(x, y, width, 3.2, -0.08, 0, Math.PI * 2);
      context.fillStyle = 'rgba(43, 45, 37, 0.24)';
      context.fill();
      context.beginPath();
      context.ellipse(x - 1, y - 1.2, width * 0.62, 1.2, -0.08, Math.PI * 1.05, Math.PI * 1.88);
      context.strokeStyle = 'rgba(194, 178, 130, 0.28)';
      context.lineWidth = 1;
      context.stroke();
    }
    context.restore();
  }

  private drawWater(
    context: CanvasRenderingContext2D,
    data: GeneratedChunkData,
  ): void {
    const waterRectangles = collectTerrainRectangles(data.terrain, this.config.chunkTiles, 'water');
    if (waterRectangles.length === 0) return;

    context.beginPath();
    this.appendTerrainPath(context, waterRectangles, 5, 13);
    context.fillStyle = '#4d5d50';
    context.fill();

    context.beginPath();
    this.appendTerrainPath(context, waterRectangles, 1.5, 10);
    const shallowSurface = context.createLinearGradient(0, 0, this.chunkSize, this.chunkSize);
    shallowSurface.addColorStop(0, '#587b70');
    shallowSurface.addColorStop(1, '#4a716c');
    context.fillStyle = shallowSurface;
    context.fill();

    const deepRectangles = collectMaskRectangles(data.deepWater, this.config.chunkTiles);
    if (deepRectangles.length > 0) {
      context.beginPath();
      this.appendTerrainPath(context, deepRectangles, 1.25, 9);
      const deepSurface = context.createLinearGradient(0, 0, this.chunkSize, this.chunkSize);
      deepSurface.addColorStop(0, '#416c6b');
      deepSurface.addColorStop(1, '#365f62');
      context.fillStyle = deepSurface;
      context.fill();
    }

    const shallowTiles: number[] = [];
    const waterTiles: number[] = [];
    for (let index = 0; index < data.terrain.length; index += 1) {
      if (data.terrain[index] !== 'water') continue;
      waterTiles.push(index);
      if (!data.deepWater[index]) shallowTiles.push(index);
    }

    const shallowDetailCount = shallowTiles.length === 0
      ? 0
      : Math.min(12, Math.max(2, Math.ceil(shallowTiles.length / 10)));
    for (let detail = 0; detail < shallowDetailCount; detail += 1) {
      const tileIndex = shallowTiles[Math.floor(
        hashUnit(data.coord.x, data.coord.y, detail + 907) * shallowTiles.length,
      )];
      const column = tileIndex % this.config.chunkTiles;
      const row = Math.floor(tileIndex / this.config.chunkTiles);
      const x = (column + 0.5) * this.config.tileSize;
      const y = (row + 0.5) * this.config.tileSize;
      context.beginPath();
      context.arc(x, y, 1.3 + hashUnit(column, row, detail + 1009) * 1.7, 0, Math.PI * 2);
      context.fillStyle = 'rgba(202, 209, 169, 0.24)';
      context.fill();
    }

    const rippleCount = Math.min(14, Math.max(3, Math.ceil(waterTiles.length / 20)));
    for (let ripple = 0; ripple < rippleCount; ripple += 1) {
      const tileIndex = waterTiles[Math.floor(
        hashUnit(data.coord.y, data.coord.x, ripple + 1103) * waterTiles.length,
      )];
      const column = tileIndex % this.config.chunkTiles;
      const row = Math.floor(tileIndex / this.config.chunkTiles);
      const x = (column + 0.5) * this.config.tileSize;
      const y = (row + 0.5) * this.config.tileSize;
      const halfWidth = 5 + hashUnit(column, row, ripple + 1201) * 5;
      context.beginPath();
      context.moveTo(x - halfWidth, y + 1);
      context.quadraticCurveTo(x, y - 2.5, x + halfWidth, y);
      context.strokeStyle = 'rgba(169, 207, 194, 0.2)';
      context.lineWidth = 1;
      context.stroke();
    }
  }

  private unmount(key: ChunkKey): void {
    const view = this.views.get(key);
    if (!view) return;
    this.wildlifeSystem.unmountChunk(key);
    this.objectCount -= view.objects.length;
    this.colliderCount -= view.colliders.length;
    view.objects.forEach((object) => object.destroy());
    view.colliders.forEach((collider) => collider.destroy());
    this.scene.textures.remove(view.terrainTextureKey);
    this.views.delete(key);
  }

  private syncWildlifeImages(): void {
    const snapshots = this.wildlifeSystem.snapshots();
    const visible = new Set(snapshots.map(({ id }) => id));
    for (const [id, image] of this.wildlifeImages) {
      if (visible.has(id)) continue;
      image.destroy();
      this.wildlifeImages.delete(id);
    }
    const alpha = this.wildlifeSystem.interpolationAlpha();
    for (const animal of snapshots) {
      let image = this.wildlifeImages.get(animal.id);
      if (!image) {
        const key = WILDLIFE_ASSET_KEYS[animal.species];
        const profile = this.characterProfiles[animal.species];
        const source = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
        const scale = profile.visualSize / Math.max(source.width, source.height);
        image = this.scene.add.image(animal.x, animal.y, key)
          .setOrigin(profile.anchorX, profile.anchorY)
          .setScale(scale)
          .setName(`wildlife:${animal.id}`);
        this.entityLayer.add(image);
        this.wildlifeImages.set(animal.id, image);
      }
      image
        .setPosition(
          Phaser.Math.Linear(animal.previousX, animal.x, alpha),
          Phaser.Math.Linear(animal.previousY, animal.y, alpha),
        )
        .setRotation(animal.facingRadians + Phaser.Math.DegToRad(this.characterProfiles[animal.species].facingOffsetDegrees))
        .setDepth(animal.y + 0.2);
    }
  }

  private createCollider(x: number, y: number, width: number, height: number, radius?: number): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, y, width, height).setOrigin(0.5);
    this.collisionGroup.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    if (radius !== undefined) body.setCircle(radius);
    else body.setSize(width, height);
    body.updateFromGameObject();
    return zone;
  }

  private createObstacle(obstacle: GeneratedObstacle): {
    readonly objects: Phaser.GameObjects.Image[];
    readonly occluder?: Occluder;
  } {
    if (obstacle.kind === 'tree') {
      const binding = this.worldAssets.slots[`seeded.tree.${obstacle.variant % 4}` as WorldAssetSlotId];
      const key = worldTextureKey(binding.sourceId);
      const source = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height) * obstacle.scale;
      const targetHeight = source.height * scale;
      const canopyCut = Math.round(source.height * (binding.canopyCutRatio ?? 0.76));
      const trunk = this.scene.add.image(obstacle.x, obstacle.y, key)
        .setOrigin(binding.anchorX, binding.anchorY)
        .setScale(scale)
        .setCrop(0, canopyCut, source.width, source.height - canopyCut)
        .setDepth(obstacle.y);
      const canopy = this.scene.add.image(obstacle.x, obstacle.y, key)
        .setOrigin(binding.anchorX, binding.anchorY)
        .setScale(scale)
        .setCrop(0, 0, source.width, canopyCut)
        .setDepth(obstacle.y + 0.4);
      return {
        objects: [trunk, canopy],
        occluder: {
          x: obstacle.x,
          y: obstacle.y,
          width: source.width * scale,
          height: targetHeight,
          canopy,
        },
      };
    }
    const binding = obstacle.kind === 'rock'
      ? this.worldAssets.slots[`seeded.rock.${obstacle.variant % 4}` as WorldAssetSlotId]
      : this.worldAssets.slots['seeded.log'];
    const key = worldTextureKey(binding.sourceId);
    const source = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height) * obstacle.scale;
    const image = this.scene.add.image(obstacle.x, obstacle.y, key)
      .setOrigin(binding.anchorX, binding.anchorY)
      .setScale(scale)
      .setRotation(obstacle.rotation)
      .setDepth(obstacle.y);
    return { objects: [image] };
  }

  private createDecoration(decoration: GeneratedDecoration): Phaser.GameObjects.Image {
    const binding = decoration.kind === 'pebble'
      ? this.worldAssets.slots[`seeded.pebble.${decoration.variant % 5}` as WorldAssetSlotId]
      : this.worldAssets.slots[`seeded.decoration.${decoration.kind}` as const];
    const key = worldTextureKey(binding.sourceId);
    const source = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const scale = binding.displaySize / (binding.sizeMode === 'width' ? source.width : source.height) * decoration.scale;
    return this.scene.add.image(decoration.x, decoration.y, key)
      .setOrigin(binding.anchorX, binding.anchorY)
      .setScale(scale)
      .setRotation(decoration.rotation)
      .setDepth(decoration.y - 0.5);
  }
}
