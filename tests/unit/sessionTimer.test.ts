import { describe, expect, it } from 'vitest';
import { formatSessionElapsed, SessionTimer } from '../../src/game/state/SessionTimer';

describe('SessionTimer', () => {
  it('counts only while running and resets cleanly', () => {
    let now = 1000;
    const timer = new SessionTimer(() => now);

    timer.start();
    now = 3750;
    expect(timer.getElapsedMs()).toBe(2750);
    timer.pause();
    now = 9000;
    expect(timer.getElapsedMs()).toBe(2750);

    timer.start();
    now = 10250;
    expect(timer.getElapsedMs()).toBe(4000);
    timer.reset();
    expect(timer.getElapsedMs()).toBe(0);
  });

  it('formats minute and hour durations', () => {
    expect(formatSessionElapsed(0)).toBe('00:00');
    expect(formatSessionElapsed(65_900)).toBe('01:05');
    expect(formatSessionElapsed(3_661_000)).toBe('01:01:01');
  });
});
