#!/usr/bin/env node
/** 모두의법률 스크린샷 헤드라인 오버레이 */

import sharp from "sharp";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..", "screenshots");
const DST = resolve(__dirname, "..", "screenshots-final");
mkdirSync(DST, { recursive: true });

const HEADLINES = {
  "01-home": "5,500+ 법령과 판례\n검색 한 번에",
  "02-law-search": "민법·형법·근로기준법\n현행 조문 전체",
  "03-precedent": "대법원·헌재·하급심\n판례 전수 검색",
  "04-bookmarks": "자주 보는 조문\n즐겨찾기로 빠르게",
  "05-browse": "법령 분야별 탐색\n초심자도 쉽게",
  "06-about": "공공 데이터 기반\n정확하고 무료",
};

const W = 1290;
const H = 2796;
const BAND_H = 540;

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

for (const file of readdirSync(SRC)) {
  if (!file.endsWith(".png")) continue;
  const key = basename(file, "-6.7.png");
  const headline = HEADLINES[key];
  if (!headline) continue;

  const lines = headline.split("\n").map(escapeXml);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND_H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3F51B5"/>
        <stop offset="100%" stop-color="#283593"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${BAND_H}" fill="url(#bg)"/>
    ${lines
      .map(
        (line, i) =>
          `<text x="${W / 2}" y="${230 + i * 110}" font-family="-apple-system, SF Pro Display, sans-serif" font-size="88" font-weight="800" fill="white" text-anchor="middle">${line}</text>`,
      )
      .join("\n    ")}
  </svg>`;

  const band = Buffer.from(svg);
  const out = join(DST, file);

  await sharp(join(SRC, file))
    .resize(W, H - BAND_H, { fit: "cover", position: "top" })
    .extend({ top: BAND_H, bottom: 0, left: 0, right: 0, background: "#3F51B5" })
    .composite([{ input: band, top: 0, left: 0 }])
    .png()
    .toFile(out);

  console.log(`✓ ${file} → ${out}`);
}
