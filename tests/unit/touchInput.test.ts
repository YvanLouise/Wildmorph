import { describe, expect, it } from 'vitest';
import {
  JOYSTICK_DEAD_ZONE,
  TouchInputState,
} from '../../src/game/input/TouchInputState';
import { PLAYER_SPEED, resolveMovement } from '../../src/game/input/movement';

describe('TouchInputState', () => {
  it('keeps input idle inside the dead zone', () => {
    const input = new TouchInputState();
    input.setVector(JOYSTICK_DEAD_ZONE * 0.5, 0);
    expect(input.getDirectionalInput()).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });

  it.each([
    [[0, -1], [true, false, false, false]],
    [[1, -1], [true, false, false, true]],
    [[1, 0], [false, false, false, true]],
    [[1, 1], [false, true, false, true]],
    [[0, 1], [false, true, false, false]],
    [[-1, 1], [false, true, true, false]],
    [[-1, 0], [false, false, true, false]],
    [[-1, -1], [true, false, true, false]],
  ] as const)('maps vector %j to one of eight directions', ([x, y], expected) => {
    const input = new TouchInputState();
    input.setVector(x, y);
    expect(Object.values(input.getDirectionalInput())).toEqual(expected);
    expect(Math.hypot(
      resolveMovement(input.getDirectionalInput()).x,
      resolveMovement(input.getDirectionalInput()).y,
    )).toBeCloseTo(PLAYER_SPEED, 8);
  });

  it('clears movement immediately', () => {
    const input = new TouchInputState();
    input.setVector(1, 0);
    input.clear();
    expect(input.getSnapshot()).toEqual({
      active: false,
      sprinting: false,
      vector: { x: 0, y: 0 },
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });

  it('keeps sprint held when the joystick is released, then clears all input', () => {
    const input = new TouchInputState();
    input.setSprint(true);
    input.setVector(1, 0);
    input.clearMovement();
    expect(input.isSprinting()).toBe(true);
    expect(input.getDirectionalInput().right).toBe(false);

    input.clear();
    expect(input.isSprinting()).toBe(false);
  });
});
