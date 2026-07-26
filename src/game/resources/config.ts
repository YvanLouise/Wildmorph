export interface SeededResourcesConfig {
  readonly berryMinPerChunk: number;
  readonly berryMaxPerChunk: number;
  readonly berryMinFood: number;
  readonly berryMaxFood: number;
  readonly playerConsumeSeconds: number;
  readonly wildlifeConsumeSeconds: number;
  readonly berryRegrowSeconds: number;
  readonly berryInteractionRadius: number;
  readonly shallowWaterRecoveryPerSecond: number;
  readonly grassMaxPerChunk: number;
  readonly grassSeekChance: number;
  readonly grassConsumeSeconds: number;
  readonly grassRefreshSeconds: number;
  readonly grassInteractionRadius: number;
  readonly grassMaxConsumersPerPatch: number;
}

export const DEFAULT_SEEDED_RESOURCES_CONFIG: SeededResourcesConfig = {
  berryMinPerChunk: 0,
  berryMaxPerChunk: 2,
  berryMinFood: 7,
  berryMaxFood: 15,
  playerConsumeSeconds: 5,
  wildlifeConsumeSeconds: 10,
  berryRegrowSeconds: 45,
  berryInteractionRadius: 72,
  shallowWaterRecoveryPerSecond: 7,
  grassMaxPerChunk: 12,
  grassSeekChance: 0.35,
  grassConsumeSeconds: 15,
  grassRefreshSeconds: 30,
  grassInteractionRadius: 56,
  grassMaxConsumersPerPatch: 3,
};

export function normalizeSeededResourcesConfig(value: unknown): SeededResourcesConfig {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...structuredClone(DEFAULT_SEEDED_RESOURCES_CONFIG),
    ...record,
  } as SeededResourcesConfig;
}
