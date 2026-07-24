import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-input-mode', 'touch');
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
});

test('moves with the floating joystick and pauses from touch UI', async ({ page }) => {
  await page.locator('#start-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
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
  await page.locator('#start-button').click();
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
});

test('keeps mobile controls inside the usable stage', async ({ page }, testInfo) => {
  await page.locator('#start-button').click();
  const stage = await page.locator('#game-stage').boundingBox();
  const pause = await page.locator('#touch-pause-button').boundingBox();
  expect(pause!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(pause!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(pause!.x + pause!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  expect(pause!.y + pause!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
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
