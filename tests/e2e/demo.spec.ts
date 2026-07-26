import { expect, test } from '@playwright/test';

async function startFixedWorld(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#start-button').click();
  await expect(page.locator('#world-select-screen')).toHaveClass(/is-visible/);
  await page.locator('#fixed-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
}

async function installFastDayNightPreset(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const config = structuredClone(window.__TUYE_DEBUG__!.getConfig()) as unknown as Record<string, unknown>;
    config.dayNight = {
      dawnDurationMinutes: 0.02,
      dayDurationMinutes: 0.02,
      duskDurationMinutes: 0.02,
      nightDurationMinutes: 0.02,
      nightDarkness: 0.6,
    };
    const preset = {
      id: 'e2e-day-night',
      name: 'E2E day and night',
      updatedAt: new Date(0).toISOString(),
      config,
    };
    localStorage.setItem('wildmorph.dev-presets.v1', JSON.stringify({
      schemaVersion: config.schemaVersion,
      activePresetId: preset.id,
      presets: [preset],
    }));
  });
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
}

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
  const titleLogo = page.locator('#title-yl-logo');
  await expect(titleArt).toBeVisible();
  await expect(titleLogo).toBeVisible();
  expect(await titleArt.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 1672, height: 941 });
  expect(await titleLogo.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 2048, height: 2048 });

  const expectedHotspots = {
    'start-button': { left: 0.3895, top: 0.7385, width: 0.2155, height: 0.093 },
    'codex-button': { left: 0.3935, top: 0.8675, width: 0.0945, height: 0.0665 },
    'settings-button': { left: 0.507, top: 0.8675, width: 0.0945, height: 0.0665 },
  } as const;

  const assertHotspotAlignment = async () => {
    const titleFrame = await page.locator('#title-frame').boundingBox();
    expect(titleFrame).not.toBeNull();
    if (!titleFrame) return;

    for (const [id, expected] of Object.entries(expectedHotspots)) {
      const hotspot = await page.locator(`#${id}`).boundingBox();
      expect(hotspot).not.toBeNull();
      if (!hotspot) continue;

      expect((hotspot.x - titleFrame.x) / titleFrame.width).toBeCloseTo(expected.left, 2);
      expect((hotspot.y - titleFrame.y) / titleFrame.height).toBeCloseTo(expected.top, 2);
      expect(hotspot.width / titleFrame.width).toBeCloseTo(expected.width, 2);
      expect(hotspot.height / titleFrame.height).toBeCloseTo(expected.height, 2);
    }

    const logo = await titleLogo.boundingBox();
    const start = await page.locator('#start-button').boundingBox();
    expect(logo).not.toBeNull();
    expect(start).not.toBeNull();
    if (logo && start) {
      expect((logo.x - titleFrame.x) / titleFrame.width).toBeCloseTo(0.025, 2);
      expect(logo.width / titleFrame.width).toBeCloseTo(0.105, 2);
      expect(logo.y + logo.height).toBeLessThanOrEqual(titleFrame.y + titleFrame.height);
      expect(logo.x + logo.width).toBeLessThan(start.x);
    }
  };

  await assertHotspotAlignment();
  await page.setViewportSize({ width: 800, height: 700 });
  await assertHotspotAlignment();

  await page.locator('#codex-button').hover();
  await expect.poll(() => page.locator('#codex-button').evaluate((button) => (
    getComputedStyle(button).backgroundColor
  ))).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('#settings-button').focus();
  await expect(page.locator('#settings-button')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedTransitionSeconds = await page.locator('#settings-button').evaluate((button) => (
    Number.parseFloat(getComputedStyle(button).transitionDuration)
  ));
  expect(reducedTransitionSeconds).toBeLessThanOrEqual(0.000001);

  const titleMusicResponsePromise = page.waitForResponse((response) => (
    decodeURIComponent(response.url()).includes('/music/悠闲-悠然_1.ogg')
    && [200, 206].includes(response.status())
  ));
  await page.locator('#codex-button').click();
  await titleMusicResponsePromise;
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
  await startFixedWorld(page);
});

