import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  GAME_CONFIG_SCHEMA_VERSION,
  isGameConfig,
  type GameConfig,
} from './GameConfig';
import { normalizeWorldAssetConfig } from '../assets/worldAssetConfig';
import { normalizeWildlifeConfig } from '../wildlife/config';
import { normalizeSeededResourcesConfig } from '../resources/config';

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

const LEGACY_DEFAULT_ZOOM_LEVELS = [0.8, 1, 1.2] as const;

function migrateCameraConfig(camera: unknown, player: unknown): unknown {
  if (!camera || typeof camera !== 'object') return structuredClone(DEFAULT_GAME_CONFIG.camera);
  const record = camera as Record<string, unknown>;
  if (Array.isArray(record.viewHalfWidthBodyMultipliers)) return record;
  const legacyZoomLevels = record.zoomLevels;
  if (!Array.isArray(legacyZoomLevels) || legacyZoomLevels.length !== 3) {
    return structuredClone(DEFAULT_GAME_CONFIG.camera);
  }

  const usesLegacyDefaults = legacyZoomLevels.every((value, index) => (
    typeof value === 'number' && value === LEGACY_DEFAULT_ZOOM_LEVELS[index]
  ));
  const playerVisualSize = player && typeof player === 'object'
    && typeof (player as Record<string, unknown>).visualSize === 'number'
    ? (player as Record<string, number>).visualSize
    : DEFAULT_GAME_CONFIG.player.visualSize;
  const converted = legacyZoomLevels.map((zoom) => (
    typeof zoom === 'number' && zoom > 0
      ? Math.round((640 / (playerVisualSize * zoom)) * 1000) / 1000
      : Number.NaN
  ));
  const convertedIsValid = converted.every((value, index) => (
    Number.isFinite(value)
    && value >= 2
    && value <= 30
    && (index === 0 || value < converted[index - 1])
  ));
  const {
    zoomLevels: _zoomLevels,
    defaultZoomIndex: _defaultZoomIndex,
    ...rest
  } = record;
  return {
    ...rest,
    viewHalfWidthBodyMultipliers: usesLegacyDefaults || !convertedIsValid
      ? [...DEFAULT_GAME_CONFIG.camera.viewHalfWidthBodyMultipliers]
      : converted,
    defaultViewIndex: Number.isInteger(record.defaultZoomIndex)
      ? record.defaultZoomIndex
      : DEFAULT_GAME_CONFIG.camera.defaultViewIndex,
  };
}

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
    survival: {
      ...structuredClone(DEFAULT_GAME_CONFIG.survival),
      ...(
        (candidate as Record<string, unknown>).survival
        && typeof (candidate as Record<string, unknown>).survival === 'object'
          ? (candidate as Record<string, unknown>).survival as Record<string, unknown>
          : {}
      ),
    },
    dayNight: {
      ...structuredClone(DEFAULT_GAME_CONFIG.dayNight),
      ...(
        (candidate as Record<string, unknown>).dayNight
        && typeof (candidate as Record<string, unknown>).dayNight === 'object'
          ? (candidate as Record<string, unknown>).dayNight as Record<string, unknown>
          : {}
      ),
    },
    seededResources: normalizeSeededResourcesConfig((candidate as Record<string, unknown>).seededResources),
    camera: migrateCameraConfig(
      (candidate as Record<string, unknown>).camera,
      (candidate as Record<string, unknown>).player,
    ),
    worldAssets: normalizeWorldAssetConfig((candidate as Record<string, unknown>).worldAssets),
    wildlife: normalizeWildlifeConfig((candidate as Record<string, unknown>).wildlife),
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
    if ((schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4 && schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8 && schemaVersion !== 9 && schemaVersion !== 10 && schemaVersion !== 11 && schemaVersion !== 12 && schemaVersion !== 13 && schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) || !Array.isArray(value.presets)) {
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
    || (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4 && schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8 && schemaVersion !== 9 && schemaVersion !== 10 && schemaVersion !== 11 && schemaVersion !== 12 && schemaVersion !== 13 && schemaVersion !== GAME_CONFIG_SCHEMA_VERSION)
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
