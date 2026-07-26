import Phaser from 'phaser';
import './style.css';
import {
  DEFAULT_WORLD_ASSET_CONFIG,
  WORLD_ASSET_SLOT_DEFINITIONS,
  defaultSlotForObstacle,
  getSlotDefinition,
} from '../game/assets/worldAssetConfig';
import {
  deleteStoredWorldAsset,
  loadWorldAssetCatalog,
  referencedWorldAssetIds,
  resolveWorldAssets,
  storeUploadedWorldAsset,
  type ResolvedWorldAssets,
  type WorldAssetRecord,
} from '../game/assets/worldAssetLibrary';
import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
  type GameConfig,
} from '../game/config/GameConfig';
import {
  CHARACTER_IDS,
  DEFAULT_CHARACTER_PROFILES,
  type CharacterId,
  type CharacterProfileConfig,
} from '../game/config/characterProfiles';
import {
  createDevPreset,
  deletePreset,
  exportPreset,
  importPreset,
  loadPresetStore,
  savePresetStore,
  upsertPreset,
  type DevPreset,
  type DevPresetStore,
} from '../game/config/devPresets';
import type { ColliderDefinition, ObstacleDefinition, ObstacleKind, PointDefinition, WorldAssetCategory, WorldAssetSlotId, WorldImageBinding } from '../game/types';
import type { TerrainType, WildlifeSpeciesConfig, WildlifeSpeciesId } from '../game/types';
import { DEFAULT_WILDLIFE_CONFIG, isWildlifeSpeciesId } from '../game/wildlife/config';
import { loadCharacterAssetCatalog, type CharacterAssetRecord } from './characterAssetLibrary';
import { MapEditorScene } from './MapEditorScene';
import { createObstacle, moveObstacleCollider, moveSelection, type MapSelection } from './mapOperations';
import { calculateCameraView } from '../game/camera/view';

type SectionId = 'characters' | 'player' | 'survival' | 'dayNight' | 'resources' | 'camera' | 'audio' | 'input' | 'procedural' | 'assets' | 'map';

interface NumberField {
  readonly path: string;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly help: string;
}

const SECTION_META: Record<Exclude<SectionId, 'characters' | 'map' | 'assets'>, {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly NumberField[];
}> = {
  player: {
    eyebrow: 'CREATURE MOTION',
    title: '原型玩家参数',
    description: '控制当前游戏中黄狐狸的运行参数；角色档案页暂不驱动实际游戏。',
    fields: [
      { path: 'player.moveSpeed', label: '基础移动速度', minimum: 50, maximum: 600, step: 10, unit: 'px/s', help: '未冲刺时角色每秒移动的逻辑像素。' },
      { path: 'player.sprintMultiplier', label: '冲刺倍率', minimum: 1, maximum: 3, step: 0.1, unit: '×', help: '按住 Shift 或触控冲刺时的速度倍率。' },
      { path: 'player.visualSize', label: '角色视觉尺寸', minimum: 16, maximum: 160, step: 1, unit: 'px', help: '角色图片最长边在世界中的显示尺寸。' },
      { path: 'camera.viewHalfWidthBodyMultipliers.0', label: '远景单侧视野', minimum: 2, maximum: 30, step: 0.5, unit: '×角色', help: '玩家到屏幕左侧或右侧边缘可见的角色体型倍数。' },
      { path: 'camera.viewHalfWidthBodyMultipliers.1', label: '默认单侧视野', minimum: 2, maximum: 30, step: 0.5, unit: '×角色', help: '初始镜头默认左右各可见10倍角色视觉尺寸。' },
      { path: 'camera.viewHalfWidthBodyMultipliers.2', label: '近景单侧视野', minimum: 2, maximum: 30, step: 0.5, unit: '×角色', help: '近景档位的单侧可见体型倍数，必须小于默认档位。' },
      { path: 'camera.defaultViewIndex', label: '初始视野档位', minimum: 0, maximum: 2, step: 1, help: '0、1、2分别对应远景、默认和近景。' },
      { path: 'player.bodyWidth', label: '碰撞体宽度', minimum: 4, maximum: 128, step: 1, unit: 'px', help: '角色 Arcade Physics 矩形碰撞体宽度。' },
      { path: 'player.bodyHeight', label: '碰撞体高度', minimum: 4, maximum: 128, step: 1, unit: 'px', help: '角色 Arcade Physics 矩形碰撞体高度。' },
      { path: 'player.footstepIntervalMs', label: '脚步间隔', minimum: 80, maximum: 1000, step: 5, unit: 'ms', help: '持续移动时触发合成脚步声的时间间隔。' },
    ],
  },
  survival: {
    eyebrow: 'SURVIVAL METABOLISM',
    title: '生存消耗',
    description: '控制食物、水源、耐力与资源耗尽后的生命损失；奔跑参数仅在角色移动并冲刺时生效。',
    fields: [
      { path: 'survival.foodDrainAmount', label: '食物消耗量', minimum: 0, maximum: 100, step: 0.1, unit: '点', help: '每个食物消耗周期扣除的数值。' },
      { path: 'survival.foodDrainIntervalSeconds', label: '食物消耗周期', minimum: 0.1, maximum: 3600, step: 0.1, unit: '秒', help: '默认每 3 秒消耗一次设定的食物量。' },
      { path: 'survival.waterDrainAmount', label: '水源消耗量', minimum: 0, maximum: 100, step: 0.1, unit: '点', help: '每个水源消耗周期扣除的数值。' },
      { path: 'survival.waterDrainIntervalSeconds', label: '水源消耗周期', minimum: 0.1, maximum: 3600, step: 0.1, unit: '秒', help: '默认每 2 秒消耗一次设定的水源量。' },
      { path: 'survival.sprintConsumptionMultiplier', label: '奔跑消耗倍率', minimum: 1, maximum: 5, step: 0.1, unit: '×', help: '角色实际移动并按住冲刺时，食物和水源消耗使用此倍率。' },
      { path: 'survival.staminaDrainPerSecond', label: '冲刺耐力消耗', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '角色实际移动并冲刺时，每秒扣除的耐力。' },
      { path: 'survival.staminaRecoveryDelaySeconds', label: '耐力恢复延迟', minimum: 0, maximum: 3600, step: 0.1, unit: '秒', help: '停止实际冲刺后，需要等待多久才开始恢复耐力。' },
      { path: 'survival.staminaRecoveryPerSecond', label: '耐力恢复速度', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '恢复延迟结束后，每秒回复的耐力。' },
      { path: 'survival.staminaStationaryRecoveryDelaySeconds', label: '静止恢复加速延迟', minimum: 0, maximum: 3600, step: 0.1, unit: '秒', help: '角色连续停止移动多久后，耐力恢复切换到加速速度。' },
      { path: 'survival.staminaStationaryRecoveryPerSecond', label: '静止加速恢复速度', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '角色达到连续静止时间后，每秒回复的耐力；默认 20 点/秒。' },
      { path: 'survival.starvationDamagePerSecond', label: '饥饿生命损失', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '食物为 0 后每秒扣除的生命值。' },
      { path: 'survival.dehydrationDamagePerSecond', label: '脱水生命损失', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '水源为 0 后每秒扣除的生命值；可与饥饿伤害叠加。' },
    ],
  },
  dayNight: {
    eyebrow: 'FIELD LIGHT CYCLE',
    title: '昼夜循环',
    description: '控制黎明、白天、黄昏和夜晚的持续时间，以及夜间画面的最大暗度。',
    fields: [
      { path: 'dayNight.dawnDurationMinutes', label: '黎明渐变', minimum: 0.01, maximum: 120, step: 0.01, unit: '分钟', help: '从深蓝夜色逐渐过渡到稳定白天的时长。' },
      { path: 'dayNight.dayDurationMinutes', label: '稳定白天', minimum: 0.01, maximum: 120, step: 0.01, unit: '分钟', help: '不叠加环境暗色的稳定白天时长。' },
      { path: 'dayNight.duskDurationMinutes', label: '黄昏渐变', minimum: 0.01, maximum: 120, step: 0.01, unit: '分钟', help: '从稳定白天经过暖紫色调进入夜晚的时长。' },
      { path: 'dayNight.nightDurationMinutes', label: '稳定夜晚', minimum: 0.01, maximum: 120, step: 0.01, unit: '分钟', help: '保持最大夜间暗度的稳定夜晚时长。' },
      { path: 'dayNight.nightDarkness', label: '夜间最大暗度', minimum: 0, maximum: 0.75, step: 0.01, help: '0 表示不变暗，0.75 为可调上限；默认 0.52。' },
    ],
  },
  resources: {
    eyebrow: 'SEEDED FORAGING',
    title: '资源补给',
    description: '控制种子世界中的浆果生成、持续采食、空丛再生与浅水补水。',
    fields: [
      { path: 'seededResources.berryMinPerChunk', label: '每区块浆果下限', minimum: 0, maximum: 8, step: 1, unit: '丛', help: '每个512×512区块尝试生成的浆果丛数量下限。' },
      { path: 'seededResources.berryMaxPerChunk', label: '每区块浆果上限', minimum: 0, maximum: 8, step: 1, unit: '丛', help: '合法位置不足时实际数量可能更少。' },
      { path: 'seededResources.berryMinFood', label: '单丛食物下限', minimum: 0, maximum: 100, step: 1, unit: '点', help: '每丛浆果的确定性随机食物量下限。' },
      { path: 'seededResources.berryMaxFood', label: '单丛食物上限', minimum: 0, maximum: 100, step: 1, unit: '点', help: '每丛浆果的确定性随机食物量上限。' },
      { path: 'seededResources.playerConsumeSeconds', label: '玩家采食耗时', minimum: 0.1, maximum: 60, step: 0.1, unit: '秒', help: '玩家独自吃完整丛浆果需要的时间。' },
      { path: 'seededResources.wildlifeConsumeSeconds', label: 'AI采食耗时', minimum: 0.1, maximum: 60, step: 0.1, unit: '秒', help: '单只AI独自吃完整丛浆果需要的时间。' },
      { path: 'seededResources.berryRegrowSeconds', label: '空丛再生时间', minimum: 1, maximum: 3600, step: 1, unit: '秒', help: '浆果归零后恢复成熟状态的游戏时间。' },
      { path: 'seededResources.berryInteractionRadius', label: '采食交互半径', minimum: 24, maximum: 192, step: 1, unit: 'px', help: '玩家和AI进入该半径后可持续采食。' },
      { path: 'seededResources.shallowWaterRecoveryPerSecond', label: '浅水补水速度', minimum: 0, maximum: 100, step: 0.1, unit: '点/秒', help: '与自然耗水并行计算，最终数值限制在0–100。' },
      { path: 'seededResources.grassMaxPerChunk', label: '每区块可食草上限', minimum: 0, maximum: 32, step: 1, unit: '处', help: '每个512×512区块同时存在的可食草硬上限。' },
      { path: 'seededResources.grassSeekChance', label: '动物主动觅草比例', minimum: 0, maximum: 1, step: 0.01, help: '每个刷新周期稳定选取开启食草的动物，避免目标随机抖动。' },
      { path: 'seededResources.grassConsumeSeconds', label: '草被吃完耗时', minimum: 0.1, maximum: 300, step: 0.1, unit: '秒', help: '至少一只动物停留在草旁时累计的共享进食时间，多只不会加速。' },
      { path: 'seededResources.grassRefreshSeconds', label: '草刷新周期', minimum: 1, maximum: 3600, step: 1, unit: '秒', help: '每到刷新边界，各区块会在新候选位置补足草。' },
      { path: 'seededResources.grassInteractionRadius', label: '食草交互半径', minimum: 16, maximum: 192, step: 1, unit: 'px', help: '动物进入此范围后停止移动并开始进食。' },
      { path: 'seededResources.grassMaxConsumersPerPatch', label: '单处聚集上限', minimum: 1, maximum: 8, step: 1, unit: '只', help: '允许同时聚集在同一处草旁的动物数量。' },
    ],
  },
  camera: {
    eyebrow: 'CAMERA RIG',
    title: '镜头参数',
    description: '调整三档开发缩放、默认档位和镜头跟随响应。',
    fields: [
      { path: 'camera.followLerp', label: '镜头跟随平滑度', minimum: 0, maximum: 1, step: 0.01, help: '数值越大，镜头跟随角色越紧。' },
      { path: 'camera.fadeInMs', label: '进入场景淡入', minimum: 0, maximum: 3000, step: 50, unit: 'ms', help: '从黑场进入世界画面的过渡时长。' },
    ],
  },
  audio: {
    eyebrow: 'FIELD AUDIO',
    title: '音频参数',
    description: '分别控制标题、探索氛围和脚步合成声。',
    fields: [
      { path: 'audio.titleMusicVolume', label: '标题音乐音量', minimum: 0, maximum: 1, step: 0.01, help: '标题页面循环音乐的 HTML Audio 音量。' },
      { path: 'audio.ambienceVolume', label: '探索音乐音量', minimum: 0, maximum: 1, step: 0.01, help: '进入地图后背景音乐的播放音量。' },
      { path: 'audio.footstepVolume', label: '脚步主增益', minimum: 0, maximum: 1, step: 0.01, help: 'Web Audio 合成脚步声的主增益。' },
    ],
  },
  input: {
    eyebrow: 'TOUCH INPUT',
    title: '输入参数',
    description: '控制触控摇杆在中心区域忽略微小抖动的范围。',
    fields: [
      { path: 'input.joystickDeadZone', label: '摇杆死区', minimum: 0, maximum: 0.5, step: 0.01, help: '输入向量低于该长度时不产生方向移动。' },
    ],
  },
  procedural: {
    eyebrow: 'SEEDED WORLD',
    title: '开放世界参数',
    description: '控制区块生命周期、地形阈值与确定性物件密度。修改规则时应同步更新生成版本。',
    fields: [
      { path: 'proceduralWorld.loadRadius', label: '加载半径', minimum: 1, maximum: 5, step: 1, unit: '区块', help: '玩家周围必须加载的区块半径；默认 2 对应 5×5。' },
      { path: 'proceduralWorld.unloadRadius', label: '卸载半径', minimum: 1, maximum: 8, step: 1, unit: '区块', help: '超过该距离的显示对象和碰撞体会被销毁。' },
      { path: 'proceduralWorld.cacheSize', label: '数据缓存上限', minimum: 1, maximum: 512, step: 1, unit: '区块', help: '只缓存轻量生成数据，不缓存 Phaser 对象。' },
      { path: 'proceduralWorld.generationBudgetMs', label: '每帧生成预算', minimum: 1, maximum: 16, step: 1, unit: 'ms', help: '移动中处理新区块的主线程时间预算。' },
      { path: 'proceduralWorld.waterThreshold', label: '水域阈值', minimum: 0, maximum: 1, step: 0.01, help: '高度低于该值时生成不可通行水域。' },
      { path: 'proceduralWorld.wetThreshold', label: '湿润草地阈值', minimum: 0, maximum: 1, step: 0.01, help: '湿度达到该值时生成湿润草地。' },
      { path: 'proceduralWorld.mudThreshold', label: '泥地湿度阈值', minimum: 0, maximum: 1, step: 0.01, help: '同时满足高度限制时生成可通行泥地。' },
      { path: 'proceduralWorld.treeDensity', label: '树木密度', minimum: 0, maximum: 1, step: 0.01, help: '影响树木候选点的保留概率。' },
      { path: 'proceduralWorld.rockDensity', label: '岩石密度', minimum: 0, maximum: 1, step: 0.01, help: '影响岩石候选点的保留概率。' },
      { path: 'proceduralWorld.logDensity', label: '枯木密度', minimum: 0, maximum: 1, step: 0.01, help: '影响枯木候选点的保留概率。' },
      { path: 'proceduralWorld.decorationDensity', label: '装饰密度', minimum: 0, maximum: 1, step: 0.01, help: '仅影响无碰撞装饰，不改变大型障碍物。' },
      { path: 'wildlife.maxActiveAnimals', label: 'AI动物上限', minimum: 1, maximum: 128, step: 1, unit: '只', help: '同时参与模拟和渲染的动物硬上限。' },
      { path: 'wildlife.activationRadius', label: '动物激活半径', minimum: 128, maximum: 4096, step: 32, unit: 'px', help: '玩家进入该范围后开始模拟动物。' },
      { path: 'wildlife.sleepRadius', label: '动物休眠半径', minimum: 128, maximum: 8192, step: 32, unit: 'px', help: '已激活动物超过该距离后停止模拟。' },
      { path: 'wildlife.simulationStepMs', label: 'AI模拟步长', minimum: 16, maximum: 250, step: 1, unit: 'ms', help: '固定时间步；默认50ms兼顾平滑和移动端性能。' },
      { path: 'wildlife.decisionIntervalMs', label: 'AI决策间隔', minimum: 50, maximum: 2000, step: 10, unit: 'ms', help: '感知、选目标和状态切换的更新间隔。' },
      { path: 'wildlife.pathSearchRadiusTiles', label: '寻路半径', minimum: 4, maximum: 64, step: 1, unit: '格', help: '局部 A* 只在该半径内搜索，避免跨越过大范围。' },
      { path: 'wildlife.maxPathNodes', label: '寻路节点上限', minimum: 32, maximum: 4096, step: 16, help: '单次局部A*最多扩展的网格节点数。' },
      { path: 'wildlife.pathSearchesPerStep', label: '每步寻路次数', minimum: 0, maximum: 16, step: 1, help: '每个固定模拟步允许执行的A*搜索数量。' },
      { path: 'wildlife.pathBudgetMs', label: '寻路时间预算', minimum: 0.1, maximum: 8, step: 0.1, unit: 'ms', help: '每个固定模拟步的 A* 总时间上限。' },
    ],
  },
};

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing developer tool element #${id}`);
  return element as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function getPath(config: Readonly<GameConfig>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, config);
}

