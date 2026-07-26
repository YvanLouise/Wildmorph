import { expect, test } from '@playwright/test';

test('keeps seeded-world resources bounded during ten minutes of travel', async ({ page }) => {
  test.setTimeout(720_000);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await page.locator('#title-seed-input').fill('TY-7K3F-29QX');
  await page.locator('#seeded-world-button').click();
  await expect(page.locator('#ui-root')).toHaveAttribute('data-phase', 'playing');

  const heapSamples: number[] = [];
  let maximumObjects = 0;
  let maximumColliders = 0;
  for (let step = 0; step < 300; step += 1) {
    const x = step - 150;
    const y = Math.round(Math.sin(step / 11) * 12);
    await page.evaluate(({ x, y }) => window.__TUYE_DEBUG__?.teleportToChunk(x, y), { x, y });
    await page.waitForTimeout(2000);
    const sample = await page.evaluate(() => {
      const world = window.__TUYE_DEBUG__?.getSnapshot().world;
      const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
      return { world, heap: memory.memory?.usedJSHeapSize ?? 0 };
    });
    expect(sample.world?.activeChunks).toBeLessThanOrEqual(49);
    expect(sample.world?.cachedChunks).toBeLessThanOrEqual(64);
    maximumObjects = Math.max(maximumObjects, sample.world?.objectCount ?? 0);
    maximumColliders = Math.max(maximumColliders, sample.world?.colliderCount ?? 0);
    if (sample.heap > 0 && step % 10 === 0) heapSamples.push(sample.heap);
  }

  expect(maximumObjects).toBeLessThan(5000);
  expect(maximumColliders).toBeLessThan(2000);
  if (heapSamples.length > 1) {
    expect(heapSamples.at(-1)! - heapSamples[0]).toBeLessThan(120 * 1024 * 1024);
  }
});
