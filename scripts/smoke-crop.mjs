import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'artifacts');
const URL = process.env.URL ?? 'http://127.0.0.1:5173/';
const TEST_PHOTO = path.join(OUT, 'test-photo.png');

async function main() {
  await mkdir(OUT, { recursive: true });

  const results = [];

  // Desktop viewport
  const browser = await chromium.launch({ headless: true });

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

    // Empty state
    await page.screenshot({ path: path.join(OUT, `crop-${viewport.name}-01-empty.png`), fullPage: true });

    // Upload
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Drop a photo or click to browse').first().click();
    const fc = await chooser;
    await fc.setFiles(TEST_PHOTO);

    // Wait for cropper media element
    await page.waitForSelector('.photo-cropper-media', { timeout: 15_000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(OUT, `crop-${viewport.name}-02-cropped.png`), fullPage: true });

    // Zoom to 2x via slider (index 0 is the zoom range in the crop panel)
    const zoomSlider = page.locator('input[type="range"][aria-label="Zoom"]');
    await zoomSlider.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '2');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `crop-${viewport.name}-03-zoomed.png`), fullPage: true });

    // Check the CROP stat updates
    const cropStat = await page.locator('text=Crop').first().locator('xpath=following-sibling::div').first().textContent().catch(() => '?');

    results.push({
      viewport: viewport.name,
      ok: consoleErrors.length === 0 && pageErrors.length === 0,
      cropDimensions: cropStat?.trim(),
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
