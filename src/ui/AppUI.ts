import { ASSET_URLS } from '../game/assets/manifest';
import type {
  DayNightPhase,
  DayNightState,
  GamePhase,
  GameSnapshot,
  PlayerForagingSnapshot,
  SurvivalState,
  SurvivalStat,
  WorldLaunchRequest,
} from '../game/types';
import { formatSessionElapsed } from '../game/state/SessionTimer';
import { generateWorldSeed, normalizeWorldSeed, parseWorldSeed } from '../game/world/seed';
import { FullscreenController } from './FullscreenController';
import { TouchControls } from './TouchControls';

export interface AppUICallbacks {
  readonly initialWorld: WorldLaunchRequest;
  readonly onLaunch: (request: WorldLaunchRequest) => void;
  readonly onApplySeed: (seed: string) => void;
  readonly onPause: () => void;
  readonly onContinue: () => void;
  readonly onRestart: () => void;
  readonly onReturnToTitle: () => void;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element #${id}`);
  return element as T;
}

const SURVIVAL_STATS: readonly SurvivalStat[] = ['health', 'food', 'water', 'stamina'];
const DAY_NIGHT_PRESENTATION: Readonly<Record<DayNightPhase, { readonly label: string; readonly icon: string }>> = {
  dawn: { label: '黎明', icon: '◒' },
  day: { label: '白天', icon: '☀' },
  dusk: { label: '黄昏', icon: '◓' },
  night: { label: '夜晚', icon: '☾' },
};

export class AppUI {
  private readonly root = requireElement<HTMLElement>('ui-root');
  private readonly dayNightOverlay = requireElement<HTMLElement>('day-night-overlay');
  private readonly dayNightHud = requireElement<HTMLElement>('day-night-hud');
  private readonly dayNightIcon = requireElement<HTMLElement>('day-night-icon');
  private readonly dayNightPhase = requireElement<HTMLElement>('day-night-phase');
  private readonly dayNightTime = requireElement<HTMLTimeElement>('day-night-time');
  private readonly titleScreen = requireElement<HTMLElement>('title-screen');
  private readonly titleArt = requireElement<HTMLImageElement>('title-art');
  private readonly pauseScreen = requireElement<HTMLElement>('pause-screen');
  private readonly worldSelectScreen = requireElement<HTMLElement>('world-select-screen');
  private readonly startButton = requireElement<HTMLButtonElement>('start-button');
  private readonly codexButton = requireElement<HTMLButtonElement>('codex-button');
  private readonly settingsButton = requireElement<HTMLButtonElement>('settings-button');
  private readonly titleNotice = requireElement<HTMLElement>('title-notice');
  private readonly continueButton = requireElement<HTMLButtonElement>('continue-button');
  private readonly restartButton = requireElement<HTMLButtonElement>('restart-button');
  private readonly titleButton = requireElement<HTMLButtonElement>('title-button');
  private readonly touchPauseButton = requireElement<HTMLButtonElement>('touch-pause-button');
  private readonly loadingLabel = requireElement<HTMLElement>('loading-label');
  private readonly controlsHint = requireElement<HTMLElement>('controls-hint');
  private readonly debugPanel = requireElement<HTMLElement>('debug-panel');
  private readonly debugStats = requireElement<HTMLElement>('debug-stats');
  private readonly areaName = requireElement<HTMLElement>('area-name');
  private readonly foragingProgress = requireElement<HTMLElement>('foraging-progress');
  private readonly foragingProgressFill = requireElement<HTMLElement>('foraging-progress-fill');
  private readonly foragingProgressValue = requireElement<HTMLOutputElement>('foraging-progress-value');
  private readonly titleSeedInput = requireElement<HTMLInputElement>('title-seed-input');
  private readonly titleSeedError = requireElement<HTMLElement>('title-seed-error');
  private readonly pauseWorldPanel = requireElement<HTMLElement>('pause-world-panel');
  private readonly pauseWorldSeed = requireElement<HTMLOutputElement>('pause-world-seed');
  private readonly pauseSeedInput = requireElement<HTMLInputElement>('pause-seed-input');
  private readonly pauseSeedError = requireElement<HTMLElement>('pause-seed-error');
  private readonly sessionElapsedTime = requireElement<HTMLTimeElement>('session-elapsed-time');
  private readonly survivalItems = Object.fromEntries(SURVIVAL_STATS.map((stat) => [
    stat,
    requireElement<HTMLElement>(`survival-${stat}`),
  ])) as Record<SurvivalStat, HTMLElement>;
  private readonly survivalMeters = Object.fromEntries(SURVIVAL_STATS.map((stat) => [
    stat,
    requireElement<HTMLElement>(`survival-${stat}-meter`),
  ])) as Record<SurvivalStat, HTMLElement>;
  private readonly survivalValues = Object.fromEntries(SURVIVAL_STATS.map((stat) => [
    stat,
    requireElement<HTMLOutputElement>(`survival-${stat}-value`),
  ])) as Record<SurvivalStat, HTMLOutputElement>;
  private hintTimer?: number;
  private noticeTimer?: number;
  private phaserAssetsReady = false;
  private titleArtReady = false;
  private titleArtFailed = false;
  private readonly touchControls: TouchControls;
  private readonly fullscreenController: FullscreenController;
  private activeWorld: WorldLaunchRequest;
  private worldSelectVisible = false;