function setNumberPath(config: Readonly<GameConfig>, path: string, value: number): GameConfig {
  const next = cloneGameConfig(config);
  const segments = path.split('.');
  let target = next as unknown as Record<string, unknown>;
  segments.slice(0, -1).forEach((segment) => {
    target = target[segment] as Record<string, unknown>;
  });
  target[segments.at(-1) ?? ''] = value;
  return next;
}

function selectedOption(value: string, current: string): string {
  return value === current ? ' selected' : '';
}

if (!import.meta.env.DEV) {
  document.body.innerHTML = '<main style="padding:40px;color:#eee;background:#102824">调参台仅在本地开发环境可用。</main>';
  throw new Error('Developer tools are disabled in production');
}

const presetSelect = requireElement<HTMLSelectElement>('preset-select');
const activePresetBadge = requireElement<HTMLElement>('active-preset-badge');
const characterView = requireElement<HTMLElement>('character-view');
const parameterView = requireElement<HTMLElement>('parameter-view');
const assetView = requireElement<HTMLElement>('asset-view');
const mapView = requireElement<HTMLElement>('map-view');
const inspector = requireElement<HTMLElement>('inspector');
const saveButton = requireElement<HTMLButtonElement>('save-button');
const saveAsButton = requireElement<HTMLButtonElement>('save-as-button');
const deletePresetButton = requireElement<HTMLButtonElement>('delete-preset-button');
const exportButton = requireElement<HTMLButtonElement>('export-button');
const importInput = requireElement<HTMLInputElement>('import-input');
const presetDialog = requireElement<HTMLDialogElement>('preset-dialog');
const presetNameInput = requireElement<HTMLInputElement>('preset-name-input');
const dirtyStatus = requireElement<HTMLElement>('dirty-status');
const validationStatus = requireElement<HTMLElement>('validation-status');
const historyStatus = requireElement<HTMLElement>('history-status');
const defaultSyncStatus = requireElement<HTMLElement>('default-sync-status');
const issueList = requireElement<HTMLElement>('issue-list');
const assetUploadInput = requireElement<HTMLInputElement>('asset-upload-input');

const [initialAssetCatalog, characterAssets] = await Promise.all([
  loadWorldAssetCatalog(),
  loadCharacterAssetCatalog(),
]);
let assetCatalog = initialAssetCatalog;

let store: DevPresetStore = loadPresetStore(localStorage);
let selectedPresetId: string | null = store.activePresetId;
let draft = selectedPresetId
  ? cloneGameConfig(store.presets.find(({ id }) => id === selectedPresetId)?.config ?? DEFAULT_GAME_CONFIG)
  : cloneGameConfig(DEFAULT_GAME_CONFIG);
let savedSnapshot = JSON.stringify(draft);
let section: SectionId = 'characters';
let selectedCharacterId: CharacterId = 'yellow-fox';
let previewHeadingDegrees = 0;
let previewSizeMode: 'min' | 'base' | 'max' = 'base';
let selection: MapSelection | undefined;
let history: GameConfig[] = [];
let future: GameConfig[] = [];
let mapGame: Phaser.Game | undefined;
let mapScene: MapEditorScene | undefined;
let mapAssets: ResolvedWorldAssets | undefined;
let mapLoading = false;
let selectedAssetSlot: WorldAssetSlotId = 'fixed.tree';
let assetCategory: WorldAssetCategory | 'all' = 'all';
let assetSearch = '';
let assetColliderDrag: {
  readonly pointerId: number;
  readonly target: HTMLElement;
  readonly slotId: WorldAssetSlotId;
  readonly collider: ColliderDefinition;
  readonly scale: number;
  readonly startClientX: number;
  readonly startClientY: number;
  currentClientX: number;
  currentClientY: number;
  readonly startLeft: number;
  readonly startTop: number;
} | undefined;
let transientMessage = '';
let transientTimer: number | undefined;
let defaultSyncTimer: number | undefined;
let defaultSyncRevision = 0;
let defaultSyncState: 'idle' | 'pending' | 'synced' | 'blocked' | 'error' = 'idle';

function currentPreset(): DevPreset | undefined {
  return store.presets.find(({ id }) => id === selectedPresetId);
}

function isReadOnly(): boolean {
  return selectedPresetId === null;
}

function isDirty(): boolean {
  return JSON.stringify(draft) !== savedSnapshot;
}

function showMessage(message: string): void {
  window.clearTimeout(transientTimer);
  transientMessage = message;
  renderStatus();
  transientTimer = window.setTimeout(() => {
    transientMessage = '';
    renderStatus();
  }, 2600);
}

function persistPresetStore(nextStore: DevPresetStore): boolean {
  try {
    savePresetStore(localStorage, nextStore);
  } catch (error) {
    const detail = error instanceof Error && error.message ? `：${error.message}` : '';
    showMessage(`浏览器未能保存本地预设${detail}`);
    return false;
  }
  store = nextStore;
  return true;
}

