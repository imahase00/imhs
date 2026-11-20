// パズトレ: 見た目の確認用スクリーンショット（タイトル・ダンジョン選び・パズル・図鑑・枠）
import { join } from 'node:path';
import { serve, launch, IPHONE16, PC, OUT, sleep } from './helpers.mjs';
import { playTurn } from './puztre-helpers.mjs';

const pc = process.argv.includes('--pc');
const tag = pc ? 'pc' : 'ip';
const { url, close } = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.setViewport(pc ? PC : IPHONE16);
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text()); });
const shot = (name) => page.screenshot({ path: join(OUT, `puz-${tag}-${name}.png`) });
const tap = (sel) => page.tap(sel);

await page.goto(url + 'games/puztre/index.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__puztre?.scene === 'title');
await sleep(500);
await shot('title');
await tap('#btn-start');
await sleep(300);
await shot('intro');
await tap('#modal .btn.gold');
await page.waitForFunction(() => window.__puztre.scene === 'map');
await sleep(400);
await shot('map');
await tap('.dg[data-d="0"]');
await sleep(300);
await shot('prep');
await tap('#modal .actions .btn.gold');
await page.waitForFunction(() => window.__puztre.scene === 'battle');
await sleep(1800);
await shot('battle');

// 3つ並びを作る動かし方で、2フロア突破してお宝を見つけるまで遊ぶ
for (let i = 0; i < 30; i++) {
  if (!(await page.$eval('#modal', (e) => e.hidden))) break;
  const n = await playTurn(page);
  if (i === 0) await shot('after');
  console.log('turn', i + 1, 'combo', n, JSON.stringify(await page.evaluate(() => ({ f: window.__puztre.run?.floor, traps: window.__puztre.run?.traps.map((t) => t.hp), hp: window.__puztre.run?.hp }))));
  await page.waitForFunction(() => window.__puztre.phase === 'idle' || !document.querySelector('#modal').hidden, { timeout: 20000 });
}
await sleep(900);
await shot('treasure');
await page.evaluate(() => { document.querySelector('#modal').hidden = true; });
await browser.close();
await close();
console.log('saved');
