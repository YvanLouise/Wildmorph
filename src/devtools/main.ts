import Phaser from 'phaser';
import './style.css';
import {
  cloneGameConfig,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
  type GameConfig,
} from '../game/config/GameConfig';
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
import type { ColliderDefinition, ObstacleDefinition, ObstacleKind, PointDefinition } from '../game/types';
import { MapEditorScene } from './MapEditorScene';
import { createObstacle, moveSelection, type MapSelection } from './mapOperations';

type SectionId = 'player' | 'camera' | 'audio' | 'input' | 'map';

interface NumberField {
  readonly path: string;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly help: string;
}

const SECTION_META: Record<Exclude<SectionId, 'map'>, {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly NumberField[];
}> = {
  player: {
    eyebrow: 'CREATURE MOTION',
    title: '玩家参数',
    description: '控制移动节奏、角色比例、实体碰撞体与脚步反馈。',
    fields: [
      { path: 'player.moveSpeed', label: '基础移动速度', minimum: 50, maximum: 600, step: 10, unit: 'px/s', help: '未冲刺时角色每秒移动的逻辑像素。' },
      { path: 'player.sprintMultiplier', label: '冲刺倍率', minimum: 1, maximum: 3, step: 0.1, unit: '×', help: '按住 Shift 或触控冲刺时的速度倍率。' },
      { path: 'player.visualSize', label: '角色视觉尺寸', minimum: 16, maximum: 160, step: 1, unit: 'px', help: '角色图片最长边在世界中的显示尺寸。' },
      { path: 'player.bodyWidth', label: '碰撞体宽度', minimum: 4, maximum: 128, step: 1, unit: 'px', help: '角色 Arcade Physics 矩形碰撞体宽度。' },
      { path: 'player.bodyHeight', label: '碰撞体高度', minimum: 4, maximum: 128, step: 1, unit: 'px', help: '角色 Arcade Physics 矩形碰撞体高度。' },
      { path: 'player.footstepIntervalMs', label: '脚步间隔', minimum: 80, maximum: 1000, step: 5, unit: 'ms', help: '持续移动时触发合成脚步声的时间间隔。' },
    ],
  },
  camera: {
    eyebrow: 'CAMERA RIG',
    title: '镜头参数',
    description: '调整三档开发缩放、默认档位和镜头跟随响应。',
    fields: [
      { path: 'camera.zoomLevels.0', label: '缩放档位一', minimum: 0.25, maximum: 3, step: 0.05, unit: '×', help: '按 [ 键循环到的最远镜头倍率。' },
      { path: 'camera.zoomLevels.1', label: '缩放档位二', minimum: 0.25, maximum: 3, step: 0.05, unit: '×', help: '默认的中间镜头倍率。' },
      { path: 'camera.zoomLevels.2', label: '缩放档位三', minimum: 0.25, maximum: 3, step: 0.05, unit: '×', help: '按 ] 键循环到的最近镜头倍率。' },
      { path: 'camera.defaultZoomIndex', label: '默认缩放档位', minimum: 0, maximum: 2, step: 1, help: '0、1、2 分别对应三档缩放参数。' },
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
const parameterView = requireElement<HTMLElement>('parameter-view');
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
const issueList = requireElement<HTMLElement>('issue-list');

let store: DevPresetStore = loadPresetStore(localStorage);
let selectedPresetId: string | null = store.activePresetId;
let draft = selectedPresetId
  ? cloneGameConfig(store.presets.find(({ id }) => id === selectedPresetId)?.config ?? DEFAULT_GAME_CONFIG)
  : cloneGameConfig(DEFAULT_GAME_CONFIG);
let savedSnapshot = JSON.stringify(draft);
let section: SectionId = 'player';
let selection: MapSelection | undefined;
let history: GameConfig[] = [];
let future: GameConfig[] = [];
let mapGame: Phaser.Game | undefined;
let mapScene: MapEditorScene | undefined;
let transientMessage = '';
let transientTimer: number | undefined;

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

function commitConfig(next: GameConfig, redrawControls = true): void {
  if (isReadOnly() || JSON.stringify(next) === JSON.stringify(draft)) return;
  history = [...history.slice(-49), cloneGameConfig(draft)];
  future = [];
  draft = next;
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

function renderSection(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === section);
  });
  const mapActive = section === 'map';
  mapView.hidden = !mapActive;
  parameterView.hidden = mapActive;
  if (mapActive) {
    ensureMapEditor();
    return;
  }
  const activeSection = section as Exclude<SectionId, 'map'>;
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
  `;
}

function renderInspector(): void {
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
    <div class="inspector-group"><h3>碰撞体</h3>
      <label>形状<select data-map-field="collider-shape"${disabled}>
        <option value="rectangle"${selectedOption('rectangle', obstacle.collider.shape)}>矩形</option>
        <option value="circle"${selectedOption('circle', obstacle.collider.shape)}>圆形</option>
      </select></label>
      ${colliderInputs(obstacle.collider, disabled)}
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
  return collider.shape === 'circle'
    ? mapNumberInput('半径', 'collider-radius', collider.radius, disabled, 1)
    : `${mapNumberInput('宽度', 'collider-width', collider.width, disabled, 1)}${mapNumberInput('高度', 'collider-height', collider.height, disabled, 1)}`;
}

function renderStatus(): void {
  const validation = validateGameConfig(draft);
  const dirty = isDirty();
  dirtyStatus.textContent = transientMessage || (dirty ? '有未保存修改' : '未修改');
  dirtyStatus.className = `status-item${dirty ? ' is-warning' : ''}`;
  validationStatus.textContent = validation.errors.length
    ? `${validation.errors.length} 个错误`
    : validation.warnings.length ? `${validation.warnings.length} 个警告` : '配置有效';
  validationStatus.className = `status-item${validation.errors.length ? ' is-error' : validation.warnings.length ? ' is-warning' : ''}`;
  historyStatus.textContent = `撤销 ${history.length} · 重做 ${future.length}`;
  issueList.innerHTML = validation.errors.length || validation.warnings.length
    ? [
      ...validation.errors.map((issue) => `<p><strong>错误 · ${escapeHtml(issue.path)}</strong><br>${escapeHtml(issue.message)}</p>`),
      ...validation.warnings.map((issue) => `<p><b>警告 · ${escapeHtml(issue.path)}</b><br>${escapeHtml(issue.message)}</p>`),
    ].join('')
    : '<p>当前草稿通过全部配置检查。</p>';
  saveButton.disabled = isReadOnly() || validation.errors.length > 0;
  requireElement<HTMLButtonElement>('undo-button').disabled = isReadOnly() || history.length === 0;
  requireElement<HTMLButtonElement>('redo-button').disabled = isReadOnly() || future.length === 0;
}

function ensureMapEditor(): void {
  if (mapGame) {
    requestAnimationFrame(() => mapGame?.scale.resize(
      requireElement<HTMLElement>('map-editor-host').clientWidth,
      requireElement<HTMLElement>('map-editor-host').clientHeight,
    ));
    return;
  }
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
    });
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
  store = upsertPreset(store, { ...preset, config: draft }, true);
  savePresetStore(localStorage, store);
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
  store = upsertPreset(store, preset, true);
  savePresetStore(localStorage, store);
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
  syncDraftViews();
}

function redo(): void {
  const next = future[0];
  if (!next || isReadOnly()) return;
  history = [...history.slice(-49), cloneGameConfig(draft)];
  future = future.slice(1);
  draft = next;
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
    commitConfig(updateObstacle(id, (obstacle) => ({ ...obstacle, kind, collisionOnly: kind === 'water' || obstacle.collisionOnly })), redrawControls);
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
    const collider: ColliderDefinition = element.value === 'circle'
      ? { shape: 'circle', radius: 28 }
      : { shape: 'rectangle', width: 34, height: 26 };
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
  const obstacle = createObstacle(draft, kind, point);
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

parameterView.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.configPath || isReadOnly()) return;
  commitConfig(setNumberPath(draft, input.dataset.configPath, Number(input.value)), false);
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
  store = deletePreset(store, preset.id);
  savePresetStore(localStorage, store);
  selectedPresetId = store.activePresetId;
  const active = currentPreset();
  draft = cloneGameConfig(active?.config ?? DEFAULT_GAME_CONFIG);
  savedSnapshot = JSON.stringify(draft);
  selection = undefined;
  history = [];
  future = [];
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
    store = upsertPreset(store, preset, false);
    savePresetStore(localStorage, store);
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

renderTopbar();
renderSection();
renderInspector();
renderStatus();