function queueDefaultSync(delayMs = 350): void {
  window.clearTimeout(defaultSyncTimer);
  const revision = ++defaultSyncRevision;
  if (validateGameConfig(draft).errors.length > 0) {
    defaultSyncState = 'blocked';
    renderStatus();
    return;
  }
  defaultSyncState = 'pending';
  renderStatus();
  const config = cloneGameConfig(draft);
  defaultSyncTimer = window.setTimeout(async () => {
    try {
      const response = await fetch('/__wildmorph/tuned-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? '默认参数写入失败');
      if (revision !== defaultSyncRevision) return;
      defaultSyncState = 'synced';
    } catch (error) {
      if (revision !== defaultSyncRevision) return;
      defaultSyncState = 'error';
      transientMessage = error instanceof Error ? error.message : '默认参数写入失败';
    }
    renderStatus();
  }, delayMs);
}

function commitConfig(next: GameConfig, redrawControls = true): void {
  if (isReadOnly() || JSON.stringify(next) === JSON.stringify(draft)) return;
  const assetRenderingChanged = JSON.stringify(next.worldAssets) !== JSON.stringify(draft.worldAssets)
    || JSON.stringify(next.world.obstacles.map(({ id, assetOverride }) => ({ id, assetOverride })))
      !== JSON.stringify(draft.world.obstacles.map(({ id, assetOverride }) => ({ id, assetOverride })));
  history = [...history.slice(-49), cloneGameConfig(draft)];
  future = [];
  draft = next;
  queueDefaultSync();
  if (assetRenderingChanged) resetMapEditor();
  if (redrawControls) {
    syncDraftViews();
  } else {
    renderTopbar();
    renderStatus();
    if (validateGameConfig(draft).errors.length === 0) {
      mapScene?.setConfig(draft, isReadOnly());
    }
  }
}

function syncDraftViews(): void {
  renderTopbar();
  renderSection();
  renderInspector();
  renderStatus();
  if (validateGameConfig(draft).errors.length === 0) {
    mapScene?.setConfig(draft, isReadOnly());
  }
  mapScene?.setSelection(selection);
}

function renderTopbar(): void {
  const validation = validateGameConfig(draft);
  presetSelect.innerHTML = [
    '<option value="">项目默认值（只读）</option>',
    ...store.presets.map((preset) => (
      `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`
    )),
  ].join('');
  presetSelect.value = selectedPresetId ?? '';
  const selected = currentPreset();
  const active = store.presets.find(({ id }) => id === store.activePresetId);
  activePresetBadge.textContent = selectedPresetId === store.activePresetId && selected
    ? `活动：${selected.name}`
    : active ? `活动：${active.name}` : '活动：项目默认值';
  saveButton.disabled = isReadOnly() || validation.errors.length > 0;
  saveAsButton.disabled = validation.errors.length > 0;
  deletePresetButton.disabled = isReadOnly();
  exportButton.disabled = isReadOnly();
  requireElement<HTMLSelectElement>('object-kind-select').disabled = isReadOnly();
  ['add-object-button', 'add-teleport-button', 'add-pond-vertex-button'].forEach((id) => {
    requireElement<HTMLButtonElement>(id).disabled = isReadOnly();
  });
  requireElement<HTMLButtonElement>('duplicate-button').disabled = (
    isReadOnly() || selection?.kind !== 'obstacle'
  );
  requireElement<HTMLButtonElement>('remove-button').disabled = (
    isReadOnly()
    || !selection
    || selection.kind === 'spawn'
    || selection.kind === 'pond-center'
    || (selection.kind === 'pond-vertex' && draft.world.pondPolygon.length <= 3)
  );
}

function assetRecord(id: string): WorldAssetRecord | undefined {
  return assetCatalog.records.find((asset) => asset.id === id);
}

function updateAssetSlot(slotId: WorldAssetSlotId, update: Partial<WorldImageBinding>): void {
  if (isReadOnly()) return;
  const next = cloneGameConfig(draft);
  const nextBinding = { ...next.worldAssets.slots[slotId], ...update };
  const syncedObstacles = update.collider && getSlotDefinition(slotId).group === 'fixed'
    ? next.world.obstacles.map((obstacle) => (
        defaultSlotForObstacle(obstacle.kind) === slotId
          ? { ...obstacle, collider: structuredClone(update.collider!) }
          : obstacle
      ))
    : next.world.obstacles;
  commitConfig({
    ...next,
    world: syncedObstacles === next.world.obstacles
      ? next.world
      : { ...next.world, obstacles: syncedObstacles },
    worldAssets: {
      slots: {
        ...next.worldAssets.slots,
        [slotId]: nextBinding,
      },
    },
  });
}

function updateAssetCollider(
  field: 'shape' | 'width' | 'height' | 'radius' | 'offsetX' | 'offsetY',
  value: string,
): void {
  const binding = draft.worldAssets.slots[selectedAssetSlot];
  const current = binding.collider;
  if (!current) return;
  let collider: ColliderDefinition;
  if (field === 'shape') {
    collider = value === 'circle'
      ? {
          shape: 'circle',
          radius: current.shape === 'circle' ? current.radius : Math.max(current.width, current.height) / 2,
          offsetX: current.offsetX ?? 0,
          offsetY: current.offsetY ?? 0,
        }
      : {
          shape: 'rectangle',
          width: current.shape === 'rectangle' ? current.width : current.radius * 2,
          height: current.shape === 'rectangle' ? current.height : current.radius * 2,
          offsetX: current.offsetX ?? 0,
          offsetY: current.offsetY ?? 0,
        };
  } else if (field === 'offsetX' || field === 'offsetY') {
    collider = { ...current, [field]: Number(value) };
  } else if (current.shape === 'circle') {
    if (field !== 'radius') return;
    collider = { ...current, radius: Number(value) };
  } else {
    if (field === 'radius') return;
    collider = { ...current, [field]: Number(value) };
  }
  updateAssetSlot(selectedAssetSlot, { collider });
}

function assetPreviewHtml(record: WorldAssetRecord | undefined, binding: WorldImageBinding): string {
  if (!record) return '<span>素材缺失，将回退到内置默认图</span>';
  const worldWidth = binding.sizeMode === 'width'
    ? binding.displaySize
    : binding.displaySize * record.width / record.height;
  const worldHeight = binding.sizeMode === 'height'
    ? binding.displaySize
    : binding.displaySize * record.height / record.width;
  const scale = Math.min(280 / worldWidth, 170 / worldHeight, 2.2);
  const width = worldWidth * scale;
  const height = worldHeight * scale;
  const originX = 160;
  const originY = 192;
  const left = originX - width * binding.anchorX;
  const top = originY - height * binding.anchorY;
  const collider = binding.collider;
  const colliderOffsetX = collider?.offsetX ?? 0;
  const colliderOffsetY = collider?.offsetY ?? 0;
  const collisionStyle = collider
    ? collider.shape === 'circle'
      ? `left:${originX + colliderOffsetX * scale - collider.radius * scale}px;top:${originY + colliderOffsetY * scale - collider.radius * scale}px;width:${collider.radius * scale * 2}px;height:${collider.radius * scale * 2}px;border-radius:50%`
      : `left:${originX + colliderOffsetX * scale - collider.width * scale / 2}px;top:${originY + colliderOffsetY * scale - collider.height * scale / 2}px;width:${collider.width * scale}px;height:${collider.height * scale}px`
    : '';
  return `<div class="asset-preview-stage">
    <img src="${record.url}" alt="${escapeHtml(record.name)}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px">
    <span class="asset-preview-origin" style="left:${originX}px;top:${originY}px" aria-hidden="true"></span>
    ${collider ? `<span class="asset-preview-collider" data-asset-collider-drag data-preview-scale="${scale}" style="${collisionStyle}" role="button" tabindex="0" aria-label="拖动碰撞箱" title="拖动调整碰撞箱位置"></span>` : ''}
  </div>`;
}

function selectedCharacterAsset(): CharacterAssetRecord {
  return characterAssets.find(({ id }) => id === selectedCharacterId) ?? characterAssets[0];
}

function updateCharacterProfile(update: Partial<CharacterProfileConfig>, redrawControls = true): void {
  if (isReadOnly()) return;
  const next = cloneGameConfig(draft);
  commitConfig({
    ...next,
    characterProfiles: {
      ...next.characterProfiles,
      [selectedCharacterId]: {
        ...next.characterProfiles[selectedCharacterId],
        ...update,
      },
    },
  }, redrawControls);
}

function updateWildlifeProfile(species: WildlifeSpeciesId, update: Partial<WildlifeSpeciesConfig>, redrawControls = true): void {
  if (isReadOnly()) return;
  const next = cloneGameConfig(draft);
  commitConfig({
    ...next,
    wildlife: {
      ...next.wildlife,
      species: {
        ...next.wildlife.species,
        [species]: { ...next.wildlife.species[species], ...update },
      },
    },
  }, redrawControls);
}

function wildlifeNumberInput(
  label: string,
  field: keyof WildlifeSpeciesConfig,
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  unit = '',
): string {
  return `<label class="character-field"><span><strong>${label}</strong></span><span class="character-field-control">
    <input type="number" data-wildlife-field="${field}" min="${minimum}" max="${maximum}" step="${step}" value="${value}" ${isReadOnly() ? 'disabled' : ''}>${unit ? `<em>${unit}</em>` : ''}
  </span></label>`;
}

function wildlifeEditor(species: WildlifeSpeciesId): string {
  const profile = draft.wildlife.species[species];
  const character = draft.characterProfiles[species];
  const terrains: readonly [TerrainType, string][] = [['grass', '草地'], ['wet-grass', '湿润草地'], ['mud', '泥地']];
  return `<section class="character-field-group wildlife-field-group">
    <div class="wildlife-field-heading"><h4>AI行为</h4><button id="restore-wildlife-profile-button" class="button" type="button" ${isReadOnly() ? 'disabled' : ''}>恢复AI默认值</button></div>
    <label class="character-field"><span><strong>启用种子世界生成</strong></span><input type="checkbox" data-wildlife-field="enabled" ${profile.enabled ? 'checked' : ''} ${isReadOnly() ? 'disabled' : ''}></label>
    <label class="character-field"><span><strong>可食用浆果</strong></span><input type="checkbox" data-wildlife-field="eatsBerries" ${profile.eatsBerries ? 'checked' : ''} ${isReadOnly() ? 'disabled' : ''}></label>
    <label class="character-field"><span><strong>可食用草</strong></span><input type="checkbox" data-wildlife-field="eatsGrass" ${profile.eatsGrass ? 'checked' : ''} ${isReadOnly() ? 'disabled' : ''}></label>
    <label class="character-field"><span><strong>生态角色</strong></span><select data-wildlife-field="role" ${isReadOnly() ? 'disabled' : ''}>
      <option value="prey"${selectedOption('prey', profile.role)}>猎物</option><option value="forager"${selectedOption('forager', profile.role)}>觅食者</option><option value="mesopredator"${selectedOption('mesopredator', profile.role)}>中型捕食者</option><option value="predator"${selectedOption('predator', profile.role)}>顶级捕食者</option>
    </select></label>
    ${wildlifeNumberInput('区块生成概率', 'spawnChance', profile.spawnChance, 0, 1, 0.001)}
    ${wildlifeNumberInput('群体下限', 'groupMin', profile.groupMin, 1, 12, 1, '只')}
    ${wildlifeNumberInput('群体上限', 'groupMax', profile.groupMax, 1, 12, 1, '只')}
    ${wildlifeNumberInput('最小体型倍率', 'minSizeScale', profile.minSizeScale, 0.25, 2.5, 0.05, '×')}
    ${wildlifeNumberInput('最大体型倍率', 'maxSizeScale', profile.maxSizeScale, 0.25, 2.5, 0.05, '×')}
    <p class="wildlife-size-summary" data-wildlife-size-summary>视觉 ${(character.visualSize * profile.minSizeScale).toFixed(1)}–${(character.visualSize * profile.maxSizeScale).toFixed(1)}px · 碰撞 ${(character.bodyWidth * profile.minSizeScale).toFixed(1)}×${(character.bodyHeight * profile.minSizeScale).toFixed(1)} – ${(character.bodyWidth * profile.maxSizeScale).toFixed(1)}×${(character.bodyHeight * profile.maxSizeScale).toFixed(1)}px</p>
    <fieldset class="wildlife-terrain-field"><legend>可活动地形</legend>${terrains.map(([terrain, label]) => `<label><input type="checkbox" data-wildlife-terrain="${terrain}" ${profile.preferredTerrains.includes(terrain) ? 'checked' : ''} ${isReadOnly() ? 'disabled' : ''}>${label}</label>`).join('')}</fieldset>
    ${wildlifeNumberInput('游荡速度', 'walkSpeed', profile.walkSpeed, 0, 600, 5, 'px/s')}
    ${wildlifeNumberInput('逃跑速度', 'fleeSpeed', profile.fleeSpeed, 0, 600, 5, 'px/s')}
    ${wildlifeNumberInput('追逐速度', 'chaseSpeed', profile.chaseSpeed, 0, 600, 5, 'px/s')}
    ${wildlifeNumberInput('感知半径', 'detectionRadius', profile.detectionRadius, 16, 2000, 10, 'px')}
    ${wildlifeNumberInput('放弃距离', 'giveUpRadius', profile.giveUpRadius, 16, 3000, 10, 'px')}
    ${wildlifeNumberInput('领地半径', 'territoryRadius', profile.territoryRadius, 32, 3000, 10, 'px')}
    ${wildlifeNumberInput('反应延迟', 'reactionDelayMs', profile.reactionDelayMs, 0, 5000, 25, 'ms')}
    ${wildlifeNumberInput('警戒时长', 'alertDurationMs', profile.alertDurationMs, 0, 30000, 50, 'ms')}
    ${wildlifeNumberInput('追逐时长', 'chaseDurationMs', profile.chaseDurationMs, 0, 30000, 100, 'ms')}
    ${wildlifeNumberInput('休息时长', 'restDurationMs', profile.restDurationMs, 0, 30000, 100, 'ms')}
    ${wildlifeNumberInput('冷却时长', 'cooldownMs', profile.cooldownMs, 0, 60000, 100, 'ms')}
  </section>`;
}

function characterNumberInput(
  label: string,
  field: keyof CharacterProfileConfig,
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  unit: string,
  help: string,
): string {
  return `<label class="character-field">
    <span><strong>${label}</strong><small>${help}</small></span>
    <span class="character-field-control">
      <input type="number" data-character-field="${field}" min="${minimum}" max="${maximum}" step="${step}" value="${value}" ${isReadOnly() ? 'disabled' : ''}>
      ${unit ? `<em>${unit}</em>` : ''}
    </span>
  </label>`;
}

function previewSizeScale(): number {
  if (!isWildlifeSpeciesId(selectedCharacterId)) return 1;
  const wildlife = draft.wildlife.species[selectedCharacterId];
  if (previewSizeMode === 'min') return wildlife.minSizeScale;
  if (previewSizeMode === 'max') return wildlife.maxSizeScale;
  return 1;
}

function characterPreviewMetrics(profile: CharacterProfileConfig, asset: CharacterAssetRecord, sizeScale = 1): {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly imageLeft: number;
  readonly imageTop: number;
  readonly colliderWidth: number;
  readonly colliderHeight: number;
} {
  const previewCenter = 180;
  const previewPixelsPerWorldPixel = 3;
  const opaqueLongestSide = Math.max(asset.opaqueBounds.width, asset.opaqueBounds.height);
  const scale = profile.visualSize * sizeScale * previewPixelsPerWorldPixel / opaqueLongestSide;
  const imageWidth = asset.naturalWidth * scale;
  const imageHeight = asset.naturalHeight * scale;
  return {
    imageWidth,
    imageHeight,
    imageLeft: previewCenter - profile.anchorX * imageWidth,
    imageTop: previewCenter - profile.anchorY * imageHeight,
    colliderWidth: profile.bodyWidth * sizeScale * previewPixelsPerWorldPixel,
    colliderHeight: profile.bodyHeight * sizeScale * previewPixelsPerWorldPixel,
  };
}

function updateCharacterPreview(): void {
  if (section !== 'characters') return;
  const profile = draft.characterProfiles[selectedCharacterId];
  const asset = selectedCharacterAsset();
  const sizeScale = previewSizeScale();
  const metrics = characterPreviewMetrics(profile, asset, sizeScale);
  const image = characterView.querySelector<HTMLImageElement>('[data-character-preview-image]');
  if (image) {
    image.style.width = `${metrics.imageWidth}px`;
    image.style.height = `${metrics.imageHeight}px`;
    image.style.left = `${metrics.imageLeft}px`;
    image.style.top = `${metrics.imageTop}px`;
    image.style.transformOrigin = `${profile.anchorX * 100}% ${profile.anchorY * 100}%`;
    image.style.transform = `rotate(${previewHeadingDegrees + profile.facingOffsetDegrees}deg)`;
  }
  const collider = characterView.querySelector<HTMLElement>('[data-character-collider]');
  if (collider) {
    collider.style.width = `${metrics.colliderWidth}px`;
    collider.style.height = `${metrics.colliderHeight}px`;
  }
  const sizeReadout = characterView.querySelector<HTMLElement>('[data-character-size-readout]');
  if (sizeReadout) sizeReadout.textContent = `倍率 ${sizeScale.toFixed(2)}× · 视觉 ${(profile.visualSize * sizeScale).toFixed(1)}px · 碰撞 ${(profile.bodyWidth * sizeScale).toFixed(1)}×${(profile.bodyHeight * sizeScale).toFixed(1)}px`;
  const sizeSummary = characterView.querySelector<HTMLElement>('[data-wildlife-size-summary]');
  if (sizeSummary && isWildlifeSpeciesId(selectedCharacterId)) {
    const wildlife = draft.wildlife.species[selectedCharacterId];
    sizeSummary.textContent = `视觉 ${(profile.visualSize * wildlife.minSizeScale).toFixed(1)}–${(profile.visualSize * wildlife.maxSizeScale).toFixed(1)}px · 碰撞 ${(profile.bodyWidth * wildlife.minSizeScale).toFixed(1)}×${(profile.bodyHeight * wildlife.minSizeScale).toFixed(1)} – ${(profile.bodyWidth * wildlife.maxSizeScale).toFixed(1)}×${(profile.bodyHeight * wildlife.maxSizeScale).toFixed(1)}px`;
  }
}

function focusSelectedCharacterTab(): void {
  const tabs = characterView.querySelector<HTMLElement>('.character-tabs');
  const tab = characterView.querySelector<HTMLButtonElement>(`[data-character-id="${selectedCharacterId}"]`);
  if (!tabs || !tab) return;
  tab.focus({ preventScroll: true });
  tabs.scrollTop = Math.max(0, tab.offsetTop - tabs.offsetTop - (tabs.clientHeight - tab.offsetHeight) / 2);
  tabs.scrollLeft = Math.max(0, tab.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2);
}

function renderCharacterView(): void {
  const profile = draft.characterProfiles[selectedCharacterId];
  const asset = selectedCharacterAsset();
  const sizeScale = previewSizeScale();
  const metrics = characterPreviewMetrics(profile, asset, sizeScale);
  const directions = [
    ['上', 180], ['右上', -135], ['右', -90], ['右下', -45],
    ['下', 0], ['左下', 45], ['左', 90], ['左上', 135],
  ] as const;
  characterView.innerHTML = `
    <header class="section-header">
      <div><p>CREATURE PROFILE ARCHIVE</p><h2>动物角色档案</h2></div>
      <span>这些档案用于独立记录角色比例、碰撞与移动手感；当前游戏仍由“原型玩家”参数驱动。</span>
    </header>
    ${isReadOnly() ? '<div class="readonly-banner">项目默认档案可浏览但不可编辑。点击“另存为”创建可编辑预设。</div>' : ''}
    <div class="character-workspace">
      <div class="character-tabs" role="tablist" aria-label="动物角色" aria-orientation="vertical">
        ${CHARACTER_IDS.map((id) => {
          const tabAsset = characterAssets.find((candidate) => candidate.id === id);
          const tabProfile = draft.characterProfiles[id];
          const selected = id === selectedCharacterId;
          return `<button
            id="character-tab-${id}"
            class="character-tab${selected ? ' is-selected' : ''}"
            type="button"
            role="tab"
            aria-selected="${selected}"
            aria-controls="character-profile-panel"
            tabindex="${selected ? 0 : -1}"
            data-character-id="${id}"
          >
            <span class="character-tab-thumb"><img src="${tabAsset?.url ?? ''}" alt=""></span>
            <span><strong>${escapeHtml(tabProfile.displayName)}</strong><small>${id}</small></span>
          </button>`;
        }).join('')}
      </div>
      <article
        id="character-profile-panel"
        class="character-profile"
        role="tabpanel"
        aria-labelledby="character-tab-${selectedCharacterId}"
      >
        <div class="character-profile-heading">
          <div><p>${escapeHtml(asset.sourceName)} · ${asset.naturalWidth}×${asset.naturalHeight}</p><h3>${escapeHtml(profile.displayName)}</h3></div>
          <button id="restore-character-profile-button" class="button" type="button" ${isReadOnly() ? 'disabled' : ''}>恢复该角色默认值</button>
        </div>
        <p class="character-alpha-note">有效轮廓 ${asset.opaqueBounds.width}×${asset.opaqueBounds.height} · Alpha 阈值 ≥ 16 · 原图只读</p>
        <div class="character-profile-layout">
          <section class="character-preview-panel" aria-label="${escapeHtml(profile.displayName)}视觉与碰撞预览">
            <div class="character-preview-stage">
              <img
                data-character-preview-image
                src="${asset.url}"
                alt="${escapeHtml(profile.displayName)}原图预览"
                style="width:${metrics.imageWidth}px;height:${metrics.imageHeight}px;left:${metrics.imageLeft}px;top:${metrics.imageTop}px;transform-origin:${profile.anchorX * 100}% ${profile.anchorY * 100}%;transform:rotate(${previewHeadingDegrees + profile.facingOffsetDegrees}deg)"
              >
              <span class="character-collider" data-character-collider style="width:${metrics.colliderWidth}px;height:${metrics.colliderHeight}px"><i>碰撞体</i></span>
              <span class="character-anchor" aria-hidden="true"></span>
            </div>
            <div class="character-preview-readout" data-character-size-readout>倍率 ${sizeScale.toFixed(2)}× · 视觉 ${(profile.visualSize * sizeScale).toFixed(1)}px · 碰撞 ${(profile.bodyWidth * sizeScale).toFixed(1)}×${(profile.bodyHeight * sizeScale).toFixed(1)}px</div>
            ${isWildlifeSpeciesId(selectedCharacterId) ? `<div class="character-size-preview" aria-label="AI 体型预览">
              ${(['min', 'base', 'max'] as const).map((mode) => `<button class="${mode === previewSizeMode ? 'is-selected' : ''}" type="button" data-preview-size="${mode}" aria-pressed="${mode === previewSizeMode}">${mode === 'min' ? '最小' : mode === 'max' ? '最大' : '基准'}</button>`).join('')}
            </div>` : ''}
            <div class="character-directions" aria-label="预览朝向">
              ${directions.map(([label, degrees]) => `<button class="${degrees === previewHeadingDegrees ? 'is-selected' : ''}" type="button" data-preview-heading="${degrees}" aria-pressed="${degrees === previewHeadingDegrees}">${label}</button>`).join('')}
            </div>
          </section>
          <div class="character-editor-groups">
            <section class="character-field-group character-identity-group">
              <h4>身份记录</h4>
              <label class="character-text-field">显示名称<input data-character-field="displayName" maxlength="32" value="${escapeHtml(profile.displayName)}" ${isReadOnly() ? 'disabled' : ''}></label>
              <label class="character-text-field">调参备注<textarea data-character-field="notes" maxlength="2000" rows="4" placeholder="记录比例、碰撞与手感结论" ${isReadOnly() ? 'disabled' : ''}>${escapeHtml(profile.notes)}</textarea></label>
            </section>
            <section class="character-field-group">
              <h4>视觉与朝向</h4>
              ${characterNumberInput('视觉尺寸', 'visualSize', profile.visualSize, 16, 160, 1, 'px', '以不透明轮廓最长边为基准。')}
              ${characterNumberInput('锚点 X', 'anchorX', profile.anchorX, 0, 1, 0.01, '', '图片中与角色实体中心对齐的位置。')}
              ${characterNumberInput('锚点 Y', 'anchorY', profile.anchorY, 0, 1, 0.01, '', '图片中与角色实体中心对齐的位置。')}
              ${characterNumberInput('朝向偏移', 'facingOffsetDegrees', profile.facingOffsetDegrees, -180, 180, 1, '°', '修正原图默认朝下产生的角度偏差。')}
            </section>
            <section class="character-field-group">
              <h4>碰撞</h4>
              ${characterNumberInput('碰撞宽度', 'bodyWidth', profile.bodyWidth, 4, 128, 1, 'px', '排除耳朵、尾巴和四肢末端。')}
              ${characterNumberInput('碰撞高度', 'bodyHeight', profile.bodyHeight, 4, 128, 1, 'px', 'AI 动物会在运行时使用该尺寸阻挡玩家并规避障碍。')}
            </section>
            <section class="character-field-group">
              <h4>移动节奏</h4>
              ${characterNumberInput('移动速度', 'moveSpeed', profile.moveSpeed, 50, 600, 10, 'px/s', '普通移动的逻辑速度。')}
              ${characterNumberInput('冲刺倍率', 'sprintMultiplier', profile.sprintMultiplier, 1, 3, 0.1, '×', '按住冲刺时的速度倍率。')}
              ${characterNumberInput('脚步间隔', 'footstepIntervalMs', profile.footstepIntervalMs, 80, 1000, 5, 'ms', '持续移动时的脚步反馈节奏。')}
            </section>
            ${isWildlifeSpeciesId(selectedCharacterId) ? wildlifeEditor(selectedCharacterId) : '<section class="character-field-group"><h4>AI行为</h4><p>该角色不在首批种子世界AI动物名单中。</p></section>'}
          </div>
        </div>
      </article>
    </div>`;
}

function renderAssetView(): void {
  const definition = getSlotDefinition(selectedAssetSlot);
  const binding = draft.worldAssets.slots[selectedAssetSlot];
  const current = assetRecord(binding.sourceId);
  const categories: readonly [WorldAssetCategory | 'all', string][] = [
    ['all', '全部分类'], ['trees', '树木'], ['rocks', '岩石'], ['wood', '木材'],
    ['vegetation', '植被'], ['terrain', '地形'], ['landmarks', '地标'],
    ['food', '食物'], ['remains', '遗骸'], ['uploaded', '本机上传'],
  ];
  const normalizedSearch = assetSearch.trim().toLocaleLowerCase('zh-CN');
  const compatible = assetCatalog.records.filter((asset) => (
    (asset.category === definition.category || asset.category === 'uploaded')
    && (assetCategory === 'all' || asset.category === assetCategory)
    && (!normalizedSearch || asset.name.toLocaleLowerCase('zh-CN').includes(normalizedSearch))
  ));
  const slotGroup = (group: 'fixed' | 'seeded', title: string) => `
    <section class="asset-slot-group"><h4>${title}</h4><div class="asset-slot-list">
      ${WORLD_ASSET_SLOT_DEFINITIONS.filter((slot) => slot.group === group).map((slot) => `
        <button class="asset-slot${slot.id === selectedAssetSlot ? ' is-selected' : ''}" data-asset-slot="${slot.id}" type="button">${slot.label}</button>
      `).join('')}
    </div></section>`;
  assetView.innerHTML = `
    <header class="section-header">
      <div><p>WORLD IMAGE LIBRARY</p><h2>世界图片素材</h2></div>
      <span>统一调整图片、碰撞占地与种子世界中的生成密度。</span>
    </header>
    ${isReadOnly() ? '<div class="readonly-banner">项目默认值可浏览但不可重新映射。点击“另存为”创建可编辑预设；上传素材仍可加入本机素材库。</div>' : ''}
    <div class="asset-toolbar">
      <input id="asset-search" class="asset-search" value="${escapeHtml(assetSearch)}" placeholder="搜索素材名称" aria-label="搜索素材名称">
      <select id="asset-category-filter" class="asset-filter" aria-label="素材分类">${categories.map(([value, label]) => `<option value="${value}"${selectedOption(value, assetCategory)}>${label}</option>`).join('')}</select>
      <button id="upload-world-asset-button" class="button button-primary" type="button">上传 PNG / WebP</button>
      <span>${assetCatalog.records.length} 项素材</span>
    </div>
    <div class="asset-workspace">
      <section class="asset-panel"><h3>场景槽位</h3>${slotGroup('fixed', '固定地图')}${slotGroup('seeded', '种子世界')}</section>
      <section class="asset-panel"><h3>${definition.label}</h3>
        <div class="asset-preview">${assetPreviewHtml(current, binding)}</div>
        <div class="asset-binding-fields">
          <label>尺寸基准<select data-asset-binding-field="sizeMode" ${isReadOnly() ? 'disabled' : ''}><option value="height"${selectedOption('height', binding.sizeMode)}>高度</option><option value="width"${selectedOption('width', binding.sizeMode)}>宽度</option></select></label>
          <label>显示尺寸<input data-asset-binding-field="displaySize" type="number" min="4" max="2048" step="1" value="${binding.displaySize}" ${isReadOnly() ? 'disabled' : ''}></label>
          <label>锚点 X<input data-asset-binding-field="anchorX" type="number" min="0" max="1" step="0.01" value="${binding.anchorX}" ${isReadOnly() ? 'disabled' : ''}></label>
          <label>锚点 Y<input data-asset-binding-field="anchorY" type="number" min="0" max="1" step="0.01" value="${binding.anchorY}" ${isReadOnly() ? 'disabled' : ''}></label>
          ${definition.tree ? `<label>树冠裁切<input data-asset-binding-field="canopyCutRatio" type="number" min="0.1" max="0.95" step="0.01" value="${binding.canopyCutRatio ?? 0.76}" ${isReadOnly() ? 'disabled' : ''}></label>` : ''}
        </div>
        ${definition.collidable && binding.collider ? `<section class="asset-calibration-group">
          <h4>碰撞箱</h4>
          <p>${definition.group === 'fixed' ? '修改后会同步到固定地图中使用该槽位的同类实体；仍可在地图编辑器中逐个微调。' : '尺寸会随生成物的视觉缩放同步变化，不改变生成位置。'} 拖动预览中的青色框可调整位置；方向键微调，Shift + 方向键每次移动 10 像素。</p>
          <div class="asset-binding-fields">
            <label>形状<select data-asset-collider-field="shape" ${isReadOnly() ? 'disabled' : ''}><option value="rectangle"${selectedOption('rectangle', binding.collider.shape)}>矩形</option><option value="circle"${selectedOption('circle', binding.collider.shape)}>圆形</option></select></label>
            ${binding.collider.shape === 'circle'
              ? `<label>半径<input data-asset-collider-field="radius" type="number" min="1" max="500" step="1" value="${binding.collider.radius}" ${isReadOnly() ? 'disabled' : ''}></label>`
              : `<label>宽度<input data-asset-collider-field="width" type="number" min="1" max="500" step="1" value="${binding.collider.width}" ${isReadOnly() ? 'disabled' : ''}></label><label>高度<input data-asset-collider-field="height" type="number" min="1" max="500" step="1" value="${binding.collider.height}" ${isReadOnly() ? 'disabled' : ''}></label>`}
            <label>偏移 X<input data-asset-collider-field="offsetX" type="number" min="-500" max="500" step="1" value="${binding.collider.offsetX ?? 0}" ${isReadOnly() ? 'disabled' : ''}></label>
            <label>偏移 Y<input data-asset-collider-field="offsetY" type="number" min="-500" max="500" step="1" value="${binding.collider.offsetY ?? 0}" ${isReadOnly() ? 'disabled' : ''}></label>
          </div>
        </section>` : ''}
        ${definition.generated ? `<section class="asset-calibration-group">
          <h4>生成密度</h4>
          <p>倍率会乘以开放世界的全局密度。0 表示禁用该素材，1 为基准，最高 3 倍。</p>
          <label class="asset-density-field"><span>槽位密度倍率</span><input data-asset-binding-field="densityWeight" type="range" min="0" max="3" step="0.05" value="${binding.densityWeight ?? 1}" ${isReadOnly() ? 'disabled' : ''}><output>${(binding.densityWeight ?? 1).toFixed(2)}×</output></label>
        </section>` : '<p class="asset-fixed-density-note">固定地图物件位置由“地图编辑”管理，不参与随机生成。</p>'}
        <button id="restore-asset-slot-button" class="button" type="button" ${isReadOnly() ? 'disabled' : ''}>恢复该槽位默认值</button>
      </section>
      <section class="asset-panel asset-library"><h3>兼容素材</h3>
        <div class="asset-grid">${compatible.length ? compatible.map((asset) => `
          <article class="asset-card${asset.id === binding.sourceId ? ' is-current' : ''}" data-asset-card="${escapeHtml(asset.id)}">
            <button class="asset-pick" data-asset-source="${escapeHtml(asset.id)}" type="button" ${isReadOnly() ? 'disabled' : ''}>
              <span class="asset-thumb"><img src="${asset.url}" alt=""></span>
              <strong>${escapeHtml(asset.name)}</strong><small>${asset.builtIn ? '内置' : '本机'} · ${asset.width}×${asset.height}${asset.byteSize ? ` · ${(asset.byteSize / 1024).toFixed(0)}KB` : ''}</small>
            </button>
            ${asset.builtIn ? '' : `<button class="asset-delete" data-delete-asset="${escapeHtml(asset.id)}" type="button" title="删除本机素材">×</button>`}
          </article>`).join('') : '<div class="asset-empty">当前筛选下没有兼容素材。</div>'}</div>
      </section>
    </div>`;
}

function playerCameraSummary(): string {
  const labels = ['远景', '默认', '近景'];
  return `<section class="player-camera-summary" aria-label="1280乘720视野换算">
    <header><div><p>VIEW CALIBRATION</p><h3>1280×720 视野换算</h3></div><span>纵向视野会按实际画布比例自动调整</span></header>
    <div class="player-camera-summary-grid">
      ${draft.camera.viewHalfWidthBodyMultipliers.map((multiplier, index) => {
        const metrics = calculateCameraView(
          { width: 1280, height: 720 },
          draft.player.visualSize,
          multiplier,
        );
        return `<article class="player-camera-summary-card${index === draft.camera.defaultViewIndex ? ' is-default' : ''}">
          <strong>${labels[index]}${index === draft.camera.defaultViewIndex ? ' · 初始' : ''}</strong>
          <span>单侧 ${metrics.halfWidthWorld.toFixed(0)}px · ${multiplier.toFixed(1)}×角色</span>
          <span>视野 ${metrics.worldWidth.toFixed(0)}×${metrics.worldHeight.toFixed(0)}px</span>
          <span>Zoom ${metrics.zoom.toFixed(3)}</span>
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function updatePlayerCameraSummary(): void {
  if (section !== 'player') return;
  const current = parameterView.querySelector<HTMLElement>('.player-camera-summary');
  if (current) current.outerHTML = playerCameraSummary();
}

function formatMinutes(value: number): string {
  return Number.isFinite(value) ? `${Number(value.toFixed(2))}` : '—';
}

function dayNightSummary(): string {
  const config = draft.dayNight;
  const phases = [
    ['黎明', config.dawnDurationMinutes, 'dawn'],
    ['白天', config.dayDurationMinutes, 'day'],
    ['黄昏', config.duskDurationMinutes, 'dusk'],
    ['夜晚', config.nightDurationMinutes, 'night'],
  ] as const;
  const total = phases.reduce((sum, [, duration]) => sum + duration, 0);
  return `<section class="day-night-summary" aria-label="昼夜阶段时间轴">
    <header><div><p>CYCLE PREVIEW</p><h3>总周期 ${formatMinutes(total)} 分钟</h3></div><span>05:00 黎明起点 · 19:00 进入夜晚</span></header>
    <div class="day-night-timeline">
      ${phases.map(([label, duration, phase]) => `<span class="is-${phase}" style="flex-grow:${Math.max(0.01, duration)}"><strong>${label}</strong><small>${formatMinutes(duration)} 分钟</small></span>`).join('')}
    </div>
    <p>夜间暗度 ${(config.nightDarkness * 100).toFixed(0)}% · HUD 映射为 24 小时时钟</p>
  </section>`;
}

function updateDayNightSummary(): void {
  if (section !== 'dayNight') return;
  const current = parameterView.querySelector<HTMLElement>('.day-night-summary');
  if (current) current.outerHTML = dayNightSummary();
}

function renderSection(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === section);
  });
  const mapActive = section === 'map';
  const assetsActive = section === 'assets';
  const charactersActive = section === 'characters';
  mapView.hidden = !mapActive;
  assetView.hidden = !assetsActive;
  characterView.hidden = !charactersActive;
  parameterView.hidden = mapActive || assetsActive || charactersActive;
  if (mapActive) {
    void ensureMapEditor();
    return;
  }
  if (assetsActive) {
    renderAssetView();
    return;
  }
  if (charactersActive) {
    renderCharacterView();
    return;
  }
  const activeSection = section as Exclude<SectionId, 'characters' | 'map' | 'assets'>;
  const meta = SECTION_META[activeSection];
  parameterView.innerHTML = `
    <header class="section-header">
      <div><p>${meta.eyebrow}</p><h2>${meta.title}</h2></div>
      <span>${meta.description}</span>
    </header>
    ${isReadOnly() ? '<div class="readonly-banner">项目默认值是只读基线。点击“另存为”创建可编辑预设。</div>' : ''}
    <div class="parameter-grid">
      ${meta.fields.map((field) => `
        <article class="parameter-card">
          <label>
            <span>${field.label}</span>
            <span>
              <input
                type="number"
                data-config-path="${field.path}"
                min="${field.minimum}"
                max="${field.maximum}"
                step="${field.step}"
                value="${String(getPath(draft, field.path))}"
                ${isReadOnly() ? 'disabled' : ''}
              />
              ${field.unit ? `<span class="unit">${field.unit}</span>` : ''}
            </span>
          </label>
          <p>${field.help}</p>
        </article>
      `).join('')}
    </div>
    ${activeSection === 'player' ? playerCameraSummary() : ''}
    ${activeSection === 'dayNight' ? dayNightSummary() : ''}
  `;
}

