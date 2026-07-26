import Phaser from 'phaser';
import { ASSET_KEYS } from '../../game/assets/manifest';
import type { ResolvedWorldAssets } from '../../game/assets/worldAssetLibrary';
import type { GameConfig } from '../../game/config/GameConfig';
import { touchInput } from '../../game/input/TouchInputState';
import {
  mergeDirectionalInput,
  resolveMovement,
  type DirectionalInput,
} from '../../game/input/movement';
import { gameStore } from '../../game/state/GameStore';
import type { ColliderDefinition, PointDefinition, WorldLaunchRequest } from '../../game/types';
import { parseWorldSeed } from '../../game/world/seed';
import { createWorldView, type TreeOccluder } from '../world/createWorldView';
import { SeededWorldRuntime } from '../world/SeededWorldRuntime';
import type { SeededDebugLayers } from '../world/SeededWorldRuntime';

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

export class WorldScene extends Phaser.Scene {
  static readonly KEY = 'world';

  private playerBody!: Phaser.GameObjects.Zone;
  private playerSprite!: Phaser.GameObjects.Image;
  private body!: Phaser.Physics.Arcade.Body;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: MovementKeys;
  private sprintKey?: Phaser.Input.Keyboard.Key;
  private trees: readonly TreeOccluder[] = [];
  private seededWorld?: SeededWorldRuntime;
  private launchRequest: WorldLaunchRequest = { mode: 'fixed' };
  private debugGraphic!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  private debugLayers: SeededDebugLayers = {
    chunks: true,
    terrain: false,
    collision: true,
    spawn: true,
    wildlife: false,
  };
  private facingRadians = Math.PI;
  private nextFootstepAt = 0;
  private nextSnapshotAt = 0;
  private baseSpriteScale = 1;
  private zoomIndex: number;
  private baseCameraZoom = 1;

  constructor(
    private readonly gameConfig: Readonly<GameConfig>,
    private readonly worldAssets: ResolvedWorldAssets,
  ) {
    super(WorldScene.KEY);
    this.zoomIndex = gameConfig.camera.defaultZoomIndex;
  }

  setLaunchRequest(request: WorldLaunchRequest): void {
    this.launchRequest = { ...request };
  }

