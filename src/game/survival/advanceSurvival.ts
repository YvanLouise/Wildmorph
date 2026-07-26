import type { SurvivalConfig } from '../config/GameConfig';
import type { SurvivalState } from '../types';

export interface SurvivalActivity {
  readonly moving: boolean;
  readonly sprinting: boolean;
  /** Recovery is combined with the normal water drain as a signed net rate. */
  readonly waterRecoveryPerSecond?: number;
  /** Seconds in this step that occur after the store-managed recovery delay. */
  readonly staminaRecoverySeconds?: number;
  /** Recovery-enabled seconds in this step that also occur after the stationary boost delay. */
  readonly staminaBoostedRecoverySeconds?: number;
}

interface ResourceAdvance {
  readonly value: number;
  readonly zeroSeconds: number;
}

function clampStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function drainResource(value: number, ratePerSecond: number, deltaSeconds: number): ResourceAdvance {
  const current = clampStat(value);
  if (current === 0) return { value: 0, zeroSeconds: deltaSeconds };
  if (ratePerSecond <= 0 || !Number.isFinite(ratePerSecond)) {
    return { value: current, zeroSeconds: 0 };
  }
  const timeToZero = current / ratePerSecond;
  return {
    value: clampStat(current - ratePerSecond * deltaSeconds),
    zeroSeconds: Math.max(0, deltaSeconds - timeToZero),
  };
}

export function advanceSurvival(
  state: Readonly<SurvivalState>,
  deltaMs: number,
  activity: Readonly<SurvivalActivity>,
  config: Readonly<SurvivalConfig>,
): SurvivalState {
  const deltaSeconds = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) / 1000 : 0;
  const multiplier = activity.moving && activity.sprinting
    ? config.sprintConsumptionMultiplier
    : 1;
  const foodRate = config.foodDrainIntervalSeconds > 0
    ? config.foodDrainAmount / config.foodDrainIntervalSeconds * multiplier
    : 0;
  const waterDrainRate = config.waterDrainIntervalSeconds > 0
    ? config.waterDrainAmount / config.waterDrainIntervalSeconds * multiplier
    : 0;
  const food = drainResource(state.food, foodRate, deltaSeconds);
  const waterRecoveryRate = Math.max(0, activity.waterRecoveryPerSecond ?? 0);
  const netWaterDrainRate = waterDrainRate - waterRecoveryRate;
  const water = netWaterDrainRate > 0
    ? drainResource(state.water, netWaterDrainRate, deltaSeconds)
    : {
        value: clampStat(state.water - netWaterDrainRate * deltaSeconds),
        zeroSeconds: 0,
      };
  const healthDamage = food.zeroSeconds * config.starvationDamagePerSecond
    + water.zeroSeconds * config.dehydrationDamagePerSecond;
  const staminaRecoverySeconds = activity.moving && activity.sprinting
    ? 0
    : Math.min(deltaSeconds, Math.max(0, activity.staminaRecoverySeconds ?? 0));
  const staminaBoostedRecoverySeconds = Math.min(
    staminaRecoverySeconds,
    Math.max(0, activity.staminaBoostedRecoverySeconds ?? 0),
  );
  const staminaNormalRecoverySeconds = staminaRecoverySeconds - staminaBoostedRecoverySeconds;
  const stamina = activity.moving && activity.sprinting
    ? state.stamina - config.staminaDrainPerSecond * deltaSeconds
    : state.stamina
      + config.staminaRecoveryPerSecond * staminaNormalRecoverySeconds
      + config.staminaStationaryRecoveryPerSecond * staminaBoostedRecoverySeconds;

  return {
    health: clampStat(state.health - healthDamage),
    food: food.value,
    water: water.value,
    stamina: clampStat(stamina),
  };
}
