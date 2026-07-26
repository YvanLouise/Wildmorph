import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/devtools.html');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('wildmorph-world-assets');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.locator('#save-as-button'), await page.locator('#issue-list').textContent() ?? 'default configuration is invalid').toBeEnabled();
});

test('creates, persists, and applies a core tuning preset', async ({ page, context }) => {
  await expect(page).toHaveTitle('蜕野 · 野外调参台');
  await expect(page.locator('#game-root')).toHaveCount(0);
  await expect(page.locator('#save-button')).toBeDisabled();

  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('E2E 调参预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="player"]').click();
  const speedInput = page.locator('[data-config-path="player.moveSpeed"]');
  const adjustedSpeed = String(Number(await speedInput.inputValue()) + 15);
  await speedInput.fill(adjustedSpeed);
  await expect(page.locator('#dirty-status')).toHaveText('有未保存修改');
  await page.locator('#save-button').click();
  await expect(page.locator('#dirty-status')).toContainText('已保存并设为活动预设');

  await page.reload();
  await page.locator('[data-section="player"]').click();
  await expect(page.locator('[data-config-path="player.moveSpeed"]')).toHaveValue(adjustedSpeed);

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await expect.poll(() => gamePage.evaluate(() => (
    window.__TUYE_DEBUG__?.getConfig()
  ))).toMatchObject({ player: { moveSpeed: Number(adjustedSpeed) } });
});

test('edits and applies survival consumption tuning', async ({ page, context }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('生存消耗预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="survival"]').click();

  for (const path of [
    'foodDrainAmount', 'foodDrainIntervalSeconds', 'waterDrainIntervalSeconds',
    'sprintConsumptionMultiplier', 'staminaDrainPerSecond', 'staminaRecoveryDelaySeconds',
    'staminaRecoveryPerSecond', 'staminaStationaryRecoveryDelaySeconds',
    'staminaStationaryRecoveryPerSecond', 'starvationDamagePerSecond', 'dehydrationDamagePerSecond',
  ]) {
    expect(Number.isFinite(Number(await page.locator(`[data-config-path="survival.${path}"]`).inputValue()))).toBe(true);
  }

  await page.locator('[data-config-path="survival.foodDrainIntervalSeconds"]').fill('4');
  await page.locator('[data-config-path="survival.waterDrainAmount"]').fill('1.5');
  await page.locator('[data-config-path="survival.sprintConsumptionMultiplier"]').fill('1.8');
  await page.locator('[data-config-path="survival.staminaDrainPerSecond"]').fill('12');
  await page.locator('#save-button').click();
  await page.reload();
  await page.locator('[data-section="survival"]').click();
  await expect(page.locator('[data-config-path="survival.foodDrainIntervalSeconds"]')).toHaveValue('4');
  await expect(page.locator('[data-config-path="survival.waterDrainAmount"]')).toHaveValue('1.5');
  await expect(page.locator('[data-config-path="survival.sprintConsumptionMultiplier"]')).toHaveValue('1.8');
  await expect(page.locator('[data-config-path="survival.staminaDrainPerSecond"]')).toHaveValue('12');

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await expect.poll(() => gamePage.evaluate(() => window.__TUYE_DEBUG__?.getConfig().survival)).toMatchObject({
    foodDrainIntervalSeconds: 4,
    waterDrainAmount: 1.5,
    sprintConsumptionMultiplier: 1.8,
    staminaDrainPerSecond: 12,
  });
});

test('edits, summarizes, persists, and applies day and night tuning', async ({ page, context }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('昼夜短周期预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="dayNight"]').click();

  for (const path of [
    'dawnDurationMinutes', 'dayDurationMinutes', 'duskDurationMinutes',
    'nightDurationMinutes', 'nightDarkness',
  ]) {
    expect(Number.isFinite(Number(await page.locator(`[data-config-path="dayNight.${path}"]`).inputValue()))).toBe(true);
  }

  await page.locator('[data-config-path="dayNight.dawnDurationMinutes"]').fill('0.02');
  await page.locator('[data-config-path="dayNight.dayDurationMinutes"]').fill('0.02');
  await page.locator('[data-config-path="dayNight.duskDurationMinutes"]').fill('0.02');
  await page.locator('[data-config-path="dayNight.nightDurationMinutes"]').fill('0.02');
  await page.locator('[data-config-path="dayNight.nightDarkness"]').fill('0.6');
  await expect(page.locator('.day-night-summary')).toContainText('总周期 0.08 分钟');
  await page.locator('#save-button').click();

  await page.reload();
  await page.locator('[data-section="dayNight"]').click();
  await expect(page.locator('[data-config-path="dayNight.nightDarkness"]')).toHaveValue('0.6');

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await expect.poll(() => gamePage.evaluate(() => window.__TUYE_DEBUG__?.getConfig().dayNight)).toMatchObject({
    dawnDurationMinutes: 0.02,
    dayDurationMinutes: 0.02,
    duskDurationMinutes: 0.02,
    nightDurationMinutes: 0.02,
    nightDarkness: 0.6,
  });
});

