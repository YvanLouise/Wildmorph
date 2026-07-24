export const PLAYER_SPEED = 200;

export interface DirectionalInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface MovementVector {
  readonly x: number;
  readonly y: number;
  readonly moving: boolean;
}

export function resolveMovement(input: DirectionalInput): MovementVector {
  const rawX = Number(input.right) - Number(input.left);
  const rawY = Number(input.down) - Number(input.up);

  if (rawX === 0 && rawY === 0) {
    return { x: 0, y: 0, moving: false };
  }

  const magnitude = Math.hypot(rawX, rawY);
  return {
    x: (rawX / magnitude) * PLAYER_SPEED,
    y: (rawY / magnitude) * PLAYER_SPEED,
    moving: true,
  };
}
