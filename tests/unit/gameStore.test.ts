import { describe, expect, it, vi } from 'vitest';
import { BASE_GAME_CONFIG, DEFAULT_GAME_CONFIG } from '../../src/game/config/GameConfig';
import { canTransition, GameStore } from '../../src/game/state/GameStore';

describe('GameStore', () => {
  it('supports the complete demo state flow', () => {
    const store = new GameStore();
    store.transition('playing');
    store.transition('paused');
    store.transition('resetting');
    store.transition('playing');
    store.transition('title');
    expect(store.getPhase()).toBe('title');
  });

  it('rejects invalid transitions', () => {
    const store = new GameStore();
    expect(() => store.transition('paused')).toThrow(/Invalid game phase transition/);
    expect(canTransition('title', 'resetting')).toBe(false);
  });

  it('notifies subscribers on each valid state change', () => {
    const listener = vi.fn();
    const store = new GameStore();
    const unsubscribe = store.subscribe(listener);
    store.transition('playing');
    unsubscribe();
    store.transition('paused');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith('playing');
  });

  it('updates, clamps, copies, and resets survival values', () => {
    const store = new GameStore();
    expect(store.getSnapshot().survival).toEqual({
      health: 100,
      food: 100,
      water: 100,
      stamina: 100,
    });

    store.updateSurvival({ health: -10, water: 140, stamina: 42.6 });
    const snapshot = store.getSnapshot();
    expect(snapshot.survival).toEqual({
      health: 0,
      food: 100,
      water: 100,
      stamina: 42.6,
    });

    (snapshot.survival as { health: number }).health = 77;
    expect(store.getSnapshot().survival.health).toBe(0);
    store.resetSurvival();
    expect(store.getSnapshot().survival.health).toBe(100);
    expect(store.getSnapshot().survival.stamina).toBe(100);
  });

  it('advances survival through the state boundary and resets it', () => {
    const store = new GameStore();
    store.updateSurvival({ food: 0, water: 0 });
    store.advanceSurvival(
      1000,
      { moving: true, sprinting: true },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(store.getSnapshot().survival.health).toBe(97);
    store.resetSurvival();
    expect(store.getSnapshot().survival).toEqual({
      health: 100,
      food: 100,
      water: 100,
      stamina: 100,
    });
  });

  it('drains sprint stamina, waits three stationary seconds, then recovers twenty per second', () => {
    const store = new GameStore();
    store.advanceSurvival(
      1000,
      { moving: true, sprinting: true },
      DEFAULT_GAME_CONFIG.survival,
    );
    expect(store.getSnapshot().survival.stamina).toBe(90);

    store.advanceSurvival(3000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(90);
    store.advanceSurvival(1000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(100);
  });

  it('uses normal recovery while moving and boosts after three continuous stationary seconds', () => {
    const store = new GameStore();
    store.updateSurvival({ stamina: 20 });

    store.advanceSurvival(2000, { moving: true, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(30);
    store.advanceSurvival(2000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(40);
    store.advanceSurvival(500, { moving: true, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    store.advanceSurvival(3000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(57.5);
    store.advanceSurvival(1000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(77.5);
  });

  it('blocks sprint after exhaustion until input is released and stamina recovers', () => {
    const store = new GameStore();
    store.updateSurvival({ stamina: 10 });
    store.advanceSurvival(1000, { moving: true, sprinting: true }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(0);
    expect(store.canSprint()).toBe(false);

    store.advanceSurvival(4000, { moving: true, sprinting: true }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(0);
    store.advanceSurvival(3000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    store.advanceSurvival(1000, { moving: false, sprinting: false }, DEFAULT_GAME_CONFIG.survival);
    expect(store.getSnapshot().survival.stamina).toBe(20);
    expect(store.canSprint()).toBe(true);
  });

  it('advances and resets the shared day and night clock', () => {
    const store = new GameStore();
    expect(store.getSnapshot().dayNight).toMatchObject({ phase: 'dawn', clockText: '05:00' });
    store.advanceDayNight(45_000, BASE_GAME_CONFIG.dayNight);
    expect(store.getSnapshot().dayNight).toMatchObject({ phase: 'day', clockText: '06:00' });
    store.resetDayNight(BASE_GAME_CONFIG.dayNight);
    expect(store.getSnapshot().dayNight).toMatchObject({
      elapsedSeconds: 0,
      phase: 'dawn',
      clockText: '05:00',
    });
  });
});