test('edits player-relative camera ranges and keeps the reference view live', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('视野调参');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="player"]').click();

  const initialThirdRange = await page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.2"]').inputValue();

  await page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.0"]').fill('14');
  await page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.1"]').fill('9');
  await page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.2"]').fill('6.5');
  await expect(page.locator('.player-camera-summary')).toContainText('单侧 576px');
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.2"]')).toHaveValue(initialThirdRange);
  await page.keyboard.press('Control+y');
  await expect(page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.2"]')).toHaveValue('6.5');
  await page.locator('#save-button').click();
  await page.reload();
  await page.locator('[data-section="player"]').click();
  await expect(page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.0"]')).toHaveValue('14');
  await expect(page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.1"]')).toHaveValue('9');
  await expect(page.locator('[data-config-path="camera.viewHalfWidthBodyMultipliers.2"]')).toHaveValue('6.5');
});

test('edits, persists, resets, and isolates dedicated animal profiles', async ({ page, context }, testInfo) => {
  await expect(page.locator('[data-character-id]')).toHaveCount(9);
  await expect(page.locator('[data-character-field="displayName"]')).toBeDisabled();
  const imagesReady = await page.locator('.character-tab-thumb img').evaluateAll((images) => (
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  ));
  expect(imagesReady).toBe(true);

  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('动物档案预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-character-id="tiger"]').click();
  expect(await page.locator('#character-view').evaluate((element) => element.scrollTop)).toBe(0);
  await page.locator('[data-character-field="displayName"]').fill('山林幼虎');
  await page.locator('[data-character-field="displayName"]').press('Tab');
  await page.locator('[data-character-field="notes"]').fill('碰撞体避开尾巴，移动节奏保持原型基准。');
  await page.locator('[data-character-field="notes"]').press('Tab');
  await page.locator('[data-character-field="visualSize"]').fill('72');
  await page.locator('[data-character-field="bodyWidth"]').fill('30');
  await expect(page.locator('#dirty-status')).toHaveText('有未保存修改');

  await page.locator('[data-character-id="penguin"]').click();
  await expect(page.locator('[data-character-field="displayName"]')).toHaveValue('企鹅');
  await expect(page.locator('[data-character-field="visualSize"]')).toHaveValue('64');
  await page.locator('[data-character-id="tiger"]').click();
  await expect(page.locator('[data-character-field="displayName"]')).toHaveValue('山林幼虎');
  await expect(page.locator('[data-character-field="visualSize"]')).toHaveValue('72');
  await expect(page.locator('[data-character-field="bodyWidth"]')).toHaveValue('30');
  await expect(page.locator('.character-alpha-note')).toContainText('Alpha 阈值 ≥ 16');
  await page.locator('[data-preview-heading="-90"]').click();
  await expect(page.locator('[data-character-preview-image]')).toHaveCSS('transform', /matrix/);
  await page.locator('#character-view').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('character-profile-tiger.png') });

  await page.locator('#save-button').click();
  await page.reload();
  await page.locator('[data-character-id="tiger"]').click();
  await expect(page.locator('[data-character-field="displayName"]')).toHaveValue('山林幼虎');
  await expect(page.locator('[data-character-field="notes"]')).toHaveValue('碰撞体避开尾巴，移动节奏保持原型基准。');
  await expect(page.locator('[data-character-field="visualSize"]')).toHaveValue('72');

  await page.locator('[data-character-field="visualSize"]').fill('80');
  await page.locator('#restore-character-profile-button').click();
  await expect(page.locator('[data-character-field="visualSize"]')).toHaveValue('64');
  await expect(page.locator('[data-character-field="displayName"]')).toHaveValue('老虎');
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-character-field="visualSize"]')).toHaveValue('80');

  await page.locator('[data-section="player"]').click();
  const defaultPlayerSpeed = await page.locator('[data-config-path="player.moveSpeed"]').inputValue();
  await expect(page.locator('[data-config-path="player.moveSpeed"]')).toHaveValue(defaultPlayerSpeed);

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  const gameResources = await gamePage.evaluate(() => (
    performance.getEntriesByType('resource').map((entry) => decodeURI(entry.name))
  ));
  expect(gameResources.some((url) => url.includes('老虎-1.png'))).toBe(true);
  expect(gameResources.some((url) => url.includes('黄狐狸-1.png'))).toBe(true);
  expect(await gamePage.evaluate(() => window.__TUYE_DEBUG__?.getConfig().player.moveSpeed)).toBe(Number(defaultPlayerSpeed));
  await gamePage.close();

  await page.setViewportSize({ width: 1100, height: 760 });
  await page.locator('[data-section="characters"]').click();
  await expect(page.locator('.character-tabs')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('character-profiles-narrow.png') });
});

