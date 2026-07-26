import Phaser from 'phaser';
import { ASSET_KEYS, ASSET_URLS } from '../game/assets/manifest';
import type { ResolvedWorldAssets } from '../game/assets/worldAssetLibrary';
import type { GameConfig } from '../game/config/GameConfig';
import type { ColliderDefinition, PointDefinition } from '../game/types';
import { createWorldView } from '../phaser/world/createWorldView';
import type { MapSelection } from './mapOperations';

export interface MapEditorCallbacks {
  readonly onSelect: (selection: MapSelection) => void;
  readonly onMove: (selection: MapSelection, point: PointDefinition) => void;
  readonly onColliderMove: (id: string, offset: PointDefinition) => void;
}

const GRID_SIZE = 100;
const SNAP_SIZE = 10;

function sameSelection(a: MapSelection | undefined, b: MapSelection): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'obstacle' && b.kind === 'obstacle') return a.id === b.id;
  if (a.kind === 'teleport' && b.kind === 'teleport') return a.index === b.index;
  if (a.kind === 'pond-vertex' && b.kind === 'pond-vertex') return a.index === b.index;
  return true;
}

export class MapEditorScene extends Phaser.Scene {
  static readonly KEY = 'map-editor';

  private configDraft: Readonly<GameConfig>;
  private readOnly = true;
  private selected?: MapSelection;
  private panning?: {
    readonly x: number;
    readonly y: number;
    readonly scrollX: number;
    readonly scrollY: number;
  };
  private spaceKey?: Phaser.Input.Keyboard.Key;

  constructor(
    initialConfig: Readonly<GameConfig>,
    private readonly callbacks: MapEditorCallbacks,
    private readonly worldAssets: ResolvedWorldAssets,
  ) {
    super(MapEditorScene.KEY);
    this.configDraft = initialConfig;
  }

  preload(): void {
    this.load.image(ASSET_KEYS.playerFox, ASSET_URLS.playerFox);
    this.worldAssets.textureEntries.forEach(([key, url]) => this.load.image(key, url));
  }

