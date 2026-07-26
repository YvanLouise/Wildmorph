import type { WorldSeed } from '../types';
import { hashUnit } from './random';

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function valueNoise2D(seed: WorldSeed, namespace: string, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const north = lerp(
    hashUnit(seed, namespace, x0, y0),
    hashUnit(seed, namespace, x0 + 1, y0),
    tx,
  );
  const south = lerp(
    hashUnit(seed, namespace, x0, y0 + 1),
    hashUnit(seed, namespace, x0 + 1, y0 + 1),
    tx,
  );
  return lerp(north, south, ty);
}

export function fractalNoise2D(
  seed: WorldSeed,
  namespace: string,
  worldX: number,
  worldY: number,
  wavelength: number,
  octaves = 4,
): number {
  let amplitude = 1;
  let frequency = 1 / wavelength;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(seed, `${namespace}:${octave}`, worldX * frequency, worldY * frequency) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / weight;
}