test('edits wildlife behavior in animal profiles and global seeded-world controls', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('AI动物调参');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-character-id="tiger"]').click();
  await expect(page.locator('[data-wildlife-field="enabled"]')).toBeChecked();
  await expect(page.locator('[data-wildlife-field="role"]')).toHaveValue('predator');
  await page.locator('[data-wildlife-field="minSizeScale"]').fill('0.7');
  await page.locator('[data-wildlife-field="maxSizeScale"]').fill('1.35');
  await expect(page.locator('[data-wildlife-size-summary]')).toContainText('44.8–86.4px');
  await page.locator('[data-preview-size="min"]').click();
  const minimumPreviewWidth = (await page.locator('[data-character-preview-image]').boundingBox())!.width;
  await page.locator('[data-preview-size="max"]').click();
  const maximumPreviewWidth = (await page.locator('[data-character-preview-image]').boundingBox())!.width;
  expect(maximumPreviewWidth).toBeGreaterThan(minimumPreviewWidth);
  await page.locator('[data-wildlife-field="chaseSpeed"]').fill('245');
  await page.locator('[data-wildlife-field="chaseSpeed"]').press('Tab');
  await page.locator('[data-wildlife-field="reactionDelayMs"]').fill('525');
  await page.locator('[data-wildlife-field="reactionDelayMs"]').press('Tab');
  await page.locator('[data-section="procedural"]').click();
  await page.locator('[data-config-path="wildlife.maxActiveAnimals"]').fill('36');
  await page.locator('#save-button').click();

  await page.reload();
  await page.locator('[data-character-id="tiger"]').click();
  await expect(page.locator('[data-wildlife-field="minSizeScale"]')).toHaveValue('0.7');
  await expect(page.locator('[data-wildlife-field="maxSizeScale"]')).toHaveValue('1.35');
  await expect(page.locator('[data-wildlife-field="chaseSpeed"]')).toHaveValue('245');
  await expect(page.locator('[data-wildlife-field="reactionDelayMs"]')).toHaveValue('525');
  await page.locator('[data-section="procedural"]').click();
  await expect(page.locator('[data-config-path="wildlife.maxActiveAnimals"]')).toHaveValue('36');

  await page.locator('[data-section="characters"]').click();
  await page.locator('[data-character-id="penguin"]').click();
  await expect(page.locator('[data-wildlife-field]')).toHaveCount(0);
  await expect(page.locator('.character-field-group').last()).toContainText('不在首批种子世界AI动物名单');
});

test('edits seeded resource supplies and berry diets', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('资源补给预设');
  await page.locator('#preset-form button[type="submit"]').click();

  await page.locator('[data-section="resources"]').click();
  for (const path of ['berryMinFood', 'berryMaxFood', 'grassMaxPerChunk', 'grassSeekChance']) {
    expect(Number.isFinite(Number(await page.locator(`[data-config-path="seededResources.${path}"]`).inputValue()))).toBe(true);
  }
  await page.locator('[data-config-path="seededResources.berryRegrowSeconds"]').fill('60');
  await page.locator('[data-config-path="seededResources.shallowWaterRecoveryPerSecond"]').fill('9');

  await page.locator('[data-section="characters"]').click();
  await page.locator('[data-character-id="white-rabbit"]').click();
  await expect(page.locator('[data-wildlife-field="eatsBerries"]')).toBeChecked();
  await expect(page.locator('[data-wildlife-field="eatsGrass"]')).toBeChecked();
  await page.locator('[data-character-id="tiger"]').click();
  await expect(page.locator('[data-wildlife-field="eatsBerries"]')).not.toBeChecked();
  await expect(page.locator('[data-wildlife-field="eatsGrass"]')).not.toBeChecked();
  await page.locator('#save-button').click();

  await page.reload();
  await page.locator('[data-section="resources"]').click();
  await expect(page.locator('[data-config-path="seededResources.berryRegrowSeconds"]')).toHaveValue('60');
  await expect(page.locator('[data-config-path="seededResources.shallowWaterRecoveryPerSecond"]')).toHaveValue('9');
});

