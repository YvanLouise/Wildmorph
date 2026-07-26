import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import { advanceSurvival } from '../../src/game/survival/advanceSurvival';
import type { SurvivalState } from '../../src/game/types';

const full: SurvivalState = { health: 100, food: 100, water: 100, stamina: 100 };
const idle = { moving: false, sprinting: false };

describe('advanceSurvival', () => {
  it('combines shallow-water recovery with normal drain and prevents dehydration damage', () => {
    const result = advanceSurvival(
      { health: 80, food: 100, water: 0, stamina: 100 },
      1000,
      { moving: false, sprinting: false, waterRecoveryPerSecond: 7 },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(result.water).toBeCloseTo(6.5, 5);
    expect(result.health).toBe(80);
  });
  it('drains two food and three water over six normal seconds', () => {
    expect(advanceSurvival(full, 6000, idle, DEFAULT_GAME_CONFIG.survival)).toEqual({
      health: 100,
      food: 98,
      water: 97,
      stamina: 100,
    });
  });

  it('applies the sprint multiplier only while moving', () => {
    const sprinting = advanceSurvival(
      full,
      4000,
      { moving: true, sprinting: true },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(sprinting.food).toBe(98);
    expect(sprinting.water).toBe(97);
    expect(sprinting.stamina).toBe(60);

    const stationary = advanceSurvival(
      full,
      4000,
      { moving: false, sprinting: true },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(stationary.food).toBeCloseTo(100 - 4 / 3, 8);
    expect(stationary.water).toBe(98);
    expect(stationary.stamina).toBe(100);
  });

  it('recovers stamina only for the recovery-enabled part of a step', () => {
    const result = advanceSurvival(
      { ...full, stamina: 40 },
      2000,
      { ...idle, staminaRecoverySeconds: 1.25 },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(result.stamina).toBe(46.25);
  });

  it('uses the boosted rate only for the stationary-boosted part of a step', () => {
    const result = advanceSurvival(
      { ...full, stamina: 40 },
      2000,
      { ...idle, staminaRecoverySeconds: 2, staminaBoostedRecoverySeconds: 0.75 },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(result.stamina).toBe(61.25);
  });

  it.each([
    [{ health: 100, food: 0, water: 100, stamina: 100 }, 98],
    [{ health: 100, food: 100, water: 0, stamina: 100 }, 96],
    [{ health: 100, food: 0, water: 0, stamina: 100 }, 94],
  ] as const)('applies additive zero-resource damage', (state, expectedHealth) => {
    expect(advanceSurvival(state, 2000, idle, DEFAULT_GAME_CONFIG.survival).health).toBe(expectedHealth);
  });

  it('damages health only for the part of a large step after depletion', () => {
    const state = { health: 100, food: 1, water: 1, stamina: 100 };
    const result = advanceSurvival(state, 4000, idle, DEFAULT_GAME_CONFIG.survival);
    expect(result.food).toBe(0);
    expect(result.water).toBe(0);
    expect(result.health).toBe(95);
  });

  it('clamps values and ignores non-positive elapsed time', () => {
    const depleted = advanceSurvival(
      { health: 1, food: 0, water: 0, stamina: 120 },
      10_000,
      idle,
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(depleted).toEqual({ health: 0, food: 0, water: 0, stamina: 100 });
    expect(advanceSurvival(full, -100, idle, DEFAULT_GAME_CONFIG.survival)).toEqual(full);
  });
});
