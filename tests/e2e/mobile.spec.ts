import { expect, test, type Page } from '@playwright/test';

const fullscreenPromptTest = 'prompts for fullscreen and keeps it available in settings';
const rotatedLaunchTest = 'keeps the canvas aspect after rotating before launch';

async function expectCanvasAspectMatchesDisplay(page: Page): Promise<void> {
  await expect.poll(async () => page.locator('#game-root canvas').evaluate((canvas) => {
    const drawingSurface = canvas as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const drawingRatio = drawingSurface.width / drawingSurface.height;
    const displayRatio = bounds.width / bounds.height;
    return Math.abs(drawingRatio - displayRatio);
  })).toBeLessThan(0.02);
}

async function startFixedWorld(page: Page): Promise<void> {
  await page.locator('#start-button').click();
  await expect(page.locator('#world-select-screen')).toHaveClass(/is-visible/);
  await page.locator('#fixed-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(
    testInfo.title === rotatedLaunchTest
      ? { width: 390, height: 844 }
      : { width: 844, height: 390 },
  );
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-input-mode', 'touch');
  if (testInfo.title !== fullscreenPromptTest) {
    await page.locator('#skip-fullscreen-button').click();
    await expect(page.locator('#mobile-fullscreen-prompt')).not.toHaveClass(/is-visible/);
  }
});

test(rotatedLaunchTest, async ({ page }, testInfo) => {
  await expect(page.locator('#orientation-overlay')).toHaveClass(/is-visible/);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#orientation-overlay')).not.toHaveClass(/is-visible/);
  await startFixedWorld(page);
  await expectCanvasAspectMatchesDisplay(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-rotate-before-launch.png') });
});

test(fullscreenPromptTest, async ({ page }, testInfo) => {
  await expect(page.locator('#mobile-fullscreen-prompt')).toHaveClass(/is-visible/);
  await expect(page.locator('#enable-fullscreen-button')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('mobile-fullscreen-prompt.png') });

  await page.locator('#skip-fullscreen-button').click();
  await expect(page.locator('#mobile-fullscreen-prompt')).not.toHaveClass(/is-visible/);
  await page.locator('#settings-button').click();
  await expect(page.locator('#mobile-settings-screen')).toHaveClass(/is-visible/);
  await expect(page.locator('#settings-fullscreen-button')).toBeEnabled();

  await page.locator('#settings-fullscreen-button').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('#mobile-settings-screen')).not.toHaveClass(/is-visible/);

  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-fullscreen-button')).toHaveText('退出全屏模式');
  await page.locator('#settings-fullscreen-button').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test('adapts the title to landscape and gates portrait play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#orientation-overlay')).toHaveClass(/is-visible/);
  await expect(page.locator('#ui-root')).toHaveAttribute('data-orientation', 'portrait');

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#orientation-overlay')).not.toHaveClass(/is-visible/);
  await expect(page.locator('#ui-root')).toHaveAttribute('data-orientation', 'landscape');

  const stage = await page.locator('#game-stage').boundingBox();
  const frame = await page.locator('#title-frame').boundingBox();
  expect(stage?.width).toBeCloseTo(844, 0);
  expect(stage?.height).toBeCloseTo(390, 0);
  expect((frame?.width ?? 0) / (frame?.height ?? 1)).toBeCloseTo(1672 / 941, 2);
  expect(frame?.height).toBeLessThanOrEqual(stage?.height ?? 0);

  const start = await page.locator('#start-button').boundingBox();
  expect((start!.x - frame!.x) / frame!.width).toBeCloseTo(0.3895, 2);
  expect((start!.y - frame!.y) / frame!.height).toBeCloseTo(0.7385, 2);

  await page.locator('#start-button').click();
  await expect(page.locator('#world-select-screen')).toHaveClass(/is-visible/);
  const selector = await page.locator('.world-select-card').boundingBox();
  expect(selector!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(selector!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(selector!.x + selector!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  expect(selector!.y + selector!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  await page.locator('#close-world-select-button').click();
});

test('moves with the floating joystick and pauses from touch UI', async ({ page }) => {
  await startFixedWorld(page);
  await expect(page.locator('#touch-pause-button')).toBeVisible();
  await expect(page.locator('#touch-sprint-button')).toBeVisible();

  const zone = await page.locator('#joystick-zone').boundingBox();
  expect(zone).not.toBeNull();
  const startX = zone!.x + Math.min(180, zone!.width * 0.45);
  const startY = zone!.y + zone!.height * 0.65;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY);
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(200);
  await page.locator('#touch-sprint-button').dispatchEvent('pointerdown', {
    pointerId: 42,
    pointerType: 'touch',
  });
  await expect(page.locator('#touch-sprint-button')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(300);
  await page.locator('#touch-sprint-button').dispatchEvent('pointerup', {
    pointerId: 42,
    pointerType: 'touch',
  });
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(200);
  await page.waitForTimeout(250);
  const movedX = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0);
  expect(movedX).toBeGreaterThan(1240);
  await page.mouse.up();

  const stoppedX = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0);
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0)).toBeCloseTo(stoppedX, 2);

  await page.locator('#touch-pause-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#joystick-zone')).not.toBeVisible();
});

test('clears movement and stays paused after a portrait rotation', async ({ page }) => {
  await startFixedWorld(page);
  const zone = await page.locator('#joystick-zone').boundingBox();
  const x = zone!.x + zone!.width * 0.4;
  const y = zone!.y + zone!.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y - 70);
  await page.waitForTimeout(180);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#orientation-overlay')).toHaveClass(/is-visible/);
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'paused');
  await page.mouse.up();
  const paused = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  await page.waitForTimeout(220);
  const stable = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  expect(stable?.x).toBeCloseTo(paused?.x ?? 0, 2);
  expect(stable?.y).toBeCloseTo(paused?.y ?? 0, 2);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#orientation-overlay')).not.toHaveClass(/is-visible/);
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#continue-button')).toBeVisible();
  await expectCanvasAspectMatchesDisplay(page);
});

test('keeps mobile controls inside the usable stage', async ({ page }, testInfo) => {
  await startFixedWorld(page);
  const stage = await page.locator('#game-stage').boundingBox();
  const pause = await page.locator('#touch-pause-button').boundingBox();
  const survivalHud = await page.locator('#survival-hud').boundingBox();
  const areaChip = await page.locator('.area-chip').boundingBox();
  expect(pause!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(pause!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(pause!.x + pause!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  expect(pause!.y + pause!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  expect(survivalHud!.x + survivalHud!.width).toBeLessThanOrEqual(pause!.x);
  expect(survivalHud!.x).toBeGreaterThanOrEqual(areaChip!.x + areaChip!.width);
  expect(survivalHud!.y).toBeGreaterThanOrEqual(stage!.y);
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape.png') });

  const zone = await page.locator('#joystick-zone').boundingBox();
  const joystickX = zone!.x + zone!.width * 0.35;
  const joystickY = zone!.y + zone!.height * 0.6;
  await page.mouse.move(joystickX, joystickY);
  await page.mouse.down();
  await page.mouse.move(joystickX + 70, joystickY - 35);
  await page.screenshot({ path: testInfo.outputPath('mobile-joystick-active.png') });
  await page.locator('#touch-sprint-button').dispatchEvent('pointerdown', {
    pointerId: 43,
    pointerType: 'touch',
  });
  await page.screenshot({ path: testInfo.outputPath('mobile-sprint-active.png') });
  await page.locator('#touch-sprint-button').dispatchEvent('pointerup', {
    pointerId: 43,
    pointerType: 'touch',
  });
  await page.mouse.up();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('mobile-portrait-prompt.png') });
});
