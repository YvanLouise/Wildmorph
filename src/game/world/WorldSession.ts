import type { WorldLaunchRequest, WorldMode, WorldSeed } from '../types';
import { generateWorldSeed, parseWorldSeed } from './seed';

export const WORLD_SESSION_STORAGE_KEY = 'wildmorph.world-session.v1';

interface StoredWorldSession {
  readonly version: 1;
  readonly mode: WorldMode;
  readonly seed: string;
}

export class WorldSession {
  private mode: WorldMode = 'fixed';
  private seed: WorldSeed;

  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.seed = generateWorldSeed();
    this.restore();
  }

  get request(): WorldLaunchRequest {
    return this.mode === 'seeded'
      ? { mode: this.mode, seed: this.seed.text }
      : { mode: this.mode };
  }

  get currentMode(): WorldMode {
    return this.mode;
  }

  get currentSeed(): WorldSeed {
    return this.seed;
  }

  select(request: WorldLaunchRequest): boolean {
    if (request.mode === 'seeded') {
      const parsed = request.seed ? parseWorldSeed(request.seed) : undefined;
      if (!parsed) return false;
      this.seed = parsed;
    }
    this.mode = request.mode;
    this.persist();
    return true;
  }

  createRandomSeed(): WorldSeed {
    this.seed = generateWorldSeed();
    this.persist();
    return this.seed;
  }

  private restore(): void {
    if (!this.storage) return;
    try {
      const parsed = JSON.parse(this.storage.getItem(WORLD_SESSION_STORAGE_KEY) ?? '') as Partial<StoredWorldSession>;
      const seed = typeof parsed.seed === 'string' ? parseWorldSeed(parsed.seed) : undefined;
      if (parsed.version === 1 && (parsed.mode === 'fixed' || parsed.mode === 'seeded') && seed) {
        this.mode = parsed.mode;
        this.seed = seed;
      }
    } catch {
      // A malformed local preference should never block starting a world.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const value: StoredWorldSession = {
      version: 1,
      mode: this.mode,
      seed: this.seed.text,
    };
    this.storage.setItem(WORLD_SESSION_STORAGE_KEY, JSON.stringify(value));
  }
}