function renderInspector(): void {
  if (section === 'characters') {
    const profile = draft.characterProfiles[selectedCharacterId];
    const asset = selectedCharacterAsset();
    inspector.innerHTML = `
      <header class="inspector-header"><p>CHARACTER RECORD</p><h2>${escapeHtml(profile.displayName)}</h2></header>
      <div class="inspector-group"><h3>档案标识</h3><p>${selectedCharacterId}</p><p>${escapeHtml(asset.sourceName)}</p></div>
      <div class="inspector-group"><h3>原图检查</h3><p>天然尺寸 ${asset.naturalWidth} × ${asset.naturalHeight}</p><p>有效轮廓 ${asset.opaqueBounds.width} × ${asset.opaqueBounds.height}</p><p>Alpha 阈值 ≥ 16</p></div>
      <div class="inspector-group"><h3>参数摘要</h3><p>视觉 ${profile.visualSize}px</p><p>碰撞 ${profile.bodyWidth} × ${profile.bodyHeight}px</p><p>移动 ${profile.moveSpeed}px/s · 冲刺 ${profile.sprintMultiplier}×</p></div>
      <div class="inspector-empty">视觉与碰撞档案会驱动已启用的种子世界AI动物；当前玩家仍读取“原型玩家”参数并使用黄狐狸。</div>
    `;
    return;
  }
  if (section !== 'map') {
    inspector.innerHTML = `
      <header class="inspector-header"><p>CONFIG SUMMARY</p><h2>运行时摘要</h2></header>
      <div class="inspector-group"><h3>当前预设</h3><p>${escapeHtml(currentPreset()?.name ?? '项目默认值')}</p></div>
      <div class="inspector-group"><h3>地图</h3><p>${draft.world.width} × ${draft.world.height}</p><p>${draft.world.obstacles.length} 个障碍物</p></div>
      <div class="inspector-empty">保存并激活预设后，刷新独立游戏页面即可应用。线上构建不会读取这里的数据。</div>
    `;
    return;
  }
  const disabled = isReadOnly() ? ' disabled' : '';
  const header = (eyebrow: string, title: string) => `<header class="inspector-header"><p>${eyebrow}</p><h2>${title}</h2></header>`;
  if (!selection) {
    inspector.innerHTML = `${header('WORLD BOUNDS', '地图全局')}
      ${isReadOnly() ? '<div class="readonly-banner">先另存为预设才能编辑地图。</div>' : ''}
      <div class="inspector-group"><h3>世界尺寸</h3>
        ${mapNumberInput('宽度', 'world-width', draft.world.width, disabled)}
        ${mapNumberInput('高度', 'world-height', draft.world.height, disabled)}
        ${mapNumberInput('出生安全半径', 'spawn-clear-radius', draft.world.spawnClearRadius, disabled)}
      </div>
      <div class="inspector-empty">选择画布中的出生点、传送点、池塘顶点或障碍物查看属性。缩小世界不会自动移动越界对象。</div>`;
    return;
  }
  if (selection.kind === 'spawn') {
    inspector.innerHTML = `${header('PLAYER ORIGIN', '出生点')}${pointInspector(draft.world.spawn, disabled)}
      <div class="inspector-group"><h3>安全区域</h3>${mapNumberInput('半径', 'spawn-clear-radius', draft.world.spawnClearRadius, disabled)}</div>`;
    return;
  }
  if (selection.kind === 'pond-center') {
    inspector.innerHTML = `${header('POND ANCHOR', '池塘中心')}${pointInspector(draft.world.pondCenter, disabled)}`;
    return;
  }
  if (selection.kind === 'pond-vertex') {
    const point = draft.world.pondPolygon[selection.index];
    inspector.innerHTML = `${header('POND VERTEX', `池塘顶点 ${selection.index + 1}`)}${pointInspector(point, disabled)}
      <div class="inspector-empty">池塘至少保留三个顶点，并且轮廓不能自相交。</div>`;
    return;
  }
  if (selection.kind === 'teleport') {
    const point = draft.world.teleportPoints[selection.index];
    inspector.innerHTML = `${header('DEBUG TRAVEL', `传送点 ${selection.index + 1}`)}${pointInspector(point, disabled)}`;
    return;
  }
  const obstacleSelection = selection as Extract<MapSelection, { kind: 'obstacle' }>;
  const obstacle = draft.world.obstacles.find(({ id }) => id === obstacleSelection.id);
  if (!obstacle) {
    selection = undefined;
    renderInspector();
    return;
  }
  inspector.innerHTML = `${header('WORLD OBJECT', obstacle.id)}
    <div class="inspector-group"><h3>对象</h3>
      ${mapTextInput('ID', 'obstacle-id', obstacle.id, disabled)}
      <label>类型<select data-map-field="obstacle-kind"${disabled}>${obstacleKindOptions(obstacle.kind)}</select></label>
      ${mapNumberInput('X', 'point-x', obstacle.x, disabled)}
      ${mapNumberInput('Y', 'point-y', obstacle.y, disabled)}
      ${mapNumberInput('视觉缩放', 'visual-scale', obstacle.visualScale ?? 1, disabled, 0.1)}
      ${mapNumberInput('旋转角度', 'rotation-degrees', Phaser.Math.RadToDeg(obstacle.rotation ?? 0), disabled, 1)}
      <label>仅碰撞<input data-map-field="collision-only" type="checkbox" ${obstacle.collisionOnly ? 'checked' : ''}${disabled}></label>
    </div>
    ${obstacleAssetInspector(obstacle, disabled)}
    <div class="inspector-group"><h3>碰撞体</h3>
      <label>形状<select data-map-field="collider-shape"${disabled}>
        <option value="rectangle"${selectedOption('rectangle', obstacle.collider.shape)}>矩形</option>
        <option value="circle"${selectedOption('circle', obstacle.collider.shape)}>圆形</option>
      </select></label>
      ${colliderInputs(obstacle.collider, disabled)}
    </div>`;
}

