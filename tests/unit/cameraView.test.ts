import { describe, expect, it } from 'vitest';
import { calculateCameraView, maximumStreamedHalfWidth } from '../../src/game/camera/view';

describe('player-relative camera view', () => {
  it('shows ten player sizes on each side at the default desktop view', () => {
    const view = calculateCameraView({ width: 1280, height: 720 }, 64, 10);
    expect(view.zoom).toBe(1);
    expect(view.halfWidthWorld).toBe(640);
    expect(view.halfWidthBodyMultiplier).toBe(10);
    expect(view.worldWidth).toBe(1280);
    expect(view.worldHeight).toBe(720);
  });

  it('keeps horizontal body coverage on a landscape phone and scales vertical view proportionally', () => {
    const view = calculateCameraView({ width: 844, height: 390 }, 64, 10);
    expect(view.zoom).toBeCloseTo(844 / 1280, 6);
    expect(view.halfWidthWorld).toBeCloseTo(640, 6);
    expect(view.worldHeight).toBeCloseTo(390 / (844 / 1280), 5);
  });

  it('uses the configured player visual size without changing the body multiplier', () => {
    const view = calculateCameraView({ width: 1280, height: 720 }, 80, 10);
    expect(view.halfWidthWorld).toBe(800);
    expect(view.halfWidthBodyMultiplier).toBe(10);
    expect(view.zoom).toBe(0.8);
  });

  it('tightens a fixed-world camera enough to avoid showing outside the map', () => {
    const view = calculateCameraView(
      { width: 1280, height: 720 },
      160,
      15,
      { width: 2400, height: 1600 },
    );
    expect(view.constrainedByWorldBounds).toBe(true);
    expect(view.worldWidth).toBeLessThanOrEqual(2400);
    expect(view.worldHeight).toBeLessThanOrEqual(1600);
  });

  it('derives the seeded-world safety range from chunk dimensions and load radius', () => {
    expect(maximumStreamedHalfWidth(32, 16, 2)).toBe(1024);
  });
});
