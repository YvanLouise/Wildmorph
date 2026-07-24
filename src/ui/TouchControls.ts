import { touchInput } from '../game/input/TouchInputState';
import type { GamePhase, InputMode, SafeAreaInsets, ViewportState } from '../game/types';

const LOGICAL_VIEW_HEIGHT = 720;
const JOYSTICK_RADIUS = 56;
const JOYSTICK_MAX_DISTANCE = 48;
const JOYSTICK_KNOB_TRAVEL = 40;

interface TouchControlsCallbacks {
  readonly onPause: () => void;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required touch UI element #${id}`);
  }
  return element as T;
}

function toPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class TouchControls {
  private readonly root = requireElement<HTMLElement>('ui-root');
  private readonly stage = requireElement<HTMLElement>('game-stage');
  private readonly safeAreaProbe = requireElement<HTMLElement>('safe-area-probe');
  private readonly controls = requireElement<HTMLElement>('touch-controls');
  private readonly zone = requireElement<HTMLElement>('joystick-zone');
  private readonly joystick = requireElement<HTMLElement>('joystick-visual');
  private readonly knob = requireElement<HTMLElement>('joystick-knob');
  private readonly sprintButton = requireElement<HTMLButtonElement>('touch-sprint-button');
  private readonly orientationOverlay = requireElement<HTMLElement>('orientation-overlay');
  private readonly coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
  private phase: GamePhase = 'title';
  private pointerId?: number;
  private sprintPointerId?: number;
  private center = { x: 0, y: 0 };
  private viewportState!: ViewportState;

  constructor(private readonly callbacks: TouchControlsCallbacks) {
    this.zone.addEventListener('pointerdown', this.onPointerDown);
    this.zone.addEventListener('pointermove', this.onPointerMove);
    this.zone.addEventListener('pointerup', this.onPointerEnd);
    this.zone.addEventListener('pointercancel', this.onPointerEnd);
    this.zone.addEventListener('lostpointercapture', this.onPointerEnd);
    this.sprintButton.addEventListener('pointerdown', this.onSprintStart);
    this.sprintButton.addEventListener('pointerup', this.onSprintEnd);
    this.sprintButton.addEventListener('pointercancel', this.onSprintEnd);
    this.sprintButton.addEventListener('lostpointercapture', this.onSprintEnd);
    this.coarsePointerQuery.addEventListener('change', this.updateViewport);
    window.addEventListener('resize', this.updateViewport, { passive: true });
    window.addEventListener('orientationchange', this.updateViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', this.updateViewport, { passive: true });
    window.addEventListener('blur', this.clearAllControls);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.updateViewport();
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.controls.setAttribute('aria-hidden', String(phase !== 'playing'));
    if (phase !== 'playing') {
      this.clearAllControls();
    }
  }

  clear(): void {
    this.clearAllControls();
  }

  getViewportState(): Readonly<ViewportState> {
    return {
      ...this.viewportState,
      safeArea: { ...this.viewportState.safeArea },
    };
  }

  private readonly updateViewport = (): void => {
    const stageBounds = this.stage.getBoundingClientRect();
    const inputMode: InputMode = this.isTouchDevice() ? 'touch' : 'keyboard';
    const orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    const safeArea = this.measureSafeArea();

    this.viewportState = {
      width: stageBounds.width,
      height: stageBounds.height,
      orientation,
      inputMode,
      safeArea,
      baseCameraZoom: stageBounds.height / LOGICAL_VIEW_HEIGHT,
    };

    document.documentElement.dataset.inputMode = inputMode;
    this.root.dataset.inputMode = inputMode;
    this.root.dataset.orientation = orientation;
    this.orientationOverlay.classList.toggle(
      'is-visible',
      inputMode === 'touch' && orientation === 'portrait',
    );
    this.orientationOverlay.setAttribute(
      'aria-hidden',
      String(inputMode !== 'touch' || orientation !== 'portrait'),
    );

    if (inputMode !== 'touch' || orientation === 'portrait') {
      this.clearAllControls();
    }
    if (inputMode === 'touch' && orientation === 'portrait' && this.phase === 'playing') {
      this.callbacks.onPause();
    }
  };

  private isTouchDevice(): boolean {
    return this.coarsePointerQuery.matches || navigator.maxTouchPoints > 0;
  }

  private measureSafeArea(): SafeAreaInsets {
    const styles = getComputedStyle(this.safeAreaProbe);
    return {
      top: toPixels(styles.paddingTop),
      right: toPixels(styles.paddingRight),
      bottom: toPixels(styles.paddingBottom),
      left: toPixels(styles.paddingLeft),
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (
      this.pointerId !== undefined
      || this.phase !== 'playing'
      || this.viewportState.inputMode !== 'touch'
      || this.viewportState.orientation !== 'landscape'
    ) {
      return;
    }

    event.preventDefault();
    this.pointerId = event.pointerId;
    const bounds = this.zone.getBoundingClientRect();
    this.center = {
      x: Math.min(Math.max(event.clientX - bounds.left, JOYSTICK_RADIUS), bounds.width - JOYSTICK_RADIUS),
      y: Math.min(Math.max(event.clientY - bounds.top, JOYSTICK_RADIUS), bounds.height - JOYSTICK_RADIUS),
    };
    this.joystick.style.left = `${this.center.x}px`;
    this.joystick.style.top = `${this.center.y}px`;
    this.joystick.classList.add('is-active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    touchInput.setVector(0, 0);
    try {
      this.zone.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser cancels the touch during rotation.
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    event.preventDefault();
    const bounds = this.zone.getBoundingClientRect();
    const x = (event.clientX - bounds.left - this.center.x) / JOYSTICK_MAX_DISTANCE;
    const y = (event.clientY - bounds.top - this.center.y) / JOYSTICK_MAX_DISTANCE;
    const snapshot = touchInput.setVector(x, y);
    this.knob.style.transform = [
      'translate(-50%, -50%)',
      `translate(${snapshot.vector.x * JOYSTICK_KNOB_TRAVEL}px, ${snapshot.vector.y * JOYSTICK_KNOB_TRAVEL}px)`,
    ].join(' ');
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.clearPointer();
  };

  private readonly onSprintStart = (event: PointerEvent): void => {
    if (
      this.sprintPointerId !== undefined
      || this.phase !== 'playing'
      || this.viewportState.inputMode !== 'touch'
      || this.viewportState.orientation !== 'landscape'
    ) {
      return;
    }

    event.preventDefault();
    this.sprintPointerId = event.pointerId;
    this.sprintButton.classList.add('is-active');
    this.sprintButton.setAttribute('aria-pressed', 'true');
    touchInput.setSprint(true);
    try {
      this.sprintButton.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and rotation cancellation may not permit capture.
    }
  };

  private readonly onSprintEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.sprintPointerId) {
      return;
    }
    this.clearSprint();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearAllControls();
    }
  };

  private readonly clearAllControls = (): void => {
    this.clearPointer();
    this.clearSprint();
    touchInput.clear();
  };

  private clearPointer(): void {
    if (this.pointerId !== undefined && this.zone.hasPointerCapture(this.pointerId)) {
      this.zone.releasePointerCapture(this.pointerId);
    }
    this.pointerId = undefined;
    touchInput.clearMovement();
    this.joystick.classList.remove('is-active');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private clearSprint(): void {
    if (
      this.sprintPointerId !== undefined
      && this.sprintButton.hasPointerCapture(this.sprintPointerId)
    ) {
      this.sprintButton.releasePointerCapture(this.sprintPointerId);
    }
    this.sprintPointerId = undefined;
    touchInput.setSprint(false);
    this.sprintButton.classList.remove('is-active');
    this.sprintButton.setAttribute('aria-pressed', 'false');
  }
}