function obstacleAssetInspector(obstacle: ObstacleDefinition, disabled: string): string {
  const slotId = defaultSlotForObstacle(obstacle.kind);
  if (!slotId) return '';
  const slot = getSlotDefinition(slotId);
  const value = obstacle.assetOverride ?? draft.worldAssets.slots[slotId];
  const options = assetCatalog.records.filter((asset) => asset.category === slot.category || asset.category === 'uploaded');
  return `<div class="inspector-group"><h3>图片素材</h3>
    <label>使用方式<select data-map-field="asset-mode"${disabled}><option value="inherit"${selectedOption('inherit', obstacle.assetOverride ? 'override' : 'inherit')}>继承分类默认</option><option value="override"${selectedOption('override', obstacle.assetOverride ? 'override' : 'inherit')}>单体覆盖</option></select></label>
    ${obstacle.assetOverride ? `
      <label>素材<select data-map-field="asset-source"${disabled}>${options.map((asset) => `<option value="${escapeHtml(asset.id)}"${selectedOption(asset.id, value.sourceId)}>${escapeHtml(asset.name)}</option>`).join('')}</select></label>
      <label>尺寸基准<select data-map-field="asset-size-mode"${disabled}><option value="height"${selectedOption('height', value.sizeMode)}>高度</option><option value="width"${selectedOption('width', value.sizeMode)}>宽度</option></select></label>
      ${mapNumberInput('显示尺寸', 'asset-display-size', value.displaySize, disabled, 1)}
      ${mapNumberInput('锚点 X', 'asset-anchor-x', value.anchorX, disabled, 0.01)}
      ${mapNumberInput('锚点 Y', 'asset-anchor-y', value.anchorY, disabled, 0.01)}
      ${slot.tree ? mapNumberInput('树冠裁切', 'asset-canopy-cut', value.canopyCutRatio ?? 0.76, disabled, 0.01) : ''}
    ` : '<p>当前对象随分类默认槽位变化。</p>'}
  </div>`;
}

