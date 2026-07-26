import type { WorldSeed } from '../types';

export const WORLD_SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const WORLD_SEED_PATTERN = /^TY-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export function hashText32(text: string, initial = 0x811c9dc5): number {
  let hash = initial >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function normalizeWorldSeed(value: string): string {
  return value.trim().toUpperCase();
}

export function parseWorldSeed(value: string): WorldSeed | undefined {
  const text = normalizeWorldSeed(value);
  if (!WORLD_SEED_PATTERN.test(text)) return undefined;
  return {
    text,
    low: hashText32(text, 0x811c9dc5),
    high: hashText32(text, 0x9e3779b9),
  };
}

export function generateWorldSeed(getRandomValues: (values: Uint32Array) => Uint32Array = (values) => (
  crypto.getRandomValues(values)
)): WorldSeed {
  const values = getRandomValues(new Uint32Array(2));
  let symbols = '';
  let state = (BigInt(values[0]) << 32n) | BigInt(values[1]);
  for (let index = 0; index < 8; index += 1) {
    symbols += WORLD_SEED_ALPHABET[Number(state & 31n)];
    state >>= 5n;
  }
  return parseWorldSeed(`TY-${symbols.slice(0, 4)}-${symbols.slice(4)}`)!;
}