  constructor(callbacks: AppUICallbacks) {
    this.activeWorld = { ...callbacks.initialWorld };
    this.touchControls = new TouchControls({ onPause: callbacks.onPause });
    this.fullscreenController = new FullscreenController();

    this.startButton.addEventListener('click', () => this.openWorldSelect());
    requireElement<HTMLButtonElement>('close-world-select-button').addEventListener('click', () => this.closeWorldSelect());
    document.querySelector<HTMLElement>('[data-close-world-select]')?.addEventListener('click', () => this.closeWorldSelect());
    requireElement<HTMLButtonElement>('fixed-world-button').addEventListener('click', () => {
      this.closeWorldSelect();
      callbacks.onLaunch({ mode: 'fixed' });
    });
    requireElement<HTMLButtonElement>('seeded-world-button').addEventListener('click', () => {
      const seed = this.validSeed(this.titleSeedInput, this.titleSeedError);
      if (!seed) return;
      this.closeWorldSelect();
      callbacks.onLaunch({ mode: 'seeded', seed });
    });
    requireElement<HTMLButtonElement>('random-seed-button').addEventListener('click', () => {
      this.titleSeedInput.value = generateWorldSeed().text;
      this.titleSeedError.textContent = '';
    });
    requireElement<HTMLButtonElement>('copy-title-seed-button').addEventListener('click', () => {
      const seed = this.validSeed(this.titleSeedInput, this.titleSeedError);
      if (seed) void this.copySeed(seed, this.titleSeedError);
    });

    this.touchPauseButton.addEventListener('click', callbacks.onPause);
    this.continueButton.addEventListener('click', callbacks.onContinue);
    this.restartButton.addEventListener('click', callbacks.onRestart);
    this.titleButton.addEventListener('click', callbacks.onReturnToTitle);
    requireElement<HTMLButtonElement>('copy-pause-seed-button').addEventListener('click', () => {
      if (this.activeWorld.seed) void this.copySeed(this.activeWorld.seed, this.pauseSeedError);
    });
    requireElement<HTMLButtonElement>('apply-pause-seed-button').addEventListener('click', () => {
      const seed = this.validSeed(this.pauseSeedInput, this.pauseSeedError);
      if (!seed || seed === this.activeWorld.seed) return;
      if (window.confirm('应用新种子将返回出生点，继续吗？')) callbacks.onApplySeed(seed);
    });
    requireElement<HTMLButtonElement>('new-seeded-world-button').addEventListener('click', () => {
      const seed = generateWorldSeed().text;
      if (window.confirm(`创建新世界 ${seed} 并返回出生点？`)) callbacks.onApplySeed(seed);
    });
    this.titleSeedInput.addEventListener('input', () => { this.titleSeedError.textContent = ''; });
    this.pauseSeedInput.addEventListener('input', () => { this.pauseSeedError.textContent = ''; });

    this.codexButton.addEventListener('click', () => this.showTitleNotice('图鉴将在后续版本开放'));
    this.settingsButton.addEventListener('click', () => {
      if (!this.fullscreenController.openSettings()) this.showTitleNotice('设置将在后续版本开放');
    });

    this.titleArt.addEventListener('load', () => {
      this.titleArtReady = true;
      this.updateStartAvailability();
    }, { once: true });
    this.titleArt.addEventListener('error', () => {
      this.titleArtReady = true;
      this.titleArtFailed = true;
      this.titleScreen.classList.add('is-art-missing');
      this.loadingLabel.textContent = '首页图像未能载入，仍可开始探索';
      this.updateStartAvailability();
    }, { once: true });
    this.titleArt.src = ASSET_URLS.titleScreen;
    requireElement<HTMLImageElement>('title-yl-logo').src = ASSET_URLS.ylLogo;
    requireElement<HTMLImageElement>('survival-health-icon').src = ASSET_URLS.healthIcon;
    requireElement<HTMLImageElement>('survival-food-icon').src = ASSET_URLS.foodIcon;
    requireElement<HTMLImageElement>('survival-water-icon').src = ASSET_URLS.waterIcon;
    requireElement<HTMLImageElement>('survival-stamina-icon').src = ASSET_URLS.staminaIcon;
    this.syncWorldUI();
  }

