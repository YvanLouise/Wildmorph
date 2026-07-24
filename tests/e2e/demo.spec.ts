import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title === 'allows exploration when the title art cannot load') {
    await page.route('**/*', async (route) => {
      if (
        route.request().resourceType() === 'image'
        && decodeURIComponent(route.request().url()).includes('/art/ui/title/蜕野首页ui1.png')
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
  }
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
});

test('renders the title art and keeps all hotspots aligned', async ({ page }) => {
  const titleArt = page.locator('#title-art');
  await expect(titleArt).toBeVisible();
  expect(await titleArt.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 1672, height: 941 });

  const expectedHotspots = {
    'start-button': { left: 0.3895, top: 0.7385, width: 0.2155, height: 0.093 },
    'codex-button': { left: 0.3935, top: 0.8675, width: 0.0945, height: 0.0665 },
    'settings-button': { left: 0.507, top: 0.8675, width: 0.0945, height: 0.0665 },
  } as const;

  const assertHotspotAlignment = async () => {
    const stage = await page.locator('#game-stage').boundingBox();
    expect(stage).not.toBeNull();
    if (!stage) return;

    for (const [id, expected] of Object.entries(expectedHotspots)) {
      const hotspot = await page.locator(`#${id}`).boundingBox();
      expect(hotspot).not.toBeNull();
      if (!hotspot) continue;

      expect((hotspot.x - stage.x) / stage.width).toBeCloseTo(expected.left, 2);
      expect((hotspot.y - stage.y) / stage.height).toBeCloseTo(expected.top, 2);
      expect(hotspot.width / stage.width).toBeCloseTo(expected.width, 2);
      expect(hotspot.height / stage.height).toBeCloseTo(expected.height, 2);
    }
  };

  await assertHotspotAlignment();
  await page.setViewportSize({ width: 800, height: 700 });
  await assertHotspotAlignment();

  await page.locator('#codex-button').hover();
  expect(await page.locator('#codex-button').evaluate((button) => (
    getComputedStyle(button).backgroundColor
  ))).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('#settings-button').focus();
  await expect(page.locator('#settings-button')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedTransitionSeconds = await page.locator('#settings-button').evaluate((button) => (
    Number.parseFloat(getComputedStyle(button).transitionDuration)
  ));
  expect(reducedTransitionSeconds).toBeLessThanOrEqual(0.000001);

  await page.locator('#codex-button').click();
  await expect(page.locator('#title-notice')).toHaveText('图鉴将在后续版本开放');
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('#title-notice')).not.toHaveClass(/is-visible/, { timeout: 2500 });

  await page.locator('#settings-button').click();
  await expect(page.locator('#title-notice')).toHaveText('设置将在后续版本开放');
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'title');
});

test('allows exploration when the title art cannot load', async ({ page }) => {
  await expect(page.locator('#title-screen')).toHaveClass(/is-art-missing/);
  await expect(page.locator('#loading-label')).toHaveText('首页图像未能载入，仍可开始探索');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
});

test('starts, moves, pauses, resets, and returns to title', async ({ page }) => {
  const musicResponsePromise = page.waitForResponse((response) => (
    response.url().includes('.ogg') && [200, 206].includes(response.status())
  ));
  await page.locator('#start-button').click();
  await musicResponsePromise;
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x)).toBe(1200);

  await page.keyboard.down('d');
  await page.waitForTimeout(320);
  await page.keyboard.up('d');
  const moved = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0);
  expect(moved).toBeGreaterThan(1240);

  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toHaveClass(/is-visible/);
  const pausedX = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0);
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0)).toBeCloseTo(pausedX, 3);

  await page.locator('#restart-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x)).toBe(1200);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.y)).toBe(960);

  await page.keyboard.press('Escape');
  await page.locator('#title-button').click();
  await expect(page.locator('#title-screen')).toHaveClass(/is-visible/);
});

test('normalizes diagonal input and auto-pauses on focus loss', async ({ page }) => {
  await page.locator('#start-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');

  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  const snapshot = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot());
  expect(snapshot?.player.x).toBeGreaterThan(1220);
  expect(snapshot?.player.y).toBeLessThan(940);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'paused');
});

test('keeps a 16:9 stage and exposes safe debug travel', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const box = await page.locator('#game-stage').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 2);

  await page.locator('#start-button').click();
  await page.evaluate(() => window.__TUYE_DEBUG__?.teleport(3));
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x)).toBe(2250);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.y)).toBe(1450);
});

test('blocks the player at the world edge and ancient tree trunk', async ({ page }) => {
  await page.locator('#start-button').click();
  await page.evaluate(() => window.__TUYE_DEBUG__?.teleport(3));
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(1500);
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  const edge = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  expect(edge?.x).toBeLessThanOrEqual(2386.5);
  expect(edge?.y).toBeLessThanOrEqual(1584.5);

  await page.evaluate(() => window.__TUYE_DEBUG__?.resetPlayer());
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  const treeCollisionY = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.y ?? 0);
  expect(treeCollisionY).toBeGreaterThan(300);
  expect(treeCollisionY).toBeLessThan(340);
});

test('captures representative title, world, landmark, and pause views', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('title.png') });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.screenshot({ path: testInfo.outputPath('title-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#start-button').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: testInfo.outputPath('spawn.png') });

  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.waitForTimeout(450);
  await page.screenshot({ path: testInfo.outputPath('ancient-tree.png') });

  await page.evaluate(() => window.__TUYE_DEBUG__?.teleport(3));
  await page.waitForTimeout(450);
  await page.screenshot({ path: testInfo.outputPath('south-east.png') });

  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('pause.png') });
});
