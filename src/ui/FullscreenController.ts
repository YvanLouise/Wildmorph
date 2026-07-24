import type { GamePhase } from '../game/types';

type FullscreenDocument = Document & {
  readonly webkitFullscreenElement?: Element | null;
  readonly webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required fullscreen UI element #${id}`);
  }
  return element as T;
}

export class FullscreenController {
  private readonly prompt = requireElement<HTMLElement>('mobile-fullscreen-prompt');
  private readonly promptStatus = requireElement<HTMLElement>('fullscreen-prompt-status');
  private readonly enableButton = requireElement<HTMLButtonElement>('enable-fullscreen-button');
  private readonly skipButton = requireElement<HTMLButtonElement>('skip-fullscreen-button');
  private readonly settingsScreen = requireElement<HTMLElement>('mobile-settings-screen');
  private readonly settingsStatus = requireElement<HTMLElement>('settings-fullscreen-status');
  private readonly settingsButton = requireElement<HTMLButtonElement>('settings-fullscreen-button');
  private readonly closeSettingsButton = requireElement<HTMLButtonElement>('close-mobile-settings-button');
  private readonly fullscreenDocument = document as FullscreenDocument;
  private readonly fullscreenElement = document.documentElement as FullscreenElement;
  private readonly touchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    || navigator.maxTouchPoints > 0;
  private readonly supported = this.detectSupport();

  constructor() {
    this.enableButton.addEventListener('click', () => void this.enterFullscreen('prompt'));
    this.skipButton.addEventListener('click', () => this.hidePrompt());
    this.settingsButton.addEventListener('click', () => void this.toggleFullscreen());
    this.closeSettingsButton.addEventListener('click', () => this.closeSettings());
    document.addEventListener('fullscreenchange', this.updateState);
    document.addEventListener('webkitfullscreenchange', this.updateState);
    document.addEventListener('fullscreenerror', this.onFullscreenError);
    document.addEventListener('webkitfullscreenerror', this.onFullscreenError);

    this.enableButton.disabled = !this.supported;
    this.settingsButton.disabled = !this.supported;
    this.updateState();
    if (this.touchDevice) {
      this.showPrompt();
    }
  }

  openSettings(): boolean {
    if (!this.touchDevice) {
      return false;
    }
    this.hidePrompt();
    this.settingsScreen.classList.add('is-visible');
    this.settingsScreen.setAttribute('aria-hidden', 'false');
    this.updateState();
    window.requestAnimationFrame(() => {
      (this.supported ? this.settingsButton : this.closeSettingsButton).focus();
    });
    return true;
  }

  setPhase(phase: GamePhase): void {
    if (phase !== 'title') {
      this.hidePrompt();
      this.closeSettings();
    }
  }

  private detectSupport(): boolean {
    const standardSupported = document.fullscreenEnabled && Boolean(this.fullscreenElement.requestFullscreen);
    const webkitSupported = this.fullscreenDocument.webkitFullscreenEnabled !== false
      && Boolean(this.fullscreenElement.webkitRequestFullscreen);
    return standardSupported || webkitSupported;
  }

  private isFullscreen(): boolean {
    return Boolean(document.fullscreenElement || this.fullscreenDocument.webkitFullscreenElement);
  }

  private showPrompt(): void {
    this.prompt.classList.add('is-visible');
    this.prompt.setAttribute('aria-hidden', 'false');
    this.promptStatus.textContent = this.supported
      ? '全屏可减少浏览器栏遮挡，获得更完整的横屏视野。'
      : '当前浏览器不支持网页全屏，你仍然可以正常游玩。';
    window.requestAnimationFrame(() => {
      (this.supported ? this.enableButton : this.skipButton).focus();
    });
  }

  private hidePrompt(): void {
    this.prompt.classList.remove('is-visible');
    this.prompt.setAttribute('aria-hidden', 'true');
  }

  private closeSettings(): void {
    this.settingsScreen.classList.remove('is-visible');
    this.settingsScreen.setAttribute('aria-hidden', 'true');
  }

  private async enterFullscreen(source: 'prompt' | 'settings'): Promise<void> {
    if (!this.supported || this.isFullscreen()) {
      return;
    }
    try {
      if (this.fullscreenElement.requestFullscreen) {
        await this.fullscreenElement.requestFullscreen();
      } else {
        await this.fullscreenElement.webkitRequestFullscreen?.();
      }
      this.hidePrompt();
      if (source === 'settings') {
        this.closeSettings();
      }
    } catch {
      const message = '未能进入全屏，请检查浏览器权限后重试。';
      if (source === 'prompt') {
        this.promptStatus.textContent = message;
      } else {
        this.settingsStatus.textContent = message;
      }
    }
  }

  private async toggleFullscreen(): Promise<void> {
    if (!this.supported) {
      return;
    }
    if (!this.isFullscreen()) {
      await this.enterFullscreen('settings');
      return;
    }
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        await this.fullscreenDocument.webkitExitFullscreen?.();
      }
    } catch {
      this.settingsStatus.textContent = '未能退出全屏，请使用浏览器的返回手势重试。';
    }
  }

  private readonly updateState = (): void => {
    const fullscreen = this.isFullscreen();
    this.settingsButton.textContent = fullscreen ? '退出全屏模式' : '开启全屏模式';
    this.settingsButton.setAttribute('aria-pressed', String(fullscreen));
    this.settingsStatus.textContent = !this.supported
      ? '当前浏览器不支持网页全屏。'
      : fullscreen
        ? '当前已进入全屏模式。'
        : '当前未开启全屏模式。';
  };

  private readonly onFullscreenError = (): void => {
    const message = '浏览器拒绝了全屏请求，可稍后在设置中重试。';
    if (this.settingsScreen.classList.contains('is-visible')) {
      this.settingsStatus.textContent = message;
    } else {
      this.promptStatus.textContent = message;
    }
  };
}
