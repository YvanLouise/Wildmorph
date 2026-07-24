import type { GamePhase, GameSnapshot } from '../game/types';
import { ASSET_URLS } from '../game/assets/manifest';
import { TouchControls } from './TouchControls';
import { FullscreenController } from './FullscreenController';

export interface AppUICallbacks {
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onContinue: () => void;
  readonly onRestart: () => void;
  readonly onReturnToTitle: () => void;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required UI element #${id}`);
  }
  return element as T;
}

export class AppUI {
  private readonly root = requireElement<HTMLElement>('ui-root');
  private readonly titleScreen = requireElement<HTMLElement>('title-screen');
  private readonly titleArt = requireElement<HTMLImageElement>('title-art');
  private readonly pauseScreen = requireElement<HTMLElement>('pause-screen');
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
  private hintTimer?: number;
  private noticeTimer?: number;
  private phaserAssetsReady = false;
  private titleArtReady = false;
  private titleArtFailed = false;
  private readonly touchControls: TouchControls;
  private readonly fullscreenController: FullscreenController;

  constructor(callbacks: AppUICallbacks) {
    this.touchControls = new TouchControls({ onPause: callbacks.onPause });
    this.fullscreenController = new FullscreenController();
    this.startButton.addEventListener('click', callbacks.onStart);
    this.touchPauseButton.addEventListener('click', callbacks.onPause);
    this.continueButton.addEventListener('click', callbacks.onContinue);
    this.restartButton.addEventListener('click', callbacks.onRestart);
    this.titleButton.addEventListener('click', callbacks.onReturnToTitle);
    this.codexButton.addEventListener('click', () => {
      this.showTitleNotice('图鉴将在后续版本开放');
    });
    this.settingsButton.addEventListener('click', () => {
      if (!this.fullscreenController.openSettings()) {
        this.showTitleNotice('设置将在后续版本开放');
      }
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
  }

  setAssetsReady(): void {
    this.phaserAssetsReady = true;
    this.updateStartAvailability();
  }

  setPhase(phase: GamePhase): void {
    this.root.dataset.phase = phase;
    this.titleScreen.classList.toggle('is-visible', phase === 'title');
    this.pauseScreen.classList.toggle('is-visible', phase === 'paused');
    this.titleScreen.setAttribute('aria-hidden', String(phase !== 'title'));
    this.pauseScreen.setAttribute('aria-hidden', String(phase !== 'paused'));
    this.touchControls.setPhase(phase);
    this.fullscreenController.setPhase(phase);

    if (phase === 'playing') {
      this.showControlsHint();
    } else {
      this.hideControlsHint();
    }
    if (phase !== 'title') {
      this.hideTitleNotice();
    }
  }

  setDebugVisible(visible: boolean): void {
    this.debugPanel.classList.toggle('is-visible', visible);
  }

  updateDebug(snapshot: Readonly<GameSnapshot>): void {
    const { player, runtime } = snapshot;
    this.debugStats.textContent = [
      `FPS ${runtime.fps.toFixed(0)}`,
      `X ${player.x.toFixed(1)}`,
      `Y ${player.y.toFixed(1)}`,
      `ZOOM ${runtime.cameraZoom.toFixed(1)}`,
    ].join(' · ');
  }

  private showControlsHint(): void {
    window.clearTimeout(this.hintTimer);
    this.controlsHint.classList.remove('is-faded');
    this.hintTimer = window.setTimeout(() => {
      this.controlsHint.classList.add('is-faded');
    }, 5000);
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
}
