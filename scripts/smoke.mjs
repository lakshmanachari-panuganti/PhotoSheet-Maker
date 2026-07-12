import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'artifacts');
const URL = process.env.URL ?? 'http://127.0.0.1:5173/';
const TEST_PHOTO = path.join(OUT, 'test-photo.png');

const results = [];

async function scenario(name, page, fn) {
  const consoleErrors = [];
  const pageErrors = [];
  const consoleHandler = (msg) => msg.type() === 'error' && consoleErrors.push(msg.text());
  const errorHandler = (err) => pageErrors.push(String(err));
  page.on('console', consoleHandler);
  page.on('pageerror', errorHandler);
  try {
    const data = await fn();
    results.push({ name, ok: consoleErrors.length === 0 && pageErrors.length === 0, ...data, consoleErrors, pageErrors });
  } catch (err) {
    results.push({ name, ok: false, error: String(err), consoleErrors, pageErrors });
  } finally {
    page.off('console', consoleHandler);
    page.off('pageerror', errorHandler);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });

  await scenario('1. landing (empty state)', page, async () => {
    const summary = (await page.getByText(/per page/).first().textContent())?.trim();
    await page.screenshot({ path: path.join(OUT, '01-landing.png'), fullPage: true });
    return { summary };
  });

  await scenario('2. upload photo — 30 copies on A4', page, async () => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Drop a photo or click to browse').click();
    const fc = await chooser;
    await fc.setFiles(TEST_PHOTO);
    await page.waitForSelector('img[alt="Uploaded"]');
    await page.screenshot({ path: path.join(OUT, '02-uploaded.png'), fullPage: true });
    const summary = (await page.getByText(/per page/).first().textContent())?.trim();
    return { summary };
  });

  await scenario('3. increase margin → fewer photos', page, async () => {
    // Marginmm is the first slider. Grab by aria label proxy — use nth of range inputs.
    const sliders = page.locator('input[type="range"]');
    // Order: margin(0), gap(1), border(2), copies(3), cutmark(4)
    // Set margin to 30
    await sliders.nth(0).evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '30');
    const summary = (await page.getByText(/per page/).first().textContent())?.trim();
    await page.screenshot({ path: path.join(OUT, '03-margin30.png'), fullPage: true });
    return { summary };
  });

  await scenario('4. LAYOUT_IMPOSSIBLE on tiny paper', page, async () => {
    await page.locator('input[type="range"]').nth(0).evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '5');
    // Change paper to 4x6 (small)
    const selects = page.locator('select');
    // Order in ConfigPanel: photoStandard(0), paper(1), dpi(2)
    await selects.nth(1).selectOption('P_4X6');
    await page.screenshot({ path: path.join(OUT, '04-small-paper.png'), fullPage: true });
    const summary = (await page.getByText(/per page/).first().textContent())?.trim();
    return { summary };
  });

  await scenario('5. reset to A4 + increase copies to trigger pagination', page, async () => {
    const selects = page.locator('select');
    await selects.nth(1).selectOption('A4');
    // Copies is the 4th range (index 3)
    await page.locator('input[type="range"]').nth(3).evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '75');
    const summary = (await page.getByText(/per page/).first().textContent())?.trim();
    await page.screenshot({ path: path.join(OUT, '05-pagination.png'), fullPage: true });
    return { summary };
  });

  await scenario('6. export PNG (client-side)', page, async () => {
    // Wait for downloads
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PNG/i }).click();
    const dl = await download;
    const savePath = path.join(OUT, 'exported.png');
    await dl.saveAs(savePath);
    return { savedTo: savePath };
  });

  await browser.close();

  console.log(JSON.stringify({ url: URL, results }, null, 2));
  const anyFail = results.some((r) => !r.ok);
  process.exit(anyFail ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
