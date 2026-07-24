export const PLAYER_SPEED = 200;
export const SPRINT_MULTIPLIER = 1.5;
export const PLAYER_SPRINT_SPEED = PLAYER_SPEED * SPRINT_MULTIPLIER;

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

export function mergeDirectionalInput(
  ...inputs: readonly DirectionalInput[]
): DirectionalInput {
  return {
    up: inputs.some((input) => input.up),
    down: inputs.some((input) => input.down),
    left: inputs.some((input) => input.left),
    right: inputs.some((input) => input.right),
  };
}

export function resolveMovement(
  input: DirectionalInput,
  speed = PLAYER_SPEED,
): MovementVector {
  const rawX = Number(input.right) - Number(input.left);
  const rawY = Number(input.down) - Number(input.up);

  if (rawX === 0 && rawY === 0) {
    return { x: 0, y: 0, moving: false };
  }

  const magnitude = Math.hypot(rawX, rawY);
  return {
    x: (rawX / magnitude) * speed,
    y: (rawY / magnitude) * speed,
    moving: true,
  };
}