test('edits map drafts, validates duplicate ids, and supports undo/redo', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('地图编辑预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="map"]').click();
  await expect(page.locator('#map-editor-host canvas')).toBeVisible();

  await page.locator('#add-object-button').click();
  await expect(page.locator('#dirty-status')).toHaveText('有未保存修改');
  await page.locator('[data-map-field="obstacle-id"]').fill('ancient-tree');
  await expect(page.locator('#validation-status')).toContainText('错误');
  await expect(page.locator('#save-button')).toBeDisabled();

  await page.locator('#undo-button').click();
  await page.locator('#redo-button').click();
  await expect(page.locator('#history-status')).toContainText('撤销');
});

test('captures the desktop map editor surface', async ({ page }, testInfo) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('截图预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="map"]').click();
  await expect(page.locator('#map-editor-host canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('developer-map-editor.png') });
});

test('edits seeded-world generation parameters without replacing the fixed map editor', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('开放世界预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="procedural"]').click();
  const density = page.locator('[data-config-path="proceduralWorld.treeDensity"]');
  expect(Number(await density.inputValue())).toBeGreaterThan(0);
  await density.fill('0.42');
  await page.locator('#save-button').click();
  await page.reload();
  await page.locator('[data-section="procedural"]').click();
  await expect(page.locator('[data-config-path="proceduralWorld.treeDensity"]')).toHaveValue('0.42');
  await expect(page.locator('[data-section="map"]')).toBeVisible();
});

test('exports and reimports a preset without overwriting its id', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('导入导出预设');
  await page.getByRole('button', { name: '创建并激活' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  await page.locator('#import-input').setInputFiles(downloadPath!);

  await expect(page.locator('#preset-select')).toContainText('导入导出预设（导入副本）');
  await expect(page.locator('#active-preset-badge')).toContainText('活动：导入导出预设');
});

test('uploads, assigns, persists, restores, and safely deletes a world image', async ({ page, context }, testInfo) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('图片素材预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="assets"]').click();
  await expect(page.locator('[data-asset-slot]')).toHaveCount(26);
  await expect(page.locator('[data-asset-card]')).not.toHaveCount(0);

  await page.locator('#asset-upload-input').setInputFiles('art/environment/vegetation/蘑菇-001.png');
  const uploaded = page.locator('[data-asset-card]').filter({ hasText: '蘑菇-001.png' });
  await expect(uploaded).toBeVisible();
  await page.locator('#asset-upload-input').setInputFiles('art/environment/vegetation/蘑菇-001.png');
  await expect(page.locator('#dirty-status')).toContainText('内容重复');
  await expect(page.locator('[data-asset-card]').filter({ hasText: '蘑菇-001.png' })).toHaveCount(1);
  await uploaded.locator('[data-asset-source]').click();
  await page.locator('[data-asset-binding-field="displaySize"]').fill('180');
  await page.locator('[data-asset-binding-field="displaySize"]').press('Tab');
  await page.locator('#save-button').click();

  await page.reload();
  await page.locator('[data-section="assets"]').click();
  await expect(page.locator('[data-asset-card].is-current')).toContainText('蘑菇-001.png');
  await page.screenshot({ path: testInfo.outputPath('world-asset-manager.png') });

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await expect.poll(() => gamePage.evaluate(() => window.__TUYE_DEBUG__?.getConfig().worldAssets.slots['fixed.tree'].sourceId))
    .toMatch(/^upload:/);
  await gamePage.locator('#start-button').click();
  await gamePage.locator('#fixed-world-button').click();
  await expect(gamePage.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await gamePage.evaluate(() => window.__TUYE_DEBUG__?.teleport(0));
  await gamePage.waitForTimeout(900);
  await gamePage.screenshot({ path: testInfo.outputPath('fixed-uploaded-tree.png') });
  await gamePage.close();

  await page.locator('[data-asset-card].is-current [data-delete-asset]').click();
  await expect(page.locator('#dirty-status')).toContainText('仍被');
  await page.locator('#restore-asset-slot-button').click();
  await page.locator('#save-button').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-asset-card]').filter({ hasText: '蘑菇-001.png' }).locator('[data-delete-asset]').click();
  await expect(page.locator('[data-asset-card]').filter({ hasText: '蘑菇-001.png' })).toHaveCount(0);
});

