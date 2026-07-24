export type GamePhase = 'title' | 'playing' | 'paused' | 'resetting';

export type InputAction = 'move-up' | 'move-down' | 'move-left' | 'move-right' | 'pause';

export interface PlayerState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly facingRadians: number;
  readonly moving: boolean;
}

export type ColliderDefinition =
  | { readonly shape: 'rectangle'; readonly width: number; readonly height: number }
  | { readonly shape: 'circle'; readonly radius: number };

export type ObstacleKind =
  | 'tree'
  | 'ancient-tree'
  | 'rock'
  | 'white-rock'
  | 'fallen-log'
  | 'water';

export interface ObstacleDefinition {
  readonly id: string;
  readonly kind: ObstacleKind;
  readonly x: number;
  readonly y: number;
  readonly collider: ColliderDefinition;
  readonly visualScale?: number;
  readonly rotation?: number;
  readonly collisionOnly?: boolean;
}

export interface PointDefinition {
  readonly x: number;
  readonly y: number;
}

export interface WorldLayout {
  readonly width: number;
  readonly height: number;
  readonly spawn: PointDefinition;
  readonly spawnClearRadius: number;
  readonly pondCenter: PointDefinition;
  readonly pondPolygon: readonly PointDefinition[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly teleportPoints: readonly PointDefinition[];
}

export interface RuntimeTelemetry {
  readonly fps: number;
  readonly cameraZoom: number;
}

export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly player: PlayerState;
  readonly runtime: RuntimeTelemetry;
}

export interface TuyeDebugApi {
  getSnapshot(): Readonly<GameSnapshot>;
  teleport(index: number): void;
  resetPlayer(): void;
  setZoom(zoom: number): void;
}

declare global {
  interface Window {
    __TUYE_DEBUG__?: TuyeDebugApi;
  }
}
