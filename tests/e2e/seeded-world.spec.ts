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
  await expect.poll(() => page.evaluate(() => {
    const active = window.__TUYE_DEBUG__?.getSnapshot().world.activeChunks ?? 0;
    return active >= 25 && active <= 49;
  })).toBe(true);
}

test('loads the seeded camera fringe when switching to the far view', async ({ page }) => {
  await startSeededWorld(page);
  const farView = await page.evaluate(() => window.__TUYE_DEBUG__!.getConfig().camera.viewHalfWidthBodyMultipliers[0]);
  await page.evaluate((multiplier) => window.__TUYE_DEBUG__?.setViewRange(multiplier), farView);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().runtime.cameraHalfWidthBodyMultiplier)).toBe(farView);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.activeChunks)).toBeGreaterThanOrEqual(25);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.activeChunks ?? 0)).toBeLessThanOrEqual(49);
});

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

  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), { x: rabbit.x, y: rabbit.y + 80 });
  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getWildlifeSnapshots().some((candidate) => candidate.id === id) ?? false
  ), rabbit.id)).toBe(true);
  const scaledRabbit = await page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getWildlifeSnapshots().find((animal) => animal.id === id)
  ), rabbit.id);
  expect(scaledRabbit).toBeDefined();
  if (!scaledRabbit) return;
  const runtimeConfig = await page.evaluate(() => window.__TUYE_DEBUG__!.getConfig());
  expect(scaledRabbit?.sizeScale).toBeGreaterThanOrEqual(runtimeConfig.wildlife.species['white-rabbit'].minSizeScale);
  expect(scaledRabbit?.sizeScale).toBeLessThanOrEqual(runtimeConfig.wildlife.species['white-rabbit'].maxSizeScale);
  const rabbitProfile = runtimeConfig.characterProfiles['white-rabbit'];
  expect(scaledRabbit?.bodyWidth).toBeCloseTo(rabbitProfile.bodyWidth * scaledRabbit!.sizeScale, 4);
  expect(scaledRabbit?.bodyHeight).toBeCloseTo(rabbitProfile.bodyHeight * scaledRabbit!.sizeScale, 4);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowUp');
  const overlaps = await page.evaluate((id) => {
    const animal = window.__TUYE_DEBUG__?.getWildlifeSnapshots().find((candidate) => candidate.id === id);
    const snapshot = window.__TUYE_DEBUG__?.getSnapshot();
    const config = window.__TUYE_DEBUG__?.getConfig();
    if (!animal || !snapshot || !config) return true;
    return Math.abs(animal.x - snapshot.player.x) < (animal.bodyWidth + config.player.bodyWidth) / 2
      && Math.abs(animal.y - snapshot.player.y) < (animal.bodyHeight + config.player.bodyHeight) / 2;
  }, rabbit.id);
  expect(overlaps).toBe(false);
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
  await page.evaluate(() => window.__TUYE_DEBUG__?.setSurvival({ water: 0, health: 100 }));
  await page.waitForTimeout(250);
  const shallowPosition = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  expect(shallowPosition?.x).toBeCloseTo(target.x, 1);
  expect(shallowPosition?.y).toBeCloseTo(target.y, 1);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.resources.playerInShallowWater)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().survival.water)).toBeGreaterThan(2);

  await page.keyboard.down(target.key);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player.moving)).toBe(true);
  const waterBeforeMoving = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().survival.water ?? 0);
  await page.waitForTimeout(450);
  const waterWhileMoving = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().survival.water ?? 0);
  expect(waterWhileMoving).toBeLessThanOrEqual(waterBeforeMoving);
  await page.keyboard.up(target.key);
  const blockedPosition = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().player);
  const progress = ((blockedPosition?.x ?? target.x) - target.x) * target.dx
    + ((blockedPosition?.y ?? target.y) - target.y) * target.dy;
  expect(progress).toBeGreaterThanOrEqual(0);
  expect(progress).toBeLessThan(8);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().survival.water ?? 0))
    .toBeGreaterThan(waterWhileMoving);
});

