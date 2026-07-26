import type {
  GamePhase,
  GameSnapshot,
  PlayerState,
  RuntimeTelemetry,
  SurvivalState,
  WorldGenerationTelemetry,
} from '../types';

type PhaseListener = (phase: GamePhase) => void;

const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  title: ['playing'],
  playing: ['paused', 'resetting', 'title'],
  paused: ['playing', 'resetting', 'title'],
  resetting: ['playing', 'title'],
};

const INITIAL_PLAYER: PlayerState = {
  x: 1200,
  y: 960,
  velocityX: 0,
  velocityY: 0,
  facingRadians: Math.PI,
  moving: false,
};

const INITIAL_RUNTIME: RuntimeTelemetry = {
  fps: 0,
  cameraZoom: 1,
};

const INITIAL_SURVIVAL: SurvivalState = {
  health: 100,
  food: 100,
  water: 100,
  stamina: 100,
};

const INITIAL_WORLD: WorldGenerationTelemetry = {
  mode: 'fixed',
  seed: null,
  generationVersion: null,
  chunk: null,
  activeChunks: 0,
  cachedChunks: 0,
  lastGenerationMs: 0,
  objectCount: 0,
  colliderCount: 0,
  wildlife: {
    activeAnimals: 0,
    sleepingAnimals: 0,
    pathSearches: 0,
    lastSimulationMs: 0,
    bySpecies: {},
    byState: {},
  },
};

const clampSurvivalValue = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class GameStore {
  private phase: GamePhase = 'title';
  private player: PlayerState = INITIAL_PLAYER;
  private survival: SurvivalState = INITIAL_SURVIVAL;
  private runtime: RuntimeTelemetry = INITIAL_RUNTIME;
  private world: WorldGenerationTelemetry = INITIAL_WORLD;
  private readonly listeners = new Set<PhaseListener>();

  getPhase(): GamePhase {
    return this.phase;
  }

  transition(next: GamePhase): void {
    if (next === this.phase) {
      return;
    }
    if (!canTransition(this.phase, next)) {
      throw new Error(`Invalid game phase transition: ${this.phase} -> ${next}`);
    }
    this.phase = next;
    for (const listener of this.listeners) {
      listener(this.phase);
    }
  }

  subscribe(listener: PhaseListener): () => void {
    this.listeners.add(listener);
    listener(this.phase);
    return () => this.listeners.delete(listener);
  }

  updatePlayer(player: PlayerState): void {
    this.player = { ...player };
  }

  updateRuntime(runtime: RuntimeTelemetry): void {
    this.runtime = { ...runtime };
  }

  updateWorld(world: WorldGenerationTelemetry): void {
    this.world = {
      ...world,
      chunk: world.chunk ? { ...world.chunk } : null,
      wildlife: {
        ...world.wildlife,
        bySpecies: { ...world.wildlife.bySpecies },
        byState: { ...world.wildlife.byState },
      },
    };
  }

  updateSurvival(update: Partial<SurvivalState>): void {
    const survival = { ...this.survival };
    for (const key of Object.keys(update) as (keyof SurvivalState)[]) {
      const value = update[key];
      if (value !== undefined) {
        survival[key] = clampSurvivalValue(value);
      }
    }
    this.survival = survival;
  }

  resetSurvival(): void {
    this.survival = { ...INITIAL_SURVIVAL };
  }

  getSnapshot(): Readonly<GameSnapshot> {
    return {
      phase: this.phase,
      player: { ...this.player },
      survival: { ...this.survival },
      runtime: { ...this.runtime },
      world: {
        ...this.world,
        chunk: this.world.chunk ? { ...this.world.chunk } : null,
        wildlife: {
          ...this.world.wildlife,
          bySpecies: { ...this.world.wildlife.bySpecies },
          byState: { ...this.world.wildlife.byState },
        },
      },
    };
  }
}

export const gameStore = new GameStore();
