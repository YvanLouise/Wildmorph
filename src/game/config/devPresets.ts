import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  GAME_CONFIG_SCHEMA_VERSION,
  isGameConfig,
  type GameConfig,
} from './GameConfig';

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
    if (value.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION || !Array.isArray(value.presets)) {
      return structuredClone(EMPTY_PRESET_STORE);
    }
    const presets = value.presets.filter((preset): preset is DevPreset => (
      typeof preset?.id === 'string'
      && typeof preset.name === 'string'
      && typeof preset.updatedAt === 'string'
      && isGameConfig(preset.config)
    ));
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
  if (
    value.format !== PRESET_FILE_FORMAT
    || value.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION
    || !value.preset
    || typeof value.preset.name !== 'string'
    || !isGameConfig(value.preset.config)
  ) {
    throw new Error('预设文件格式、版本或参数无效');
  }
  const duplicate = store.presets.some(({ id }) => id === value.preset?.id);
  return {
    ...value.preset,
    id: duplicate || typeof value.preset.id !== 'string' ? createId() : value.preset.id,
    name: duplicate ? `${value.preset.name}（导入副本）` : value.preset.name,
    updatedAt: new Date().toISOString(),
    config: cloneGameConfig(value.preset.config),
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
