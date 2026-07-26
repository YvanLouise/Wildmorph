import Phaser from 'phaser';
import './style.css';
import { ASSET_URLS } from './game/assets/manifest';
import { resolveWorldAssets } from './game/assets/worldAssetLibrary';
import { AmbienceAudio } from './game/audio/AmbienceAudio';
import { LoopingMusic } from './game/audio/LoopingMusic';
import { cloneGameConfig } from './game/config/GameConfig';
import { loadActiveGameConfig } from './game/config/devPresets';
import { touchInput } from './game/input/TouchInputState';
import { gameStore } from './game/state/GameStore';
import { SessionTimer } from './game/state/SessionTimer';
import { berryWorldSessions } from './game/resources/BerryResourceSystem';
import { grassWorldSessions } from './game/resources/GrassResourceSystem';
import type { GameSnapshot, WorldLaunchRequest } from './game/types';
import { WorldSession } from './game/world/WorldSession';
import { attachViewportSync } from './phaser/ViewportSync';
import { BootScene } from './phaser/scenes/BootScene';
import { WorldScene } from './phaser/scenes/WorldScene';
import { AppUI } from './ui/AppUI';

const gameConfig = loadActiveGameConfig(
  import.meta.env.DEV,
  typeof localStorage === 'undefined' ? undefined : localStorage,
);
const resolvedWorldAssets = await resolveWorldAssets(
  gameConfig.worldAssets,
  gameConfig.world.obstacles,
  import.meta.env.DEV,
);
touchInput.setDeadZone(gameConfig.input.joystickDeadZone);

const ambience = new AmbienceAudio(
  ASSET_URLS.backgroundMusic,
  gameConfig.audio.ambienceVolume,
  gameConfig.audio.footstepVolume,
);
const titleMusic = new LoopingMusic(ASSET_URLS.titleMusic, gameConfig.audio.titleMusicVolume);
let assetsReady = false;
let debugVisible = false;
const worldSession = new WorldSession(typeof localStorage === 'undefined' ? undefined : localStorage);
const sessionTimer = new SessionTimer();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1280,
  height: 720,
  backgroundColor: '#53624b',
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      // Match physics updates to the rendered frame rate so high-refresh displays
      // do not show repeated positions followed by visible movement jumps.
      fixedStep: false,
      debug: false,
    },
  },
  scene: [new BootScene(resolvedWorldAssets), new WorldScene(gameConfig, resolvedWorldAssets)],
});

window.addEventListener('pagehide', () => resolvedWorldAssets.dispose(), { once: true });

const getWorldScene = (): WorldScene | undefined => {
  const scene = game.scene.getScene(WorldScene.KEY);
  return scene instanceof WorldScene ? scene : undefined;
};

const startGame = (request: WorldLaunchRequest): void => {
  if (!assetsReady || gameStore.getPhase() !== 'title') {
    return;
  }
  if (!worldSession.select(request)) return;
  if (worldSession.request.mode === 'seeded' && worldSession.request.seed) {
    berryWorldSessions.reset(worldSession.request.seed);
    grassWorldSessions.reset(worldSession.request.seed);
  }
  gameStore.resetSurvival();
  gameStore.resetDayNight(gameConfig.dayNight);
  ui.updateDayNight(gameStore.getSnapshot().dayNight);
  sessionTimer.reset();
  sessionTimer.start();
  ui.updateSessionElapsed(0);
  getWorldScene()?.setLaunchRequest(worldSession.request);
  ui.setWorld(worldSession.request);
  void titleMusic.stop();
  gameStore.transition('playing');
  void ambience.start();
  game.scene.start(WorldScene.KEY);
};

const pauseGame = (): void => {
  if (gameStore.getPhase() !== 'playing') {
    return;
  }
  getWorldScene()?.clearInput();
  sessionTimer.pause();
  ui.updateSessionElapsed(sessionTimer.getElapsedMs());
  game.scene.pause(WorldScene.KEY);
  gameStore.transition('paused');
  void ambience.pause();
};

const continueGame = (): void => {
  if (gameStore.getPhase() !== 'paused') {
    return;
  }
  getWorldScene()?.clearInput();
  sessionTimer.start();
  game.scene.resume(WorldScene.KEY);
  gameStore.transition('playing');
  void ambience.resume();
};

const restartGame = (): void => {
  const phase = gameStore.getPhase();
  if (phase !== 'playing' && phase !== 'paused') {
    return;
  }
  gameStore.transition('resetting');
  if (worldSession.request.mode === 'seeded' && worldSession.request.seed) {
    berryWorldSessions.reset(worldSession.request.seed);
    grassWorldSessions.reset(worldSession.request.seed);
  }
  gameStore.resetSurvival();
  gameStore.resetDayNight(gameConfig.dayNight);
  ui.updateDayNight(gameStore.getSnapshot().dayNight);
  sessionTimer.reset();
  sessionTimer.start();
  ui.updateSessionElapsed(0);
  getWorldScene()?.setLaunchRequest(worldSession.request);
  game.scene.stop(WorldScene.KEY);
  game.scene.start(WorldScene.KEY);
  void ambience.resume();
};

const applyWorldSeed = (seed: string): void => {
  const phase = gameStore.getPhase();
  if ((phase !== 'playing' && phase !== 'paused') || !worldSession.select({ mode: 'seeded', seed })) return;
  berryWorldSessions.reset(seed);
  grassWorldSessions.reset(seed);
  ui.setWorld(worldSession.request);
  gameStore.transition('resetting');
  gameStore.resetSurvival();
  gameStore.resetDayNight(gameConfig.dayNight);
  ui.updateDayNight(gameStore.getSnapshot().dayNight);
  sessionTimer.reset();
  sessionTimer.start();
  ui.updateSessionElapsed(0);
  getWorldScene()?.setLaunchRequest(worldSession.request);
  game.scene.stop(WorldScene.KEY);
  game.scene.start(WorldScene.KEY);
  void ambience.resume();
};

