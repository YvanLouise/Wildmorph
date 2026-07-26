import Phaser from 'phaser';

const SETTLE_DELAYS = [120, 320] as const;

/**
 * Keeps Phaser's drawing buffer aligned with the final CSS viewport size.
 * Mobile browsers can report an intermediate portrait size while rotating or
 * entering fullscreen, so resize again after the browser chrome settles.
 */
export function attachViewportSync(game: Phaser.Game, stage: HTMLElement): () => void {
  let animationFrame = 0;
  let nestedAnimationFrame = 0;
  const settleTimers = new Set<number>();

  const resizeGame = (): void => {
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const current = game.scale.gameSize;

    if (Math.abs(current.width - width) <= 1 && Math.abs(current.height - height) <= 1) {
      return;
    }

    game.scale.resize(width, height);
  };

  const resizeAfterLayout = (): void => {
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(nestedAnimationFrame);
    animationFrame = requestAnimationFrame(() => {
      nestedAnimationFrame = requestAnimationFrame(resizeGame);
    });
  };

  const scheduleResize = (): void => {
    resizeAfterLayout();
    settleTimers.forEach((timer) => window.clearTimeout(timer));
    settleTimers.clear();

    SETTLE_DELAYS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        settleTimers.delete(timer);
        resizeAfterLayout();
      }, delay);
      settleTimers.add(timer);
    });
  };

  const observer = new ResizeObserver(scheduleResize);
  observer.observe(stage);
  window.addEventListener('resize', scheduleResize, { passive: true });
  window.addEventListener('orientationchange', scheduleResize, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true });
  document.addEventListener('fullscreenchange', scheduleResize);
  document.addEventListener('webkitfullscreenchange', scheduleResize);
  scheduleResize();

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', scheduleResize);
    window.removeEventListener('orientationchange', scheduleResize);
    window.visualViewport?.removeEventListener('resize', scheduleResize);
    document.removeEventListener('fullscreenchange', scheduleResize);
    document.removeEventListener('webkitfullscreenchange', scheduleResize);
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(nestedAnimationFrame);
    settleTimers.forEach((timer) => window.clearTimeout(timer));
  };
}
