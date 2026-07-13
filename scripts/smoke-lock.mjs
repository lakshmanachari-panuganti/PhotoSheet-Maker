import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'artifacts');
const URL = process.env.URL ?? 'https://thankful-rock-0827fc610.7.azurestaticapps.net/';
const TEST_PHOTO = path.join(OUT, 'test-photo.png');

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Upload the photo
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Drop a photo or click to browse').first().click();
    const fc = await chooser;
    await fc.setFiles(TEST_PHOTO);
    await page.waitForSelector('.photo-cropper-media', { timeout: 15_000 });
    await page.waitForTimeout(800);

    // 1. Unlocked state
    await page.screenshot({ path: path.join(OUT, `lock-${viewport.name}-01-unlocked.png`), fullPage: true });

    // 2. Read crop pre-lock, click Lock, read crop after
    const cropBefore = await page.locator('div').filter({ hasText: /^Crop$/ }).first().locator('xpath=following-sibling::div').first().textContent().catch(() => null);
    const lockBtn = page.getByRole('button', { name: /^Lock$/ });
    await lockBtn.click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(OUT, `lock-${viewport.name}-02-locked.png`), fullPage: true });

    // Verify badge shows
    const badgeVisible = await page.getByText('Locked', { exact: false }).first().isVisible();

    // Verify zoom slider is disabled
    const zoomSlider = page.locator('input[type="range"][aria-label="Zoom"]');
    const zoomDisabled = await zoomSlider.isDisabled();

    // Verify Reset button is disabled
    const resetBtn = page.getByRole('button', { name: /Reset/ });
    const resetDisabled = await resetBtn.isDisabled();

    // Attempt a drag on the cropper — should NOT change the crop
    const cropperMedia = page.locator('.photo-cropper-container').first();
    const box = await cropperMedia.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 80, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    const cropAfterDrag = await page.locator('div').filter({ hasText: /^Crop$/ }).first().locator('xpath=following-sibling::div').first().textContent().catch(() => null);

    // 3. Unlock and confirm interactions come back
    const unlockBtn = page.getByRole('button', { name: /^Unlock$/ });
    await unlockBtn.click();
    await page.waitForTimeout(400);
    const zoomAfterUnlock = await zoomSlider.isDisabled();
    await page.screenshot({ path: path.join(OUT, `lock-${viewport.name}-03-unlocked-again.png`), fullPage: true });

    results.push({
      viewport: viewport.name,
      ok:
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        badgeVisible === true &&
        zoomDisabled === true &&
        resetDisabled === true &&
        zoomAfterUnlock === false &&
        cropBefore === cropAfterDrag,
      badgeVisible,
      zoomDisabledWhenLocked: zoomDisabled,
      resetDisabledWhenLocked: resetDisabled,
      zoomReEnabledOnUnlock: zoomAfterUnlock === false,
      cropUnchangedByDrag: cropBefore === cropAfterDrag,
      cropBefore: cropBefore?.trim(),
      cropAfterDrag: cropAfterDrag?.trim(),
      consoleErrors,
      pageErrors,
    });

    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify({ url: URL, results }, null, 2));
  process.exit(results.some((r) => !r.ok) ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
