import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  GAME_CONFIG_SCHEMA_VERSION,
  isGameConfig,
  type GameConfig,
} from './GameConfig';
import { normalizeWorldAssetConfig } from '../assets/worldAssetConfig';

export const PRESET_STORAGE_KEY = 'wildmorph.dev-presets.v1';
export const PRESET_FILE_FORMAT = 'wildmorph-dev-preset';

export interface DevPreset {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly config: GameConfig;
}

export interface DevPresetStore {
  readonly schemaVersion: typeof GAME_CONFIG_SCHEMA_VERSION;
  readonly activePresetId: string | null;
  readonly presets: readonly DevPreset[];
}

export interface DevPresetFile {
  readonly format: typeof PRESET_FILE_FORMAT;
  readonly schemaVersion: typeof GAME_CONFIG_SCHEMA_VERSION;
  readonly preset: DevPreset;
}

export const EMPTY_PRESET_STORE: DevPresetStore = {
  schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
  activePresetId: null,
  presets: [],
};

function migrateConfig(value: unknown): GameConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.schemaVersion === 1
    ? {
        ...record,
        schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
        proceduralWorld: structuredClone(DEFAULT_GAME_CONFIG.proceduralWorld),
        worldAssets: structuredClone(DEFAULT_GAME_CONFIG.worldAssets),
        characterProfiles: structuredClone(DEFAULT_GAME_CONFIG.characterProfiles),
      }
    : record.schemaVersion === 2
      ? {
          ...record,
          schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
          worldAssets: structuredClone(DEFAULT_GAME_CONFIG.worldAssets),
          characterProfiles: structuredClone(DEFAULT_GAME_CONFIG.characterProfiles),
        }
      : record.schemaVersion === 3
        ? {
            ...record,
            schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
            characterProfiles: structuredClone(DEFAULT_GAME_CONFIG.characterProfiles),
          }
        : record.schemaVersion === 4
          ? {
              ...record,
              schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
              worldAssets: normalizeWorldAssetConfig(record.worldAssets),
            }
          : record;
  const normalizedCandidate = {
    ...candidate,
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    worldAssets: normalizeWorldAssetConfig((candidate as Record<string, unknown>).worldAssets),
    wildlife: (candidate as Record<string, unknown>).wildlife
      ?? structuredClone(DEFAULT_GAME_CONFIG.wildlife),
  };
  return isGameConfig(normalizedCandidate) ? cloneGameConfig(normalizedCandidate) : undefined;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadPresetStore(storage: Pick<Storage, 'getItem'>): DevPresetStore {
  try {
    const raw = storage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_PRESET_STORE);
    const value = JSON.parse(raw) as Partial<DevPresetStore>;
    const schemaVersion = (value as { schemaVersion?: number }).schemaVersion;
    if ((schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4 && schemaVersion !== 5 && schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) || !Array.isArray(value.presets)) {
      return structuredClone(EMPTY_PRESET_STORE);
    }
    const presets = value.presets.flatMap((preset) => {
      const config = migrateConfig(preset?.config);
      return typeof preset?.id === 'string'
        && typeof preset.name === 'string'
        && typeof preset.updatedAt === 'string'
        && config
        ? [{ ...preset, config }]
        : [];
    });
    const activePresetId = presets.some(({ id }) => id === value.activePresetId)
      ? value.activePresetId ?? null
      : null;
    return { schemaVersion: GAME_CONFIG_SCHEMA_VERSION, activePresetId, presets };
  } catch {
    return structuredClone(EMPTY_PRESET_STORE);
  }
}

export function savePresetStore(
  storage: Pick<Storage, 'setItem'>,
  store: Readonly<DevPresetStore>,
): void {
  storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
}

export function createDevPreset(name: string, config: Readonly<GameConfig>): DevPreset {
  return {
    id: createId(),
    name: name.trim() || '未命名预设',
    updatedAt: new Date().toISOString(),
    config: cloneGameConfig(config),
  };
}

export function upsertPreset(
  store: Readonly<DevPresetStore>,
  preset: Readonly<DevPreset>,
  activate = true,
): DevPresetStore {
  const nextPreset: DevPreset = {
    ...preset,
    updatedAt: new Date().toISOString(),
    config: cloneGameConfig(preset.config),
  };
  const exists = store.presets.some(({ id }) => id === preset.id);
  const presets = exists
    ? store.presets.map((item) => item.id === preset.id ? nextPreset : item)
    : [...store.presets, nextPreset];
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    activePresetId: activate ? nextPreset.id : store.activePresetId,
    presets,
  };
}

export function deletePreset(store: Readonly<DevPresetStore>, id: string): DevPresetStore {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    activePresetId: store.activePresetId === id ? null : store.activePresetId,
    presets: store.presets.filter((preset) => preset.id !== id),
  };
}

export function exportPreset(preset: Readonly<DevPreset>): string {
  const file: DevPresetFile = {
    format: PRESET_FILE_FORMAT,
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    preset: { ...preset, config: cloneGameConfig(preset.config) },
  };
  return JSON.stringify(file, null, 2);
}

export function importPreset(serialized: string, store: Readonly<DevPresetStore>): DevPreset {
  const value = JSON.parse(serialized) as Partial<DevPresetFile>;
  const schemaVersion = (value as { schemaVersion?: number }).schemaVersion;
  const migratedConfig = migrateConfig(value.preset?.config);
  if (
    value.format !== PRESET_FILE_FORMAT
    || (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4 && schemaVersion !== 5 && schemaVersion !== GAME_CONFIG_SCHEMA_VERSION)
    || !value.preset
    || typeof value.preset.name !== 'string'
    || !migratedConfig
  ) {
    throw new Error('预设文件格式、版本或参数无效');
  }
  const duplicate = store.presets.some(({ id }) => id === value.preset?.id);
  return {
    ...value.preset,
    config: migratedConfig,
    id: duplicate || typeof value.preset.id !== 'string' ? createId() : value.preset.id,
    name: duplicate ? `${value.preset.name}（导入副本）` : value.preset.name,
    updatedAt: new Date().toISOString(),
  };
}

export function loadActiveGameConfig(
  development: boolean,
  storage?: Pick<Storage, 'getItem'>,
): GameConfig {
  if (!development || !storage) {
    return cloneGameConfig(DEFAULT_GAME_CONFIG);
  }
  const store = loadPresetStore(storage);
  const preset = store.presets.find(({ id }) => id === store.activePresetId);
  return preset ? cloneGameConfig(preset.config) : cloneGameConfig(DEFAULT_GAME_CONFIG);
}