test('adjusts world asset collision boxes and seeded density multipliers', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('素材碰撞与密度');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="assets"]').click();

  await expect(page.locator('.asset-preview-collider')).toBeVisible();
  await page.locator('[data-asset-collider-field="width"]').fill('42');
  await page.locator('[data-asset-collider-field="width"]').press('Tab');
  const colliderBox = await page.locator('.asset-preview-collider').boundingBox();
  expect(colliderBox).not.toBeNull();
  await page.mouse.move(colliderBox!.x + colliderBox!.width / 2, colliderBox!.y + colliderBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(colliderBox!.x + colliderBox!.width / 2 + 24, colliderBox!.y + colliderBox!.height / 2 - 16);
  await page.mouse.up();
  const colliderOffsetX = Number(await page.locator('[data-asset-collider-field="offsetX"]').inputValue());
  const colliderOffsetY = Number(await page.locator('[data-asset-collider-field="offsetY"]').inputValue());
  expect(Math.abs(colliderOffsetX)).toBeGreaterThan(1);
  expect(Math.abs(colliderOffsetY)).toBeGreaterThan(1);

  await page.locator('[data-asset-slot="seeded.tree.0"]').click();
  const density = page.locator('[data-asset-binding-field="densityWeight"]');
  await density.fill('0.35');
  await expect(density.locator('xpath=following-sibling::output')).toHaveText('0.35×');
  await page.locator('#save-button').click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wildmorph.dev-presets.v1') ?? '{}'));
  expect(stored.presets[0].config.worldAssets.slots['fixed.tree'].collider.width).toBe(42);
  expect(stored.presets[0].config.worldAssets.slots['fixed.tree'].collider.offsetX).toBe(colliderOffsetX);
  expect(stored.presets[0].config.worldAssets.slots['fixed.tree'].collider.offsetY).toBe(colliderOffsetY);
  expect(stored.presets[0].config.world.obstacles.filter((obstacle: { kind: string }) => obstacle.kind === 'tree')
    .every((obstacle: { collider: { width: number; offsetX: number; offsetY: number } }) => (
      obstacle.collider.width === 42
      && obstacle.collider.offsetX === colliderOffsetX
      && obstacle.collider.offsetY === colliderOffsetY
    ))).toBe(true);
  expect(stored.presets[0].config.worldAssets.slots['seeded.tree.0'].densityWeight).toBe(0.35);
});

test('supports per-object image overrides in the fixed map editor', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('单体图片覆盖');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-section="map"]').click();
  await expect(page.locator('#map-editor-host canvas')).toBeVisible();
  await page.locator('#add-object-button').click();
  await page.locator('[data-map-field="asset-mode"]').selectOption('override');
  await expect(page.locator('[data-map-field="asset-source"]')).toBeVisible();
  await page.locator('[data-map-field="asset-source"]').selectOption('builtin:trees/针叶树-001');
  await expect(page.locator('#dirty-status')).toHaveText('有未保存修改');
  await expect(page.locator('#map-editor-host canvas')).toBeVisible();
  await page.locator('#save-button').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wildmorph.dev-presets.v1') ?? '{}'));
  expect(stored.presets[0].config.world.obstacles.at(-1).assetOverride.sourceId).toBe('builtin:trees/针叶树-001');
});

test('warns and falls back when an imported local image is unavailable', async ({ page, context }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('缺失素材回退');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.evaluate(() => {
    const key = 'wildmorph.dev-presets.v1';
    const store = JSON.parse(localStorage.getItem(key) ?? '{}');
    store.presets[0].config.worldAssets.slots['fixed.tree'].sourceId = 'upload:not-on-this-device';
    localStorage.setItem(key, JSON.stringify(store));
  });
  await page.reload();
  await page.locator('[data-section="assets"]').click();
  await expect(page.locator('#validation-status')).toContainText('警告');
  await expect(page.locator('.asset-preview')).toContainText('素材缺失');

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await gamePage.locator('#start-button').click();
  await gamePage.locator('#fixed-world-button').click();
  await expect(gamePage.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
});