  create(): void {
    const layout = this.gameConfig.world;
    const seeded = this.launchRequest.mode === 'seeded';
    const spawn = seeded ? this.gameConfig.proceduralWorld.spawn : layout.spawn;
    this.zoomIndex = this.gameConfig.camera.defaultZoomIndex;
    if (seeded) {
      this.physics.world.setBounds(-1_000_000_000, -1_000_000_000, 2_000_000_000, 2_000_000_000);
      this.cameras.main.removeBounds();
    } else {
      this.physics.world.setBounds(0, 0, layout.width, layout.height);
      this.cameras.main.setBounds(0, 0, layout.width, layout.height);
    }
    this.cameras.main.setBackgroundColor('#53624b');

    if (!seeded) {
      const worldView = createWorldView(this, layout, this.worldAssets);
      this.trees = worldView.trees;
    } else {
      this.trees = [];
    }
    this.createPlayer(spawn, seeded);
    if (seeded) {
      const seed = parseWorldSeed(this.launchRequest.seed ?? '');
      if (!seed) throw new Error(`Invalid seeded world launch: ${this.launchRequest.seed ?? ''}`);
      this.seededWorld = new SeededWorldRuntime(
        this,
        this.playerBody,
        this.playerSprite,
        seed,
        this.gameConfig.proceduralWorld,
        this.worldAssets,
        this.gameConfig.characterProfiles,
        this.gameConfig.wildlife,
      );
      this.seededWorld.initialize();
    }
    this.createInput();
    this.createDebugGraphic();

    this.applyCameraZoom(this.scale.gameSize.height);
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.cameras.main.startFollow(
      this.playerBody,
      true,
      this.gameConfig.camera.followLerp,
      this.gameConfig.camera.followLerp,
    );
    this.cameras.main.fadeIn(this.gameConfig.camera.fadeInMs, 0, 0, 0);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
      this.clearInput();
      this.body.setVelocity(0, 0);
      this.seededWorld?.destroy();
      this.seededWorld = undefined;
    });

    this.publishSnapshot();
    this.game.events.emit('world-ready');
  }

  update(time: number, delta: number): void {
    const sprinting = Boolean(this.sprintKey?.isDown || touchInput.isSprinting());
    const speed = this.gameConfig.player.moveSpeed;
    const movement = resolveMovement(
      mergeDirectionalInput(this.getKeyboardInput(), touchInput.getDirectionalInput()),
      sprinting ? speed * this.gameConfig.player.sprintMultiplier : speed,
    );

    this.body.setVelocity(movement.x, movement.y);
    this.seededWorld?.update(this.playerBody.x, this.playerBody.y, {
      x: movement.x === 0 ? 0 : Math.sign(movement.x),
      y: movement.y === 0 ? 0 : Math.sign(movement.y),
    }, delta);

    if (movement.moving) {
      this.facingRadians = Math.atan2(movement.y, movement.x) - Math.PI / 2;
      if (time >= this.nextFootstepAt) {
        this.game.events.emit('player-step');
        this.nextFootstepAt = time + this.gameConfig.player.footstepIntervalMs;
      }
    }

    this.updatePlayerView();
    this.updateTreeOcclusion();
    this.seededWorld?.updateOcclusion(this.playerBody.x, this.playerBody.y);
    this.updateDebugDrawing();

    gameStore.updatePlayer({
      x: this.playerBody.x,
      y: this.playerBody.y,
      velocityX: movement.x,
      velocityY: movement.y,
      facingRadians: this.facingRadians,
      moving: movement.moving,
    });
    gameStore.updateRuntime({
      fps: this.game.loop.actualFps,
      cameraZoom: this.cameras.main.zoom,
    });
    gameStore.updateWorld(this.seededWorld?.telemetry() ?? {
      mode: 'fixed',
      seed: null,
      generationVersion: null,
      chunk: null,
      activeChunks: 1,
      cachedChunks: 0,
      lastGenerationMs: 0,
      objectCount: this.gameConfig.world.obstacles.length,
      colliderCount: this.gameConfig.world.obstacles.length,
      wildlife: {
        activeAnimals: 0,
        sleepingAnimals: 0,
        pathSearches: 0,
        lastSimulationMs: 0,
        bySpecies: {},
        byState: {},
      },
    });

    if (time >= this.nextSnapshotAt) {
      this.publishSnapshot();
      this.nextSnapshotAt = time + 100;
    }
  }

  clearInput(): void {
    this.input.keyboard?.resetKeys();
    touchInput.clear();
    if (this.body) {
      this.body.setVelocity(0, 0);
    }
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.debugGraphic?.setVisible(visible);
    if (!visible) {
      this.debugGraphic?.clear();
    }
  }

  setDebugLayer(layer: keyof SeededDebugLayers, visible: boolean): void {
    this.debugLayers = { ...this.debugLayers, [layer]: visible };
  }

  cycleZoom(direction: -1 | 1): void {
    const zoomLevels = this.gameConfig.camera.zoomLevels;
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + direction, 0, zoomLevels.length - 1);
    this.setZoom(zoomLevels[this.zoomIndex]);
  }

  setZoom(zoom: number): void {
    const zoomLevels = this.gameConfig.camera.zoomLevels;
    const nearestIndex = zoomLevels.reduce((bestIndex, candidate, index) => (
      Math.abs(candidate - zoom) < Math.abs(zoomLevels[bestIndex] - zoom) ? index : bestIndex
    ), 0);
    this.zoomIndex = nearestIndex;
    this.applyCameraZoom(this.scale.gameSize.height);
    gameStore.updateRuntime({
      fps: this.game.loop.actualFps,
      cameraZoom: this.cameras.main.zoom,
    });
    this.publishSnapshot();
  }

  teleport(index: number): void {
    if (this.seededWorld) {
      const points = [
        { x: -4, y: -4 },
        { x: 4, y: -4 },
        { x: -4, y: 4 },
        { x: 4, y: 4 },
      ];
      const chunk = points[index];
      if (chunk) this.teleportToChunk(chunk.x, chunk.y);
      return;
    }
    const point = this.gameConfig.world.teleportPoints[index];
    if (point) {
      this.movePlayerTo(point);
    }
  }

  resetPlayer(): void {
    this.movePlayerTo(this.seededWorld ? this.gameConfig.proceduralWorld.spawn : this.gameConfig.world.spawn);
    this.facingRadians = Math.PI;
    this.playerSprite.setRotation(this.facingRadians);
  }

  teleportToChunk(x: number, y: number): void {
    if (!this.seededWorld) return;
    const size = this.gameConfig.proceduralWorld.tileSize * this.gameConfig.proceduralWorld.chunkTiles;
    this.movePlayerTo({ x: x * size + size / 2, y: y * size + size / 2 });
  }

  teleportToWorld(x: number, y: number): void {
    if (this.seededWorld) this.movePlayerTo({ x, y });
  }

  getChunkFingerprint(x: number, y: number): string | undefined {
    return this.seededWorld?.getFingerprint(x, y);
  }

  getChunkData(x: number, y: number) {
    return this.seededWorld?.getChunkData(x, y);
  }

  refreshWorld(): void {
    this.seededWorld?.refresh();
  }

  getWildlifeSnapshots() {
    return this.seededWorld?.getWildlifeSnapshots() ?? [];
  }

  teleportToWildlife(id: string): void {
    const animal = this.seededWorld?.getWildlifeSnapshots().find((candidate) => candidate.id === id);
    if (animal) this.movePlayerTo({ x: animal.x, y: animal.y + 120 });
  }

  private createStaticZone(
    x: number,
    y: number,
    collider: ColliderDefinition,
  ): Phaser.GameObjects.Zone {
    const width = collider.shape === 'circle' ? collider.radius * 2 : collider.width;
    const height = collider.shape === 'circle' ? collider.radius * 2 : collider.height;
    const zone = this.add.zone(x, y, width, height).setOrigin(0.5);
    this.physics.add.existing(zone, true);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    if (collider.shape === 'circle') {
      body.setCircle(collider.radius);
    } else {
      body.setSize(collider.width, collider.height);
    }
    body.updateFromGameObject();
    return zone;
  }

  private createPlayer(spawn: PointDefinition, seeded: boolean): void {
    const { player, world } = this.gameConfig;
    const { x, y } = spawn;
    this.playerBody = this.add.zone(x, y, player.bodyWidth, player.bodyHeight).setOrigin(0.5);
    this.physics.add.existing(this.playerBody);
    this.body = this.playerBody.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(player.bodyWidth, player.bodyHeight);
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(!seeded);
    const sprintSpeed = player.moveSpeed * player.sprintMultiplier;
    this.body.setMaxVelocity(sprintSpeed, sprintSpeed);

    this.playerSprite = this.add.image(x, y, ASSET_KEYS.playerFox).setRotation(this.facingRadians);
    const source = this.textures.get(ASSET_KEYS.playerFox).getSourceImage() as HTMLImageElement;
    this.baseSpriteScale = player.visualSize / Math.max(source.width, source.height);
    this.playerSprite.setScale(this.baseSpriteScale).setDepth(y);

    if (!seeded) {
      for (const obstacle of world.obstacles) {
        const zone = this.createStaticZone(
          obstacle.x + (obstacle.collider.offsetX ?? 0),
          obstacle.y + (obstacle.collider.offsetY ?? 0),
          obstacle.collider,
        );
        this.physics.add.collider(this.playerBody, zone);
      }
    }
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    this.cursors = keyboard.createCursorKeys();
    this.sprintKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys;
  }

  private getKeyboardInput(): DirectionalInput {
    return {
      up: Boolean(this.cursors?.up.isDown || this.wasd?.up.isDown),
      down: Boolean(this.cursors?.down.isDown || this.wasd?.down.isDown),
      left: Boolean(this.cursors?.left.isDown || this.wasd?.left.isDown),
      right: Boolean(this.cursors?.right.isDown || this.wasd?.right.isDown),
    };
  }

  private readonly handleResize = (gameSize: { readonly height: number }): void => {
    this.applyCameraZoom(gameSize.height);
    this.publishSnapshot();
  };

  private applyCameraZoom(viewportHeight: number): void {
    this.baseCameraZoom = Math.max(viewportHeight, 1) / 720;
    this.cameras.main.setZoom(
      this.baseCameraZoom * this.gameConfig.camera.zoomLevels[this.zoomIndex],
    );
  }

  private createDebugGraphic(): void {
    this.debugGraphic = this.add.graphics().setDepth(10000).setVisible(this.debugVisible);
  }

  private updatePlayerView(): void {
    const x = this.playerBody.x;
    const y = this.playerBody.y;
    this.playerSprite
      .setPosition(x, y)
      .setRotation(this.facingRadians)
      .setScale(this.baseSpriteScale)
      .setDepth(y + 0.5);
  }

  private updateTreeOcclusion(): void {
    for (const tree of this.trees) {
      const behindTree =
        this.playerBody.y < tree.y + 8 &&
        this.playerBody.y > tree.y - tree.canopyHeight &&
        Math.abs(this.playerBody.x - tree.x) < tree.canopyWidth * 0.48;
      tree.canopy.setAlpha(behindTree ? 0.7 : 1);
    }
  }

  private updateDebugDrawing(): void {
    if (!this.debugVisible) {
      return;
    }

    this.debugGraphic.clear();
    this.debugGraphic.lineStyle(2, 0x7fffd4, 0.92);
    const { bodyWidth, bodyHeight } = this.gameConfig.player;
    this.debugGraphic.strokeRect(
      this.playerBody.x - bodyWidth / 2,
      this.playerBody.y - bodyHeight / 2,
      bodyWidth,
      bodyHeight,
    );
    this.debugGraphic.lineStyle(2, 0xffba73, 0.78);
    if (this.seededWorld) {
      this.seededWorld.drawDebug(this.debugGraphic, this.debugLayers);
    } else {
      for (const obstacle of this.gameConfig.world.obstacles) {
        const colliderX = obstacle.x + (obstacle.collider.offsetX ?? 0);
        const colliderY = obstacle.y + (obstacle.collider.offsetY ?? 0);
        if (obstacle.collider.shape === 'circle') {
          this.debugGraphic.strokeCircle(colliderX, colliderY, obstacle.collider.radius);
        } else {
          this.debugGraphic.strokeRect(
            colliderX - obstacle.collider.width / 2,
            colliderY - obstacle.collider.height / 2,
            obstacle.collider.width,
            obstacle.collider.height,
          );
        }
      }
      this.debugGraphic.lineStyle(3, 0xd7e8a4, 0.8);
      this.debugGraphic.strokeRect(0, 0, this.gameConfig.world.width, this.gameConfig.world.height);
    }
  }

  private movePlayerTo(point: PointDefinition): void {
    this.clearInput();
    this.body.reset(point.x, point.y);
    this.playerBody.setPosition(point.x, point.y);
    this.updatePlayerView();
    this.cameras.main.centerOn(point.x, point.y);
    gameStore.updatePlayer({
      x: point.x,
      y: point.y,
      velocityX: 0,
      velocityY: 0,
      facingRadians: this.facingRadians,
      moving: false,
    });
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    this.game.events.emit('world-snapshot', gameStore.getSnapshot());
  }
}