function mapNumberInput(label: string, field: string, value: number, disabled: string, step = 10): string {
  return `<label>${label}<input data-map-field="${field}" type="number" step="${step}" value="${value}"${disabled}></label>`;
}

function mapTextInput(label: string, field: string, value: string, disabled: string): string {
  return `<label>${label}<input data-map-field="${field}" value="${escapeHtml(value)}"${disabled}></label>`;
}

function pointInspector(point: PointDefinition | undefined, disabled: string): string {
  if (!point) return '<div class="inspector-empty">坐标不存在。</div>';
  return `<div class="inspector-group"><h3>坐标</h3>
    ${mapNumberInput('X', 'point-x', point.x, disabled)}
    ${mapNumberInput('Y', 'point-y', point.y, disabled)}
  </div>`;
}

function obstacleKindOptions(kind: ObstacleKind): string {
  const options: readonly [ObstacleKind, string][] = [
    ['tree', '树木'], ['ancient-tree', '古树'], ['rock', '岩石'],
    ['white-rock', '白石'], ['fallen-log', '倒木'], ['water', '水域碰撞体'],
  ];
  return options.map(([value, label]) => `<option value="${value}"${selectedOption(value, kind)}>${label}</option>`).join('');
}

function colliderInputs(collider: ColliderDefinition, disabled: string): string {
  const sizeInputs = collider.shape === 'circle'
    ? mapNumberInput('半径', 'collider-radius', collider.radius, disabled, 1)
    : `${mapNumberInput('宽度', 'collider-width', collider.width, disabled, 1)}${mapNumberInput('高度', 'collider-height', collider.height, disabled, 1)}`;
  return `${sizeInputs}${mapNumberInput('偏移 X', 'collider-offset-x', collider.offsetX ?? 0, disabled, 1)}${mapNumberInput('偏移 Y', 'collider-offset-y', collider.offsetY ?? 0, disabled, 1)}`;
}

function renderStatus(): void {
  const validation = validateGameConfig(draft);
  const knownAssets = new Set(assetCatalog.records.map(({ id }) => id));
  const configuredAssets = [
    ...Object.values(draft.worldAssets.slots).map(({ sourceId }) => sourceId),
    ...draft.world.obstacles.flatMap(({ assetOverride }) => assetOverride ? [assetOverride.sourceId] : []),
  ];
  const missingAssets = [...new Set(configuredAssets.filter((id) => !knownAssets.has(id)))];
  const dirty = isDirty();
  dirtyStatus.textContent = transientMessage || (dirty ? '有未保存修改' : '未修改');
  dirtyStatus.className = `status-item${dirty ? ' is-warning' : ''}`;
  validationStatus.textContent = validation.errors.length
    ? `${validation.errors.length} 个错误`
    : validation.warnings.length || missingAssets.length ? `${validation.warnings.length + missingAssets.length} 个警告` : '配置有效';
  validationStatus.className = `status-item${validation.errors.length ? ' is-error' : validation.warnings.length || missingAssets.length ? ' is-warning' : ''}`;
  historyStatus.textContent = `撤销 ${history.length} · 重做 ${future.length}`;
  const syncPresentation = {
    idle: ['源码默认值已载入', ''],
    pending: ['正在同步源码默认值', ' is-warning'],
    synced: ['源码默认值已同步', ''],
    blocked: ['修正错误后同步默认值', ' is-warning'],
    error: ['源码默认值同步失败', ' is-error'],
  } as const;
  const [syncText, syncClass] = syncPresentation[defaultSyncState];
  defaultSyncStatus.textContent = syncText;
  defaultSyncStatus.className = `status-item${syncClass}`;
  issueList.innerHTML = validation.errors.length || validation.warnings.length || missingAssets.length
    ? [
      ...validation.errors.map((issue) => `<p><strong>错误 · ${escapeHtml(issue.path)}</strong><br>${escapeHtml(issue.message)}</p>`),
      ...validation.warnings.map((issue) => `<p><b>警告 · ${escapeHtml(issue.path)}</b><br>${escapeHtml(issue.message)}</p>`),
      ...missingAssets.map((id) => `<p><b>警告 · 世界图片素材</b><br>${escapeHtml(id)} 在本机不存在，游戏将使用内置默认图。</p>`),
    ].join('')
    : '<p>当前草稿通过全部配置检查。</p>';
  saveButton.disabled = isReadOnly() || validation.errors.length > 0;
  requireElement<HTMLButtonElement>('undo-button').disabled = isReadOnly() || history.length === 0;
  requireElement<HTMLButtonElement>('redo-button').disabled = isReadOnly() || future.length === 0;
}

function resetMapEditor(): void {
  mapGame?.destroy(true);
  mapGame = undefined;
  mapScene = undefined;
  mapAssets?.dispose();
  mapAssets = undefined;
  mapLoading = false;
}

async function ensureMapEditor(): Promise<void> {
  if (mapGame) {
    requestAnimationFrame(() => mapGame?.scale.resize(
      requireElement<HTMLElement>('map-editor-host').clientWidth,
      requireElement<HTMLElement>('map-editor-host').clientHeight,
    ));
    return;
  }
  if (mapLoading) return;
  mapLoading = true;
  const resolved = await resolveWorldAssets(draft.worldAssets, draft.world.obstacles, true);
  if (section !== 'map') {
    resolved.dispose();
    mapLoading = false;
    return;
  }
  mapAssets = resolved;
  requestAnimationFrame(() => {
    const host = requireElement<HTMLElement>('map-editor-host');
    mapScene = new MapEditorScene(draft, {
      onSelect: (nextSelection) => {
        selection = nextSelection;
        mapScene?.setSelection(selection);
        renderTopbar();
        renderInspector();
      },
      onMove: (nextSelection, point) => {
        selection = nextSelection;
        commitConfig(moveSelection(draft, nextSelection, point));
      },
      onColliderMove: (id, offset) => {
        selection = { kind: 'obstacle', id };
        commitConfig(moveObstacleCollider(draft, id, offset));
      },
    }, resolved);
    mapGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: Math.max(host.clientWidth, 640),
      height: Math.max(host.clientHeight, 420),
      backgroundColor: '#142f29',
      render: { antialias: true, pixelArt: false },
      scale: { mode: Phaser.Scale.RESIZE },
      scene: [mapScene],
    });
    mapLoading = false;
  });
}

function selectPreset(id: string | null): void {
  if (isDirty() && !window.confirm('放弃当前未保存修改并切换预设？')) {
    presetSelect.value = selectedPresetId ?? '';
    return;
  }
  selectedPresetId = id;
  const preset = currentPreset();
  draft = cloneGameConfig(preset?.config ?? DEFAULT_GAME_CONFIG);
  savedSnapshot = JSON.stringify(draft);
  selection = undefined;
  history = [];
  future = [];
  resetMapEditor();
  syncDraftViews();
}