test('shows four survival stats in the upper-right HUD', async ({ page }) => {
  const survivalHud = page.locator('#survival-hud');
  await expect(survivalHud).not.toBeVisible();
  await startFixedWorld(page);
  await expect(survivalHud).toBeVisible();

  const stats = survivalHud.locator('[data-survival-stat]');
  await expect(stats).toHaveCount(4);
  expect(await stats.evaluateAll((items) => items.map((item) => item.getAttribute('data-survival-stat'))))
    .toEqual(['health', 'food', 'water', 'stamina']);
  await expect(stats.locator('.survival-label')).toHaveText(['生命', '食物', '水源', '耐力']);
  await expect(stats.locator('.survival-value')).toHaveText(['100', '100', '100', '100']);

  for (const stat of ['health', 'food', 'water', 'stamina']) {
    await expect(page.locator(`#survival-${stat}-meter`)).toHaveAttribute('aria-valuenow', '100');
    await expect.poll(() => page.locator(`#survival-${stat}-icon`).evaluate(
      (image: HTMLImageElement) => image.naturalWidth,
    )).toBeGreaterThan(0);
  }

  const stage = await page.locator('#game-stage').boundingBox();
  const hud = await survivalHud.boundingBox();
  expect(hud!.x + hud!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  expect(hud!.y).toBeGreaterThanOrEqual(stage!.y);
});

test('cycles dawn, day, dusk, and night while keeping HUD and pause synchronized', async ({ page }, testInfo) => {
  await installFastDayNightPreset(page);
  await startFixedWorld(page);

  const phase = page.locator('#day-night-phase');
  const clock = page.locator('#day-night-time');
  const overlay = page.locator('#day-night-overlay');
  await expect(phase).toHaveText('黎明');
  await expect(clock).toHaveText(/^05:/);
  await expect.poll(() => overlay.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.45);

  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.phase), {
    timeout: 2500,
  }).toBe('day');
  await expect(phase).toHaveText('白天');
  await expect(clock).toHaveText(/^(0[6-9]|1[0-7]):/);
  await expect.poll(() => overlay.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(0);

  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight)).toEqual(paused);
  await page.locator('#continue-button').click();

  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.phase), {
    timeout: 2500,
  }).toBe('dusk');
  await expect(phase).toHaveText('黄昏');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.phase), {
    timeout: 2500,
  }).toBe('night');
  await expect(phase).toHaveText('夜晚');
  await expect.poll(() => overlay.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBeCloseTo(0.6, 1);
  await page.screenshot({ path: testInfo.outputPath('desktop-night-cycle.png') });

  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.phase), {
    timeout: 2500,
  }).toBe('dawn');
  await page.keyboard.press('Escape');
  await page.locator('#restart-button').click();
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.elapsedSeconds))
    .toBeLessThan(0.5);
  await expect(phase).toHaveText('黎明');

  await page.keyboard.press('Escape');
  await page.locator('#title-button').click();
  await page.locator('#start-button').click();
  await page.locator('#seeded-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().dayNight.elapsedSeconds))
    .toBeLessThan(0.5);
  await expect(phase).toHaveText('黎明');
});

test('shows session play time in pause settings and excludes paused time', async ({ page }) => {
  await startFixedWorld(page);
  await page.waitForTimeout(1100);
  await page.keyboard.press('Escape');

  const sessionTime = page.locator('#session-elapsed-time');
  await expect(sessionTime).toBeVisible();
  await expect(sessionTime).toHaveText(/^00:0[1-2]$/);
  const firstElapsed = Number(await sessionTime.getAttribute('data-elapsed-ms'));
  expect(firstElapsed).toBeGreaterThanOrEqual(1000);

  await page.waitForTimeout(500);
  expect(Number(await sessionTime.getAttribute('data-elapsed-ms'))).toBe(firstElapsed);

  await page.locator('#continue-button').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  expect(Number(await sessionTime.getAttribute('data-elapsed-ms'))).toBeGreaterThan(firstElapsed);

  await page.locator('#restart-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  expect(Number(await sessionTime.getAttribute('data-elapsed-ms'))).toBeLessThan(1000);
  await expect(sessionTime).toHaveText('00:00');
});

test('drains survival over game time, accelerates while sprinting, and freezes while paused', async ({ page }) => {
  await startFixedWorld(page);
  const initial = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival);
  await page.waitForTimeout(2200);
  const afterNormal = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival);
  const normalFoodDrain = initial.food - afterNormal.food;
  const normalWaterDrain = initial.water - afterNormal.water;
  expect(normalFoodDrain).toBeGreaterThan(0.6);
  expect(normalWaterDrain).toBeGreaterThan(0.8);

  await page.keyboard.press('Escape');
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'paused');
  const paused = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival)).toEqual(paused);
  await page.locator('#continue-button').click();

  const beforeSprint = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival);
  await page.keyboard.down('d');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(2200);
  await page.keyboard.up('Shift');
  await page.keyboard.up('d');
  const afterSprint = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival);
  const sprintFoodDrain = beforeSprint.food - afterSprint.food;
  const sprintWaterDrain = beforeSprint.water - afterSprint.water;
  expect(sprintFoodDrain).toBeGreaterThan(normalFoodDrain * 1.3);
  expect(sprintWaterDrain).toBeGreaterThan(normalWaterDrain * 1.3);
  expect(beforeSprint.stamina - afterSprint.stamina).toBeGreaterThan(18);

  await page.waitForTimeout(2500);
  const beforeRecovery = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival.stamina);
  expect(beforeRecovery).toBeCloseTo(afterSprint.stamina, 0);
  await page.waitForTimeout(1000);
  const afterRecovery = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().survival.stamina);
  expect(afterRecovery - beforeRecovery).toBeGreaterThan(2);
});

