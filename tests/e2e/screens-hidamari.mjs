// ひだまり菜園の画面確認用スクリーンショット（iPhone 16 相当・PC幅）: node tests/e2e/screens-hidamari.mjs
import { join } from 'node:path';
import { serve, launch, IPHONE16, PC, OUT, sleep } from './helpers.mjs';

const srv = await serve();
const browser = await launch();
const errors = [];
const skipTalk = async (page) => {
  for (let k = 0; k < 10 && !(await page.$eval('#talk', (e) => e.hidden)); k++) { await page.click('#talk-skip'); await sleep(120); }
};
try {
  for (const [name, vp] of [['iphone', IPHONE16], ['pc', PC]]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(srv.url, { waitUntil: 'networkidle0' });
    await sleep(400);
    await page.screenshot({ path: join(OUT, `hg-${name}-launcher.png`), fullPage: true });
    await page.goto(srv.url + 'games/hidamari-garden/index.html', { waitUntil: 'networkidle0' });
    await sleep(500);
    await page.screenshot({ path: join(OUT, `hg-${name}-talk.png`) });
    await skipTalk(page);
    // 種まき → 水やり → おやすみ ×3 → 収穫
    for (let i = 0; i < 6; i++) { await page.click(`.plot[data-i="${i}"]`); await sleep(60); }
    await page.screenshot({ path: join(OUT, `hg-${name}-planted.png`), fullPage: true });
    for (let d = 0; d < 2; d++) {
      for (let i = 0; i < 6; i++) { await page.click(`.plot[data-i="${i}"]`); await sleep(40); }
      await page.click('#btn-sleep');
      await sleep(250);
      if (!(await page.$eval('#modal', (e) => e.hidden))) { await page.click('#modal .actions .btn:last-child'); }
      await sleep(1300);
      await skipTalk(page);
    }
    await page.screenshot({ path: join(OUT, `hg-${name}-growing.png`), fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
console.log(errors.length ? errors.join('\n') : 'エラーなし');
