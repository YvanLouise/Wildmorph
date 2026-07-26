import { expect, test, type Page } from '@playwright/test';

const FIRST_SEED = 'TY-7K3F-29QX';
const SECOND_SEED = 'TY-8M4G-3R5W';

async function openWorldSelect(page: Page): Promise<void> {
  await page.locator('#start-button').click();
  await expect(page.locator('#world-select-screen')).toHaveClass(/is-visible/);
}

async function startSeededWorld(page: Page, seed = FIRST_SEED): Promise<void> {
  await openWorldSelect(page);
  await page.locator('#title-seed-input').fill(seed);
  await page.locator('#seeded-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.activeChunks)).toBe(25);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
});

test('keeps wildlife out of the fixed map and runs deterministic prey AI in the seeded world', async ({ page }, testInfo) => {
  await openWorldSelect(page);
  await page.locator('#fixed-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getWildlifeSnapshots())).toEqual([]);

  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await startSeededWorld(page);
  const rabbit = await page.evaluate(() => {
    for (let y = -6; y <= 6; y += 1) {
      for (let x = -6; x <= 6; x += 1) {
        const target = window.__TUYE_DEBUG__?.getChunkData(x, y)?.wildlifeSpawns.find(({ species }) => species === 'white-rabbit');
        if (target) return target;
      }
    }
    return undefined;
  });
  expect(rabbit).toBeDefined();
  if (!rabbit) return;

  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), { x: rabbit.x + 100, y: rabbit.y });
  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getWildlifeSnapshots().find((animal) => animal.id === id)?.state
  ), rabbit.id)).toMatch(/alert|flee/);
  const telemetry = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.wildlife);
  expect(telemetry?.activeAnimals).toBeLessThanOrEqual(48);
  await page.screenshot({ path: testInfo.outputPath('seeded-wildlife-rabbit.png') });
});

test('selects a world, validates seeds, and remembers the last seed', async ({ page }, testInfo) => {
  await openWorldSelect(page);
  await expect(page.locator('#world-select-screen')).toHaveAttribute('aria-hidden', 'false');
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('world-select.png') });

  await page.locator('#title-seed-input').fill('TY-I000-OOOO');
  await page.locator('#seeded-world-button').click();
  await expect(page.locator('#title-seed-error')).toContainText('TY-XXXX-XXXX');
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'title');

  await page.locator('#title-seed-input').fill('ty-7k3f-29qx');
  await page.locator('#seeded-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.seed)).toBe(FIRST_SEED);
  await expect(page.locator('#area-name')).toHaveText('种子世界');

  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-world-panel')).toBeVisible();
  await expect(page.locator('#pause-world-seed')).toHaveText(FIRST_SEED);
  await page.locator('#title-button').click();
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await openWorldSelect(page);
  await expect(page.locator('#title-seed-input')).toHaveValue(FIRST_SEED);
});

test('creates collidable seeded trees and water', async ({ page }, testInfo) => {
  await startSeededWorld(page);
  const targets = await page.evaluate(() => {
    let treeTarget: { chunk: { x: number; y: number }; tree: NonNullable<ReturnType<NonNullable<typeof window.__TUYE_DEBUG__>['getChunkData']>>['obstacles'][number] } | undefined;
    let waterTarget: { chunk: { x: number; y: number }; water: NonNullable<ReturnType<NonNullable<typeof window.__TUYE_DEBUG__>['getChunkData']>>['waterColliders'][number] } | undefined;
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        const data = window.__TUYE_DEBUG__?.getChunkData(x, y);
        const tree = data?.obstacles.find((obstacle) => obstacle.kind === 'tree');
        const water = data?.waterColliders[0];
        if (tree && !treeTarget) treeTarget = { chunk: { x, y }, tree };
        if (water && !waterTarget) waterTarget = { chunk: { x, y }, water };
        if (treeTarget && waterTarget) return { treeTarget, waterTarget };
      }
    }
    return undefined;
  });
  expect(targets).toBeDefined();
  if (!targets) return;

  const { treeTarget, waterTarget } = targets;
  const treeWidth = treeTarget.tree.collider.shape === 'rectangle' ? treeTarget.tree.collider.width : treeTarget.tree.collider.radius * 2;
  const treeStartX = treeTarget.tree.x - treeWidth / 2 - 24;
  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), {
    x: treeStartX,
    y: treeTarget.tree.y,
  });
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.chunk)).toEqual(treeTarget.chunk);
  await page.waitForTimeout(500);
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  const treeBlockedX = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x ?? 0);
  expect(treeBlockedX).toBeLessThan(treeTarget.tree.x - treeWidth / 2);

  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), {
    x: waterTarget.water.x,
    y: waterTarget.water.y - waterTarget.water.height / 2 - 24,
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('seeded-water.png') });
  await page.keyboard.down('s');
  await page.waitForTimeout(600);
  await page.keyboard.up('s');
  const waterBlockedY = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.y ?? 0);
  expect(waterBlockedY).toBeLessThan(waterTarget.water.y - waterTarget.water.height / 2);
});

