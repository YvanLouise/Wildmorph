import Phaser from 'phaser';
import './style.css';
import { ASSET_URLS } from './game/assets/manifest';
import { AmbienceAudio } from './game/audio/AmbienceAudio';
import { gameStore } from './game/state/GameStore';
import type { GameSnapshot } from './game/types';
import { BootScene } from './phaser/scenes/BootScene';
import { WorldScene } from './phaser/scenes/WorldScene';
import { AppUI } from './ui/AppUI';

const ambience = new AmbienceAudio(ASSET_URLS.backgroundMusic);
let assetsReady = false;
let debugVisible = false;

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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
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
  scene: [BootScene, WorldScene],
});

const getWorldScene = (): WorldScene | undefined => {
  const scene = game.scene.getScene(WorldScene.KEY);
  return scene instanceof WorldScene ? scene : undefined;
};

const startGame = (): void => {
  if (!assetsReady || gameStore.getPhase() !== 'title') {
    return;
  }
  gameStore.transition('playing');
  void ambience.start();
  game.scene.start(WorldScene.KEY);
};

const pauseGame = (): void => {
  if (gameStore.getPhase() !== 'playing') {
    return;
  }
  getWorldScene()?.clearInput();
  game.scene.pause(WorldScene.KEY);
  gameStore.transition('paused');
  void ambience.pause();
};

const continueGame = (): void => {
  if (gameStore.getPhase() !== 'paused') {
    return;
  }
  getWorldScene()?.clearInput();
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
  gameStore.transition('title');
  void ambience.stop();
};

const ui = new AppUI({
  onStart: startGame,
  onContinue: continueGame,
  onRestart: restartGame,
  onReturnToTitle: returnToTitle,
});

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
  ui.updateDebug(snapshot);
});

game.events.on('player-step', () => ambience.footstep());

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

const pauseForFocusLoss = (): void => {
  if (gameStore.getPhase() === 'playing') {
    pauseGame();
  }
};

window.addEventListener('blur', pauseForFocusLoss);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseForFocusLoss();
  }
});

if (import.meta.env.DEV) {
  window.__TUYE_DEBUG__ = {
    getSnapshot: () => gameStore.getSnapshot(),
    teleport: (index) => getWorldScene()?.teleport(index),
    resetPlayer: () => getWorldScene()?.resetPlayer(),
    setZoom: (zoom) => getWorldScene()?.setZoom(zoom),
  };
}
