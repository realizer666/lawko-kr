#!/usr/bin/env node
/**
 * 모두의법률 — App Store/Play Store 스크린샷 자동 생성
 *
 * 실행:
 *   npm init -y (없으면)
 *   npm install -D playwright
 *   npx playwright install chromium
 *   node scripts/generate-screenshots.mjs
 *
 * 출력: screenshots/*.png
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://lawko.kr";

const PAGES = [
  { path: "/", name: "01-home" },
  { path: "/law.html", name: "02-law-search" },
  { path: "/precedent.html", name: "03-precedent" },
  { path: "/bookmarks.html", name: "04-bookmarks" },
  { path: "/browse.html", name: "05-browse" },
  { path: "/about.html", name: "06-about" },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  for (const p of PAGES) {
    try {
      await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1500);
      const file = resolve(OUT_DIR, `${p.name}-6.7.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${p.name} → ${file}`);
    } catch (e) {
      console.error(`✗ ${p.name}:`, e.message);
    }
  }
  await browser.close();
})();
