import type { WildlifeGlobalConfig, WildlifeSpeciesId } from '../types';

export const WILDLIFE_SPECIES_IDS = [
  'white-rabbit',
  'sika-deer',
  'pig',
  'raccoon',
  'red-fox',
  'tiger',
] as const satisfies readonly WildlifeSpeciesId[];

export const DEFAULT_WILDLIFE_CONFIG: WildlifeGlobalConfig = {
  maxActiveAnimals: 48,
  activationRadius: 1100,
  sleepRadius: 1300,
  simulationStepMs: 50,
  decisionIntervalMs: 200,
  pathSearchRadiusTiles: 24,
  maxPathNodes: 384,
  pathSearchesPerStep: 2,
  pathBudgetMs: 1.5,
  spawnClearRadius: 220,
  dangerSpawnClearRadius: 900,
  species: {
    'white-rabbit': {
      enabled: true, role: 'prey', spawnChance: 0.18, groupMin: 2, groupMax: 4,
      preferredTerrains: ['grass', 'wet-grass'], walkSpeed: 70, fleeSpeed: 230, chaseSpeed: 70,
      detectionRadius: 230, giveUpRadius: 360, territoryRadius: 260,
      alertDurationMs: 450, chaseDurationMs: 0, restDurationMs: 1500, cooldownMs: 2500,
    },
    'sika-deer': {
      enabled: true, role: 'prey', spawnChance: 0.09, groupMin: 2, groupMax: 4,
      preferredTerrains: ['grass', 'wet-grass'], walkSpeed: 85, fleeSpeed: 220, chaseSpeed: 85,
      detectionRadius: 270, giveUpRadius: 430, territoryRadius: 360,
      alertDurationMs: 600, chaseDurationMs: 0, restDurationMs: 1800, cooldownMs: 3000,
    },
    pig: {
      enabled: true, role: 'forager', spawnChance: 0.08, groupMin: 2, groupMax: 3,
      preferredTerrains: ['grass', 'wet-grass', 'mud'], walkSpeed: 65, fleeSpeed: 165, chaseSpeed: 65,
      detectionRadius: 180, giveUpRadius: 320, territoryRadius: 300,
      alertDurationMs: 750, chaseDurationMs: 0, restDurationMs: 1900, cooldownMs: 3000,
    },
    raccoon: {
      enabled: true, role: 'forager', spawnChance: 0.1, groupMin: 1, groupMax: 2,
      preferredTerrains: ['wet-grass', 'grass'], walkSpeed: 60, fleeSpeed: 170, chaseSpeed: 60,
      detectionRadius: 190, giveUpRadius: 330, territoryRadius: 260,
      alertDurationMs: 500, chaseDurationMs: 0, restDurationMs: 1700, cooldownMs: 2800,
    },
    'red-fox': {
      enabled: true, role: 'mesopredator', spawnChance: 0.05, groupMin: 1, groupMax: 1,
      preferredTerrains: ['grass', 'wet-grass'], walkSpeed: 80, fleeSpeed: 190, chaseSpeed: 205,
      detectionRadius: 280, giveUpRadius: 420, territoryRadius: 380,
      alertDurationMs: 900, chaseDurationMs: 4500, restDurationMs: 1600, cooldownMs: 8000,
    },
    tiger: {
      enabled: true, role: 'predator', spawnChance: 0.018, groupMin: 1, groupMax: 1,
      preferredTerrains: ['grass', 'wet-grass'], walkSpeed: 75, fleeSpeed: 75, chaseSpeed: 225,
      detectionRadius: 280, giveUpRadius: 520, territoryRadius: 460,
      alertDurationMs: 650, chaseDurationMs: 5500, restDurationMs: 2200, cooldownMs: 10000,
    },
  },
};

export function cloneDefaultWildlifeConfig(): WildlifeGlobalConfig {
  return structuredClone(DEFAULT_WILDLIFE_CONFIG);
}

export function isWildlifeSpeciesId(value: string): value is WildlifeSpeciesId {
  return (WILDLIFE_SPECIES_IDS as readonly string[]).includes(value);
}
