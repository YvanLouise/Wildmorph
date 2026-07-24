import { describe, expect, it } from 'vitest';
import {
  mergeDirectionalInput,
  PLAYER_SPRINT_SPEED,
  PLAYER_SPEED,
  resolveMovement,
} from '../../src/game/input/movement';

describe('resolveMovement', () => {
  it('returns zero immediately when no direction is active', () => {
    expect(resolveMovement({ up: false, down: false, left: false, right: false })).toEqual({
      x: 0,
      y: 0,
      moving: false,
    });
  });

  it('cancels opposite directions', () => {
    expect(resolveMovement({ up: true, down: true, left: true, right: true })).toEqual({
      x: 0,
      y: 0,
      moving: false,
    });
  });

  it('moves at exactly 200 logical pixels per second on one axis', () => {
    const movement = resolveMovement({ up: false, down: false, left: false, right: true });
    expect(movement.x).toBe(PLAYER_SPEED);
    expect(movement.y).toBe(0);
  });

  it('normalizes diagonal movement to the same total speed', () => {
    const movement = resolveMovement({ up: true, down: false, left: false, right: true });
    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(PLAYER_SPEED, 8);
    expect(movement.x).toBeCloseTo(Math.SQRT1_2 * PLAYER_SPEED, 8);
    expect(movement.y).toBeCloseTo(-Math.SQRT1_2 * PLAYER_SPEED, 8);
  });

  it('uses exactly 1.5x speed while sprinting', () => {
    const movement = resolveMovement(
      { up: true, down: false, left: false, right: true },
      PLAYER_SPRINT_SPEED,
    );
    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(300, 8);
  });
});

describe('mergeDirectionalInput', () => {
  it('combines keyboard and touch directions before resolving opposites', () => {
    const merged = mergeDirectionalInput(
      { up: false, down: false, left: false, right: true },
      { up: false, down: false, left: true, right: false },
    );
    expect(resolveMovement(merged)).toEqual({ x: 0, y: 0, moving: false });
  });
});
