/**
 * 截圖腳本 — 用 Playwright 把所有 mockup HTML 截成 JPG
 * 用法: node docs/design/screenshot.mjs
 */
import { chromium } from 'playwright';
import { readdir } from 'fs/promises';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DESIGN_DIR = __dirname;
const VIEWPORT = { width: 1920, height: 1080 };

async function main() {
  const files = await readdir(DESIGN_DIR);
  const htmlFiles = files
    .filter(f => f.endsWith('.html') && f !== 'screenshot.mjs')
    .sort();

  console.log(`Found ${htmlFiles.length} HTML files to screenshot\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  for (const file of htmlFiles) {
    const filePath = resolve(DESIGN_DIR, file);
    const name = basename(file, '.html');
    const outputPath = resolve(DESIGN_DIR, `${name}.jpg`);

    console.log(`📸 ${file} → ${name}.jpg`);

    const page = await context.newPage();
    await page.goto(`file:///${filePath.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Wait for any animations to settle
    await page.waitForTimeout(500);

    // For pages with state switcher, ensure "normal" state is active
    // (most pages default to normal, but just in case)

    await page.screenshot({
      path: outputPath,
      type: 'jpeg',
      quality: 90,
      fullPage: false, // viewport-only, 1920x1080
    });

    await page.close();
    console.log(`   ✅ saved`);
  }

  await browser.close();
  console.log(`\nDone! ${htmlFiles.length} screenshots saved to docs/design/`);
}

main().catch(err => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});