  create(): void {
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on(Phaser.Input.Events.DRAG, this.handleDrag, this);
    this.input.on(Phaser.Input.Events.DRAG_END, this.handleDragEnd, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handleWheel, this);
    this.game.canvas.addEventListener('contextmenu', this.preventContextMenu);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener('contextmenu', this.preventContextMenu);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    });
    this.renderMap(false);
    this.fitMap();
    this.time.delayedCall(0, () => this.fitMap());
  }

  setConfig(config: Readonly<GameConfig>, readOnly: boolean): void {
    this.configDraft = config;
    this.readOnly = readOnly;
    if (this.sys.isActive()) this.renderMap(true);
  }

  setSelection(selection: MapSelection | undefined): void {
    this.selected = selection;
    if (this.sys.isActive()) this.renderMap(true);
  }

  fitMap(): void {
    const { width, height } = this.configDraft.world;
    const viewport = this.scale.gameSize;
    const zoom = Phaser.Math.Clamp(
      Math.min(viewport.width / width, viewport.height / height) * 0.9,
      0.12,
      2,
    );
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
  }

  private renderMap(preserveCamera: boolean): void {
    const camera = this.cameras.main;
    const cameraState = { zoom: camera.zoom, scrollX: camera.scrollX, scrollY: camera.scrollY };
    this.tweens.killAll();
    this.children.removeAll(true);

    const layout = this.configDraft.world;
    camera.setBounds(0, 0, layout.width, layout.height);
    camera.setBackgroundColor('#172b27');
    this.drawGrid(layout.width, layout.height);
    const worldView = createWorldView(this, layout, this.worldAssets, { animated: false, ambientMotion: false });
    this.createPondHandles();
    this.createSpawnHandle();
    layout.teleportPoints.forEach((point, index) => {
      this.createPointHandle(
        { kind: 'teleport', index },
        point,
        0x71c6b1,
        String(index + 1),
      );
    });
    for (const obstacle of layout.obstacles) {
      this.createObstacleHandle(
        { kind: 'obstacle', id: obstacle.id },
        { x: obstacle.x, y: obstacle.y },
        obstacle.collider,
        worldView.objects.get(obstacle.id),
      );
    }

    if (preserveCamera) {
      camera.setZoom(cameraState.zoom);
      camera.setScroll(cameraState.scrollX, cameraState.scrollY);
    }
  }

  private drawGrid(width: number, height: number): void {
    const grid = this.add.graphics().setDepth(9000);
    grid.lineStyle(2, 0xf4e8bd, 0.12);
    for (let x = 0; x <= width; x += GRID_SIZE) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += GRID_SIZE) grid.lineBetween(0, y, width, y);
    grid.lineStyle(5, 0xf3cf78, 0.7).strokeRect(0, 0, width, height);
  }

  private createSpawnHandle(): void {
    const point = this.configDraft.world.spawn;
    const image = this.add.image(0, -12, ASSET_KEYS.playerFox);
    const source = this.textures.get(ASSET_KEYS.playerFox).getSourceImage() as HTMLImageElement;
    image.setScale(58 / Math.max(source.width, source.height));
    const ring = this.add.circle(0, 0, this.configDraft.world.spawnClearRadius)
      .setStrokeStyle(4, 0xf4c765, 0.68)
      .setFillStyle(0xf4c765, 0.04);
    const container = this.add.container(point.x, point.y, [ring, image]).setDepth(19000);
    this.enableHandle(container, { kind: 'spawn' }, 70, 70);
  }

  private createPondHandles(): void {
    this.createPointHandle(
      { kind: 'pond-center' },
      this.configDraft.world.pondCenter,
      0x4dc6cf,
      '池',
    );
    this.configDraft.world.pondPolygon.forEach((point, index) => {
      this.createPointHandle({ kind: 'pond-vertex', index }, point, 0x65dbe2, '');
    });
  }

  private createPointHandle(
    selection: MapSelection,
    point: PointDefinition,
    color: number,
    label: string,
  ): void {
    const active = sameSelection(this.selected, selection);
    const circle = this.add.circle(0, 0, active ? 19 : 14, color, active ? 0.95 : 0.72)
      .setStrokeStyle(active ? 5 : 3, 0xfff3c4, 0.95);
    const text = label
      ? this.add.text(0, 0, label, { color: '#17322c', fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5)
      : undefined;
    const container = this.add.container(point.x, point.y, text ? [circle, text] : [circle]).setDepth(20000);
    this.enableHandle(container, selection, 44, 44);
  }

  private createObstacleHandle(
    selection: MapSelection,
    point: PointDefinition,
    collider: ColliderDefinition,
    display?: Phaser.GameObjects.Container,
  ): void {
    const active = sameSelection(this.selected, selection);
    const colliderX = point.x + (collider.offsetX ?? 0);
    const colliderY = point.y + (collider.offsetY ?? 0);
    if (active && (colliderX !== point.x || colliderY !== point.y)) {
      const tether = this.add.graphics().setDepth(19999);
      tether.lineStyle(3, 0x59dfc1, 0.7);
      tether.lineBetween(point.x, point.y, colliderX, colliderY);
    }
    const graphic = this.add.graphics();
    graphic.lineStyle(active ? 6 : 3, active ? 0x76f2d2 : 0x4fc8ad, active ? 1 : 0.68);
    let width: number;
    let height: number;
    if (collider.shape === 'circle') {
      width = collider.radius * 2;
      height = width;
      graphic.strokeCircle(0, 0, collider.radius);
    } else {
      width = collider.width;
      height = collider.height;
      graphic.strokeRect(-width / 2, -height / 2, width, height);
    }
    const colliderHandle = this.add.container(colliderX, colliderY, [graphic]).setDepth(20000);
    this.enableHandle(
      colliderHandle,
      selection,
      Math.max(width, 30),
      Math.max(height, 30),
      'collider',
    );

    const anchor = this.add.graphics();
    anchor.fillStyle(active ? 0xffd573 : 0xe2aa54, 0.95).fillCircle(0, 0, active ? 8 : 6);
    anchor.lineStyle(2, 0x17372f, 0.9).strokeCircle(0, 0, active ? 8 : 6);
    anchor.lineBetween(-11, 0, 11, 0).lineBetween(0, -11, 0, 11);
    const objectHandle = this.add.container(point.x, point.y, [anchor]).setDepth(20001);
    objectHandle.setData('display', display);
    this.enableHandle(objectHandle, selection, 18, 18, 'selection');
  }

  private enableHandle(
    container: Phaser.GameObjects.Container,
    selection: MapSelection,
    width: number,
    height: number,
    dragKind: 'selection' | 'collider' = 'selection',
  ): void {
    container.setSize(width, height).setInteractive({ cursor: this.readOnly ? 'pointer' : 'grab' });
    container.setData('selection', selection);
    container.setData('drag-kind', dragKind);
    container.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.callbacks.onSelect(selection);
    });
    if (!this.readOnly) this.input.setDraggable(container);
  }

  private readonly handleDrag = (
    _pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.Container,
    dragX: number,
    dragY: number,
  ): void => {
    if (this.readOnly) return;
    gameObject.setPosition(dragX, dragY);
    if (gameObject.getData('drag-kind') === 'selection') {
      const display = gameObject.getData('display') as Phaser.GameObjects.Container | undefined;
      display?.setPosition(dragX, dragY);
    }
  };

  private readonly handleDragEnd = (
    _pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.Container,
  ): void => {
    const selection = gameObject.getData('selection') as MapSelection | undefined;
    if (!selection || this.readOnly) return;
    if (gameObject.getData('drag-kind') === 'collider' && selection.kind === 'obstacle') {
      const obstacle = this.configDraft.world.obstacles.find(({ id }) => id === selection.id);
      if (!obstacle) return;
      this.callbacks.onColliderMove(selection.id, {
        x: Phaser.Math.Snap.To(gameObject.x - obstacle.x, SNAP_SIZE),
        y: Phaser.Math.Snap.To(gameObject.y - obstacle.y, SNAP_SIZE),
      });
      return;
    }
    const point = {
      x: Phaser.Math.Snap.To(gameObject.x, SNAP_SIZE),
      y: Phaser.Math.Snap.To(gameObject.y, SNAP_SIZE),
    };
    this.callbacks.onMove(selection, point);
  };

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.middleButtonDown() && !pointer.rightButtonDown() && !this.spaceKey?.isDown) return;
    this.panning = {
      x: pointer.x,
      y: pointer.y,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
    };
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.panning || !pointer.isDown) return;
    const camera = this.cameras.main;
    camera.setScroll(
      this.panning.scrollX - (pointer.x - this.panning.x) / camera.zoom,
      this.panning.scrollY - (pointer.y - this.panning.y) / camera.zoom,
    );
  };

  private readonly handlePointerUp = (): void => {
    this.panning = undefined;
  };

  private readonly handleWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    const camera = this.cameras.main;
    const before = pointer.positionToCamera(camera) as Phaser.Math.Vector2;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * (deltaY > 0 ? 0.9 : 1.1), 0.12, 2.5));
    const after = pointer.positionToCamera(camera) as Phaser.Math.Vector2;
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
  };

  private readonly handleResize = (): void => {
    this.fitMap();
  };

  private readonly preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