test('forages deterministic berry bushes and keeps partial depletion across chunk unloads', async ({ page }, testInfo) => {
  await startSeededWorld(page);
  const berry = await page.evaluate(() => {
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        const target = window.__TUYE_DEBUG__?.getChunkData(x, y)?.berryBushes[0];
        if (target) return target;
      }
    }
    return undefined;
  });
  expect(berry).toBeDefined();
  if (!berry) return;

  await page.evaluate(() => window.__TUYE_DEBUG__?.setSurvival({ food: 0 }));
  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), berry);
  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getBerrySnapshots().some((candidate) => candidate.id === id)
  ), berry.id)).toBe(true);
  await expect(page.locator('#foraging-progress')).toHaveClass(/is-visible/);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().survival.food)).toBeGreaterThan(0.5);

  await page.keyboard.down('d');
  await expect(page.locator('#foraging-progress')).not.toHaveClass(/is-visible/);
  const remainingWhileMoving = await page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getBerrySnapshots().find((candidate) => candidate.id === id)?.remainingFood ?? 0
  ), berry.id);
  await page.waitForTimeout(250);
  expect(await page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getBerrySnapshots().find((candidate) => candidate.id === id)?.remainingFood ?? 0
  ), berry.id)).toBeCloseTo(remainingWhileMoving, 4);
  await page.keyboard.up('d');

  const partiallyConsumed = await page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getBerrySnapshots().find((candidate) => candidate.id === id)?.remainingFood
  ), berry.id);
  expect(partiallyConsumed).toBeLessThan(berry.maxFood);
  expect(partiallyConsumed).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('seeded-berry-foraging.png') });

  await page.evaluate(() => window.__TUYE_DEBUG__?.teleportToChunk(10, 10));
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.chunk)).toEqual({ x: 10, y: 10 });
  await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToWorld(x, y), berry);
  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getBerrySnapshots().find((candidate) => candidate.id === id)?.remainingFood
  ), berry.id)).toBeLessThan(berry.maxFood);
});

test('lets configured herbivores gather at grass, consume it, and refresh at a new position', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const base = structuredClone(window.__TUYE_DEBUG__!.getConfig());
    const config = {
      ...base,
      seededResources: {
        ...base.seededResources,
        berryMinPerChunk: 0,
        berryMaxPerChunk: 0,
        grassSeekChance: 1,
        grassConsumeSeconds: 2,
        grassRefreshSeconds: 1,
      },
    };
    localStorage.setItem('wildmorph.dev-presets.v1', JSON.stringify({
      schemaVersion: 13,
      activePresetId: 'grass-e2e',
      presets: [{
        id: 'grass-e2e',
        name: 'grass e2e',
        updatedAt: new Date(0).toISOString(),
        config,
      }],
    }));
  });
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await startSeededWorld(page);

  const target = await page.evaluate(() => {
    const config = window.__TUYE_DEBUG__!.getConfig();
    for (let chunkY = -8; chunkY <= 8; chunkY += 1) {
      for (let chunkX = -8; chunkX <= 8; chunkX += 1) {
        const data = window.__TUYE_DEBUG__!.getChunkData(chunkX, chunkY);
        if (!data) continue;
        const grass = data.grassCandidates.slice(0, config.seededResources.grassMaxPerChunk);
        for (const animal of data.wildlifeSpawns) {
          const species = config.wildlife.species[animal.species];
          if (!species.eatsGrass) continue;
          if (grass.some((patch) => Math.hypot(patch.x - animal.x, patch.y - animal.y) <= species.detectionRadius)) {
            return { animal, detectionRadius: species.detectionRadius };
          }
        }
      }
    }
    return undefined;
  });
  expect(target).toBeDefined();
  if (!target) return;

  await page.evaluate(({ animal, detectionRadius }) => {
    window.__TUYE_DEBUG__?.teleportToWorld(
      animal.x + Math.min(700, detectionRadius + 180),
      animal.y,
    );
  }, target);
  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getWildlifeSnapshots().some((animal) => animal.id === id)
  ), target.animal.id)).toBe(true);
  await expect.poll(() => page.evaluate((id) => {
    const animal = window.__TUYE_DEBUG__?.getWildlifeSnapshots().find((candidate) => candidate.id === id);
    return animal?.state === 'eat-grass' ? animal.targetId : null;
  }, target.animal.id), { timeout: 10_000 }).not.toBeNull();
  const grassId = await page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getWildlifeSnapshots().find((animal) => animal.id === id)?.targetId
  ), target.animal.id);
  expect(grassId).toMatch(/:grass:/);
  const before = await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.resources.activeGrassPatches ?? 0);
  await page.screenshot({ path: testInfo.outputPath('seeded-grass-gathering.png') });

  await expect.poll(() => page.evaluate((id) => (
    window.__TUYE_DEBUG__?.getGrassSnapshots().some((grass) => grass.id === id)
  ), grassId), { timeout: 5_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().world.resources.activeGrassPatches ?? 0
  )), { timeout: 5_000 }).toBeGreaterThanOrEqual(before);
  expect(await page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.resources.grassRefreshes ?? 0)).toBeGreaterThan(0);
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

  await expect.poll(() => page.evaluate(() => (
    window.__TUYE_DEBUG__?.getSnapshot().dayNight.elapsedSeconds ?? 0
  ))).toBeGreaterThan(0.5);
  await page.keyboard.press('Escape');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#pause-seed-input').fill(SECOND_SEED);
  await page.locator('#apply-pause-seed-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().world.seed)).toBe(SECOND_SEED);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().dayNight.elapsedSeconds))
    .toBeLessThan(0.5);
  await expect.poll(() => page.evaluate(() => window.__TUYE_DEBUG__?.getSnapshot().dayNight.phase)).toBe('dawn');
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
