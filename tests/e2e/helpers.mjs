// E2E 共通: 静的サーバー（Pages と同じ /imhs/ 配下）と Chrome/Edge の起動
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../../tools/serve.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const OUT = join(ROOT, 'test-output');
mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

export async function serve(port = 0, base = '/imhs/') {
  const p = port || 20000 + Math.floor(Math.random() * 20000);
  const server = await startServer(p, join(ROOT, 'docs'), base);
  return { server, url: `http://127.0.0.1:${p}${base}`, close: () => new Promise((r) => server.close(r)) };
}

export async function launch(opts = {}) {
  const executablePath = BROWSERS.find((p) => existsSync(p));
  if (!executablePath) throw new Error('Chrome / Edge が見つかりません（CHROME_PATH で指定できます）');
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'],
    ...opts,
  });
}

export const IPHONE16 = { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
export const IPHONE16_SAFARI = { width: 393, height: 659, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
export const PC = { width: 1366, height: 860, deviceScaleFactor: 1 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ページ内の外部通信を記録（同一オリジン以外への要求を検出） */
export function watchExternal(page, origin) {
  const ext = [];
  page.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
  });
  return ext;
}
