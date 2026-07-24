import type { GamePhase, GameSnapshot, PlayerState, RuntimeTelemetry } from '../types';

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

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class GameStore {
  private phase: GamePhase = 'title';
  private player: PlayerState = INITIAL_PLAYER;
  private runtime: RuntimeTelemetry = INITIAL_RUNTIME;
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

  getSnapshot(): Readonly<GameSnapshot> {
    return {
      phase: this.phase,
      player: { ...this.player },
      runtime: { ...this.runtime },
    };
  }
}

export const gameStore = new GameStore();