function saveAndActivate(): void {
  const preset = currentPreset();
  if (!preset) return;
  const validation = validateGameConfig(draft);
  if (validation.errors.length) {
    showMessage('存在错误，无法保存');
    return;
  }
  const nextStore = upsertPreset(store, { ...preset, config: draft }, true);
  if (!persistPresetStore(nextStore)) return;
  savedSnapshot = JSON.stringify(draft);
  showMessage('已保存并设为活动预设');
  syncDraftViews();
}

function createPresetFromDialog(name: string): void {
  if (validateGameConfig(draft).errors.length > 0) {
    presetDialog.close();
    showMessage('存在错误，无法另存为预设');
    return;
  }
  const preset = createDevPreset(name, draft);
  const nextStore = upsertPreset(store, preset, true);
  if (!persistPresetStore(nextStore)) return;
  selectedPresetId = preset.id;
  draft = cloneGameConfig(preset.config);
  savedSnapshot = JSON.stringify(draft);
  history = [];
  future = [];
  showMessage('新预设已创建并激活');
  syncDraftViews();
}

function undo(): void {
  const previous = history.at(-1);
  if (!previous || isReadOnly()) return;
  future = [cloneGameConfig(draft), ...future.slice(0, 49)];
  history = history.slice(0, -1);
  draft = previous;
  queueDefaultSync();
  syncDraftViews();
}

function redo(): void {
  const next = future[0];
  if (!next || isReadOnly()) return;
  history = [...history.slice(-49), cloneGameConfig(draft)];
  future = future.slice(1);
  draft = next;
  queueDefaultSync();
  syncDraftViews();
}

function updateObstacle(id: string, update: (obstacle: ObstacleDefinition) => ObstacleDefinition): GameConfig {
  const next = cloneGameConfig(draft);
  return {
    ...next,
    world: {
      ...next.world,
      obstacles: next.world.obstacles.map((obstacle) => obstacle.id === id ? update(obstacle) : obstacle),
    },
  };
}

function pointForSelection(): PointDefinition | undefined {
  const currentSelection = selection;
  if (!currentSelection) return undefined;
  if (currentSelection.kind === 'spawn') return draft.world.spawn;
  if (currentSelection.kind === 'pond-center') return draft.world.pondCenter;
  if (currentSelection.kind === 'pond-vertex') return draft.world.pondPolygon[currentSelection.index];
  if (currentSelection.kind === 'teleport') return draft.world.teleportPoints[currentSelection.index];
  const obstacle = draft.world.obstacles.find(({ id }) => id === currentSelection.id);
  return obstacle ? { x: obstacle.x, y: obstacle.y } : undefined;
}

function handleMapField(
  field: string,
  element: HTMLInputElement | HTMLSelectElement,
  redrawControls = true,
): void {
  if (isReadOnly()) return;
  if (field === 'world-width' || field === 'world-height' || field === 'spawn-clear-radius') {
    const value = Number(element.value);
    const next = cloneGameConfig(draft);
    commitConfig({
      ...next,
      world: {
        ...next.world,
        ...(field === 'world-width' ? { width: value } : {}),
        ...(field === 'world-height' ? { height: value } : {}),
        ...(field === 'spawn-clear-radius' ? { spawnClearRadius: value } : {}),
      },
    }, redrawControls);
    return;
  }
  if ((field === 'point-x' || field === 'point-y') && selection) {
    const current = pointForSelection();
    if (!current) return;
    commitConfig(moveSelection(draft, selection, {
      ...current,
      [field === 'point-x' ? 'x' : 'y']: Number(element.value),
    }), redrawControls);
    return;
  }
  if (selection?.kind !== 'obstacle') return;
  const id = selection.id;
  if (field === 'obstacle-id') {
    const nextId = element.value.trim();
    selection = { kind: 'obstacle', id: nextId };
    commitConfig(updateObstacle(id, (obstacle) => ({ ...obstacle, id: nextId })), redrawControls);
    return;
  }
  if (field === 'obstacle-kind') {
    const kind = element.value as ObstacleKind;
    commitConfig(updateObstacle(id, (obstacle) => ({ ...obstacle, kind, collisionOnly: kind === 'water' || obstacle.collisionOnly, assetOverride: undefined })), redrawControls);
    return;
  }
  if (field === 'asset-mode') {
    commitConfig(updateObstacle(id, (obstacle) => {
      const slot = defaultSlotForObstacle(obstacle.kind);
      if (!slot) return obstacle;
      if (element.value === 'override') {
        return { ...obstacle, assetOverride: structuredClone(draft.worldAssets.slots[slot]) };
      }
      const rest = { ...obstacle };
      delete rest.assetOverride;
      return rest;
    }), redrawControls);
    return;
  }
  if (field.startsWith('asset-')) {
    commitConfig(updateObstacle(id, (obstacle) => {
      if (!obstacle.assetOverride) return obstacle;
      const numeric = Number(element.value);
      const update: Partial<WorldImageBinding> = field === 'asset-source' ? { sourceId: element.value }
        : field === 'asset-size-mode' ? { sizeMode: element.value as WorldImageBinding['sizeMode'] }
          : field === 'asset-display-size' ? { displaySize: numeric }
            : field === 'asset-anchor-x' ? { anchorX: numeric }
              : field === 'asset-anchor-y' ? { anchorY: numeric }
                : { canopyCutRatio: numeric };
      return { ...obstacle, assetOverride: { ...obstacle.assetOverride, ...update } };
    }), redrawControls);
    return;
  }
  if (field === 'visual-scale' || field === 'rotation-degrees') {
    const value = Number(element.value);
    commitConfig(updateObstacle(id, (obstacle) => ({
      ...obstacle,
      ...(field === 'visual-scale' ? { visualScale: value } : { rotation: Phaser.Math.DegToRad(value) }),
    })), redrawControls);
    return;
  }
  if (field === 'collision-only' && element instanceof HTMLInputElement) {
    commitConfig(updateObstacle(id, (obstacle) => ({ ...obstacle, collisionOnly: element.checked })), redrawControls);
    return;
  }
  if (field === 'collider-shape') {
    const obstacle = draft.world.obstacles.find(({ id: obstacleId }) => obstacleId === id);
    if (!obstacle) return;
    const collider: ColliderDefinition = element.value === 'circle'
      ? { shape: 'circle', radius: 28, offsetX: obstacle.collider.offsetX ?? 0, offsetY: obstacle.collider.offsetY ?? 0 }
      : { shape: 'rectangle', width: 34, height: 26, offsetX: obstacle.collider.offsetX ?? 0, offsetY: obstacle.collider.offsetY ?? 0 };
    commitConfig(updateObstacle(id, (obstacle) => ({ ...obstacle, collider })), redrawControls);
    return;
  }
  const numeric = Number(element.value);
  commitConfig(updateObstacle(id, (obstacle) => {
    if (obstacle.collider.shape === 'circle' && field === 'collider-radius') {
      return { ...obstacle, collider: { ...obstacle.collider, radius: numeric } };
    }
    if (obstacle.collider.shape === 'rectangle' && field === 'collider-width') {
      return { ...obstacle, collider: { ...obstacle.collider, width: numeric } };
    }
    if (obstacle.collider.shape === 'rectangle' && field === 'collider-height') {
      return { ...obstacle, collider: { ...obstacle.collider, height: numeric } };
    }
    if (field === 'collider-offset-x') {
      return { ...obstacle, collider: { ...obstacle.collider, offsetX: numeric } };
    }
    if (field === 'collider-offset-y') {
      return { ...obstacle, collider: { ...obstacle.collider, offsetY: numeric } };
    }
    return obstacle;
  }), redrawControls);
}

function uniqueCopyId(source: string): string {
  let index = 1;
  let id = `${source}-copy`;
  while (draft.world.obstacles.some((obstacle) => obstacle.id === id)) {
    index += 1;
    id = `${source}-copy-${index}`;
  }
  return id;
}

function addObject(): void {
  if (isReadOnly()) return;
  const kind = requireElement<HTMLSelectElement>('object-kind-select').value as ObstacleKind;
  const point = { x: 100, y: 100 };
  const created = createObstacle(draft, kind, point);
  const slotId = defaultSlotForObstacle(kind);
  const obstacle = slotId && draft.worldAssets.slots[slotId].collider
    ? { ...created, collider: structuredClone(draft.worldAssets.slots[slotId].collider) }
    : created;
  const next = cloneGameConfig(draft);
  selection = { kind: 'obstacle', id: obstacle.id };
  commitConfig({ ...next, world: { ...next.world, obstacles: [...next.world.obstacles, obstacle] } });
}

function duplicateSelection(): void {
  if (selection?.kind !== 'obstacle' || isReadOnly()) return;
  const selectedId = selection.id;
  const source = draft.world.obstacles.find(({ id }) => id === selectedId);
  if (!source) return;
  const copy: ObstacleDefinition = { ...structuredClone(source), id: uniqueCopyId(source.id), x: source.x + 40, y: source.y + 40 };
  const next = cloneGameConfig(draft);
  selection = { kind: 'obstacle', id: copy.id };
  commitConfig({ ...next, world: { ...next.world, obstacles: [...next.world.obstacles, copy] } });
}

function removeSelection(): void {
  if (!selection || isReadOnly()) return;
  const currentSelection = selection;
  const next = cloneGameConfig(draft);
  if (currentSelection.kind === 'obstacle') {
    commitConfig({ ...next, world: { ...next.world, obstacles: next.world.obstacles.filter(({ id }) => id !== currentSelection.id) } });
  } else if (currentSelection.kind === 'teleport') {
    commitConfig({ ...next, world: { ...next.world, teleportPoints: next.world.teleportPoints.filter((_, index) => index !== currentSelection.index) } });
  } else if (currentSelection.kind === 'pond-vertex' && next.world.pondPolygon.length > 3) {
    commitConfig({ ...next, world: { ...next.world, pondPolygon: next.world.pondPolygon.filter((_, index) => index !== currentSelection.index) } });
  } else {
    showMessage('该对象不能删除');
    return;
  }
  selection = undefined;
  syncDraftViews();
}

characterView.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const tab = target.closest<HTMLButtonElement>('[data-character-id]');
  if (tab?.dataset.characterId) {
    selectedCharacterId = tab.dataset.characterId as CharacterId;
    previewHeadingDegrees = 0;
    previewSizeMode = 'base';
    renderCharacterView();
    renderInspector();
    focusSelectedCharacterTab();
    return;
  }
  const heading = target.closest<HTMLButtonElement>('[data-preview-heading]');
  if (heading?.dataset.previewHeading) {
    previewHeadingDegrees = Number(heading.dataset.previewHeading);
    renderCharacterView();
    return;
  }
  const sizePreview = target.closest<HTMLButtonElement>('[data-preview-size]');
  if (sizePreview?.dataset.previewSize) {
    previewSizeMode = sizePreview.dataset.previewSize as typeof previewSizeMode;
    renderCharacterView();
    return;
  }
  if (target.closest('#restore-character-profile-button') && !isReadOnly()) {
    updateCharacterProfile(structuredClone(DEFAULT_CHARACTER_PROFILES[selectedCharacterId]));
    showMessage(`已恢复${DEFAULT_CHARACTER_PROFILES[selectedCharacterId].displayName}默认档案`);
    return;
  }
  if (target.closest('#restore-wildlife-profile-button') && isWildlifeSpeciesId(selectedCharacterId) && !isReadOnly()) {
    updateWildlifeProfile(selectedCharacterId, structuredClone(DEFAULT_WILDLIFE_CONFIG.species[selectedCharacterId]));
    showMessage(`已恢复${DEFAULT_CHARACTER_PROFILES[selectedCharacterId].displayName} AI 默认值`);
  }
});

characterView.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'number' || isReadOnly()) return;
  const wildlifeField = input.dataset.wildlifeField as keyof WildlifeSpeciesConfig | undefined;
  if (wildlifeField && isWildlifeSpeciesId(selectedCharacterId) && Number.isFinite(input.valueAsNumber)) {
    updateWildlifeProfile(selectedCharacterId, { [wildlifeField]: input.valueAsNumber }, false);
    if (wildlifeField === 'minSizeScale' || wildlifeField === 'maxSizeScale') updateCharacterPreview();
    renderInspector();
    return;
  }
  const field = input.dataset.characterField as keyof CharacterProfileConfig | undefined;
  if (!field || !Number.isFinite(input.valueAsNumber)) return;
  updateCharacterProfile({ [field]: input.valueAsNumber }, false);
  updateCharacterPreview();
  renderInspector();
});