test('allows entry into the shallow water ring and blocks the adjacent deep water', async ({ page }) => {
  await startSeededWorld(page);
  const target = await page.evaluate(() => {
    const chunkTiles = 16;
    const tileSize = 32;
    const chunkSize = chunkTiles * tileSize;
    const directions = [
      { dx: 1, dy: 0, key: 'd' },
      { dx: -1, dy: 0, key: 'a' },
      { dx: 0, dy: 1, key: 's' },
      { dx: 0, dy: -1, key: 'w' },
    ] as const;

    for (let chunkY = -5; chunkY <= 5; chunkY += 1) {
      for (let chunkX = -5; chunkX <= 5; chunkX += 1) {
        const data = window.__TUYE_DEBUG__?.getChunkData(chunkX, chunkY);
        if (!data) continue;
        for (let row = 1; row < chunkTiles - 1; row += 1) {
          for (let column = 1; column < chunkTiles - 1; column += 1) {
            const index = row * chunkTiles + column;
            if (data.terrain[index] !== 'water' || data.deepWater[index]) continue;
            for (const direction of directions) {
              const neighborIndex = (row + direction.dy) * chunkTiles + column + direction.dx;
              if (!data.deepWater[neighborIndex]) continue;
              return {
                x: chunkX * chunkSize + (column + 0.5) * tileSize,
                y: chunkY * chunkSize + (row + 0.5) * tileSize,
                ...direction,
              };
            }
          }
        }
      }
    }
    return undefined;
  });

  expect(target).toBeDefined();
  if (!target) return;
  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), target);
  await page.waitForTimeout(250);
  const shallowPosition = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  expect(shallowPosition?.x).toBeCloseTo(target.x, 1);
  expect(shallowPosition?.y).toBeCloseTo(target.y, 1);

  await page.keyboard.down(target.key);
  await page.waitForTimeout(450);
  await page.keyboard.up(target.key);
  const blockedPosition = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  const progress = ((blockedPosition?.x ?? target.x) - target.x) * target.dx
    + ((blockedPosition?.y ?? target.y) - target.y) * target.dy;
  expect(progress).toBeGreaterThanOrEqual(0);
  expect(progress).toBeLessThan(8);
});

test('reproduces chunks, switches seeds cleanly, and travels across negative coordinates', async ({ page }, testInfo) => {
  await startSeededWorld(page);
  const originalFingerprint = await page.evaluate(() => window.__TUYE_DEBUG__?.getChunkFingerprint(0, 0));
  expect(originalFingerprint).toMatch(/^[0-9a-f]{8}$/);

  await page.evaluate(() => window.__TUYE_DEBUG__?.refreshWorld());
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getChunkFingerprint(0, 0))).toBe(originalFingerprint);

  await page.evaluate(() => window.__TUYE_DEBUG__?.teleportToChunk(-6, -4));
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.chunk)).toEqual({ x: -6, y: -4 });
  const travelTelemetry = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world);
  expect(travelTelemetry?.activeChunks).toBeLessThanOrEqual(49);
  expect(travelTelemetry?.cachedChunks).toBeLessThanOrEqual(64);

  await page.keyboard.press('Escape');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#pause-seed-input').fill(SECOND_SEED);
  await page.locator('#apply-pause-seed-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.seed)).toBe(SECOND_SEED);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.x)).toBe(256);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getChunkFingerprint(0, 0))).not.toBe(originalFingerprint);
  await page.waitForTimeout(850);
  await page.screenshot({ path: testInfo.outputPath('seeded-spawn.png') });

  await page.keyboard.press('F1');
  await expect(page.locator('#debug-panel')).toHaveClass(/is-visible/);
  await page.screenshot({ path: testInfo.outputPath('seeded-debug.png') });
});

test('keeps the player and generated scenery visible far north of the origin', async ({ page }, testInfo) => {
  await startSeededWorld(page);
  await page.evaluate(() => window.__TUYE_DEBUG__?.teleportToWorld(256, -2816));
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.chunk))
    .toEqual({ x: 0, y: -6 });
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.activeChunks))
    .toBe(25);
  await page.waitForTimeout(500);

  const snapshot = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot());
  expect(snapshot?.player.x).toBeCloseTo(256, 1);
  expect(snapshot?.player.y).toBeCloseTo(-2816, 1);
  await page.screenshot({ path: testInfo.outputPath('seeded-far-north.png') });
});

test('renders a dense mud patch without interior tile gaps', async ({ page }, testInfo) => {
  await startSeededWorld(page);
  const target = await page.evaluate(() => {
    let best: { x: number; y: number; joints: number } | undefined;
    const chunkSize = 512;
    const tileSize = 32;
    const chunkTiles = 16;
    for (let chunkY = -12; chunkY <= 12; chunkY += 1) {
      for (let chunkX = -12; chunkX <= 12; chunkX += 1) {
        const terrain = window.__TUYE_DEBUG__?.getChunkData(chunkX, chunkY)?.terrain;
        if (!terrain) continue;
        let joints = 0;
        let firstJoint: { x: number; y: number } | undefined;
        for (let row = 1; row < chunkTiles; row += 1) {
          for (let column = 1; column < chunkTiles; column += 1) {
            const indices = [
              (row - 1) * chunkTiles + column - 1,
              (row - 1) * chunkTiles + column,
              row * chunkTiles + column - 1,
              row * chunkTiles + column,
            ];
            if (!indices.every((index) => terrain[index] === 'mud')) continue;
            joints += 1;
            firstJoint ??= {
              x: chunkX * chunkSize + column * tileSize,
              y: chunkY * chunkSize + row * tileSize,
            };
          }
        }
        if (firstJoint && (!best || joints > best.joints)) best = { ...firstJoint, joints };
      }
    }
    return best;
  });
  expect(target?.joints).toBeGreaterThan(4);
  if (!target) return;

  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), {
    x: target.x,
    y: target.y + 180,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('seeded-mud.png') });
});
