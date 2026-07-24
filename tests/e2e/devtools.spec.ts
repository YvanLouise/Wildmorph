import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/devtools.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('creates, persists, and applies a core tuning preset', async ({ page, context }) => {
  await expect(page).toHaveTitle('蜕野 · 野外调参台');
  await expect(page.locator('#game-root')).toHaveCount(0);
  await expect(page.locator('#save-button')).toBeDisabled();

  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('E2E 调参预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.locator('[data-config-path="player.moveSpeed"]').fill('260');
  await expect(page.locator('#dirty-status')).toHaveText('有未保存修改');
  await page.locator('#save-button').click();
  await expect(page.locator('#dirty-status')).toContainText('已保存并设为活动预设');

  await page.reload();
  await expect(page.locator('[data-config-path="player.moveSpeed"]')).toHaveValue('260');

  const gamePage = await context.newPage();
  await gamePage.goto('/');
  await expect(gamePage.locator('#start-button')).toBeEnabled();
  await expect.poll(() => gamePage.evaluate(() => (
    window.__TUYE_DEBUG__?.getConfig()
  ))).toMatchObject({ player: { moveSpeed: 260 } });
});

test('edits map drafts, validates duplicate ids, and supports undo/redo', async ({ page }) => {
  await page.locator('#save-as-button').click();
  await page.locator('#preset-name-input').fill('地图编辑预设');
  await page.getByRole('button', { name: '创建并激活' }).click();
  await page.getByRole('button', { name: '05 地图编辑' }).click();
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
  await page.getByRole('button', { name: '05 地图编辑' }).click();
  await expect(page.locator('#map-editor-host canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('developer-map-editor.png') });
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