  setAssetsReady(): void {
    this.phaserAssetsReady = true;
    this.updateStartAvailability();
  }

  setPhase(phase: GamePhase): void {
    this.root.dataset.phase = phase;
    this.dayNightOverlay.classList.toggle('is-visible', phase !== 'title');
    this.titleScreen.classList.toggle('is-visible', phase === 'title');
    this.pauseScreen.classList.toggle('is-visible', phase === 'paused');
    this.titleScreen.setAttribute('aria-hidden', String(phase !== 'title'));
    this.pauseScreen.setAttribute('aria-hidden', String(phase !== 'paused'));
    this.touchControls.setPhase(phase);
    this.fullscreenController.setPhase(phase);
    if (phase !== 'title') this.closeWorldSelect();
    if (phase === 'playing') this.showControlsHint();
    else this.hideControlsHint();
    if (phase !== 'title') this.hideTitleNotice();
  }

  setWorld(request: WorldLaunchRequest): void {
    this.activeWorld = { ...request };
    this.syncWorldUI();
  }

  handleEscape(): boolean {
    if (!this.worldSelectVisible) return false;
    this.closeWorldSelect();
    return true;
  }

  setDebugVisible(visible: boolean): void {
    this.debugPanel.classList.toggle('is-visible', visible);
  }

  updateDebug(snapshot: Readonly<GameSnapshot>): void {
    const { dayNight, player, runtime, world } = snapshot;
    this.debugStats.textContent = [
      `FPS ${runtime.fps.toFixed(0)}`,
      `X ${player.x.toFixed(1)}`,
      `Y ${player.y.toFixed(1)}`,
      `VIEW ${runtime.cameraViewIndex + 1} / ${runtime.cameraHalfWidthBodyMultiplier.toFixed(1)}×`,
      `SPAN ${runtime.cameraWorldWidth.toFixed(0)}×${runtime.cameraWorldHeight.toFixed(0)}`,
      `ZOOM ${runtime.cameraZoom.toFixed(2)}`,
      `${dayNight.phase.toUpperCase()} ${dayNight.clockText}`,
      world.seed ?? 'FIXED',
      world.chunk ? `CHUNK ${world.chunk.x},${world.chunk.y}` : '',
      `ACTIVE ${world.activeChunks}`,
      `CACHE ${world.cachedChunks}`,
      `OBJ ${world.objectCount}`,
      `BODY ${world.colliderCount}`,
      `GEN ${world.lastGenerationMs.toFixed(1)}ms`,
      `BERRY ${world.resources.activeRipeBushes}/${world.resources.activeEmptyBushes}`,
      `BERRY-MOD ${world.resources.modifiedBushes}`,
      `EAT ${world.resources.activeConsumers}`,
      `GRASS ${world.resources.activeGrassPatches}/${world.resources.grazingGrassPatches}`,
      `GRAZE ${world.resources.grassConsumers}`,
      `GRASS-REFRESH ${world.resources.grassRefreshes}`,
      world.resources.playerInShallowWater ? 'SHALLOW +WATER' : '',
      `ANIMAL ${world.wildlife.activeAnimals}/${world.wildlife.sleepingAnimals}`,
      `AI ${world.wildlife.lastSimulationMs.toFixed(1)}ms`,
      Object.entries(world.wildlife.byState).map(([state, count]) => `${state.toUpperCase()} ${count}`).join('/'),
    ].filter(Boolean).join(' · ');
  }

  updateSurvival(survival: Readonly<SurvivalState>): void {
    for (const stat of SURVIVAL_STATS) {
      const value = Math.round(survival[stat]);
      const item = this.survivalItems[stat];
      const meter = this.survivalMeters[stat];
      this.survivalValues[stat].value = String(value);
      meter.style.setProperty('--survival-value', `${value}%`);
      meter.setAttribute('aria-valuenow', String(value));
      item.classList.toggle('is-low', value <= 25);
      item.classList.toggle('is-warning', value > 25 && value <= 50);
    }
  }

