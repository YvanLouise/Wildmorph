import type { ChunkKey, GeneratedChunkData } from '../types';

export class ChunkCache {
  private readonly entries = new Map<ChunkKey, GeneratedChunkData>();

  constructor(private readonly maximum: number) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: ChunkKey): GeneratedChunkData | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(value: GeneratedChunkData): void {
    this.entries.delete(value.key);
    this.entries.set(value.key, value);
    while (this.entries.size > this.maximum) {
      const oldest = this.entries.keys().next().value as ChunkKey | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
