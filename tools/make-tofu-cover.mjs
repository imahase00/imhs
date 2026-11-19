// にげろ！とうふ: ランチャーの表紙（cover.webp）を描画コードから作る
//   node tools/make-tofu-cover.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, ROOT } from '../tests/e2e/helpers.mjs';

const { url, close } = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.goto(url + 'games/tofu-run/index.html', { waitUntil: 'networkidle0' });
const data = await page.evaluate(async () => {
  const R = await import('./render.js');
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1125;
  R.drawCover(c.getContext('2d'), c.width, c.height);
  return c.toDataURL('image/webp', 0.88);
});
const dir = join(ROOT, 'docs/games/tofu-run/img');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'cover.webp'), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
await close();
console.log('cover.webp を作りました');
