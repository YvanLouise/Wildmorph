import Phaser from 'phaser';
import { ASSET_KEYS } from '../../game/assets/manifest';
import { WORLD_LAYOUT } from '../../game/content/worldLayout';
import { PLAYER_SPEED, resolveMovement } from '../../game/input/movement';
import { gameStore } from '../../game/state/GameStore';
import type { ColliderDefinition, PointDefinition } from '../../game/types';
import { createWorldView, type TreeOccluder } from '../world/createWorldView';

const PLAYER_VISUAL_SIZE = 64;
const PLAYER_BODY_WIDTH = 28;
const PLAYER_BODY_HEIGHT = 32;
const ZOOM_LEVELS = [0.8, 1, 1.2] as const;

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
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: MovementKeys;
  private trees: readonly TreeOccluder[] = [];
  private debugGraphic!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  private facingRadians = Math.PI;
  private nextFootstepAt = 0;
  private nextSnapshotAt = 0;
  private baseSpriteScale = 1;
  private zoomIndex = 1;

  constructor() {
    super(WorldScene.KEY);
  }

  create(): void {
    const layout = WORLD_LAYOUT;
    this.physics.world.setBounds(0, 0, layout.width, layout.height);
    this.cameras.main.setBounds(0, 0, layout.width, layout.height);
    this.cameras.main.setBackgroundColor('#53624b');

    const worldView = createWorldView(this, layout);
    this.trees = worldView.trees;
    this.createPlayer();
    this.createInput();
    this.createDebugGraphic();

    this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
    this.cameras.main.centerOn(layout.spawn.x, layout.spawn.y);
    this.cameras.main.startFollow(this.playerBody, true, 0.1, 0.1);
    this.cameras.main.fadeIn(700, 0, 0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearInput();
      this.body.setVelocity(0, 0);
    });

    this.publishSnapshot();
    this.game.events.emit('world-ready');
  }

  update(time: number): void {
    const movement = resolveMovement({
      up: this.cursors.up.isDown || this.wasd.up.isDown,
      down: this.cursors.down.isDown || this.wasd.down.isDown,
      left: this.cursors.left.isDown || this.wasd.left.isDown,
      right: this.cursors.right.isDown || this.wasd.right.isDown,
    });

    this.body.setVelocity(movement.x, movement.y);

    if (movement.moving) {
      this.facingRadians = Math.atan2(movement.y, movement.x) - Math.PI / 2;
      if (time >= this.nextFootstepAt) {
        this.game.events.emit('player-step');
        this.nextFootstepAt = time + 285;
      }
    }

    this.updatePlayerView();
    this.updateTreeOcclusion();
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

    if (time >= this.nextSnapshotAt) {
      this.publishSnapshot();
      this.nextSnapshotAt = time + 100;
    }
  }

  clearInput(): void {
    this.input.keyboard?.resetKeys();
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

  cycleZoom(direction: -1 | 1): void {
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1);
    this.setZoom(ZOOM_LEVELS[this.zoomIndex]);
  }

  setZoom(zoom: number): void {
    const nearestIndex = ZOOM_LEVELS.reduce((bestIndex, candidate, index) => (
      Math.abs(candidate - zoom) < Math.abs(ZOOM_LEVELS[bestIndex] - zoom) ? index : bestIndex
    ), 0);
    this.zoomIndex = nearestIndex;
    this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex]);
    gameStore.updateRuntime({
      fps: this.game.loop.actualFps,
      cameraZoom: ZOOM_LEVELS[this.zoomIndex],
    });
    this.publishSnapshot();
  }

  teleport(index: number): void {
    const point = WORLD_LAYOUT.teleportPoints[index];
    if (point) {
      this.movePlayerTo(point);
    }
  }

  resetPlayer(): void {
    this.movePlayerTo(WORLD_LAYOUT.spawn);
    this.facingRadians = Math.PI;
    this.playerSprite.setRotation(this.facingRadians);
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

  private createPlayer(): void {
    const { x, y } = WORLD_LAYOUT.spawn;
    this.playerBody = this.add.zone(x, y, PLAYER_BODY_WIDTH, PLAYER_BODY_HEIGHT).setOrigin(0.5);
    this.physics.add.existing(this.playerBody);
    this.body = this.playerBody.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(PLAYER_BODY_WIDTH, PLAYER_BODY_HEIGHT);
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(PLAYER_SPEED, PLAYER_SPEED);

    this.playerSprite = this.add.image(x, y, ASSET_KEYS.playerFox).setRotation(this.facingRadians);
    const source = this.textures.get(ASSET_KEYS.playerFox).getSourceImage() as HTMLImageElement;
    this.baseSpriteScale = PLAYER_VISUAL_SIZE / Math.max(source.width, source.height);
    this.playerSprite.setScale(this.baseSpriteScale).setDepth(y);

    for (const obstacle of WORLD_LAYOUT.obstacles) {
      const zone = this.createStaticZone(obstacle.x, obstacle.y, obstacle.collider);
      this.physics.add.collider(this.playerBody, zone);
    }
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is required for this desktop demo.');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys;
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
    this.debugGraphic.strokeRect(
      this.playerBody.x - PLAYER_BODY_WIDTH / 2,
      this.playerBody.y - PLAYER_BODY_HEIGHT / 2,
      PLAYER_BODY_WIDTH,
      PLAYER_BODY_HEIGHT,
    );
    this.debugGraphic.lineStyle(2, 0xffba73, 0.78);
    for (const obstacle of WORLD_LAYOUT.obstacles) {
      if (obstacle.collider.shape === 'circle') {
        this.debugGraphic.strokeCircle(obstacle.x, obstacle.y, obstacle.collider.radius);
      } else {
        this.debugGraphic.strokeRect(
          obstacle.x - obstacle.collider.width / 2,
          obstacle.y - obstacle.collider.height / 2,
          obstacle.collider.width,
          obstacle.collider.height,
        );
      }
    }
    this.debugGraphic.lineStyle(3, 0xd7e8a4, 0.8);
    this.debugGraphic.strokeRect(0, 0, WORLD_LAYOUT.width, WORLD_LAYOUT.height);
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
