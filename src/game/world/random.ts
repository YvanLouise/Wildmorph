import type { WorldSeed } from '../types';
import { hashText32 } from './seed';

function avalanche(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  return (result ^ (result >>> 16)) >>> 0;
}

export function hashWorld(seed: WorldSeed, namespace: string, ...values: readonly number[]): number {
  let hash = hashText32(namespace, seed.low ^ seed.high);
  for (const value of values) {
    hash = avalanche(hash ^ Math.imul(value | 0, 0x9e3779b1));
  }
  return hash >>> 0;
}

export function hashUnit(seed: WorldSeed, namespace: string, ...values: readonly number[]): number {
  return hashWorld(seed, namespace, ...values) / 0x100000000;
}

export class DeterministicRandom {
  private state: number;

  constructor(seed: WorldSeed, namespace: string, ...values: readonly number[]) {
    this.state = hashWorld(seed, namespace, ...values) || 0x6d2b79f5;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }

  between(minimum: number, maximum: number): number {
    return minimum + this.next() * (maximum - minimum);
  }

  integer(minimum: number, maximum: number): number {
    return Math.floor(this.between(minimum, maximum + 1));
  }
}
