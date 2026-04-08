/**
 * BrowserVerify — Self-verification for UI changes.
 * Inspired by Cursor/Windsurf's browser integration.
 *
 * Agents can request a screenshot of a running web app to verify
 * their UI changes without human intervention.
 *
 * Uses Playwright (if available) or falls back to a simple HTTP check.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

export interface VerifyResult {
  success: boolean;
  screenshotPath?: string;
  statusCode?: number;
  title?: string;
  error?: string;
}

class BrowserVerifyService {
  private screenshotDir: string;

  constructor() {
    this.screenshotDir = join(process.cwd(), '.maestro-screenshots');
  }

  /**
   * Check if Playwright is available.
   */
  isAvailable(): boolean {
    try {
      execSync('npx playwright --version', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Take a screenshot of a URL using Playwright.
   */
  async screenshot(url: string, options?: {
    width?: number;
    height?: number;
    waitFor?: number;
    fullPage?: boolean;
    sessionId?: string;
  }): Promise<VerifyResult> {
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }

    const filename = `screenshot-${Date.now()}.png`;
    const outputPath = join(this.screenshotDir, filename);
    const width = options?.width || 1280;
    const height = options?.height || 720;
    const waitFor = options?.waitFor || 2000;
    const fullPage = options?.fullPage || false;

    // Generate a Playwright script and execute it
    const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: ${width}, height: ${height} } });
  try {
    const response = await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(${waitFor});
    const title = await page.title();
    await page.screenshot({ path: '${outputPath.replace(/'/g, "\\'")}', fullPage: ${fullPage} });
    console.log(JSON.stringify({ success: true, statusCode: response?.status(), title }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  } finally {
    await browser.close();
  }
})();
`;

    const scriptPath = join(this.screenshotDir, '_verify.js');
    writeFileSync(scriptPath, script, 'utf-8');

    try {
      const output = execSync(`node "${scriptPath}"`, {
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      }).toString().trim();

      const result = JSON.parse(output);

      if (result.success) {
        logger.info(`BrowserVerify: screenshot saved to ${outputPath}`);
        return {
          success: true,
          screenshotPath: outputPath,
          statusCode: result.statusCode,
          title: result.title,
        };
      }

      return { success: false, error: result.error };
    } catch (err: any) {
      // Playwright not available — fallback to simple HTTP check
      return this.httpFallback(url);
    }
  }

  /**
   * Simple HTTP check when Playwright is not available.
   */
  private httpFallback(url: string): VerifyResult {
    try {
      const output = execSync(`curl -sL -o /dev/null -w "%{http_code}" "${url}"`, {
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString().trim();

      const statusCode = parseInt(output, 10);
      return {
        success: statusCode >= 200 && statusCode < 400,
        statusCode,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const browserVerify = new BrowserVerifyService();