test('starts, moves, pauses, resets, and returns to title', async ({ page }) => {
  const musicResponsePromise = page.waitForResponse((response) => (
    decodeURIComponent(response.url()).includes('/music/平静-悠然1.ogg')
    && [200, 206].includes(response.status())
  ));
  await startFixedWorld(page);
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
  await startFixedWorld(page);

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

test('uses the configured sprint multiplier while Shift is held', async ({ page }) => {
  await startFixedWorld(page);
  const playerConfig = await page.evaluate(() => window.__TUYE_DEBUG__!.getConfig().player);
  await page.keyboard.down('d');
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(playerConfig.moveSpeed);

  await page.keyboard.down('Shift');
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(playerConfig.moveSpeed * playerConfig.sprintMultiplier);

  await page.keyboard.up('Shift');
  await expect.poll(async () => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().player.velocityX
  ))).toBe(playerConfig.moveSpeed);
  await page.keyboard.up('d');
});

test('keeps a 16:9 stage and exposes safe debug travel', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const box = await page.locator('#game-stage').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 2);

  await startFixedWorld(page);
  await page.evaluate(() => window.__TUYE_DEBUG__?.teleport(3));
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x)).toBe(2250);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.y)).toBe(1450);
});

test('keeps camera view ranges proportional to the prototype player size', async ({ page }) => {
  await startFixedWorld(page);
  const config = await page.evaluate(() => window.__TUYE_DEBUG__!.getConfig());
  const defaultMultiplier = config.camera.viewHalfWidthBodyMultipliers[config.camera.defaultViewIndex];
  const defaultHalfWidth = config.player.visualSize * defaultMultiplier;
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().runtime)).toMatchObject({
    cameraViewIndex: config.camera.defaultViewIndex,
    cameraHalfWidthWorld: defaultHalfWidth,
    cameraHalfWidthBodyMultiplier: defaultMultiplier,
    cameraWorldWidth: defaultHalfWidth * 2,
    cameraWorldHeight: defaultHalfWidth * 2 * 720 / 1280,
    cameraZoom: 1280 / (defaultHalfWidth * 2),
  });
  await page.keyboard.press('F1');
  await page.keyboard.press('BracketLeft');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().runtime.cameraHalfWidthBodyMultiplier)).toBe(config.camera.viewHalfWidthBodyMultipliers[0]);
  await page.keyboard.press('BracketRight');
  await page.keyboard.press('BracketRight');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().runtime.cameraHalfWidthBodyMultiplier)).toBe(config.camera.viewHalfWidthBodyMultipliers[2]);
});

test('blocks the player at the world edge and ancient tree trunk', async ({ page }) => {
  test.setTimeout(60_000);
  await startFixedWorld(page);
  await page.evaluate(() => window.__TUYE_DEBUG__?.teleport(3));
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(1500);
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  const edgeResult = await page.evaluate(() => ({
    player: window.__TUYE_DEBUG__!.getSnapshot().player,
    config: window.__TUYE_DEBUG__!.getConfig(),
  }));
  expect(edgeResult.player.x).toBeLessThanOrEqual(edgeResult.config.world.width - edgeResult.config.player.bodyWidth / 2 + 0.5);
  expect(edgeResult.player.y).toBeLessThanOrEqual(edgeResult.config.world.height - edgeResult.config.player.bodyHeight / 2 + 0.5);

  await page.evaluate(() => window.__TUYE_DEBUG__?.resetPlayer());
  const target = await page.evaluate(() => {
    const config = window.__TUYE_DEBUG__!.getConfig();
    const candidates = config.world.obstacles.flatMap((obstacle) => {
      const collider = obstacle.collider;
      const centerX = obstacle.x + (collider.offsetX ?? 0);
      const centerY = obstacle.y + (collider.offsetY ?? 0);
      const halfWidth = collider.shape === 'circle' ? collider.radius : collider.width / 2;
      const halfHeight = collider.shape === 'circle' ? collider.radius : collider.height / 2;
      const bottom = centerY + halfHeight;
      return Math.abs(config.world.spawn.x - centerX) <= halfWidth + config.player.bodyWidth / 2
        && bottom < config.world.spawn.y
        ? [bottom + config.player.bodyHeight / 2]
        : [];
    }).sort((a, b) => b - a);
    return {
      expectedY: candidates[0],
      travelMs: (config.world.spawn.y - candidates[0] + 80) / config.player.moveSpeed * 1000,
    };
  });
  expect(target.expectedY).toBeDefined();
  await page.keyboard.down('w');
  await page.waitForTimeout(target.travelMs);
  await page.keyboard.up('w');
  const actualY = await page.evaluate(() => window.__TUYE_DEBUG__!.getSnapshot().player.y);
  expect(actualY).toBeGreaterThanOrEqual(target.expectedY - 1);
  expect(actualY).toBeLessThanOrEqual(target.expectedY + 2);
});

test('captures representative title, world, landmark, and pause views', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('title.png') });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.screenshot({ path: testInfo.outputPath('title-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await startFixedWorld(page);
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
