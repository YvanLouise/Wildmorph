export const CHARACTER_IDS = [
  'penguin',
  'raccoon',
  'sea-turtle',
  'pig',
  'white-rabbit',
  'red-fox',
  'tiger',
  'sika-deer',
  'yellow-fox',
] as const;

export type CharacterId = typeof CHARACTER_IDS[number];

export interface CharacterProfileConfig {
  readonly displayName: string;
  readonly notes: string;
  readonly visualSize: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly facingOffsetDegrees: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly moveSpeed: number;
  readonly sprintMultiplier: number;
  readonly footstepIntervalMs: number;
}

const BASE_PROFILE = {
  notes: '',
  visualSize: 64,
  anchorX: 0.5,
  anchorY: 0.5,
  facingOffsetDegrees: 0,
  moveSpeed: 200,
  sprintMultiplier: 1.5,
  footstepIntervalMs: 285,
} as const;

export const DEFAULT_CHARACTER_PROFILES: Readonly<Record<CharacterId, CharacterProfileConfig>> = {
  penguin: { ...BASE_PROFILE, displayName: '企鹅', bodyWidth: 32, bodyHeight: 28 },
  raccoon: { ...BASE_PROFILE, displayName: '浣熊', bodyWidth: 26, bodyHeight: 34 },
  'sea-turtle': { ...BASE_PROFILE, displayName: '海龟', bodyWidth: 36, bodyHeight: 32 },
  pig: { ...BASE_PROFILE, displayName: '猪', bodyWidth: 32, bodyHeight: 34 },
  'white-rabbit': { ...BASE_PROFILE, displayName: '白兔', bodyWidth: 24, bodyHeight: 34 },
  'red-fox': { ...BASE_PROFILE, displayName: '红狐', bodyWidth: 26, bodyHeight: 34 },
  tiger: { ...BASE_PROFILE, displayName: '老虎', bodyWidth: 28, bodyHeight: 36 },
  'sika-deer': { ...BASE_PROFILE, displayName: '花鹿', bodyWidth: 26, bodyHeight: 36 },
  'yellow-fox': { ...BASE_PROFILE, displayName: '黄狐狸', bodyWidth: 28, bodyHeight: 32 },
};

export function cloneDefaultCharacterProfiles(): Record<CharacterId, CharacterProfileConfig> {
  return structuredClone(DEFAULT_CHARACTER_PROFILES);
}