const returnToTitle = (): void => {
  const phase = gameStore.getPhase();
  if (phase === 'title') {
    return;
  }
  game.scene.stop(WorldScene.KEY);
  sessionTimer.reset();
  ui.updateSessionElapsed(0);
  gameStore.transition('title');
  void ambience.stop();
  void titleMusic.start();
};

const ui = new AppUI({
  initialWorld: worldSession.request,
  onLaunch: startGame,
  onApplySeed: applyWorldSeed,
  onPause: pauseGame,
  onContinue: continueGame,
  onRestart: restartGame,
  onReturnToTitle: returnToTitle,
});

attachViewportSync(game, document.getElementById('game-stage') as HTMLElement);

gameStore.subscribe((phase) => ui.setPhase(phase));

game.events.on('assets-ready', () => {
  assetsReady = true;
  ui.setAssetsReady();
});

game.events.on('world-ready', () => {
  getWorldScene()?.setDebugVisible(debugVisible);
  if (gameStore.getPhase() === 'resetting') {
    gameStore.transition('playing');
  }
});

game.events.on('world-snapshot', (snapshot: Readonly<GameSnapshot>) => {
  ui.updateSurvival(snapshot.survival);
  ui.updateDayNight(snapshot.dayNight);
  ui.updateForaging(snapshot.foraging);
  ui.updateDebug(snapshot);
});

game.events.on('player-step', () => ambience.footstep());

document.querySelectorAll<HTMLInputElement>('[data-debug-layer]').forEach((input) => {
  input.addEventListener('change', () => {
    const layer = input.dataset.debugLayer as 'chunks' | 'terrain' | 'collision' | 'spawn' | 'wildlife';
    getWorldScene()?.setDebugLayer(layer, input.checked);
  });
});

window.addEventListener('keydown', (event) => {
  const phase = gameStore.getPhase();
  if (
    phase === 'playing' &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    event.preventDefault();
  }

  if (event.code === 'Escape') {
    event.preventDefault();
    if (ui.handleEscape()) return;
    if (phase === 'playing') {
      pauseGame();
    } else if (phase === 'paused') {
      continueGame();
    }
    return;
  }

  if (!import.meta.env.DEV || event.repeat) {
    return;
  }

  if (event.code === 'F1') {
    event.preventDefault();
    debugVisible = !debugVisible;
    ui.setDebugVisible(debugVisible);
    getWorldScene()?.setDebugVisible(debugVisible);
    return;
  }

  if (!debugVisible || phase !== 'playing') {
    return;
  }

  const scene = getWorldScene();
  if (event.code === 'BracketLeft') {
    scene?.cycleZoom(-1);
  } else if (event.code === 'BracketRight') {
    scene?.cycleZoom(1);
  } else if (/^Digit[1-4]$/.test(event.code)) {
    scene?.teleport(Number(event.code.slice(-1)) - 1);
  } else if (event.code === 'KeyR') {
    scene?.resetPlayer();
  }
});

const startTitleMusicFromInteraction = (event: Event): void => {
  if (gameStore.getPhase() !== 'title') {
    return;
  }
  if (event.target instanceof Element && event.target.closest('#start-button')) {
    return;
  }
  void titleMusic.start();
};

window.addEventListener('pointerdown', startTitleMusicFromInteraction, { passive: true });
window.addEventListener('keydown', startTitleMusicFromInteraction);

const pauseForFocusLoss = (): void => {
  if (gameStore.getPhase() === 'playing') {
    pauseGame();
  } else if (gameStore.getPhase() === 'title') {
    void titleMusic.pause();
  }
};

const resumeTitleMusicOnFocus = (): void => {
  if (gameStore.getPhase() === 'title') {
    void titleMusic.resume();
  }
};

window.addEventListener('blur', pauseForFocusLoss);
window.addEventListener('focus', resumeTitleMusicOnFocus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseForFocusLoss();
  } else {
    resumeTitleMusicOnFocus();
  }
});

if (import.meta.env.DEV) {
  window.__TUYE_DEBUG__ = {
    getSnapshot: () => gameStore.getSnapshot(),
    getConfig: () => cloneGameConfig(gameConfig),
    teleport: (index) => getWorldScene()?.teleport(index),
    resetPlayer: () => getWorldScene()?.resetPlayer(),
    setViewRange: (multiplier) => getWorldScene()?.setViewRange(multiplier),
    getChunkFingerprint: (x, y) => getWorldScene()?.getChunkFingerprint(x, y),
    getChunkData: (x, y) => getWorldScene()?.getChunkData(x, y),
    teleportToWorld: (x, y) => getWorldScene()?.teleportToWorld(x, y),
    teleportToChunk: (x, y) => getWorldScene()?.teleportToChunk(x, y),
    refreshWorld: () => getWorldScene()?.refreshWorld(),
    getWildlifeSnapshots: () => getWorldScene()?.getWildlifeSnapshots() ?? [],
    getBerrySnapshots: () => getWorldScene()?.getBerrySnapshots() ?? [],
    teleportToBerry: (id) => getWorldScene()?.teleportToBerry(id),
    getGrassSnapshots: () => getWorldScene()?.getGrassSnapshots() ?? [],
    teleportToGrass: (id) => getWorldScene()?.teleportToGrass(id),
    setSurvival: (update) => gameStore.updateSurvival(update),
    teleportToWildlife: (id) => getWorldScene()?.teleportToWildlife(id),
  };
}
