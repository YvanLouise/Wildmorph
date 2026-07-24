import { describe, expect, it, vi } from 'vitest';
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
});
