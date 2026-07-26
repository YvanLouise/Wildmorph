import type {
  DayNightState,
  GamePhase,
  GameSnapshot,
  PlayerForagingSnapshot,
  PlayerState,
  RuntimeTelemetry,
  SurvivalState,
  WorldGenerationTelemetry,
} from '../types';
import { DEFAULT_GAME_CONFIG, type DayNightConfig, type SurvivalConfig } from '../config/GameConfig';
import {
  advanceDayNight as advanceDayNightState,
  sampleDayNight,
} from '../dayNight/dayNight';
import {
  advanceSurvival as advanceSurvivalState,
  type SurvivalActivity,
} from '../survival/advanceSurvival';

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
  cameraViewIndex: 1,
  cameraHalfWidthWorld: 640,
  cameraHalfWidthBodyMultiplier: 10,
  cameraWorldWidth: 1280,
  cameraWorldHeight: 720,
};

const INITIAL_SURVIVAL: SurvivalState = {
  health: 100,
  food: 100,
  water: 100,
  stamina: 100,
};

const INITIAL_FORAGING: PlayerForagingSnapshot = {
  active: false,
  berryId: null,
  remainingFood: 0,
  maxFood: 0,
  progress: 0,
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
  resources: {
    activeRipeBushes: 0,
    activeEmptyBushes: 0,
    modifiedBushes: 0,
    activeConsumers: 0,
    activeGrassPatches: 0,
    grazingGrassPatches: 0,
    grassConsumers: 0,
    grassRefreshes: 0,
    playerInShallowWater: false,
  },
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
  private dayNight: DayNightState = sampleDayNight(0, DEFAULT_GAME_CONFIG.dayNight);
  private foraging: PlayerForagingSnapshot = INITIAL_FORAGING;
  private staminaRecoveryDelayRemainingSeconds = 0;
  private staminaStationarySeconds = 0;
  private sprintExhausted = false;
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
      resources: { ...world.resources },
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
    if (survival.stamina > 0) {
      this.sprintExhausted = false;
    }
  }

  updateForaging(foraging: Readonly<PlayerForagingSnapshot>): void {
    this.foraging = { ...foraging };
  }

  canSprint(): boolean {
    return this.survival.stamina > 0 && !this.sprintExhausted;
  }

  advanceDayNight(deltaMs: number, config: Readonly<DayNightConfig>): void {
    this.dayNight = advanceDayNightState(this.dayNight, deltaMs, config);
  }

  resetDayNight(config: Readonly<DayNightConfig> = DEFAULT_GAME_CONFIG.dayNight): void {
    this.dayNight = sampleDayNight(0, config);
  }

  advanceSurvival(
    deltaMs: number,
    activity: Readonly<SurvivalActivity>,
    config: Readonly<SurvivalConfig>,
  ): void {
    const deltaSeconds = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) / 1000 : 0;
    const activeSprint = activity.moving && activity.sprinting && this.canSprint();
    let staminaRecoverySeconds = 0;
    let staminaBoostedRecoverySeconds = 0;

    if (activity.moving) {
      this.staminaStationarySeconds = 0;
    }

    if (activeSprint) {
      this.staminaRecoveryDelayRemainingSeconds = config.staminaRecoveryDelaySeconds;
    } else if (!(this.sprintExhausted && activity.moving && activity.sprinting)) {
      staminaRecoverySeconds = Math.max(0, deltaSeconds - this.staminaRecoveryDelayRemainingSeconds);
      if (!activity.moving) {
        const stationaryBoostDelayRemainingSeconds = Math.max(
          0,
          config.staminaStationaryRecoveryDelaySeconds - this.staminaStationarySeconds,
        );
        staminaBoostedRecoverySeconds = Math.max(
          0,
          deltaSeconds - Math.max(
            this.staminaRecoveryDelayRemainingSeconds,
            stationaryBoostDelayRemainingSeconds,
          ),
        );
        this.staminaStationarySeconds += deltaSeconds;
      }
      this.staminaRecoveryDelayRemainingSeconds = Math.max(
        0,
        this.staminaRecoveryDelayRemainingSeconds - deltaSeconds,
      );
    }

    this.survival = advanceSurvivalState(
      this.survival,
      deltaMs,
      {
        moving: activity.moving,
        sprinting: activeSprint,
        staminaRecoverySeconds,
        staminaBoostedRecoverySeconds,
        waterRecoveryPerSecond: activity.waterRecoveryPerSecond,
      },
      config,
    );

    if (activeSprint && this.survival.stamina === 0) {
      this.sprintExhausted = true;
    } else if ((!activity.moving || !activity.sprinting) && this.survival.stamina > 0) {
      this.sprintExhausted = false;
    }
  }

  resetSurvival(): void {
    this.survival = { ...INITIAL_SURVIVAL };
    this.staminaRecoveryDelayRemainingSeconds = 0;
    this.staminaStationarySeconds = 0;
    this.sprintExhausted = false;
    this.foraging = { ...INITIAL_FORAGING };
  }

  getSnapshot(): Readonly<GameSnapshot> {
    return {
      phase: this.phase,
      player: { ...this.player },
      survival: { ...this.survival },
      dayNight: { ...this.dayNight, lighting: { ...this.dayNight.lighting } },
      foraging: { ...this.foraging },
      runtime: { ...this.runtime },
      world: {
        ...this.world,
        chunk: this.world.chunk ? { ...this.world.chunk } : null,
        resources: { ...this.world.resources },
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
