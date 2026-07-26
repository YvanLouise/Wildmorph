import { describe, expect, it } from 'vitest';
import { BASE_GAME_CONFIG } from '../../src/game/config/GameConfig';
import {
  advanceDayNight,
  dayNightCycleSeconds,
  sampleDayNight,
} from '../../src/game/dayNight/dayNight';

const config = BASE_GAME_CONFIG.dayNight;

describe('day/night cycle', () => {
  it('uses a 450 second default cycle and starts at dawn in night lighting', () => {
    expect(dayNightCycleSeconds(config)).toBe(450);
    expect(sampleDayNight(0, config)).toMatchObject({
      phase: 'dawn',
      phaseProgress: 0,
      cycleProgress: 0,
      clockText: '05:00',
      lighting: { color: '#0e1d34', opacity: 0.52 },
    });
  });

  it.each([
    [45, 'day', '06:00'],
    [225, 'dusk', '18:00'],
    [270, 'night', '19:00'],
    [450, 'dawn', '05:00'],
  ] as const)('resolves the phase boundary at %s seconds', (elapsed, phase, clockText) => {
    expect(sampleDayNight(elapsed, config)).toMatchObject({ phase, phaseProgress: 0, clockText });
  });

  it.each([
    [22.5, '05:30'],
    [135, '12:00'],
    [247.5, '18:30'],
    [360, '00:00'],
  ] as const)('maps phase progress at %s seconds to the 24-hour clock', (elapsed, clockText) => {
    expect(sampleDayNight(elapsed, config).clockText).toBe(clockText);
  });

  it('keeps lighting continuous at every phase boundary', () => {
    for (const boundary of [45, 225, 270, 450]) {
      const before = sampleDayNight(boundary - 0.001, config).lighting;
      const after = sampleDayNight(boundary, config).lighting;
      expect(before.opacity).toBeCloseTo(after.opacity, 5);
      if (after.opacity > 0) expect(before.color).toBe(after.color);
    }
  });

  it('uses no overlay in daytime and maximum configured darkness at night', () => {
    expect(sampleDayNight(120, config).lighting.opacity).toBe(0);
    expect(sampleDayNight(330, config).lighting.opacity).toBe(config.nightDarkness);
  });

  it('advances independently of frame size and wraps across multiple cycles', () => {
    const initial = sampleDayNight(0, config);
    const advanced = advanceDayNight(initial, 1_372_500, config);
    expect(advanced.elapsedSeconds).toBe(1372.5);
    expect(advanced.phase).toBe('dawn');
    expect(advanced.clockText).toBe('05:30');
    expect(advanceDayNight(initial, -100, config)).toEqual(initial);
  });
});