characterView.addEventListener('change', (event) => {
  const element = event.target;
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || isReadOnly()) return;
  if (isWildlifeSpeciesId(selectedCharacterId)) {
    const wildlifeField = element.dataset.wildlifeField as keyof WildlifeSpeciesConfig | undefined;
    if ((wildlifeField === 'enabled' || wildlifeField === 'eatsBerries' || wildlifeField === 'eatsGrass') && element instanceof HTMLInputElement) {
      updateWildlifeProfile(selectedCharacterId, { [wildlifeField]: element.checked });
      return;
    }
    if (wildlifeField === 'role' && element instanceof HTMLSelectElement) {
      updateWildlifeProfile(selectedCharacterId, { role: element.value as WildlifeSpeciesConfig['role'] });
      return;
    }
    if (element instanceof HTMLInputElement && element.dataset.wildlifeTerrain) {
      const terrain = element.dataset.wildlifeTerrain as TerrainType;
      const current = draft.wildlife.species[selectedCharacterId].preferredTerrains;
      const preferredTerrains = element.checked
        ? [...new Set([...current, terrain])]
        : current.filter((value) => value !== terrain);
      updateWildlifeProfile(selectedCharacterId, { preferredTerrains });
      return;
    }
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  const field = element.dataset.characterField;
  if (field !== 'displayName' && field !== 'notes') return;
  updateCharacterProfile({ [field]: element.value });
});

characterView.addEventListener('keydown', (event) => {
  const tab = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>('[data-character-id]')
    : undefined;
  if (!tab || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = CHARACTER_IDS.indexOf(selectedCharacterId);
  const backwards = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
  const nextIndex = (currentIndex + (backwards ? -1 : 1) + CHARACTER_IDS.length) % CHARACTER_IDS.length;
  selectedCharacterId = CHARACTER_IDS[nextIndex];
  previewHeadingDegrees = 0;
  previewSizeMode = 'base';
  renderCharacterView();
  renderInspector();
  focusSelectedCharacterTab();
});

parameterView.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.configPath || isReadOnly()) return;
  commitConfig(setNumberPath(draft, input.dataset.configPath, Number(input.value)), false);
  updatePlayerCameraSummary();
  updateDayNightSummary();
});

async function reloadAssetCatalog(): Promise<void> {
  const previous = assetCatalog;
  assetCatalog = await loadWorldAssetCatalog();
  previous.dispose();
  if (section === 'assets') renderAssetView();
}

assetView.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const slotButton = target.closest<HTMLButtonElement>('[data-asset-slot]');
  if (slotButton?.dataset.assetSlot) {
    selectedAssetSlot = slotButton.dataset.assetSlot as WorldAssetSlotId;
    assetCategory = 'all';
    renderAssetView();
    return;
  }
  if (target.closest('#upload-world-asset-button')) {
    assetUploadInput.click();
    return;
  }
  if (target.closest('#restore-asset-slot-button')) {
    updateAssetSlot(selectedAssetSlot, structuredClone(DEFAULT_WORLD_ASSET_CONFIG.slots[selectedAssetSlot]));
    return;
  }
  const sourceButton = target.closest<HTMLButtonElement>('[data-asset-source]');
  if (sourceButton?.dataset.assetSource && !isReadOnly()) {
    updateAssetSlot(selectedAssetSlot, { sourceId: sourceButton.dataset.assetSource });
    return;
  }
  const deleteButton = target.closest<HTMLButtonElement>('[data-delete-asset]');
  if (deleteButton?.dataset.deleteAsset) {
    const id = deleteButton.dataset.deleteAsset;
    const references = referencedWorldAssetIds([
      ...store.presets.map(({ config }) => config),
      draft,
    ]).get(id) ?? [];
    if (references.length) {
      const locations = references.slice(0, 2).join('；');
      showMessage(`素材仍被引用：${locations}${references.length > 2 ? `；另有 ${references.length - 2} 处` : ''}`);
      return;
    }
    if (!window.confirm('从本机素材库删除这张图片？')) return;
    await deleteStoredWorldAsset(id);
    await reloadAssetCatalog();
    showMessage('本机素材已删除');
  }
});

assetView.addEventListener('pointerdown', (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-asset-collider-drag]')
    : null;
  if (!target || isReadOnly()) return;
  const collider = draft.worldAssets.slots[selectedAssetSlot].collider;
  const scale = Number(target.dataset.previewScale);
  if (!collider || !Number.isFinite(scale) || scale <= 0) return;
  event.preventDefault();
  target.setPointerCapture(event.pointerId);
  target.classList.add('is-dragging');
  assetColliderDrag = {
    pointerId: event.pointerId,
    target,
    slotId: selectedAssetSlot,
    collider: structuredClone(collider),
    scale,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    startLeft: Number.parseFloat(target.style.left),
    startTop: Number.parseFloat(target.style.top),
  };
});

assetView.addEventListener('pointermove', (event) => {
  const drag = assetColliderDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.target.style.left = `${drag.startLeft + event.clientX - drag.startClientX}px`;
  drag.target.style.top = `${drag.startTop + event.clientY - drag.startClientY}px`;
});

function finishAssetColliderDrag(event: PointerEvent, cancelled: boolean): void {
  const drag = assetColliderDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  assetColliderDrag = undefined;
  drag.target.classList.remove('is-dragging');
  if (cancelled) {
    renderAssetView();
    return;
  }
  const offsetX = Math.round((
    (drag.collider.offsetX ?? 0) + (drag.currentClientX - drag.startClientX) / drag.scale
  ) * 10) / 10;
  const offsetY = Math.round((
    (drag.collider.offsetY ?? 0) + (drag.currentClientY - drag.startClientY) / drag.scale
  ) * 10) / 10;
  updateAssetSlot(drag.slotId, {
    collider: { ...drag.collider, offsetX, offsetY },
  });
}

assetView.addEventListener('pointerup', (event) => finishAssetColliderDrag(event, false));
assetView.addEventListener('pointercancel', (event) => finishAssetColliderDrag(event, true));

assetView.addEventListener('keydown', (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-asset-collider-drag]')
    : null;
  if (!target || isReadOnly() || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const collider = draft.worldAssets.slots[selectedAssetSlot].collider;
  if (!collider) return;
  event.preventDefault();
  const amount = event.shiftKey ? 10 : 1;
  const offsetX = (collider.offsetX ?? 0)
    + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0);
  const offsetY = (collider.offsetY ?? 0)
    + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
  updateAssetSlot(selectedAssetSlot, { collider: { ...collider, offsetX, offsetY } });
});

assetView.addEventListener('change', (event) => {
  const element = event.target;
  if (element instanceof HTMLSelectElement && element.id === 'asset-category-filter') {
    assetCategory = element.value as WorldAssetCategory | 'all';
    renderAssetView();
    return;
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return;
  const colliderField = element.dataset.assetColliderField as 'shape' | 'width' | 'height' | 'radius' | 'offsetX' | 'offsetY' | undefined;
  if (colliderField && !isReadOnly()) {
    updateAssetCollider(colliderField, element.value);
    return;
  }
  const field = element.dataset.assetBindingField as keyof WorldImageBinding | undefined;
  if (!field || isReadOnly()) return;
  updateAssetSlot(selectedAssetSlot, {
    [field]: field === 'sizeMode' ? element.value : Number(element.value),
  });
});

assetView.addEventListener('input', (event) => {
  const element = event.target;
  if (!(element instanceof HTMLInputElement)) return;
  if (element.dataset.assetBindingField === 'densityWeight') {
    const output = element.closest('label')?.querySelector('output');
    if (output) output.textContent = `${Number(element.value).toFixed(2)}×`;
    return;
  }
  if (element.id !== 'asset-search') return;
  assetSearch = element.value;
  renderAssetView();
  const replacement = requireElement<HTMLInputElement>('asset-search');
  replacement.focus();
  replacement.setSelectionRange(replacement.value.length, replacement.value.length);
});

assetUploadInput.addEventListener('change', async () => {
  const files = [...(assetUploadInput.files ?? [])];
  if (!files.length) return;
  try {
    const existing = new Set(assetCatalog.records.map(({ id }) => id));
    const stored = [];
    for (const file of files) stored.push(await storeUploadedWorldAsset(file));
    await reloadAssetCatalog();
    const newCount = stored.filter(({ id }) => !existing.has(id)).length;
    showMessage(newCount === stored.length ? `已加入 ${newCount} 张本机素材` : `已读取 ${stored.length} 张图片，其中 ${stored.length - newCount} 张内容重复`);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '无法上传图片');
  } finally {
    assetUploadInput.value = '';
  }
});

inspector.addEventListener('change', (event) => {
  const element = event.target;
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return;
  const field = element.dataset.mapField;
  if (field && (element instanceof HTMLSelectElement || element.type === 'checkbox')) {
    handleMapField(field, element);
  }
});

inspector.addEventListener('input', (event) => {
  const element = event.target;
  if (!(element instanceof HTMLInputElement) || element.type === 'checkbox') return;
  const field = element.dataset.mapField;
  if (field) handleMapField(field, element, false);
});

document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    section = button.dataset.section as SectionId;
    renderSection();
    renderInspector();
    renderStatus();
  });
});

presetSelect.addEventListener('change', () => selectPreset(presetSelect.value || null));
saveButton.addEventListener('click', saveAndActivate);
saveAsButton.addEventListener('click', () => {
  presetNameInput.value = currentPreset() ? `${currentPreset()?.name} 副本` : '本地调试预设';
  presetDialog.showModal();
  presetNameInput.select();
});
requireElement<HTMLButtonElement>('cancel-preset-button').addEventListener('click', () => presetDialog.close());
requireElement<HTMLFormElement>('preset-form').addEventListener('submit', (event) => {
  event.preventDefault();
  createPresetFromDialog(presetNameInput.value);
  presetDialog.close();
});
deletePresetButton.addEventListener('click', () => {
  const preset = currentPreset();
  if (!preset || !window.confirm(`删除本地预设“${preset.name}”？`)) return;
  const nextStore = deletePreset(store, preset.id);
  if (!persistPresetStore(nextStore)) return;
  selectedPresetId = store.activePresetId;
  const active = currentPreset();
  draft = cloneGameConfig(active?.config ?? DEFAULT_GAME_CONFIG);
  savedSnapshot = JSON.stringify(draft);
  selection = undefined;
  history = [];
  future = [];
  resetMapEditor();
  syncDraftViews();
});
requireElement<HTMLButtonElement>('export-button').addEventListener('click', () => {
  const preset = currentPreset();
  if (!preset) return;
  const blob = new Blob([exportPreset({ ...preset, config: draft })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${preset.name.replace(/[\\/:*?"<>|]+/g, '-')}.wildmorph.json`;
  link.click();
  URL.revokeObjectURL(url);
});
requireElement<HTMLButtonElement>('import-button').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const preset = importPreset(await file.text(), store);
    const nextStore = upsertPreset(store, preset, false);
    if (!persistPresetStore(nextStore)) return;
    selectPreset(preset.id);
    showMessage('预设已导入，保存后可激活');
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '无法导入预设');
  } finally {
    importInput.value = '';
  }
});
requireElement<HTMLButtonElement>('open-game-button').addEventListener('click', () => {
  window.open(new URL('/', window.location.origin), 'wildmorph-game-preview');
});
requireElement<HTMLButtonElement>('add-object-button').addEventListener('click', addObject);
requireElement<HTMLButtonElement>('add-teleport-button').addEventListener('click', () => {
  if (isReadOnly()) return;
  const next = cloneGameConfig(draft);
  const index = next.world.teleportPoints.length;
  selection = { kind: 'teleport', index };
  commitConfig({ ...next, world: { ...next.world, teleportPoints: [...next.world.teleportPoints, { ...next.world.spawn }] } });
});
requireElement<HTMLButtonElement>('add-pond-vertex-button').addEventListener('click', () => {
  if (isReadOnly()) return;
  const next = cloneGameConfig(draft);
  const first = next.world.pondPolygon[0];
  const last = next.world.pondPolygon.at(-1) ?? first;
  const point = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  selection = { kind: 'pond-vertex', index: next.world.pondPolygon.length };
  commitConfig({ ...next, world: { ...next.world, pondPolygon: [...next.world.pondPolygon, point] } });
});
requireElement<HTMLButtonElement>('duplicate-button').addEventListener('click', duplicateSelection);
requireElement<HTMLButtonElement>('remove-button').addEventListener('click', removeSelection);
requireElement<HTMLButtonElement>('undo-button').addEventListener('click', undo);
requireElement<HTMLButtonElement>('redo-button').addEventListener('click', redo);
requireElement<HTMLButtonElement>('fit-map-button').addEventListener('click', () => mapScene?.fitMap());
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || isReadOnly()) return;
  if (event.code === 'KeyZ') {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if (event.code === 'KeyY') {
    event.preventDefault();
    redo();
  }
});

window.addEventListener('pagehide', () => {
  assetCatalog.dispose();
  mapAssets?.dispose();
}, { once: true });

renderTopbar();
renderSection();
renderInspector();
renderStatus();
if (selectedPresetId !== null) queueDefaultSync(0);
