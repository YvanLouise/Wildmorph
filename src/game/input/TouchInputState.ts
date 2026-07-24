import type { DirectionalInput } from './movement';
import type { TouchInputSnapshot } from '../types';

export const JOYSTICK_DEAD_ZONE = 0.17;

const EMPTY_DIRECTIONS: DirectionalInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export class TouchInputState {
  private deadZone: number;
  private snapshot: TouchInputSnapshot = {
    active: false,
    sprinting: false,
    vector: { x: 0, y: 0 },
    ...EMPTY_DIRECTIONS,
  };

  constructor(deadZone = JOYSTICK_DEAD_ZONE) {
    this.deadZone = deadZone;
  }

  setDeadZone(deadZone: number): void {
    this.deadZone = Math.min(Math.max(deadZone, 0), 0.5);
  }

  setVector(x: number, y: number): Readonly<TouchInputSnapshot> {
    const magnitude = Math.hypot(x, y);
    if (magnitude < this.deadZone) {
      this.snapshot = {
        active: true,
        sprinting: this.snapshot.sprinting,
        vector: { x: 0, y: 0 },
        ...EMPTY_DIRECTIONS,
      };
      return this.getSnapshot();
    }

    const limitedMagnitude = Math.min(magnitude, 1);
    const normalizedX = (x / magnitude) * limitedMagnitude;
    const normalizedY = (y / magnitude) * limitedMagnitude;
    const sector = Math.round(Math.atan2(normalizedY, normalizedX) / (Math.PI / 4));
    const directionX = Math.round(Math.cos(sector * Math.PI / 4));
    const directionY = Math.round(Math.sin(sector * Math.PI / 4));

    this.snapshot = {
      active: true,
      sprinting: this.snapshot.sprinting,
      vector: { x: normalizedX, y: normalizedY },
      up: directionY < 0,
      down: directionY > 0,
      left: directionX < 0,
      right: directionX > 0,
    };
    return this.getSnapshot();
  }

  setSprint(sprinting: boolean): void {
    this.snapshot = { ...this.snapshot, sprinting };
  }

  isSprinting(): boolean {
    return this.snapshot.sprinting;
  }

  clearMovement(): void {
    this.snapshot = {
      active: false,
      sprinting: this.snapshot.sprinting,
      vector: { x: 0, y: 0 },
      ...EMPTY_DIRECTIONS,
    };
  }

  clear(): void {
    this.snapshot = { ...this.snapshot, sprinting: false };
    this.clearMovement();
  }

  getDirectionalInput(): DirectionalInput {
    const { up, down, left, right } = this.snapshot;
    return { up, down, left, right };
  }

  getSnapshot(): Readonly<TouchInputSnapshot> {
    return {
      ...this.snapshot,
      vector: { ...this.snapshot.vector },
    };
  }
}

export const touchInput = new TouchInputState();