  updateDayNight(dayNight: Readonly<DayNightState>): void {
    const presentation = DAY_NIGHT_PRESENTATION[dayNight.phase];
    this.dayNightOverlay.style.backgroundColor = dayNight.lighting.color;
    this.dayNightOverlay.style.opacity = String(dayNight.lighting.opacity);
    this.dayNightOverlay.dataset.phase = dayNight.phase;
    this.dayNightHud.dataset.phase = dayNight.phase;
    this.dayNightHud.setAttribute('aria-label', `${presentation.label} ${dayNight.clockText}`);
    this.dayNightIcon.textContent = presentation.icon;
    this.dayNightPhase.textContent = presentation.label;
    this.dayNightTime.textContent = dayNight.clockText;
    this.dayNightTime.dateTime = dayNight.clockText;
  }

  updateForaging(foraging: Readonly<PlayerForagingSnapshot>): void {
    const percent = Math.round(foraging.progress * 100);
    this.foragingProgress.classList.toggle('is-visible', foraging.active);
    this.foragingProgress.setAttribute('aria-hidden', String(!foraging.active));
    this.foragingProgress.setAttribute('aria-valuenow', String(percent));
    this.foragingProgressFill.style.width = `${percent}%`;
    this.foragingProgressValue.value = `${percent}%`;
  }

  updateSessionElapsed(elapsedMs: number): void {
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    this.sessionElapsedTime.textContent = formatSessionElapsed(elapsedMs);
    this.sessionElapsedTime.dateTime = `PT${elapsedSeconds}S`;
    this.sessionElapsedTime.dataset.elapsedMs = String(Math.round(elapsedMs));
  }

  private showControlsHint(): void {
    window.clearTimeout(this.hintTimer);
    this.controlsHint.classList.remove('is-faded');
    this.hintTimer = window.setTimeout(() => this.controlsHint.classList.add('is-faded'), 5000);
  }

  private hideControlsHint(): void {
    window.clearTimeout(this.hintTimer);
    this.controlsHint.classList.add('is-faded');
  }

  private updateStartAvailability(): void {
    const ready = this.phaserAssetsReady && this.titleArtReady;
    this.startButton.disabled = !ready;
    this.loadingLabel.classList.toggle('is-ready', ready && !this.titleArtFailed);
  }

  private showTitleNotice(message: string): void {
    window.clearTimeout(this.noticeTimer);
    this.titleNotice.textContent = message;
    this.titleNotice.classList.add('is-visible');
    this.noticeTimer = window.setTimeout(() => this.hideTitleNotice(), 1800);
  }

  private hideTitleNotice(): void {
    window.clearTimeout(this.noticeTimer);
    this.titleNotice.classList.remove('is-visible');
    this.titleNotice.textContent = '';
  }

  private openWorldSelect(): void {
    this.worldSelectVisible = true;
    this.titleSeedInput.value = this.activeWorld.seed ?? generateWorldSeed().text;
    this.titleSeedError.textContent = '';
    this.worldSelectScreen.classList.add('is-visible');
    this.worldSelectScreen.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => requireElement<HTMLButtonElement>('fixed-world-button').focus());
  }

  private closeWorldSelect(): void {
    if (!this.worldSelectVisible) return;
    this.worldSelectVisible = false;
    this.worldSelectScreen.classList.remove('is-visible');
    this.worldSelectScreen.setAttribute('aria-hidden', 'true');
    if (this.root.dataset.phase === 'title') this.startButton.focus();
  }

  private syncWorldUI(): void {
    const seeded = this.activeWorld.mode === 'seeded' && Boolean(this.activeWorld.seed);
    this.areaName.textContent = seeded ? '种子世界' : '初生浅林';
    this.pauseWorldPanel.classList.toggle('is-visible', seeded);
    if (seeded && this.activeWorld.seed) {
      this.titleSeedInput.value = this.activeWorld.seed;
      this.pauseWorldSeed.value = this.activeWorld.seed;
      this.pauseSeedInput.value = this.activeWorld.seed;
    }
  }

  private validSeed(input: HTMLInputElement, error: HTMLElement): string | undefined {
    input.value = normalizeWorldSeed(input.value);
    const seed = parseWorldSeed(input.value);
    error.textContent = seed ? '' : '请输入格式为 TY-XXXX-XXXX 的有效种子';
    return seed?.text;
  }

  private async copySeed(seed: string, status: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(seed);
      status.textContent = '种子已复制';
    } catch {
      status.textContent = `请手动复制：${seed}`;
    }
  }
}
